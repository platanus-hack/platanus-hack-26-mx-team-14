# Visualization Plan — Natural Language Prompts & Dashboard Panels

Based on the real data shapes returned by `getReceiptInvoices` and `generateCSF`.

---

## 1. Natural Language Prompts

### Already working
- "Muéstrame mis facturas recibidas / emitidas"
- "¿Cuál es mi situación fiscal?" / "mis obligaciones"
- "Genera una factura para..."

### High-value gaps (require combining both datasets)

| Prompt | Computation |
|---|---|
| "¿Cuánto IVA debo pagar este mes?" | emitidas.IVA − recibidas.IVA |
| "¿Qué debo declarar este mes?" | ISR provisional + IVA neto juntos |
| "¿Cuánto me cuesta de impuestos?" | declaración estimada anualizada |
| "¿Cuánto gasté con mis proveedores?" | recibidas agrupadas por rfcEmisor |
| "Muéstrame mi flujo del mes" | ingresos (emitidas) vs gastos (recibidas) |
| "¿Cuánto ISR me toca?" | RESICO: tasa × (ingresos − gastos deducibles) |

---

## 2. New Panel Types to Build

### `declaracion` — **highest priority**
Answers: *"¿qué debo declarar este mes?"*

This is the #1 question a RESICO user asks their accountant. All the numbers are already computable from `getEmitedInvoices` + `getReceiptInvoices` + the CSF obligations.

- **Hero:** total a pagar (ISR + IVA) in large text
- **Sub-rows:** ISR provisional (with formula) + IVA a pagar (with formula)
- **Footer:** fecha de vencimiento del periodo (from obligaciones)

---

### `flujo` — ingresos vs gastos
Answers: *"muéstrame mi flujo del mes"*

- Side-by-side KPIs: Ingresos / Gastos / Margen neto
- Color-coded: green / red / neutral

---

### `iva-calc` — desglose de IVA
Answers: *"¿cuánto IVA debo?"*

- Visual equation: **[IVA trasladado]** − **[IVA acreditable]** = **[IVA a pagar]**
- Each amount tappable to drill into the underlying invoices

---

### `proveedores` — quién me ha facturado
Answers: *"¿cuánto gasté con mis proveedores?"*

- List grouped by `rfcEmisor`, sorted by total descending
- Deducible badge per row
- Subtotal + IVA acreditable shown at the bottom

---

## 3. detectSkill — patterns to add

```ts
// Declaración mensual
if (/declaraci[oó]n|qu[eé] debo|cu[aá]nto (pago|debo|me toca)|impuesto/.test(t))
  return 'getDeclaracion';

// Flujo / ingresos vs gastos
if (/flujo|ingresos?\s*vs|comparar|balance/.test(t))
  return 'getFlujo';

// Proveedores / gastos deducibles
if (/proveedor|gast[eé]|deducible|cu[aá]nto me factur/.test(t))
  return 'getProveedores';
```

---

## 4. Data sources per panel

| Panel | Skills needed |
|---|---|
| `declaracion` | `getEmitedInvoices` + `getReceiptInvoices` + CSF (tasa RESICO) |
| `flujo` | `getEmitedInvoices` + `getReceiptInvoices` |
| `iva-calc` | `getEmitedInvoices` + `getReceiptInvoices` |
| `proveedores` | `getReceiptInvoices` |
| `csf` (existing) | `generateCSF` |
| `invoices` (existing) | `getEmitedInvoices` or `getReceiptInvoices` |
