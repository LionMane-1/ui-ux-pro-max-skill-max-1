/* Functional and responsive checks: every page renders clean, the booking
   wizard validates and completes, navigation traps focus, and the whole thing
   still works with JavaScript and motion switched off.

   Run with `npm test`. Pass SHOTS=<dir> to also write screenshots. */
import { serve, launch, PAGES, reporter } from './helpers.mjs';
import { mkdirSync } from 'node:fs';

const { base: BASE, close } = await serve();
const SHOTS = process.env.SHOTS || '';
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const browser = await launch();
const r = reporter();
const log = r.check;

async function newPage(ctx) {
  const p = await ctx.newPage();
  p.errors = [];
  p.on('console', m => { if (m.type() === 'error' && !/fonts\.g|net::ERR/.test(m.text())) p.errors.push(m.text()); });
  p.on('pageerror', e => p.errors.push('PAGEERROR ' + e.message));
  return p;
}

/* ---------- 1. every page: errors, overflow, screenshots ---------- */
for (const [label, w, h] of [['desktop',1440,900], ['mobile',390,844]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  r.group(`${label} (${w}px)`);
  for (const f of PAGES) {
    const p = await newPage(ctx);
    await p.goto(`${BASE}/${f}`, { waitUntil: 'load' });
    await p.waitForTimeout(400);
    log(p.errors.length === 0, `${f} — no console/page errors ${p.errors.length ? JSON.stringify(p.errors.slice(0,2)) : ''}`);
    const overflow = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    log(overflow <= 0, `${f} — no horizontal overflow (${overflow}px)`);
    const spriteOk = await p.evaluate(() => !!document.querySelector('[data-sprite] symbol'));
    log(spriteOk, `${f} — icon sprite injected`);
    if (SHOTS) await p.screenshot({ path: `${SHOTS}/${label}-${f.replace('.html','')}.png`, fullPage: label === 'desktop' });
    await p.close();
  }
  await ctx.close();
}

/* ---------- 2. booking wizard ---------- */
r.group('booking wizard');
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await newPage(ctx);
  await p.goto(`${BASE}/book.html?service=bridal`, { waitUntil: 'load' });
  await p.waitForTimeout(300);

  log(await p.locator('#booking-form input[value="bridal"]').isChecked(), 'deep link ?service=bridal preselects');
  log((await p.locator('[data-total-grand]').innerText()).includes('195'), 'estimate reflects preselection');

  // step 1 gate: clear it, then try to advance
  await p.locator('#booking-form input[value="bridal"]').uncheck();
  await p.locator('[data-step-panel]').first().locator('[data-next]').click();
  log(await p.locator('[data-step-panel]').first().locator('[data-error-summary]').isVisible(), 'step 1 blocks with no service chosen');
  log(await p.locator('[data-require-one="service"]').getAttribute('data-invalid') === 'true', 'service group marked invalid');

  await p.locator('#booking-form input[value="dry-cleaning"]').check();
  await p.locator('#booking-form input[value="shirt-service"]').check();
  const sub = await p.locator('[data-total-subtotal]').innerText();
  log(sub === '£20.40', `estimate sums correctly (${sub})`);
  const del = await p.locator('[data-total-delivery]').innerText();
  log(del === '£5.90', `delivery fee applied under £30 (${del})`);
  log(await p.locator('[data-free-note]').isVisible(), 'upsell note shown below free-delivery threshold');

  await p.locator('[data-step-panel]').first().locator('[data-next]').click();
  await p.waitForTimeout(300);
  log(await p.locator('#s2-h').isVisible(), 'advanced to step 2');
  log(await p.locator('[data-step-item]').first().getAttribute('data-state') === 'done', 'step 1 marked done in progress bar');

  // step 2 validation
  const s2 = p.locator('[data-step-panel]').nth(1);
  await s2.locator('[data-next]').click();
  await p.waitForTimeout(200);
  const errCount = await s2.locator('[data-error-summary] li').count();
  log(errCount >= 4, `step 2 lists every missing field (${errCount} errors)`);
  log(await p.locator('#postcode').getAttribute('aria-invalid') === 'true', 'aria-invalid set on failing input');

  await p.fill('#address1', '18 Sydney Street');
  await p.fill('#postcode', 'ZZ99 9ZZ');
  await s2.locator('[data-next]').click();
  await p.waitForTimeout(150);
  log(await p.locator('#postcode-err').innerText() !== '', 'out-of-area postcode rejected');

  await p.fill('#postcode', 'sw3 6pp');
  await p.waitForTimeout(100);
  log(await p.locator('#postcode-err').innerText() === '', 'valid postcode clears the error live');

  const tomorrow = new Date(Date.now() + 2 * 864e5).toISOString().slice(0, 10);
  await p.fill('#date', tomorrow);
  await p.locator('input[name="window"][value="10-13"]').check();
  await s2.locator('[data-next]').click();
  await p.waitForTimeout(300);
  log(await p.locator('#s3-h').isVisible(), 'advanced to step 3');

  // step 3
  const s3 = p.locator('[data-step-panel]').nth(2);
  await p.fill('#firstName', 'Renata');
  await p.fill('#lastName', 'Blanc');
  await p.fill('#email', 'not-an-email');
  await p.fill('#phone', '123');
  await s3.locator('[data-next]').click();
  await p.waitForTimeout(150);
  log((await p.locator('#email-err').innerText()).includes('name@example.com'), 'email format validated');
  log((await p.locator('#phone-err').innerText()).includes('10 digits'), 'phone length validated');

  await p.fill('#email', 'renata@example.com');
  await p.fill('#phone', '07700900123');
  await p.locator('input[name="preference"][value="eco"]').check();
  await s3.locator('[data-next]').click();
  await p.waitForTimeout(300);
  log(await p.locator('#s4-h').isVisible(), 'advanced to step 4');

  const reviewText = await p.locator('[data-review]').innerText();
  log(reviewText.includes('Dry cleaning') && reviewText.includes('Sydney Street') && reviewText.includes('renata@example.com'),
      'review shows services, address and contact');
  log(reviewText.includes('Eco solvent only'), 'review shows preferences');

  // draft persistence
  const draft = await p.evaluate(() => localStorage.getItem('atelier-blanc:booking-draft:v1'));
  log(!!draft && JSON.parse(draft).email === 'renata@example.com', 'draft persisted to localStorage');

  // terms gate
  await p.locator('button[type="submit"]').click();
  await p.waitForTimeout(150);
  const s4sum = await p.locator('[data-step-panel]').nth(3).locator('[data-error-summary]').innerText();
  log(s4sum.includes('care policy'), 'terms checkbox gates submission with a named error');

  // edit link jumps back
  await p.locator('[data-edit-step="2"]').first().click();
  await p.waitForTimeout(300);
  log(await p.locator('#s2-h').isVisible(), 'Edit link returns to the right step');

  await p.locator('[data-step-panel]').nth(1).locator('[data-next]').click();
  await p.waitForTimeout(200);
  await p.locator('[data-step-panel]').nth(2).locator('[data-next]').click();
  await p.waitForTimeout(300);
  await p.locator('#terms').check();
  await p.locator('button[type="submit"]').click();
  await p.waitForTimeout(400);

  log(await p.locator('[data-confirm-panel]').isVisible(), 'confirmation panel shown');
  const ref = await p.locator('[data-confirm-ref]').innerText();
  log(/^AB-\d{6}-[A-Z0-9]{4}$/.test(ref), `booking reference generated (${ref})`);
  log(await p.locator('[data-wizard]').isHidden(), 'wizard hidden after confirm');
  const cleared = await p.evaluate(() => localStorage.getItem('atelier-blanc:booking-draft:v1'));
  log(cleared === null, 'draft cleared after confirmation');
  log(p.errors.length === 0, `no JS errors during the flow ${JSON.stringify(p.errors.slice(0,2))}`);
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/booking-confirmed.png` });
  await p.close();
  await ctx.close();
}

/* ---------- 3. mobile drawer + a11y ---------- */
r.group('navigation & interaction');
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p = await newPage(ctx);
  await p.goto(`${BASE}/index.html`, { waitUntil: 'load' });
  await p.waitForTimeout(300);

  await p.locator('[data-nav-toggle]').click();
  await p.waitForTimeout(600);
  log(await p.locator('#nav-drawer').evaluate(el => el.classList.contains('is-open')), 'drawer opens');
  log(await p.locator('[data-nav-toggle]').first().getAttribute('aria-expanded') === 'true', 'aria-expanded updated');
  log(await p.evaluate(() => document.activeElement.closest('#nav-drawer') !== null), 'focus moved into drawer');
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/mobile-drawer.png` });

  await p.keyboard.press('Escape');
  await p.waitForTimeout(600);
  log(!(await p.locator('#nav-drawer').evaluate(el => el.classList.contains('is-open'))), 'Escape closes drawer');
  log(await p.evaluate(() => document.activeElement.hasAttribute('data-nav-toggle')), 'focus restored to toggle');

  // accordion
  const trig = p.locator('[data-accordion-trigger]').nth(1);
  await trig.click();
  await p.waitForTimeout(400);
  log(await trig.getAttribute('aria-expanded') === 'true', 'accordion opens on click');
  log(await p.locator('#faq-2').getAttribute('data-open') === 'true', 'accordion panel state set');

  // postcode checker
  await p.fill('#home-postcode', 'nw3 4qg');
  await p.locator('[data-postcode-check] button[type="submit"]').click();
  await p.waitForTimeout(200);
  log((await p.locator('#home-postcode-result').innerText()).includes('NW3'), 'postcode checker confirms served district');
  await p.fill('#home-postcode', 'M1 1AE');
  await p.locator('[data-postcode-check] button[type="submit"]').click();
  await p.waitForTimeout(200);
  log((await p.locator('#home-postcode-result').innerText()).includes('courier'), 'postcode checker handles out-of-area');

  // skip link
  await p.reload({ waitUntil: 'load' });
  await p.waitForTimeout(300);
  await p.keyboard.press('Tab');
  await p.waitForTimeout(250);
  log(await p.evaluate(() => document.activeElement.classList.contains('skip-link')), 'skip link is first in tab order');

  // touch targets
  const small = await p.evaluate(() => {
    const out = [];
    document.querySelectorAll('a.btn, button, .nav-toggle, .choice, .pill-choice input + *').forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.width && r.height && (r.height < 44 || r.width < 44)) out.push(el.className + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
    });
    return out;
  });
  log(small.length === 0, `all interactive targets >= 44px ${small.slice(0,3).join(' | ')}`);
  await p.close();
  await ctx.close();
}

