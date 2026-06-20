import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const f = execSync(
  "ls -t artifacts-local/*/fail-generateInvoice-*.html | head -1",
  { shell: "/bin/zsh" },
)
  .toString()
  .trim();
console.log("FILE:", f, "\n");
const html = readFileSync(f, "utf8");

function info(vm) {
  const i = html.indexOf(`view-model="${vm}"`);
  if (i < 0) return `${vm} => NOTFOUND`;
  const start = html.lastIndexOf("<", i);
  const seg = html.slice(start, i + 80);
  const tag = (seg.match(/^<(\w+)/) || [])[1];
  const eid = (seg.match(/\bid="([^"]+)"/) || [])[1];
  const typ = (seg.match(/\btype="([^"]+)"/) || [])[1];
  const cls = (seg.match(/\bclass="([^"]+)"/) || [])[1];
  let label;
  if (eid) {
    const re = new RegExp(`data-titulo-control="${eid}"[^>]*>([^<]*)`);
    const m = html.match(re);
    if (m) label = m[1].trim();
  }
  return `${vm} => tag=${tag} type=${typ} id=${eid} class=${cls} label=${JSON.stringify(label)}`;
}

console.log("--- receptor ---");
for (const vm of [
  "E1350003PFAC085Descrip",
  "E1350003PFAC008",
  "E1350003PFAC009Descrip",
  "E1350003PFAC101",
  "E1350003PFAC103",
  "E1350003PUsoFacturaFisicaDescrip",
  "E1350003PUsoFacturaMoralDescrip",
  "E1350003PFAC010",
  "E1350003PFAC075",
])
  console.log(info(vm));

console.log("--- conceptos grid ---");
for (const vm of [
  "E1350010PProductoServicio",
  "E1350010PNoIdentificacion",
  "E1350010PCantidad",
  "E1350010PClaveUnidad",
  "E1350010PUnidad",
  "E1350010PDescripcion",
  "E1350010PValorUnitario",
  "E1350010PDescuento",
  "E1350010PObjetoImp",
])
  console.log(info(vm));
