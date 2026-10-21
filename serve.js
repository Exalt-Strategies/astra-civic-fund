const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 4358;
const ROOT = __dirname;

// Load .env.local for local development (never committed).
const envFile = path.join(ROOT, '.env.local');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
  }
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

const server = http.createServer(async (req, res) => {
  let urlPath;
  try { urlPath = decodeURIComponent(req.url.split('?')[0]); }
  catch { res.writeHead(400, { 'Content-Type': 'text/plain' }); res.end('Bad request'); return; }
  if (urlPath.includes('\0')) { res.writeHead(400, { 'Content-Type': 'text/plain' }); res.end('Bad request'); return; }

  const api = urlPath.match(/^\/api\/([a-z-]+)$/);
  if (api) {
    const file = path.join(ROOT, 'api', api[1] + '.js');
    if (!fs.existsSync(file)) { res.writeHead(404); res.end('Not found'); return; }
    try { await require(file)(req, res); }
    catch (e) {
      console.error(e);
      if (!res.headersSent) { res.writeHead(500); res.end('Server error'); }
      else if (!res.writableEnded) res.end();
    }
    return;
  }

  if (urlPath === '/') urlPath = '/index.html';
  let filePath = path.join(ROOT, urlPath);
  const rel = filePath.slice(ROOT.length);
  const blocked = /\/(api|test|scripts|emails|node_modules)\//.test(rel) || rel.split('/').some(seg => seg.startsWith('.'));
  if (!(filePath === ROOT || filePath.startsWith(ROOT + path.sep)) || blocked) {
    res.writeHead(403); res.end('Forbidden'); return;
  }

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      if (fs.existsSync(filePath + '.html')) filePath = filePath + '.html';
      else { res.writeHead(404, { 'Content-Type': 'text/html' }); res.end('<h1>404</h1>'); return; }
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': TYPES[ext] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, '127.0.0.1', () =>console.log(`Astra running at http://localhost:${PORT}`));
