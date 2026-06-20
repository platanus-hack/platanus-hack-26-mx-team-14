import type { CSF } from '../types';

/**
 * Anonymized demo CSF — same shape as the `generateCSF` skill output, so the
 * dashboard renders against the real shape without committing anyone's real
 * fiscal data. Swap `getCSF` to the API call when the pipeline is wired — the
 * components never change because they render the `CSF` type, not this object.
 */
export const csfFixture: CSF = {
  rfc: 'PEMJ900315H40',
  nombre: 'JUAN CARLOS PÉREZ MARTÍNEZ',
  regimenFiscal: [
    { nombre: 'Régimen de Sueldos y Salarios e Ingresos Asimilados a Salarios', porcentaje: 60 },
    { nombre: 'Régimen Simplificado de Confianza', porcentaje: 40 },
  ],
  domicilioFiscal: {
    codigoPostal: '03100',
    entidad: 'CIUDAD DE MEXICO',
    municipio: 'BENITO JUAREZ',
    colonia: 'DEL VALLE',
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
  pdfArtifactId: '00000000-0000-0000-0000-000000000000',
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
