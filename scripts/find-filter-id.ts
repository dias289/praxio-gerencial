import { chromium } from 'playwright';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });
dotenv.config({ path: path.join(process.cwd(), '.env') });

const BASE  = 'https://portaldocliente.praxio.com.br';
const EMAIL = process.env.PORTAL_EMAIL ?? '';
const SENHA = process.env.PORTAL_SENHA ?? '';

async function main() {
  const browser = await chromium.launch({ headless: false });
  const ctx     = await browser.newContext();
  const page    = await ctx.newPage();

  // Intercepta o body de TODOS os POST requests
  await page.addInitScript(() => {
    const origOpen = XMLHttpRequest.prototype.open;
    const origSend = XMLHttpRequest.prototype.send;
    (XMLHttpRequest.prototype as any).open = function(m: string, u: string, ...r: any[]) {
      (this as any).__url = u;
      return origOpen.call(this, m, u, ...r);
    };
    XMLHttpRequest.prototype.send = function(body?: any) {
      if (body && String(body).includes('customSearch')) {
        console.log(`[XHR] ${(this as any).__url} | ${body}`);
        (window as any).__foundId = String(body).match(/customSearchMenu=(\d+)/)?.[1];
      }
      return origSend.call(this, body);
    };
  });

  // Captura via Playwright também
  ctx.on('request', req => {
    const body = req.postData() ?? '';
    if (body.includes('customSearch')) {
      console.log(`\n✅ FOUND: ${req.url()}`);
      console.log(`   Body: ${body}`);
      const id = body.match(/customSearchMenu=(\d+)/)?.[1];
      if (id) console.log(`\n🎯 ID DO FILTRO: ${id}\n`);
    }
  });

  // Login
  await page.goto(`${BASE}/Home/Index`, { waitUntil: 'domcontentloaded' });
  await page.fill('[name=txtLogin]', EMAIL);
  await page.fill('[name=txtSenha]', SENHA);
  await Promise.all([
    page.waitForURL(u => u.toString().includes('/Ticket'), { timeout: 30_000 }),
    page.click('button[type=submit]'),
  ]);
  await page.waitForSelector('#grdTicket', { timeout: 30_000 });
  await page.waitForTimeout(2000);
  console.log('✓ Login OK — abrindo menu de filtros...\n');

  // Abre o dropdown
  await page.locator('.dropdown-toggle').first().click().catch(() => {});
  await page.waitForTimeout(800);

  // Passa sobre "Pesquisas salvas"
  await page.locator('text=Pesquisas salvas').first().hover();
  await page.waitForTimeout(800);

  // Clica em "Tickets concluidos / abertos / em andamento / pendente"
  console.log('🖱️  Clicando em "Tickets concluidos / abertos / em andamento / pendente"...');
  await page.locator('text=/conclu.*abertos/i, text=/abertos.*conclu/i').first().click();
  await page.waitForTimeout(4000);

  const id = await page.evaluate(() => (window as any).__foundId);
  if (id) {
    console.log(`\n🎯 ID ENCONTRADO: customSearchMenu=${id}`);
  } else {
    console.log('ID não capturado via XHR. Verificando URL:', page.url());
  }

  await browser.close();
}

main().catch(console.error);
