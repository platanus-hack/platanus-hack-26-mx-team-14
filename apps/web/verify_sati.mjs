import { chromium } from 'playwright';

const BASE = 'http://localhost:5173';
const browser = await chromium.launch({ headless: true });
const SCRATCHPAD = process.env.SCRATCHPAD;

async function shot(page, name) {
  const path = `${SCRATCHPAD}/${name}.png`;
  await page.screenshot({ path, fullPage: false });
  console.log(`📸 ${name} → ${path}`);
  return path;
}

// ── 1. Landing page – desktop ───────────────────────────────────────
{
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200); // let animations render
  await shot(page, '01_landing_desktop');

  // Mobile
  await page.setViewportSize({ width: 375, height: 812 });
  await page.waitForTimeout(600);
  await shot(page, '02_landing_mobile');
  await page.close();
}

// ── 2. Navigate to Auth ─────────────────────────────────────────────
{
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.click('button:has-text("Iniciar sesión")');
  await page.waitForTimeout(400);
  await shot(page, '03_auth_login');

  // Switch to Crear cuenta tab
  await page.click('button:has-text("Crear cuenta")');
  await page.waitForTimeout(400);
  await shot(page, '04_auth_signup_step1');

  // Fill step 1 and advance
  await page.fill('input[id="signup-name"]', 'Juan García');
  await page.fill('input[id="signup-email"]', 'juan@test.com');
  await page.fill('input[id="signup-pwd"]', 'Test1234!');
  await page.waitForTimeout(300);
  await page.click('button:has-text("Siguiente")');
  await page.waitForTimeout(400);
  await shot(page, '05_auth_signup_step2');
  await page.close();
}

// ── 3. Dashboard + orb sequence ─────────────────────────────────────
{
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  await page.click('button:has-text("Iniciar sesión")');
  await page.waitForTimeout(300);
  // Login directly
  await page.fill('input[id="login-email"]', 'juan@test.com');
  await page.fill('input[id="login-pwd"]', 'Test1234!');
  await page.click('button:has-text("Entrar al panel")');
  await page.waitForTimeout(600);
  await shot(page, '06_dashboard_idle');

  // Trigger the orb sequence via text input
  await page.fill('input[aria-label="Consulta al asistente"]', '¿Cuánto IVA debo pagar este mes?');
  await page.waitForTimeout(200);
  await page.click('button[aria-label="Enviar consulta"]');
  await page.waitForTimeout(700);
  await shot(page, '07_dashboard_listening');

  await page.waitForTimeout(1500);
  await shot(page, '08_dashboard_thinking');

  // Wait for speaking + typewriter
  await page.waitForTimeout(1800);
  await shot(page, '09_dashboard_speaking_with_cards');

  // Mobile view of dashboard
  await page.setViewportSize({ width: 375, height: 812 });
  await page.waitForTimeout(500);
  await shot(page, '10_dashboard_mobile');
  await page.close();
}

await browser.close();
console.log('✅ All screenshots captured');
