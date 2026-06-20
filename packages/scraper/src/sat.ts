/**
 * Centralized SAT URLs + selectors. ALL portal coupling lives here so that when
 * the SAT changes its DOM we patch one file. Selectors marked TODO must be
 * verified against the live portal during Phase 1 (they are best-effort).
 */

export const SAT_URLS = {
  // CIEC login (image captcha) — emitidas/recibidas/generar factura
  cfdiLoginEmitidas:
    "https://cfdiau.sat.gob.mx/nidp/wsfed/ep?id=SATUPCFDiCon&sid=0&option=credential&sid=0",
  cfdiLoginFactura:
    "https://cfdiau.sat.gob.mx/nidp/wsfed/ep?id=SATUPCFDiCon&sid=1&option=credential&sid=1",
  portalCfdi: "https://portalcfdi.facturaelectronica.sat.gob.mx/",
  consultaEmisor:
    "https://portalcfdi.facturaelectronica.sat.gob.mx/ConsultaEmisor.aspx",
  consultaReceptor:
    "https://portalcfdi.facturaelectronica.sat.gob.mx/ConsultaReceptor.aspx",
  generaFactura:
    "https://portalcfdi.facturaelectronica.sat.gob.mx/Factura/GeneraFactura",

  // Portal SAT (RFC + contraseña) — Constancia de Situación Fiscal
  portalLogin: "https://www.sat.gob.mx/portal/public/iniciar-sesion",
  miEspacio: "https://www.sat.gob.mx/portal/private/mi-espacio",
} as const;

/** Selectors. TODO: verify against live DOM. Centralized for one-place patching. */
export const SEL = {
  // --- CIEC login (cfdiau) ---
  ciec: {
    rfc: "#Ecom_User_ID",
    password: "#Ecom_Password",
    captchaImg: "#divCaptcha img, img#imgCaptcha, #IDPLogin img",
    captchaInput: "#userCaptcha, #captcha, input[name='captcha']",
    submit: "#submit, button[type='submit'], input[type='submit']",
    loginError: ".alert-danger, #idpErrorText, .error",
  },

  // --- e.firma login (cfdiau, FIEL tab) ---
  efirma: {
    tab: "a[href*='efirma'], #efirmaTab, button:has-text('e.firma')",
    cerInput: "input#certificate, input[name='certificate'], input[type='file'][accept*='cer']",
    keyInput: "input#privateKey, input[name='privateKey'], input[type='file'][accept*='key']",
    keyPassword: "#privateKeyPassword, input[name='keyPassword'], #pin",
    submit: "#submit, button[type='submit']",
  },

  // --- Consulta (emitidas/recibidas) ---
  consulta: {
    fechaTab: "#ctl00_MainContent_RdoFechas, a:has-text('Fecha de Emisión')",
    fechaInicial: "#ctl00_MainContent_TxtFechaInicial",
    fechaFinal: "#ctl00_MainContent_TxtFechaFinal",
    rfcReceptor: "#ctl00_MainContent_TxtRfcReceptor",
    rfcEmisor: "#ctl00_MainContent_TxtRfcEmisor",
    estado: "#ctl00_MainContent_ddlEstadoComprobante",
    tipoComprobante: "#ctl00_MainContent_ddlTipoComprobante",
    buscar: "#ctl00_MainContent_BtnBusqueda",
    resultsTable: "#ctl00_MainContent_tblResult, table#tblResult",
    resultsRow: "#ctl00_MainContent_tblResult tr",
    loadingMask: ".blockUI, #loadingMask, .loading",
  },

  // --- Genera Factura ---
  factura: {
    loadingModal: ".modal-loading, #loadingModal, .blockUI",
    moneda: "#moneda, select[name='moneda']",
    tipoCambio: "#tipoCambio, input[name='tipoCambio']",
    rfcReceptor: "#rfcReceptor, input[name='rfcReceptor']",
    nombreReceptor: "#nombreRazonSocial, input[name='nombreRazonSocial']",
    codigoPostal: "#codigoPostalReceptor, input[name='codigoPostal']",
    regimenReceptor: "#regimenFiscalReceptor, select[name='regimenFiscalReceptor']",
    usoCfdi: "#usoCFDI, select[name='usoCFDI']",
    agregarConcepto: "#btnAgregarConcepto, button:has-text('Agregar')",
    claveProdServ: "#claveProdServ",
    descripcion: "#descripcion, textarea[name='descripcion']",
    claveUnidad: "#claveUnidad",
    cantidad: "#cantidad",
    valorUnitario: "#valorUnitario",
    descuento: "#descuento",
    objetoImpuesto: "#objetoImpuesto",
    numeroIdentificacion: "#numeroIdentificacion",
    guardarConcepto: "#btnGuardarConcepto, button:has-text('Guardar')",
    guardar: "#btnGuardar, button:has-text('Guardar')",
    vistaPrevia: "#btnVistaPrevia, button:has-text('Vista Previa')",
    sellar: "#btnSellar, button:has-text('Sellar'), button:has-text('Emitir')",
  },

  // --- Mi Espacio (CSF) ---
  csf: {
    constanciaLink: "a:has-text('Constancia de Situación Fiscal'), #generarConstancia",
  },
} as const;