/* ---------- 4. no-JS fallback ---------- */
r.group('no-JS fallback');
{
  const ctx = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/book.html`, { waitUntil: 'load' });
  const visible = await p.locator('[data-step-panel]:visible').count();
  log(visible === 4, `all ${visible} steps readable as one form without JS`);
  log(await p.locator('.steps').isHidden(), 'inert step indicator hidden without JS');
  log(await p.locator('[data-next]').first().isHidden(), 'inert Next buttons hidden without JS');
  log(await p.locator('button[type="submit"]').isVisible(), 'submit button still present without JS');
  await p.close();
  await ctx.close();
}

/* ---------- 5. reduced motion ---------- */
r.group('reduced motion');
{
  const ctx = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1440, height: 900 } });
  const p = await newPage(ctx);
  await p.goto(`${BASE}/index.html`, { waitUntil: 'load' });
  await p.waitForTimeout(300);
  const hidden = await p.locator('[data-reveal]:not(.is-revealed)').count();
  log(hidden === 0, `all reveal content shown immediately (${hidden} still hidden)`);
  const marquee = await p.evaluate(() => getComputedStyle(document.querySelector('.trust-strip__track')).animationName);
  log(marquee === 'none', 'marquee stopped under reduced motion');
  await p.close();
  await ctx.close();
}

await browser.close();
await close();
r.finish('functional');
