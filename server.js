// 포트폴리오 카드 앱 서버. 의존 패키지 없이 Node 만으로 동작한다. 실행: node server.js
if (Number(process.versions.node.split('.')[0]) < 22) {
  console.error(`Node.js 22 이상이 필요합니다. (지금: ${process.versions.node}) https://nodejs.org 에서 최신 LTS 를 설치해 주세요.`); process.exit(1);
}
const http = require('http');
const fs = require('fs');
const path = require('path');
const { collect, inspectRepos, IMG_DIR } = require('./lib/collect');
const { build, patchProject, includeProject, hideProject, hiddenList, restoreProjects, sourceRepo, checkKey, DATA_DIR } = require('./lib/build');
const ai = require('./lib/ai');

const PORT = Number(process.env.PORT) || 4173;
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const IMAGES_DIR = path.join(DATA_DIR, 'images');
const PDF_FILE = path.join(DATA_DIR, 'portfolio.pdf');
const MAX_BODY = 256 * 1024;                                  // 이 앱의 요청 본문은 아주 작다. 큰 본문은 거절한다.
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.pdf': 'application/pdf' };
const job = { running: false, log: [], error: '' };
const liveCache = new Map(), LIVE_TTL = 10 * 60 * 1000;      // 뺀 저장소의 지금 상태 (되살리기 창용)

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
let pdfChain = Promise.resolve();
function makePdf(keys) {                                       // keys 가 있으면 그 카드만 담는다 (지원 분야별 PDF)
  const url = `http://127.0.0.1:${PORT}/print.html` + (keys ? `?keys=${encodeURIComponent(keys.join(','))}` : '');
  const run = () => require('./lib/pdf').makePdf(url, PDF_FILE);
  const job = pdfChain.then(run, run);                         // 하나씩 차례로 만든다 (같은 파일에 동시에 쓰지 않도록)
  pdfChain = job.catch(() => {});
  return job;
}
const pageCount = (list) => ['team', 'solo'].reduce((n, k) => n + Math.ceil(list.filter(p => p.section === k).length / 2), 0);
function pdfInfo(list) {
  let st; try { st = fs.statSync(PDF_FILE); } catch { return { exists: false }; }
  const l = list || build().projects;
  return { exists: true, cards: l.length, pages: pageCount(l), at: st.mtime.toISOString() };
}
function pickKeys(raw) {                                       // 화면에서 온 카드 목록 검사: 있는 카드만, 최소 1개
  if (raw === undefined) return null;
  if (!Array.isArray(raw) || raw.length > 200) throw Object.assign(new Error('선택한 프로젝트가 올바르지 않습니다.'), { code: 'BAD_INPUT' });
  const keys = raw.map(checkKey), all = build().projects;
  const list = all.filter(p => keys.includes(p.key.toLowerCase()));
  if (!list.length) throw Object.assign(new Error('내려받을 프로젝트를 한 개 이상 선택해 주세요.'), { code: 'BAD_INPUT' });
  return { keys: list.map(p => p.key.toLowerCase()), list, full: list.length === all.length };
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
    if (p === '/api/include' && post) {
      const b = await readBody(req); includeProject(b.key);
      const proj = build().projects.find(x => x.key === String(b.key).toLowerCase());
      let aiTitle = null;
      if (proj && ai.available()) {                                    // 새로 넣은 카드의 제목 초안만 AI가 쓴다 (실패하면 README에서 뽑은 값 그대로)
        const r = sourceRepo(b.key); aiTitle = r && await ai.suggestTitle(r);
        if (aiTitle) patchProject(b.key, { title: aiTitle });
      }
      return json(res, { ok: true, aiTitle });
    }
    if (p === '/api/retitle' && post) {                               // 수정 창의 "AI로 제목 쓰기": 제안만 돌려주고 저장은 사용자가 한다
      const b = await readBody(req);
      if (!ai.available()) return fail(res, 400, 'AI 키가 설정되지 않았습니다.');
      const r = sourceRepo(b.key); const titles = r ? await ai.suggestTitles(r) : [];
      return titles.length ? json(res, { ok: true, titles }) : fail(res, 422, ai.error() || '제목을 만들지 못했습니다.');
    }
    if (p === '/api/ai') return json(res, { available: ai.available() });
    if (p === '/api/hidden') {
      const base = hiddenList(), now = Date.now();
      const need = base.filter(x => !x.found && !(liveCache.get(x.key) && now - liveCache.get(x.key).at < LIVE_TTL)).map(x => x.repo);
      if (need.length) {                                             // 업데이트가 건너뛴 저장소만 지금 GitHub에서 확인 (10분간 기억)
        const got = await inspectRepos(need, build().user.login).catch(() => new Map());
        need.forEach(n => liveCache.set(n.toLowerCase(), { at: now, repo: got.get(n.toLowerCase()) || null }));
      }
      const extra = new Map([...liveCache].filter(([, v]) => v.repo).map(([k, v]) => [k, v.repo]));
      return json(res, hiddenList(extra));
    }
    if (p === '/api/restore' && post) {
      const b = await readBody(req);
      if (!Array.isArray(b.keys) || !b.keys.length || b.keys.length > 200) throw Object.assign(new Error('되살릴 저장소를 선택해 주세요.'), { code: 'BAD_INPUT' });
      restoreProjects(b.keys); return json(res, { ok: true });
    }
    if (p === '/api/hide' && post) { const b = await readBody(req); hideProject(b.key); return json(res, { ok: true }); }
    if (p === '/api/make' && post) {
      const sel = pickKeys((await readBody(req)).keys);
      await makePdf(sel && !sel.full ? sel.keys : null);       // 전부 고른 경우는 필터 없이 만든다
      return json(res, { ok: true, ...pdfInfo(sel ? sel.list : null) });
    }
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
if (require.main === module) server.listen(PORT, '127.0.0.1', () => console.log(`MY PORTFOLIO: http://127.0.0.1:${PORT}  (끄려면 이 창을 닫거나 Ctrl+C)`));
module.exports = server;
