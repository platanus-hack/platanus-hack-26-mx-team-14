import Anthropic from "@anthropic-ai/sdk";
import { env, childLogger } from "@sat/shared";
import type { CSF } from "@sat/events";

type CSFFields = Omit<CSF, "pdfArtifactId">;

/** JSON schema Claude must fill from the CSF PDF (structured outputs). */
const CSF_SCHEMA = {
  type: "object",
  properties: {
    rfc: { type: "string" },
    nombre: { type: "string", description: "Nombre o razón social del contribuyente" },
    regimenFiscal: {
      type: "array",
      description: "Todos los regímenes fiscales vigentes",
      items: {
        type: "object",
        properties: {
          nombre: { type: "string", description: "Nombre completo del régimen" },
          porcentaje: {
            type: "number",
            description:
              "Porcentaje asociado al régimen cuando hay varios (columna Porcentaje). Omitir si no aparece.",
          },
        },
        required: ["nombre"],
        additionalProperties: false,
      },
    },
    domicilioFiscal: {
      type: "object",
      properties: {
        codigoPostal: { type: "string" },
        entidad: { type: "string" },
        municipio: { type: "string" },
        colonia: { type: "string" },
      },
      required: ["codigoPostal"],
      additionalProperties: false,
    },
    obligaciones: {
      type: "array",
      items: {
        type: "object",
        properties: {
          descripcion: { type: "string" },
          fechaInicio: { type: "string" },
          vencimiento: { type: "string" },
        },
        required: ["descripcion"],
        additionalProperties: false,
      },
    },
  },
  required: ["rfc", "nombre", "regimenFiscal", "domicilioFiscal", "obligaciones"],
  additionalProperties: false,
} as const;

const EMPTY: CSFFields = {
  rfc: "",
  nombre: "",
  regimenFiscal: [],
  domicilioFiscal: { codigoPostal: "" },
  obligaciones: [],
};

/**
 * Reads the Constancia de Situación Fiscal PDF with Claude (document input +
 * structured output) and returns its structured fields. Best-effort: on any
 * failure it logs and returns empty fields so the flow still yields the PDF.
 */
export async function extractCSFFromPdf(
  pdf: Buffer,
  correlationId: string,
): Promise<CSFFields> {
  const log = childLogger({ correlationId, op: "csf.extract" });
  if (!env.ANTHROPIC_API_KEY) {
    log.warn("ANTHROPIC_API_KEY not set — skipping CSF extraction");
    return EMPTY;
  }

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 5 });
  try {
    const res = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 2048,
      output_config: { format: { type: "json_schema", schema: CSF_SCHEMA } },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: pdf.toString("base64"),
              },
            },
            {
              type: "text",
              text:
                "Extrae los datos de esta Constancia de Situación Fiscal (CSF) del SAT: " +
                "RFC, nombre o razón social, TODOS los regímenes fiscales vigentes (cada uno " +
                "con su PORCENTAJE cuando hay varios — toma el valor de la columna Porcentaje), " +
                "el domicilio fiscal (código postal, entidad, municipio, colonia) y la lista " +
                "de obligaciones (descripción y fechas si aparecen). Devuelve únicamente " +
                "datos presentes en el documento.",
            },
          ],
        },
      ],
    });

    const block = res.content.find((b) => b.type === "text");
    const raw = block && "text" in block ? block.text : "{}";
    const parsed = JSON.parse(raw) as CSFFields;
    log.info({ regimen: parsed.regimenFiscal, obligaciones: parsed.obligaciones?.length }, "CSF extracted");
    return parsed;
  } catch (err) {
    log.warn({ err: (err as Error).message }, "CSF extraction failed — returning PDF only");
    return EMPTY;
  }
}
