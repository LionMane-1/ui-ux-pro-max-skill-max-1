/* Shared harness: serves the site on an ephemeral port and hands back a
   browser. Set CHROMIUM_PATH when Playwright's bundled build is not on disk
   (CI images often pre-install one elsewhere). */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

export async function serve() {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    let file = decodeURIComponent(url.pathname);
    if (file.endsWith('/')) file += 'index.html';
    const abs = path.join(ROOT, file);
    if (!abs.startsWith(ROOT)) { res.writeHead(403).end(); return; }
    try {
      const body = await readFile(abs);
      res.writeHead(200, { 'content-type': TYPES[path.extname(abs)] ?? 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
    }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { base, close: () => new Promise(r => server.close(r)) };
}

export function launch() {
  const executablePath = process.env.CHROMIUM_PATH || undefined;
  return chromium.launch(executablePath ? { executablePath } : {});
}

export const PAGES = [
  'index.html', 'services.html', 'pricing.html',
  'book.html', 'about.html', 'contact.html'
];

export function reporter() {
  let failed = 0;
  return {
    check(ok, message) {
      if (!ok) failed++;
      console.log((ok ? '  ✓ ' : '  ✗ FAIL  ') + message);
    },
    group(name) { console.log(`\n== ${name} ==`); },
    finish(label) {
      console.log(`\n${failed ? `${failed} ${label} check(s) FAILED` : `all ${label} checks passed`}`);
      process.exit(failed ? 1 : 0);
    }
  };
}
