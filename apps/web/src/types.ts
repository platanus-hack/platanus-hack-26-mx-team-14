export type Page = 'landing' | 'auth' | 'dashboard';
export type AuthTab = 'login' | 'signup';
export type AuthStep = 1 | 2;
export type OrbState = 'idle' | 'listening' | 'thinking' | 'speaking';

// ── Skill result shapes ──────────────────────────────────────────────────
// Mirror of @sat/events (packages/events/src/results.ts). The web app doesn't
// import the backend package, so this is the shared contract for the dashboard.
// KEEP IN SYNC with packages/events/src/results.ts.
export interface Obligacion {
  descripcion: string;
  fechaInicio?: string;
  vencimiento?: string;
}

export interface RegimenCsf {
  nombre: string;
  porcentaje?: number;
}

export interface CSF {
  rfc: string;
  nombre: string;
  regimenFiscal: RegimenCsf[];
  domicilioFiscal: {
    codigoPostal: string;
    entidad?: string;
    municipio?: string;
    colonia?: string;
  };
  obligaciones: Obligacion[];
  pdfArtifactId: string;
}
