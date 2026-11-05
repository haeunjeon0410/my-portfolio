// 서버가 실제로 요청을 막는지 확인한다. 임시 폴더(PORTFOLIO_HOME)와 임시 포트에서만 돌아서 진짜 데이터에는 닿지 않는다.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-srv-'));
fs.mkdirSync(path.join(tmp, 'data', 'images'), { recursive: true }); fs.mkdirSync(path.join(tmp, '.cache', 'images'), { recursive: true });
fs.writeFileSync(path.join(tmp, 'data', 'overrides.json'), JSON.stringify({ projects: {}, hidden: [] }));
fs.writeFileSync(path.join(tmp, 'data', 'SECRET.txt'), '비밀');                  // public 밖의 파일: 절대 새어 나가면 안 된다
fs.writeFileSync(path.join(tmp, 'data', 'images', 'ok.png'), Buffer.from('png'));
process.env.PORTFOLIO_HOME = tmp;

let server, PORT;
test.before(async () => {
  process.env.PORT = '0';
  server = require('../server');
  await new Promise(ok => server.listen(0, '127.0.0.1', ok));
  PORT = server.address().port;
  process.env.PORT = String(PORT);
});
test.after(() => server.close());

// 요청 경로를 가공 없이 그대로 보내기 위해 http 모듈을 직접 쓴다 (fetch 는 ".." 를 미리 정리해 버린다)
const req = (method, p, { body, headers = {}, host } = {}) => new Promise((ok, bad) => {
  const r = http.request({ host: '127.0.0.1', port: PORT, method, path: p, headers: { Host: host || `127.0.0.1:${PORT}`, ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers } }, res => {
    const chunks = []; res.on('data', c => chunks.push(c)); res.on('end', () => ok({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8'), headers: res.headers }));
  });
  r.on('error', bad); if (body !== undefined) r.write(body); r.end();
});

test('정상 요청은 통과하고 보안 헤더가 붙는다', async () => {
  const r = await req('GET', '/api/projects'); assert.equal(r.status, 200);
  assert.equal(r.headers['x-content-type-options'], 'nosniff'); assert.equal(r.headers['x-frame-options'], 'DENY');
  assert.equal((await req('GET', '/')).status, 200);
});
test('다른 사이트(Origin)나 엉뚱한 Host 에서 온 요청은 막는다', async () => {
  assert.equal((await req('POST', '/api/hide', { body: '{"key":"a/b"}', headers: { Origin: 'https://evil.example' } })).status, 403);
  assert.equal((await req('GET', '/api/projects', { host: 'attacker.example:4173' })).status, 403);
  assert.equal((await req('GET', '/api/projects', { host: `127.0.0.1.evil.example:${PORT}` })).status, 403);
});
test('public 밖의 파일은 어떤 경로로도 읽을 수 없다 (.. 와 인코딩 포함)', async () => {
  for (const p of ['/../data/SECRET.txt', '/%2e%2e/data/SECRET.txt', '/..%2fdata/SECRET.txt', '/../../server.js', '/img/../../data/SECRET.txt', '/dimg/../SECRET.txt', '/%00', '/..\\data\\SECRET.txt']) {
    const r = await req('GET', p); assert.ok([400, 404].includes(r.status), `${p} → ${r.status}`); assert.ok(!r.body.includes('비밀'), `${p} 로 비밀 내용이 나옴`);
  }
  assert.equal((await req('GET', '/dimg/ok.png')).status, 200);                        // 정상 사진은 나온다
});
test('큰 본문과 깨진 JSON 은 거절한다', async () => {
  assert.equal((await req('POST', '/api/hide', { body: 'x'.repeat(300 * 1024) })).status, 413);
  assert.equal((await req('POST', '/api/hide', { body: '{깨진' })).status, 400);
});
test('잘못된 입력은 400 으로 거절하고, 저장된 데이터는 그대로다', async () => {
  const file = path.join(tmp, 'data', 'overrides.json'), before = fs.readFileSync(file, 'utf8');
  for (const [u, b] of [['/api/patch', { key: '__proto__', patch: { note: 'x' } }], ['/api/patch', { key: 'a/b', patch: { repos: ['x/y'] } }],
    ['/api/patch', { key: 'a/b', patch: { images: ['"><script>'] } }], ['/api/hide', { key: '../..' }], ['/api/include', { key: 5 }]]) {
    const r = await req('POST', u, { body: JSON.stringify(b) }); assert.equal(r.status, 400, `${u} ${JSON.stringify(b)} → ${r.status}`);
  }
  assert.equal(fs.readFileSync(file, 'utf8'), before);
});
test('정상 수정은 저장되고, 없는 API 는 404 다', async () => {
  assert.equal((await req('POST', '/api/patch', { body: JSON.stringify({ key: 'me/proj', patch: { note: '메모' } }) })).status, 200);
  assert.equal(JSON.parse(fs.readFileSync(path.join(tmp, 'data', 'overrides.json'), 'utf8')).projects['me/proj'].note, '메모');
  assert.equal((await req('GET', '/api/' + encodeURIComponent('없는것'))).status, 404);
});
test('PDF 가 아직 없으면 다운로드는 404, 상태는 exists:false', async () => {
  assert.equal((await req('GET', '/api/download')).status, 404);
  assert.deepEqual(JSON.parse((await req('GET', '/api/state')).body), { exists: false });
});
