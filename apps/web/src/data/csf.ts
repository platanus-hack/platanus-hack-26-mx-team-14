import type { CSF } from '../types';

/**
 * Demo CSF — the real `generateCSF` skill output for the test RFC RAOA0111176P7.
 * Same shape as the live pipeline, so the dashboard renders against real data.
 * Swap `getCSF` to the API call when the pipeline is wired — the components never
 * change because they render the `CSF` type, not this object.
 */
export const csfFixture: CSF = {
  rfc: 'RAOA0111176P7',
  nombre: 'ANDRICK DANIEL RAMOS ORTEGA',
  regimenFiscal: [
    { nombre: 'Régimen de Sueldos y Salarios e Ingresos Asimilados a Salarios' },
    { nombre: 'Régimen Simplificado de Confianza' },
  ],
  domicilioFiscal: {
    codigoPostal: '11800',
    entidad: 'CIUDAD DE MEXICO',
    municipio: 'MIGUEL HIDALGO',
    colonia: 'ESCANDON I SECCION',
  },
  obligaciones: [
    {
      descripcion: 'Pago provisional mensual de ISR. Régimen Simplificado de Confianza.',
      fechaInicio: '30/01/2026',
      vencimiento:
        'A más tardar el día 17 del mes de calendario inmediato posterior a aquél al que corresponda el pago',
    },
    {
      descripcion: 'Pago definitivo mensual de IVA. Régimen Simplificado de Confianza.',
      fechaInicio: '30/01/2026',
      vencimiento:
        'A más tardar el día 17 del mes inmediato posterior al periodo que corresponda.',
    },
    {
      descripcion:
        'Ajuste anual de ISR correspondiente a la declaración anual. Régimen Simplificado de Confianza.',
      fechaInicio: '30/01/2026',
      vencimiento: 'A más tardar el día 30 del mes de abril del ejercicio siguiente',
    },
  ],
  pdfArtifactId: '5cff40e3-24f6-4764-b3a7-2d8191a889fd',
};

/**
 * Data seam. TODAY: returns the fixture.
 * TOMORROW (live): replace the body with the real call — same return type, so
 * CsfCard and everything downstream stay untouched:
 *
 *   import api from '../lib/api';
 *   const { data } = await api.post('/skills/generateCSF/run', {
 *     userId, credentialId, rfc, input: {},
 *   });
 *   return data.result.csf as CSF;
 */
export async function getCSF(): Promise<CSF> {
  return csfFixture;
}
