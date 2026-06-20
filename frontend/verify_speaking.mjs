import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const SCRATCHPAD = process.env.SCRATCHPAD;

const page = await browser.newPage();
await page.setViewportSize({ width: 1280, height: 900 });
await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
await page.waitForTimeout(600);
await page.click('button:has-text("Iniciar sesión")');
await page.waitForTimeout(300);
await page.fill('input[id="login-email"]', 'juan@test.com');
await page.fill('input[id="login-pwd"]', 'Test1234!');
await page.click('button:has-text("Entrar al panel")');
await page.waitForTimeout(500);

// Directly trigger speaking state via the sim button
await page.click('button:has-text("speaking")');
await page.waitForTimeout(600);
await page.screenshot({ path: `${SCRATCHPAD}/11_orb_speaking_fixed.png` });
console.log('📸 speaking state captured');

// Also check the full orb sequence completes with cards
await page.click('button:has-text("idle")');
await page.waitForTimeout(300);
await page.fill('input[aria-label="Consulta al asistente"]', '¿Cuánto IVA debo pagar?');
await page.click('button[aria-label="Enviar consulta"]');
// Wait for full sequence + typewriter to finish
await page.waitForTimeout(6500);
await page.screenshot({ path: `${SCRATCHPAD}/12_full_sequence_with_cards.png`, fullPage: true });
console.log('📸 full sequence + cards captured');

await browser.close();
