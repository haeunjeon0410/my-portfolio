// 포트폴리오 카드 앱 서버. 의존 패키지 없이 Node 만으로 동작한다. 실행: node server.js
if (Number(process.versions.node.split('.')[0]) < 22) {
  console.error(`Node.js 22 이상이 필요합니다. (지금: ${process.versions.node}) https://nodejs.org 에서 최신 LTS 를 설치해 주세요.`); process.exit(1);
}
const http = require('http');
const fs = require('fs');
const path = require('path');
const { collect, IMG_DIR } = require('./lib/collect');
const { build, patchProject, includeProject, hideProject, DATA_DIR } = require('./lib/build');

const PORT = Number(process.env.PORT) || 4173;
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const IMAGES_DIR = path.join(DATA_DIR, 'images');
const PDF_FILE = path.join(DATA_DIR, 'portfolio.pdf');
const MAX_BODY = 256 * 1024;                                  // 이 앱의 요청 본문은 아주 작다. 큰 본문은 거절한다.
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.pdf': 'application/pdf' };
const job = { running: false, log: [], error: '' };

// ---------- 응답 도우미 ----------
const SECURITY = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY' };
const send = (res, code, body, type = 'application/json; charset=utf-8', extra = {}) => { res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', ...SECURITY, ...extra }); res.end(body); };
const json = (res, obj, code = 200) => send(res, code, JSON.stringify(obj));
const fail = (res, code, message) => json(res, { ok: false, message }, code);

function readBody(req) {                                       // 크기 제한이 있는 JSON 본문 읽기
  return new Promise((ok, bad) => {
    let size = 0; const chunks = [];
    let rejected = false;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { if (!rejected) { rejected = true; bad(Object.assign(new Error('요청이 너무 큽니다.'), { status: 413 })); } return; }     // 더 받지 않고 버린다. 연결은 응답을 보낸 뒤에 닫힌다
      chunks.push(c);
    });
    req.on('end', () => { if (rejected) return; try { ok(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch { bad(Object.assign(new Error('요청 형식이 올바르지 않습니다.'), { status: 400 })); } });
    req.on('error', bad);
  });
}
function serveFile(res, dir, rel) {                            // dir 밖으로 나가는 경로는 모두 막는다 (.. 포함)
  const file = path.resolve(dir, rel);
  if (file !== dir && !file.startsWith(dir + path.sep)) return fail(res, 404, 'not found');
  let st; try { st = fs.statSync(file); } catch { return fail(res, 404, 'not found'); }
  if (!st.isFile()) return fail(res, 404, 'not found');
  send(res, 200, fs.readFileSync(file), MIME[path.extname(file).toLowerCase()] || 'application/octet-stream');
}

// ---------- PDF: 동시에 두 번 만들지 않는다 ----------
let pdfJob = null;
function makePdf() {
  if (!pdfJob) pdfJob = require('./lib/pdf').makePdf(`http://127.0.0.1:${PORT}/print.html`, PDF_FILE).finally(() => { pdfJob = null; });
  return pdfJob;                                               // 이미 만드는 중이면 그 결과를 같이 기다린다
}
function pdfInfo() {
  let st; try { st = fs.statSync(PDF_FILE); } catch { return { exists: false }; }
  const d = build(), cards = d.projects.length;
  const pages = ['team', 'solo'].reduce((n, k) => n + Math.ceil(d.projects.filter(p => p.section === k).length / 2), 0);
  return { exists: true, cards, pages, at: st.mtime.toISOString() };
}

// ---------- 요청 검사 ----------
// 이 앱은 내 PC 안에서만 쓴다. 다른 웹사이트가 브라우저를 통해 이 서버에 요청을 보내는 것(예: 몰래 "빼기" 누르기)을 막는다.
const HOST_OK = /^(127\.0\.0\.1|localhost):\d+$/;
const ORIGIN_OK = new Set([`http://127.0.0.1:${PORT}`, `http://localhost:${PORT}`]);
const allowed = (req) => HOST_OK.test(req.headers.host || '') && (!req.headers.origin || ORIGIN_OK.has(req.headers.origin));

const server = http.createServer(async (req, res) => {
  if (!allowed(req)) return fail(res, 403, '허용되지 않은 요청입니다.');
  let p; try { p = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { return fail(res, 400, '주소가 올바르지 않습니다.'); }
  const post = req.method === 'POST';
  try {
    if (p === '/api/projects') return json(res, build());
    if (p === '/api/status') return json(res, job);
    if (p === '/api/state') return json(res, pdfInfo());
    if (p === '/api/collect' && post) {
      if (job.running) return fail(res, 409, '이미 불러오는 중입니다.');
      Object.assign(job, { running: true, log: [], error: '' });
      collect(m => job.log.push(m)).catch(e => { job.error = e.message; job.log.push('오류: ' + e.message); }).finally(() => { job.running = false; });
      return json(res, { ok: true });
    }
    if (p === '/api/patch' && post) { const b = await readBody(req); patchProject(b.key, b.patch); return json(res, { ok: true }); }
    if (p === '/api/include' && post) { const b = await readBody(req); includeProject(b.key); return json(res, { ok: true }); }
    if (p === '/api/hide' && post) { const b = await readBody(req); hideProject(b.key); return json(res, { ok: true }); }
    if (p === '/api/make' && post) { await makePdf(); return json(res, { ok: true, ...pdfInfo() }); }
    if (p === '/api/download') {
      let buf; try { buf = fs.readFileSync(PDF_FILE); } catch { return fail(res, 404, '아직 만든 PDF가 없습니다.'); }
      return send(res, 200, buf, 'application/pdf', { 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent('포트폴리오.pdf')}` });
    }
    if (p.startsWith('/img/')) return serveFile(res, IMG_DIR, p.slice(5));
    if (p.startsWith('/dimg/')) return serveFile(res, IMAGES_DIR, p.slice(6));
    if (p.startsWith('/api/')) return fail(res, 404, 'not found');
    return serveFile(res, PUBLIC, p === '/' ? 'index.html' : p.slice(1));
  } catch (e) { return fail(res, e.status || (e.code === 'BAD_INPUT' ? 400 : 500), e.message); }
});
server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') { console.log(`이미 실행 중입니다. 브라우저에서 http://127.0.0.1:${PORT} 를 열어 주세요.`); process.exit(0); }
  throw e;
});
if (require.main === module) server.listen(PORT, '127.0.0.1', () => console.log(`포트폴리오 카드: http://127.0.0.1:${PORT}  (끄려면 이 창을 닫거나 Ctrl+C)`));
module.exports = server;
