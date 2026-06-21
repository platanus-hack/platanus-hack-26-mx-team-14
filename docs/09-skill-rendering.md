
# 09 — Skill rendering: qué preguntamos y qué nos contesta

Guía para el equipo. Explica **qué le pedimos al agente** (frases que el usuario
escribe), **qué skill se dispara**, y **qué JSON nos regresa** para pintar el
dashboard. Hoy el front corre con _fixtures_ (datos hardcodeados con la forma
real); cuando el backend esté vivo, el mismo JSON llega por API y los mismos
componentes lo pintan sin cambiar nada.

- Detección de intención: `apps/web/src/data/skills.ts` → `detectSkill()`
- Forma de los datos (contrato): `apps/web/src/types.ts` (espejo de `@sat/events`)
- De JSON a paneles: `apps/web/src/lib/dashboard.ts` → `resultToPanels()`

---

## Flujo en una línea

```
Usuario escribe  →  detectSkill(texto)  →  runSkill()  →  SkillResult (JSON)  →  resultToPanels()  →  paneles en el canvas
```

Cada consulta agrega paneles que **se acumulan** (no reemplazan lo anterior).

---

## Resumen rápido

| Intención            | Skill                | Qué pinta                                    |
| -------------------- | -------------------- | -------------------------------------------- |
| Constancia / régimen | `generateCSF`        | Tarjeta CSF (próximo vencimiento, régimen, obligaciones) |
| Facturas recibidas   | `getReceiptInvoices` | KPI IVA acreditable + lista de facturas      |
| Facturas emitidas    | `getEmitedInvoices`  | KPI IVA trasladado + lista de facturas       |
| Generar factura      | `generateInvoice`    | KPI con el total de la vista previa          |

---

## 1. Constancia de Situación Fiscal → `generateCSF`

### Qué se pregunta (cualquiera de estas)

- "genera mi constancia de situación fiscal"
- "muéstrame mi constancia / mi CSF"
- "¿cuáles son mis obligaciones?"
- "¿en qué régimen estoy?"
- "¿cuándo vence mi próxima declaración?"

> Palabras gatillo: `constancia`, `csf`, `régimen`, `situación fiscal`,
> `obligaci…`, `vencimiento`, `domicilio fiscal`.

### Qué nos regresa

```json
{
  "skill": "generateCSF",
  "csf": {
    "rfc": "RAOA0111176P7",
    "nombre": "ANDRICK DANIEL RAMOS ORTEGA",
    "regimenFiscal": [
      "Régimen de Sueldos y Salarios e Ingresos Asimilados a Salarios",
      "Régimen Simplificado de Confianza"
    ],
    "domicilioFiscal": {
      "codigoPostal": "11800",
      "entidad": "CIUDAD DE MEXICO",
      "municipio": "MIGUEL HIDALGO",
      "colonia": "ESCANDON I SECCION"
    },
    "obligaciones": [
      {
        "descripcion": "Pago provisional mensual de ISR. Régimen Simplificado de Confianza.",
        "fechaInicio": "30/01/2026",
        "vencimiento": "A más tardar el día 17 del mes de calendario inmediato posterior a aquél al que corresponda el pago"
      },
      {
        "descripcion": "Pago definitivo mensual de IVA. Régimen Simplificado de Confianza.",
        "fechaInicio": "30/01/2026",
        "vencimiento": "A más tardar el día 17 del mes inmediato posterior al periodo que corresponda."
      },
      {
        "descripcion": "Ajuste anual de ISR correspondiente a la declaración anual. Régimen Simplificado de Confianza.",
        "fechaInicio": "30/01/2026",
        "vencimiento": "A más tardar el día 30 del mes de abril del ejercicio siguiente"
      }
    ],
    "pdfArtifactId": "5cff40e3-24f6-4764-b3a7-2d8191a889fd"
  }
}
```

> ⚠️ **Drift a alinear:** el scraper devuelve `regimenFiscal` como **lista de
> strings** (arriba). El tipo del front (`types.ts`) espera **objetos**
> `{ nombre: string, porcentaje?: number }`. Al cablear data real hay que
> adaptar `string[] → { nombre }[]`, o alinear el backend. En fixtures ya está
> con la forma de objeto.

---

## 2. Facturas recibidas → `getReceiptInvoices`

### Qué se pregunta

- "muéstrame mis facturas recibidas"
- "¿qué me facturaron mis proveedores?"
- "facturas que recibí este mes"

> Palabras gatillo: `recibid…`, `me factur…`, `proveedor`.

### Qué nos regresa

```json
{
  "skill": "getReceiptInvoices",
  "invoices": [
    {
      "uuid": "70333722-2728-46D5-B255-5835C7756332",
      "rfcEmisor": "ROM240313I36",
      "rfcReceptor": "RAOA0111176P7",
      "fechaEmision": "2026-01-30",
      "subtotal": 253.45,
      "iva": 40.55,
      "total": 294,
      "estado": "Vigente",
      "tipoComprobante": "I"
    }
  ]
}
```

Pinta: **KPI "IVA acreditable"** (suma del IVA de las vigentes) + **lista de facturas**.

