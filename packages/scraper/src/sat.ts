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

  // --- Consulta (emitidas/recibidas) — verified via dump-on-failure ---
  consulta: {
    // ASP.NET WebForms; "por fechas" is a radio that must be selected first.
    modoFechas: "#ctl00_MainContent_RdoFechas",
    modoFolio: "#ctl00_MainContent_RdoFolioFiscal",
    uuid: "#ctl00_MainContent_TxtUUID",
    // Date fields are AjaxControlToolkit calendar text inputs (dd/mm/yyyy).
    fechaInicial: "#ctl00_MainContent_CldFechaInicial2_Calendario_text",
    fechaFinal: "#ctl00_MainContent_CldFechaFinal2_Calendario_text",
    rfcReceptor: "#ctl00_MainContent_TxtRfcReceptor", // ConsultaEmisor
    rfcEmisor: "#ctl00_MainContent_TxtRfcEmisor", // ConsultaReceptor
    estado: "#ctl00_MainContent_DdlEstadoComprobante",
    buscar: "#ctl00_MainContent_BtnBusqueda",
    loadingMask: ".blockUI, #loadingMask, .loading, .modal.in",
  },

  // --- Navigation: portalcfdi landing → Genera Factura ---
  // After CIEC login you land on the portalcfdi home. Open the "menú desplegable"
  // and pick the "Configuración de Datos V 4.0" option (this primes the v4.0 form
  // context), then navigate to the form. The label is kept here so a SAT version
  // bump (e.g. "V 4.1") is a one-line patch; the xpath is the documented fallback.
  facturaNav: {
    // portalcfdi landing → "Generación de CFDI" dropdown → "Configuración de
    // datos V 4.0". The toggle is a Bootstrap dropdown whose handler binds late,
    // so a plain click can navigate to its href="#" instead of opening the menu;
    // openFacturaConfigMenu falls back to the option's own href when that happens.
    // The option is a cross-host anchor → portal.facturaelectronica (note: NOT
    // portalcfdi), which primes the v4.0 form context.
    menuToggle: "#menuDesplegable",
    configOption: 'a[href^="https://portal.facturaelectronica.sat.gob.mx/"]',
    // On the factura portal navbar, open "Generar" then click "Nueva factura".
    // Same late-binding dropdown caveat; nuevaFactura's href is same-host.
    generarToggle: 'a.dropdown-toggle:has-text("Generar")',
    nuevaFactura: 'ul.dropdown-menu a[href="/Factura/GeneraFactura"]',
  },

  // --- Genera Factura (portal.facturaelectronica.sat.gob.mx/Factura/GeneraFactura) ---
  // This is a Knockout/FormsBuilder ("declaracion") form. The numeric `135…` id
  // prefixes are generated at runtime and change between sessions, so we hook on
  // the STABLE `view-model` attribute (the Knockout binding) instead. Some controls
  // are "cintillo" widgets: a clickable opener (`a.cintillo-opener`) pops a catalog
  // (`#div_<catalogo>`) you must click; the chosen value lands in a hidden
  // `input.itemdeCintillo[view-model=…]` and its label renders in `#itemdeCintillo<catalogo>`.
  factura: {
    loadingModal: "#myModal.in, #modalGuardando.in, #ajaxModal.in, .blockUI, #loadAjax.overlay",
    errorModal: "#modal-error.in, .modal.error.in",

    // -- Comprobante (cintillo widgets; pre-filled from the emisor's config) --
    regimen: {
      opener: "a#E1350006Pregimen.cintillo-opener",
      input: "input.itemdeCintillo[view-model='E1350006Pregimen']",
      display: "#itemdeCintillo25",
      popup: "#div_25",
    },
    // Editable cintillo — a real text input (emisor CP, not the receptor's).
    codigoPostalEmisor: "input.item-cintillo-editable[view-model='E1350006Pcp']",
    fechaEmision: "input[view-model='E1350006PfechaEmision']",
    tipoFactura: {
      opener: "a#E1350006PtipodeFactura.cintillo-opener",
      input: "input.itemdeCintillo[view-model='E1350006PtipodeFactura']",
      display: "#itemdeCintillo33",
      popup: "#div_33",
    },
    formaPago: {
      opener: "a#E1350006PformadePago.cintillo-opener",
      input: "input.itemdeCintillo[view-model='E1350006PformadePago']",
      display: "#itemdeCintillo11",
      popup: "#div_11",
    },
    metodoPago: {
      opener: "a#E1350006PmetododePago.cintillo-opener",
      input: "input.itemdeCintillo[view-model='E1350006PmetododePago']",
      display: "#itemdeCintillo17",
      popup: "#div_17",
    },

    // -- Datos generales --
    // Moneda is a jQuery-UI autocomplete (type → pick from #ui-id-* list).
    moneda: "input.ui-autocomplete-input[view-model='E1350003PFAC001Descrip']",
    autocompleteMenu: "ul.ui-autocomplete:visible li:first-child",
    tipoCambio: "input[view-model='E1350003PFAC002']",
    serie: "input[view-model='E1350003PFAC003']",
    folio: "input[view-model='E1350003PFAC004']",
    // -- Factura Global (InformacionGlobal): the "Es una Factura Global" checkbox
    // (FAC111) is rendered display:none for some emisores; checking it via the KO
    // binding reveals the Periodicidad/Mes/Año row (E1350012P*).
    facturaGlobal: "input[view-model='E1350003PFAC111']",
    periodicidad: "select[view-model='E1350012PPeriodicidad']",
    mesesGlobal: "select[view-model='E1350012PMeses']",
    anioGlobal: "input[view-model='E1350012PAnn']",
    exportacionCheck: "input[view-model='E1350003PFAC086']",
    exportacion: "select[view-model='E1350006PExportacion']",

    // -- Datos del cliente --
    // Cliente Frecuente autocomplete; type "Otro" to reveal the manual receptor fields.
    clienteFrecuente: "input.ui-autocomplete-input[view-model='E1350003PFAC085Descrip']",
    correoReceptor: "input[view-model='E1350003PFAC010']",
    paisResidencia: "select[view-model='E1350003PFAC075']",

    // -- Receptor manual fields (revealed after Cliente Frecuente = "Otro").
    // Matches dynamically generated IDs via stable view-model attributes.
    // Verified against the rendered form DOM. Régimen/Uso are jQuery-UI
    // autocompletes (NOT <select>) → fill via autocompletePick.
    rfcReceptor: "input[view-model$='PFAC007']",
    nombreReceptor: "input[view-model$='PFAC008']",
    codigoPostalReceptor: "input[view-model$='PFAC101']",
    regimenReceptor: "input.ui-autocomplete-input[view-model$='PFAC103']",
    // Uso de la Factura is rendered as one of THREE autocompletes depending on the
    // receptor's persona type (genérico FAC009Descrip / moral / física); only one is
    // visible. Target the visible one (`:visible` ⇒ Playwright selectors only — read
    // its value via session.inputValue, not evaluate/querySelector).
    usoCfdi:
      "input.ui-autocomplete-input[view-model$='PFAC009Descrip']:visible, input.ui-autocomplete-input[view-model$='UsoFacturaMoralDescrip']:visible, input.ui-autocomplete-input[view-model$='UsoFacturaFisicaDescrip']:visible",

    // -- Conceptos grid (Knockout grid inputs and buttons).
    // `:visible` on the catalog autocompletes — the grid can render a hidden template
    // row with the same view-model, and typing into THAT leaves the visible field (the
    // one the SAT validates) empty → "valide los campos requeridos".
    agregarConcepto: "button.btnNewItem[entidad$='0001']",
    claveProdServ: "input[view-model$='PFAC013']:visible",
    descripcion: "input[view-model$='PFAC083']",
    claveUnidad: "input[view-model$='PFAC015']:visible",
    cantidad: "input[view-model$='PFAC016']",
    valorUnitario: "input[view-model$='PFAC017']",
    descuento: "input[view-model$='PFAC020']",
    objetoImpuesto: "select[view-model$='PFAC104']",
    numeroIdentificacion: "input[view-model$='PFAC084']",
    guardarConcepto: "button[id*='guardarEditar'][entidad$='0001']",

    // Footer actions are <a> with stable classes (verified via page dump), not
    // <button id=…>. Text fallback kept in case the markup shifts. `:visible` avoids
    // grabbing a hidden duplicate anchor (the page renders these footer actions twice).
    guardar: "a.btn-guardar-das:visible, a:has-text('Guardar'):visible",
    vistaPrevia: "a.btn-marcar-vista-previa:visible, a:has-text('Vista Previa'):visible",
    sellar: "a.btn-sellar-factura:visible, a:has-text('Sellar'):visible",
  },

  // --- Portal SAT login (RFC + Contraseña, no captcha) ---
  portal: {
    // Multiple fallbacks — SAT has changed these inputs across deployments
    rfc: 'input[placeholder="RFC"], input[name="rfc"], #rfc, input[id*="rfc" i]',
    password: 'input[name="password"], input[type="password"], #password',
    submit: 'button:has-text("Enviar"), button[type="submit"], input[type="submit"]',
    // Inline validation error shown by the Svelte login form (empty when no error).
    error: ".error-message",
  },

  // --- Mi Espacio (CSF) ---
  csf: {
    // Broad selector: SAT renders this as a button OR anchor depending on deployment.
    // Case-insensitive text fallbacks cover "Situación" vs "Situacion" encoding issues.
    constanciaLink: [
      "button:has-text('Constancia de Situación Fiscal')",
      "button:has-text('Constancia de situación fiscal')",
      "a:has-text('Constancia de Situación Fiscal')",
      "a:has-text('Constancia de situación fiscal')",
      "[href*='constancia' i]",
      "[href*='csf' i]",
      "button:has-text('Constancia')",
      "a:has-text('Constancia')",
    ].join(", "),
    descargar: [
      "button:has-text('Generar')",
      "button:has-text('Descargar')",
      "button:has-text('Imprimir')",
      "a:has-text('Descargar')",
      "a:has-text('Generar')",
      "input[value*='Generar' i]",
      "input[value*='Descargar' i]",
    ].join(", "),
  },
} as const;
