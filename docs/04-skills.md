# 4 · Skills (Agent Tools)

The assistant's "skills" are the **tools** the Claude agent can call. Each skill
is: a typed tool definition (what Claude sees) + an event contract + a Brisk Camel
scraper flow (how it's fulfilled). The agent runs `claude-opus-4-8` with adaptive
thinking and the manual tool loop so we can gate side-effecting tools.

There are four skills, matching the diagram's EVENT LIST:

| Skill | Side effect | Confirmation gate |
|---|---|---|
| `getEmitedInvoices` | read | no |
| `getReceiptInvoices` | read | no |
| `generateCSF` | read | no |
| `generateInvoice` | **write (issues a CFDI)** | **yes — mandatory** |

> All tools are async: the tool handler publishes a `scrape.<op>.requested` event,
> the agent loop awaits the matching `*.succeeded` / `*.failed` result, and only
> then continues. See [06-events.md](./06-events.md) for the event envelope.

## 4.1 Tool definitions (Anthropic tool schema)

```ts
// packages/agent/tools.ts
export const tools = [
  {
    name: "getEmitedInvoices",
    description:
      "Fetch the user's ISSUED invoices (CFDIs emitidas) from the SAT for a date " +
      "range. Use when the user asks about invoices they sent/issued. Max range 12 months.",
    input_schema: {
      type: "object",
      properties: {
        from: { type: "string", format: "date", description: "Start date (YYYY-MM-DD)" },
        to:   { type: "string", format: "date", description: "End date (YYYY-MM-DD), ≤12 months after `from`" },
        rfcReceptor:   { type: "string", description: "Optional: filter by receiver RFC" },
        estado:        { type: "string", enum: ["Vigente", "Cancelado"], description: "Optional CFDI status filter" },
        tipoComprobante: { type: "string", enum: ["I","E","P","N","T"], description: "Optional voucher type filter" },
      },
      required: ["from", "to"],
      additionalProperties: false,
    },
  },
  {
    name: "getReceiptInvoices",
    description:
      "Fetch the user's RECEIVED invoices (CFDIs recibidas) from the SAT for a date " +
      "range. Use when the user asks about invoices issued TO them. Max range 12 months.",
    input_schema: {
      type: "object",
      properties: {
        from: { type: "string", format: "date" },
        to:   { type: "string", format: "date" },
        rfcEmisor: { type: "string", description: "Optional: filter by issuer RFC" },
        estado:    { type: "string", enum: ["Vigente", "Cancelado"] },
      },
      required: ["from", "to"],
      additionalProperties: false,
    },
  },
  {
    name: "generateCSF",
    description:
      "Download the user's Constancia de Situación Fiscal (CSF) PDF and extract its " +
      "fields (régimen fiscal, domicilio, obligaciones, etc.). Use to learn the " +
      "user's fiscal profile or when they ask for their constancia.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "generateInvoice",
    description:
      "Issue a CFDI (factura) on the user's behalf. This has REAL side effects. " +
      "You MUST present the vista previa and obtain explicit user confirmation " +
      "before the invoice is emitted; never set confirmed=true on your own.",
    input_schema: {
      type: "object",
      properties: {
        receptor: {
          type: "object",
          properties: {
            rfc: { type: "string" },
            nombreRazonSocial: { type: "string" },
            codigoPostal: { type: "string" },
            regimenFiscalReceptor: { type: "string" },
            usoCFDI: { type: "string", description: "e.g. G03, P01" },
          },
          required: ["rfc", "nombreRazonSocial", "codigoPostal", "regimenFiscalReceptor", "usoCFDI"],
          additionalProperties: false,
        },
        conceptos: {
          type: "array",
          items: {
            type: "object",
            properties: {
              claveProdServ: { type: "string" },
              descripcion: { type: "string" },
              claveUnidad: { type: "string" },
              cantidad: { type: "number" },
              valorUnitario: { type: "number" },
              descuento: { type: "number" },
              objetoImpuesto: { type: "string" },
            },
            required: ["descripcion", "cantidad", "valorUnitario"],
            additionalProperties: false,
          },
          minItems: 1,
        },
        moneda: { type: "string", description: "MXN by default" },
        tipoCambio: { type: "number", description: "Required only if moneda != MXN" },
        confirmed: {
          type: "boolean",
          description:
            "Must be true to actually emit. Only set true AFTER the user has seen the " +
            "vista previa and explicitly agreed in this conversation.",
        },
      },
      required: ["receptor", "conceptos", "confirmed"],
      additionalProperties: false,
    },
  },
] as const;
```

## 4.2 Scraper flows (Brisk Camel)

These are the real SAT navigation flows each skill drives. URLs and steps from the
diagram's "SAT steps" notes.

### `getEmitedInvoices()`
1. `https://cfdiau.sat.gob.mx/nidp/wsfed/ep?id=SATUPCFDiCon&sid=0&option=credential&sid=0`
   — **captcha** (alphanumeric image → solved by Claude vision).
2. `https://portalcfdi.facturaelectronica.sat.gob.mx/`
3. Consultar → **Facturas Emitidas**.
4. `.../ConsultaEmisor.aspx` → click **Fecha de Emisión**.
5. Select the user-given range (**max 12 months**).
6. *(Optional)* filters: RFC Receptor, RFC a cuenta de terceros, Estado del
   Comprobante (Cancelado/Vigente), Tipo de Comprobante (complemento).
7. Click **Buscar CFDI** → scrape result rows → normalize.

### `getReceiptInvoices()`
1. `https://portalcfdi.facturaelectronica.sat.gob.mx/ConsultaReceptor.aspx`
2. Then the same shape as `getEmitedInvoices()` (login/captcha + date range + filters + Buscar).

### `generateCSF()`
1. `https://www.sat.gob.mx/portal/public/iniciar-sesion` — RFC + Contraseña → Enviar.
2. `https://www.sat.gob.mx/portal/private/mi-espacio`
3. Click **Constancia de Situación Fiscal** → await PDF download.
4. Get the PDF → **extract field values** (régimen, domicilio, obligaciones, …).

### `generateInvoice()`
1. `https://cfdiau.sat.gob.mx/nidp/wsfed/ep?id=SATUPCFDiCon&sid=1&option=credential&sid=1`
   — **captcha** (alphanumeric image → Claude vision).
2. `https://portalcfdi.facturaelectronica.sat.gob.mx/Factura/GeneraFactura`
   — await loading modal to be hidden/unmounted.
3. **Datos generales** (Moneda, Tipo de Cambio — disabled if MXN).
4. **Datos del cliente** (Cliente Frecuente, Nombre/Razón Social, Uso de la
   Factura, Código Postal, Régimen Fiscal — these may autopopulate).
5. **Producto y Servicio** ("Agregar" button) → Producto y Servicio,
   Descripción Detallada, Producto o Servicio, Unidad de Medida, Cantidad, Valor
   Unitario, Descuento = 0, Objeto de Impuesto, Número de Identificación → Guardar/cancelar.
6. Await modal/mask loader to unmount.
7. **Guardar.**
8. Click **Vista Previa** download → **extract content**.
9. **Verify it matches the user request and provided data.**
10. Get data from *vista previa* — **DO NOT emit the invoice yet.**

> **Safety gate.** `generateInvoice` runs steps 1–10 to build and preview, then the
> worker emits `scrape.generateInvoice.previewed` with the extracted *vista previa*.
> The agent shows/speaks it and asks the user to confirm. Only a follow-up call with
> `confirmed: true` (after explicit user yes) drives the final emit click. The
> assistant is instructed never to self-confirm.

## 4.3 Agent system-prompt rules (excerpt)

- Act through tools; never invent SAT data. If a tool fails, report the failure
  reason and offer to retry — don't fabricate results.
- Default invoice currency to MXN; require `tipoCambio` only for non-MXN.
- For `generateInvoice`: always preview first, summarize the *vista previa*
  (receptor, conceptos, totals, IVA), and obtain an explicit "sí, emítela" before
  re-calling with `confirmed: true`.
- Prefer the smallest date range the user implies; never exceed 12 months per query.
- When the user's régimen is known (from a prior `generateCSF`), tailor language
  and surface only relevant obligations.

## 4.4 Result shapes (normalized)

```ts
type Invoice = {
  uuid: string;                 // folio fiscal
  rfcEmisor: string; rfcReceptor: string;
  nombreEmisor?: string; nombreReceptor?: string;
  fechaEmision: string;         // ISO
  total: number; subtotal: number; iva?: number;
  estado: "Vigente" | "Cancelado";
  tipoComprobante: "I"|"E"|"P"|"N"|"T";
};

type CSF = {
  rfc: string; nombre: string;
  regimenFiscal: string[]; // a user may have several
  domicilioFiscal: { codigoPostal: string; entidad: string; municipio: string; /* … */ };
  obligaciones: { descripcion: string; fechaInicio?: string; vencimiento?: string }[];
  pdfArtifactId: string;   // pointer to stored PDF
};

type InvoicePreview = {
  receptor: Invoice["rfcReceptor"]; conceptos: unknown[];
  subtotal: number; iva: number; total: number;
  rawArtifactId: string;   // stored vista previa
};
```
