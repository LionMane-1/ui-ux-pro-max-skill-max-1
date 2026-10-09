/* Accessibility and colour-contrast checks: landmarks, heading order,
   accessible names, keyboard entry point, and a WCAG AA contrast sweep over
   every rendered text node with translucent layers composited properly.

   Run with `npm run test:a11y`. */
import { serve, launch, PAGES, reporter } from './helpers.mjs';

const { base: BASE, close } = await serve();
const browser = await launch();
const r = reporter();
const b = browser;
for (const f of PAGES) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  await p.goto(BASE + '/' + f, { waitUntil: 'load' });
  await p.waitForTimeout(250);

  // A fresh document: the first Tab must land on a visible skip link.
  await p.keyboard.press('Tab');
  await p.waitForTimeout(300);
  const first = await p.evaluate(() => ({
    cls: document.activeElement.className,
    txt: document.activeElement.textContent.trim(),
    top: Math.round(document.activeElement.getBoundingClientRect().top)
  }));
  r.check(first.cls.includes('skip-link') && first.top >= 0,
      `${f} — first Tab focuses a visible skip link ("${first.txt}", top ${first.top}px)`);

  // and it actually moves focus into main
  await p.keyboard.press('Enter');
  await p.waitForTimeout(200);
  r.check(await p.evaluate(() => location.hash === '#main'), `${f} — skip link targets #main`);

  // document landmarks / heading order
  const a = await p.evaluate(() => {
    const hs = [...document.querySelectorAll('h1,h2,h3,h4')].map(h => +h.tagName[1]);
    let jump = null, prev = hs[0];
    for (const l of hs.slice(1)) { if (l > prev + 1) { jump = prev + '->' + l; break; } prev = l; }
    return {
      h1: document.querySelectorAll('h1').length,
      main: document.querySelectorAll('main').length,
      lang: document.documentElement.lang,
      title: document.title.length,
      jump,
      noLabelBtn: [...document.querySelectorAll('button, a')].filter(el =>
        !el.textContent.trim() && !el.getAttribute('aria-label') && !el.querySelector('.visually-hidden')).length,
      unlabelledInputs: [...document.querySelectorAll('input:not([type=hidden]), select, textarea')].filter(el =>
        !el.labels?.length && !el.getAttribute('aria-label') && !el.getAttribute('aria-labelledby')).length,
      landmarks: [...document.querySelectorAll('nav')].filter(n =>
        !n.getAttribute('aria-label') && !n.getAttribute('aria-labelledby')).length
    };
  });
  r.check(a.h1 === 1, `${f} — exactly one h1 (${a.h1})`);
  r.check(a.main === 1, `${f} — one main landmark`);
  r.check(a.lang === 'en-GB', `${f} — lang set (${a.lang})`);
  r.check(a.title > 10 && a.title < 70, `${f} — title length ${a.title}`);
  r.check(a.jump === null, `${f} — no skipped heading level ${a.jump ?? ''}`);
  r.check(a.noLabelBtn === 0, `${f} — every button/link has an accessible name (${a.noLabelBtn} missing)`);
  r.check(a.unlabelledInputs === 0, `${f} — every form control is labelled (${a.unlabelledInputs} missing)`);
  r.check(a.landmarks === 0, `${f} — every nav is named (${a.landmarks} unnamed)`);
  await ctx.close();
}

/* contrast audit on rendered text */
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();
r.group('contrast (WCAG AA)');
for (const f of ['index.html','book.html','pricing.html','contact.html']) {
  await p.goto(BASE + '/' + f, { waitUntil: 'load' });
  await p.waitForTimeout(300);
  const bad = await p.evaluate(() => {
    const lum = c => { const [r,g,bl] = c.map(v => { v/=255; return v<=0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055,2.4); });
      return 0.2126*r + 0.7152*g + 0.0722*bl; };
    const parse = s => (s.match(/[\d.]+/g) || []).slice(0,3).map(Number);
    // Walk up compositing every translucent layer, so rgba() surfaces are
    // measured as they actually render rather than as their opaque colour.
    const bgOf = el => {
      const layers = []; let n = el;
      while (n && n !== document.documentElement) {
        const c = getComputedStyle(n).backgroundColor;
        const v = (c.match(/[\d.]+/g) || []).map(Number);
        if (v.length) {
          const a = v.length === 4 ? v[3] : 1;
          if (a > 0) { layers.push([v[0], v[1], v[2], a]); if (a === 1) break; }
        }
        n = n.parentElement;
      }
      layers.push([255, 255, 255, 1]);
      let out = layers[layers.length - 1].slice(0, 3);
      for (let i = layers.length - 2; i >= 0; i--) {
        const [r, g, bl, a] = layers[i];
        out = [r * a + out[0] * (1 - a), g * a + out[1] * (1 - a), bl * a + out[2] * (1 - a)];
      }
      return out;
    };
    const out = [];
    document.querySelectorAll('body *').forEach(el => {
      if (!el.childNodes.length) return;
      const txt = [...el.childNodes].filter(n => n.nodeType === 3 && n.textContent.trim()).map(n => n.textContent.trim()).join(' ');
      if (!txt) return;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) return;
      // The fixed header floats over whatever section is beneath it, which an
      // ancestor walk cannot see. Its two states are asserted separately.
      if (el.closest('.site-header, .nav-drawer')) return;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const fg = parse(cs.color), bg = bgOf(el);
      if (fg.length < 3) return;
      const L1 = lum(fg), L2 = lum(bg);
      const ratio = (Math.max(L1,L2)+0.05)/(Math.min(L1,L2)+0.05);
      const size = parseFloat(cs.fontSize), bold = +cs.fontWeight >= 700;
      const large = size >= 24 || (size >= 18.66 && bold);
      const need = large ? 3 : 4.5;
      if (ratio < need) out.push({ txt: txt.slice(0,42), ratio: ratio.toFixed(2), need, size: Math.round(size), cls: (el.className+'').slice(0,34) });
    });
    return out;
  });
  r.check(bad.length === 0, `${f} — all text meets AA contrast (${bad.length} below)`);
  if (bad.length) console.table(bad.slice(0, 12));
}
await b.close();
await close();
r.finish('accessibility');