---

## 3. Facturas emitidas → `getEmitedInvoices`

### Qué se pregunta

- "mis facturas emitidas"
- "¿cuánto he facturado este mes?"
- "mis ingresos / mis CFDI emitidos"

> Palabras gatillo (lo que sobra tras descartar lo anterior): `emit…`,
> `factura`, `cfdi`, `ingreso`.

### Qué nos regresa

Misma forma que recibidas, pero el `rfcEmisor` es el del usuario:

```json
{
  "skill": "getEmitedInvoices",
  "invoices": [
    {
      "uuid": "E7F1F401-3B41-4791-93CB-163BF2140FF6",
      "rfcEmisor": "RAOA0111176P7",
      "rfcReceptor": "XAXX010101000",
      "nombreReceptor": "FACTURA GLOBAL",
      "fechaEmision": "2026-01-30",
      "subtotal": 11600,
      "iva": 1856,
      "total": 13456,
      "estado": "Vigente",
      "tipoComprobante": "I"
    }
  ]
}
```

Pinta: **KPI "IVA trasladado"** + **lista de facturas**.

---

## 4. Generar una factura → `generateInvoice`

### Qué se pregunta

- "genérame una factura"
- "emite una factura a FACTURA GLOBAL"
- "hazme un CFDI por 11600"
- "quiero facturar a XAXX010101000"
- "necesito una factura nueva"

> Palabras gatillo: un verbo de creación (`gen[eé]r…`, `emit…`, `crea…`,
> `haz…`, `saca…`, `nueva`, `quier…`, `necesit…`, `dame`) seguido de
> `factura`/`cfdi`, **o** la palabra `facturar`.
>
> Importante: "facturas **emitidas**/**recibidas**" NO cae aquí (eso es
> consulta, no creación). La detección de creación va primero y es específica.

### Qué nos regresa (vista previa — todavía no se emite)

```json
{
  "skill": "generateInvoice",
  "status": "previewed",
  "preview": {
    "receptorRfc": "XAXX010101000",
    "conceptos": [
      {
        "claveProdServ": "01010101",
        "descripcion": "Prueba",
        "claveUnidad": "H87",
        "cantidad": 1,
        "valorUnitario": 11600,
        "descuento": 0,
        "objetoImpuesto": "02"
      }
    ],
    "subtotal": 11600,
    "iva": 1856,
    "total": 13456,
    "rawArtifactId": "e7f1f401-3b41-4791-93cb-163bf2140ff6"
  }
}
```

Pinta: **KPI "Vista previa"** con el total a emitir. La factura **NO se emite**
hasta confirmar (regla de seguridad: `generateInvoice` nunca auto-confirma).

### Qué regresaría una vez emitida (`status: "issued"`)

```json
{
  "skill": "generateInvoice",
  "status": "issued",
  "issued": {
    "uuid": "....",
    "pdfArtifactId": "....",
    "xmlArtifactId": "...."
  }
}
```

---

## Contrato de tipos (referencia)

Forma canónica de cada resultado (`apps/web/src/types.ts`, espejo de `@sat/events`):

```ts
type SkillResult =
  | { skill: 'getEmitedInvoices';  invoices: Invoice[] }
  | { skill: 'getReceiptInvoices'; invoices: Invoice[] }
  | { skill: 'generateCSF';        csf: CSF }
  | { skill: 'generateInvoice'; status: 'previewed'; preview: InvoicePreview }
  | { skill: 'generateInvoice'; status: 'issued';    issued: IssuedInvoice };
```

| Campo (Invoice)   | Tipo                                          | Nota                       |
| ----------------- | --------------------------------------------- | -------------------------- |
| `uuid`            | string                                        | Folio fiscal               |
| `rfcEmisor`       | string                                        |                            |
| `rfcReceptor`     | string                                        |                            |
| `nombreReceptor?` | string                                        | Opcional                   |
| `fechaEmision`    | string                                        | ISO o `YYYY-MM-DD`         |
| `subtotal`        | number                                        |                            |
| `iva?`            | number                                        | Opcional                   |
| `total`           | number                                        |                            |
| `estado`          | `'Vigente'` \| `'Cancelado'`                  |                            |
| `tipoComprobante` | `'I'` \| `'E'` \| `'P'` \| `'N'` \| `'T'`     | I = Ingreso                |

---

## Cómo agregar una skill/visualización nueva

1. Agrega su forma a `SkillResult` en `apps/web/src/types.ts`.
2. Agrega su intención en `detectSkill()` (`apps/web/src/data/skills.ts`).
3. Devuelve su fixture en `fixtureFor()` (mismo archivo).
4. Mapea el resultado a paneles en `resultToPanels()` (`apps/web/src/lib/dashboard.ts`).
5. Si necesitas un panel visual nuevo, crea el componente y agrégalo al
   `switch` de `DashboardCanvas.tsx`.

Cuando el backend esté vivo: pon `USE_FIXTURES = false` en `skills.ts` y
`runSkill()` pega a `POST /skills/:skill/run`. Los componentes no cambian.
