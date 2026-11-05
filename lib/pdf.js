// Chrome 을 직접 제어해서 PDF 를 만든다. 페이지가 "사진까지 모두 준비됐다(title=ready, 이미지 로드 완료)"고 할 때까지
// 기다렸다가 찍기 때문에, 명령줄 --print-to-pdf 처럼 사진이 빠지는 일이 없다. (Node 22+ 의 내장 WebSocket 사용, 설치할 것 없음)
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
function chromePath() {
  return ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(p => fs.existsSync(p));
}

async function makePdf(url, outFile) {
  const exe = chromePath(); if (!exe) throw new Error('Chrome 또는 Edge를 찾지 못했습니다.');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-chrome-'));
  const proc = spawn(exe, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${dir}`, 'about:blank'], { stdio: 'ignore' });
  let ws;
  try {
    let port = 0;
    for (let i = 0; i < 100 && !port; i++) {                    // Chrome 이 열어 준 제어 포트를 알아낸다
      await sleep(150);
      try { port = Number(fs.readFileSync(path.join(dir, 'DevToolsActivePort'), 'utf8').split('\n')[0]); } catch { /* 아직 */ }
    }
    if (!port) throw new Error('Chrome 을 제어하지 못했습니다.');
    const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const page = targets.find(t => t.type === 'page'); if (!page) throw new Error('Chrome 페이지를 찾지 못했습니다.');
    ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((ok, fail) => { ws.onopen = ok; ws.onerror = () => fail(new Error('Chrome 연결 실패')); });
    let id = 0; const waiting = new Map();
    ws.onmessage = (m) => { const j = JSON.parse(m.data); if (j.id && waiting.has(j.id)) { const { ok, fail } = waiting.get(j.id); waiting.delete(j.id); j.error ? fail(new Error(j.error.message)) : ok(j.result); } };
    ws.onclose = () => { for (const w of waiting.values()) w.fail(new Error('Chrome 연결이 끊어졌습니다.')); waiting.clear(); };       // Chrome 이 죽으면 기다리던 요청을 모두 실패 처리
    const call = (method, params = {}) => new Promise((ok, fail) => {
      const n = ++id, timer = setTimeout(() => { waiting.delete(n); fail(new Error(`Chrome 응답이 없습니다 (${method})`)); }, 30000);    // 무한 대기 방지
      waiting.set(n, { ok: (v) => { clearTimeout(timer); ok(v); }, fail: (e) => { clearTimeout(timer); fail(e); } });
      ws.send(JSON.stringify({ id: n, method, params }));
    });
    const evaluate = async (expression) => (await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result.value;

    await call('Page.enable'); await call('Page.navigate', { url });
    // 준비될 때까지 기다린다: 페이지가 title=ready 로 알리고, 모든 이미지가 실제로 그려질 수 있는 상태일 때
    const ready = `document.title==='ready' && [...document.images].every(i=>i.complete && i.naturalWidth>0)`;
    let ok = false;
    for (let i = 0; i < 160 && !ok; i++) { await sleep(150); ok = await evaluate(ready).catch(() => false); }
    if (!ok) throw new Error('페이지가 준비되지 않았습니다. (사진을 불러오지 못했을 수 있습니다)');
    await evaluate('document.fonts.ready.then(() => true)');
    await sleep(250);                                              // 마지막 그리기 여유
    const pdf = await call('Page.printToPDF', { printBackground: true, preferCSSPageSize: true, marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0 });
    fs.writeFileSync(outFile, Buffer.from(pdf.data, 'base64'));
    return outFile;
  } finally {
    try { ws && ws.close(); } catch { /* 이미 닫힘 */ }
    await killTree(proc);                                              // Chrome 본체와 자식 프로세스(렌더러 등)를 모두 끝낸다
    for (let i = 0; i < 10; i++) {                                     // 파일을 잡고 있던 프로세스가 사라질 때까지 잠깐씩 기다리며 임시 폴더를 지운다
      try { fs.rmSync(dir, { recursive: true, force: true }); break; } catch { await sleep(200); }
    }
  }
}

// proc.kill() 은 Chrome 본체만 끄고 자식 프로세스를 남겨서, 쓸 때마다 프로세스·임시 폴더가 쌓였다. 자식까지 한 번에 끝낸다.
function killTree(proc) {
  return new Promise((ok) => {
    if (!proc.pid || proc.exitCode !== null) return ok();
    proc.once('exit', ok);
    const done = setTimeout(ok, 4000);                                  // 안 끝나도 4초 뒤엔 넘어간다
    if (process.platform === 'win32') spawn('taskkill', ['/PID', String(proc.pid), '/T', '/F'], { stdio: 'ignore' }).on('exit', () => { clearTimeout(done); setTimeout(ok, 200); });
    else { try { proc.kill('SIGKILL'); } catch { /* 이미 종료 */ } }
  });
}
module.exports = { makePdf };
