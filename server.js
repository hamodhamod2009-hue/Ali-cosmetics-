const http = require('http');
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

pool.query('SELECT 1').then(() => console.log('Postgres connected')).catch(err => console.error('Postgres connection error:', err.message));
pool.query(`CREATE TABLE IF NOT EXISTS app_data (id INTEGER PRIMARY KEY, data JSONB NOT NULL DEFAULT '{}'::jsonb)`).then(() => console.log('app_data table ready')).catch(err => console.error('Table create error:', err.message));
function readJson(req){return new Promise((resolve,reject)=>{let body='';req.on('data',c=>body+=c);req.on('end',()=>{try{resolve(body?JSON.parse(body):{});}catch(e){reject(e);}});req.on('error',reject);});}
async function getAppData(){const r=await pool.query('SELECT data FROM app_data WHERE id=1');return r.rows[0]?.data||null;}
async function saveAppData(data){await pool.query('INSERT INTO app_data (id,data) VALUES (1,$1::jsonb) ON CONFLICT (id) DO UPDATE SET data=EXCLUDED.data',[JSON.stringify(data)]);}
const PORT = Number(process.env.PORT) || 3000;
const ROOT = __dirname;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function send(res, status, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, {
    'Content-Type': type,
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Referrer-Policy': 'same-origin'
  });
  res.end(body);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (url.pathname === '/health') {
    return send(res, 200, JSON.stringify({ ok: true, app: 'Ali Cosmetics' }), 'application/json; charset=utf-8');
  }

  let pathname;
  try { pathname = decodeURIComponent(url.pathname); }
  catch { return send(res, 400, 'Bad request'); }

  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const requested = path.resolve(ROOT, relative);
  if (!requested.startsWith(path.resolve(ROOT) + path.sep)) return send(res, 403, 'Forbidden');

  fs.stat(requested, (err, stat) => {
    let file = requested;
    if (!err && stat.isDirectory()) file = path.join(requested, 'index.html');

    fs.readFile(file, (readErr, data) => {
      if (readErr) {
        // Single-page fallback.
        return fs.readFile(path.join(ROOT, 'index.html'), (fallbackErr, html) => {
          if (fallbackErr) return send(res, 404, 'Not found');
          send(res, 200, html, MIME['.html']);
        });
      }
      send(res, 200, data, MIME[path.extname(file).toLowerCase()] || 'application/octet-stream');
    });
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Ali Cosmetics running at http://localhost:${PORT}`);
});
