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
    rfc: "#rfc",
    password: "#password",
    // The captcha <img> sits next to #userCaptcha. Robust fallback chain; refine
    // with `diagnose cfdi` (now dumps images) if the element screenshot misses.
    captchaImg:
      "#divCaptcha img, img#divImagenCaptcha, img[src*='aptcha'], img[id*='aptcha'], #userCaptcha ~ img",
    captchaInput: "#userCaptcha",
    submit: "#submit",
    loginError: ".alert-danger, #idpErrorText, .error, .ui-messages-error, span.messageError",
  },

  // --- e.firma login (cfdiau) — toggle via the "e.firma" button ---
  efirma: {
    tab: "#buttonFiel",
    cerInput: "input[type='file'][id*='cert'], #fileCertificate, input[name='certificate'], input[type='file']:nth-of-type(1)",
    keyInput: "input[type='file'][id*='priv'], #filePrivateKey, input[name='privateKey'], input[type='file']:nth-of-type(2)",
    keyPassword: "#privateKeyPassword, #password, input[type='password']",
    submit: "#submit, #buttonFielSubmit",
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

  // --- Portal SAT login (RFC + Contraseña, no captcha) — verified via diagnose ---
  portal: {
    rfc: 'input[placeholder="RFC"]',
    password: 'input[name="password"]',
    submit: 'button:has-text("Enviar")',
  },

  // --- Mi Espacio (CSF) — verified via dump-on-failure ---
  csf: {
    // It's a <button type="submit">, not a link.
    constanciaLink: "button:has-text('Constancia de Situación Fiscal')",
    // Likely intermediate page: a generar/descargar/imprimir trigger (best-effort;
    // the next dump-on-failure will confirm if the first click isn't a direct PDF).
    descargar:
      "button:has-text('Generar'), button:has-text('Descargar'), button:has-text('Imprimir'), a:has-text('Descargar')",
  },
} as const;
