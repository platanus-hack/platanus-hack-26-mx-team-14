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

// Look for ProductoServicio and scan forwards for buttons
const index = html.indexOf("E1350010PProductoServicio");
if (index !== -1) {
  // Let's grab 10,000 characters after this index to find the buttons
  const slice = html.slice(index, index + 35000);
  console.log("--- SCANNING FOR BUTTONS IN CONCEPTO FORM REGION ---");
  const buttonRegex = /<button\s+([^>]*)/g;
  let match;
  while ((match = buttonRegex.exec(slice)) !== null) {
    const attrs = match[1];
    const end = slice.indexOf("</button>", buttonRegex.lastIndex);
    const content = slice.slice(buttonRegex.lastIndex - match[0].length, end + 9);
    if (content.includes("Guardar") || content.includes("Cancelar") || content.includes("Aceptar")) {
      console.log(content.slice(0, 300));
      console.log("-----------------------------------------");
    }
  }
} else {
  console.log("Not found");
}
