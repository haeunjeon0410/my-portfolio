// "새 저장소는 자동으로 카드가 되지 않고, 이미 뺀 저장소는 다시 묻지 않는다"는 약속과, 입력 검증을 확인한다.
// 진짜 data/ 를 건드리면 안 되므로, 앱 코드를 불러오기 "전에" PORTFOLIO_HOME 을 임시 폴더로 정하고 그 사실을 스스로 확인한다.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-test-'));
fs.mkdirSync(path.join(tmp, 'data')); fs.mkdirSync(path.join(tmp, '.cache'));
process.env.PORTFOLIO_HOME = tmp;
const { build, patchProject, includeProject, hideProject, DATA_DIR, ROOT } = require('../lib/build');

test('안전장치: 이 시험은 진짜 data/ 가 아니라 임시 폴더만 쓴다', () => {
  assert.equal(ROOT, tmp);
  assert.notEqual(path.resolve(DATA_DIR), path.resolve(__dirname, '..', 'data'));
});

const LONG = '프로젝트 소개 '.repeat(40) + '\n![화면](a.png)';
const mk = (name) => ({ repo: `me/${name}`, name, private: false, readme: LONG, description: name, langs: {}, deps: [], images: [], codeFiles: 9,
  contributors: [{ login: 'me', n: 4 }], span: { first: '2026-10-01T00:00:00Z', last: '2026-10-02T00:00:00Z', count: 4 }, pushedAt: '2026-10-02T00:00:00Z', v: 3 });
const writeCollected = (names) => { fs.writeFileSync(path.join(tmp, '.cache', 'collected.json'), JSON.stringify({ at: new Date().toISOString(), user: { login: 'me', name: '' }, repos: names.map(mk) })); };
const writeOvr = (o) => fs.writeFileSync(path.join(tmp, 'data', 'overrides.json'), JSON.stringify(o));
const bumpMtime = (f) => { const t = new Date(Date.now() + (bumpMtime.n = (bumpMtime.n || 0) + 2000)); fs.utimesSync(f, t, t); };   // 캐시 무효화 시험용
const fresh = () => { bumpMtime(path.join(tmp, 'data', 'overrides.json')); return build(); };

test('새 저장소는 자동으로 카드가 되지 않고 "확인 필요"에만 올라온다 (완성으로 보여도)', () => {
  writeOvr({ projects: {}, hidden: [] }); writeCollected(['alpha']);
  const d = fresh(); assert.equal(d.projects.length, 0); assert.equal(d.pending.length, 1); assert.equal(d.pending[0].recommend, true);
});
test('넣기: 카드가 되고, 다시 불러와도 카드로 남는다', () => {
  includeProject('me/alpha'); writeCollected(['alpha']);
  const d = fresh(); assert.equal(d.projects.length, 1); assert.equal(d.pending.length, 0);
});
test('빼기: 다시 불러와도 다시 묻지 않는다', () => {
  writeOvr({ projects: {}, hidden: [] }); writeCollected(['beta']);
  hideProject('me/beta'); writeCollected(['beta']);
  const d = fresh(); assert.equal(d.projects.length, 0); assert.equal(d.pending.length, 0);
});
test('고친 값은 자동 값보다 우선하고, 비우면 자동 값으로 돌아간다', () => {
  writeOvr({ projects: {}, hidden: [] }); writeCollected(['gamma']); includeProject('me/gamma');
  patchProject('me/gamma', { title: '내가 쓴 설명' }); assert.equal(fresh().projects[0].title, '내가 쓴 설명');
  patchProject('me/gamma', { title: null }); assert.equal(fresh().projects[0].title, 'gamma');
});
test('구분(팀/개인)은 커밋 수와 따로 지정할 수 있다', () => {
  patchProject('me/gamma', { section: 'team' }); assert.equal(fresh().projects[0].section, 'team');
  patchProject('me/gamma', { section: 'solo' }); assert.equal(fresh().projects[0].section, 'solo');
});
test('저장할 때마다 overrides.json 이 백업된다', () => {
  const dir = path.join(tmp, 'data', 'backups');
  assert.ok(fs.existsSync(dir) && fs.readdirSync(dir).length > 0);
});
test('파일이 바뀌면 캐시를 쓰지 않고 새로 계산한다 / 안 바뀌면 같은 결과를 그대로 준다', () => {
  const a = build(), b = build(); assert.equal(a, b);                    // 같은 객체 = 캐시 사용
  patchProject('me/gamma', { note: '바뀜' }); assert.notEqual(build(), a);
});

// ---------- 입력 검증: 화면에서 오는 값은 믿지 않는다 ----------
const rejects = (fn, re) => assert.throws(fn, (e) => e.code === 'BAD_INPUT' && (!re || re.test(e.message)));
test('이상한 저장소 이름·키는 거절한다 (__proto__, 경로, 빈 값)', () => {
  for (const k of ['__proto__', 'constructor', '../x', 'a/b/c', '', null, 123, 'x'.repeat(200) + '/y']) rejects(() => patchProject(k, { note: 'x' }));
  rejects(() => hideProject('__proto__')); rejects(() => includeProject('a b/c'));
});
test('고칠 수 없는 항목(repos 등)은 거절한다', () => {
  rejects(() => patchProject('me/gamma', { repos: ['x/y'] }), /고칠 수 없는/);
  rejects(() => patchProject('me/gamma', { evil: 'x' }), /고칠 수 없는/);
  rejects(() => patchProject('me/gamma', 'note'));
  rejects(() => patchProject('me/gamma', [1]));
});
test('값의 형식·길이를 검사한다', () => {
  rejects(() => patchProject('me/gamma', { section: 'both' }));
  rejects(() => patchProject('me/gamma', { note: 'x'.repeat(501) }));
  rejects(() => patchProject('me/gamma', { note: { a: 1 } }));
  rejects(() => patchProject('me/gamma', { result: ['a', 5] }));
});
test('사진은 이 앱이 가진 파일 주소만 받는다 (스크립트·외부 주소·4장 이상 거절)', () => {
  rejects(() => patchProject('me/gamma', { images: ['"><script>alert(1)</script>'] }));
  rejects(() => patchProject('me/gamma', { images: ['https://evil.example/x.png'] }));
  rejects(() => patchProject('me/gamma', { images: ['/img/../../data/overrides.json'] }));
  rejects(() => patchProject('me/gamma', { images: ['/img/a.png', '/img/b.png', '/img/c.png', '/img/d.png'] }));
  patchProject('me/gamma', { images: ['/img/abc123.png', '/dimg/%EB%8B%A4%EC%A7%B1_x.jpg'] });            // 정상 값은 통과
});
test('거절된 요청은 저장된 데이터를 바꾸지 않는다', () => {
  const file = path.join(tmp, 'data', 'overrides.json'), before = fs.readFileSync(file, 'utf8');
  try { patchProject('me/gamma', { repos: ['x/y'] }); } catch { /* 거절 */ }
  try { patchProject('__proto__', { note: 'x' }); } catch { /* 거절 */ }
  assert.equal(fs.readFileSync(file, 'utf8'), before);
  assert.equal(({}).polluted, undefined);
});

// ---------- 뺀 저장소 되살리기 ----------
const { hiddenList, restoreProjects } = require('../lib/build');
test('뺀 저장소 목록에는 지금 상태(완성으로 보이는지)가 함께 나온다', () => {
  writeOvr({ projects: {}, hidden: [] }); writeCollected(['delta']); hideProject('me/delta'); hideProject('me/gone');
  const l = hiddenList(); assert.equal(l.length, 2);
  const d = l.find(x => x.key === 'me/delta'), g = l.find(x => x.key === 'me/gone');
  assert.equal(d.found, true); assert.equal(d.recommend, true); assert.equal(g.found, false);       // 수집에 없는 저장소는 되살릴 수 없다고 표시
  assert.equal(l[0].key, 'me/delta');                                                                  // 찾은 것이 먼저
  assert.equal(fresh().hiddenCount, 2);
});
test('되살리면 다시 "확인 필요"로 올라오고, 카드였던 것은 내용 그대로 돌아온다', () => {
  writeOvr({ projects: {}, hidden: [] }); writeCollected(['eps', 'zeta']);
  includeProject('me/zeta'); patchProject('me/zeta', { title: '내 제목' }); hideProject('me/zeta'); hideProject('me/eps');
  assert.equal(fresh().projects.length, 0); assert.equal(build().pending.length, 0);                  // 빼면 다시 묻지 않는다
  restoreProjects(['me/eps']);
  let d = fresh(); assert.equal(d.pending.length, 1); assert.equal(d.pending[0].key, 'me/eps'); assert.equal(d.hiddenCount, 1);
  restoreProjects(['ME/Zeta']);                                                                         // 대소문자 상관없이
  d = fresh(); assert.equal(d.projects.length, 1); assert.equal(d.projects[0].title, '내 제목'); assert.equal(d.hiddenCount, 0);
});
test('되살리기 입력 검증: 이상한 이름은 거절하고 데이터를 바꾸지 않는다', () => {
  const file = path.join(tmp, 'data', 'overrides.json'), before = fs.readFileSync(file, 'utf8');
  for (const k of ['__proto__', '../x', '', null, 5]) rejects(() => restoreProjects([k]));
  assert.equal(fs.readFileSync(file, 'utf8'), before);
});
test('뺀 저장소: 업데이트가 건너뛴 것은 지금 확인한 데이터로 완성 여부를 보여 준다', () => {
  writeOvr({ projects: {}, hidden: [] }); writeCollected([]); hideProject('me/later');
  assert.equal(hiddenList()[0].found, false);
  const live = new Map([['me/later', mk('later')]]);
  const h = hiddenList(live)[0]; assert.equal(h.found, true); assert.equal(h.recommend, true);
});
test('뺀 저장소: 같은 저장소(포크)는 한 줄로 합치고, 이미 카드인 것은 표시한다', () => {
  writeOvr({ projects: { 'me/own': { repos: ['me/own'] } }, hidden: ['me/own', 'fork/orig', 'me/orig'] });
  writeCollected(['own', 'orig']);
  const live = new Map([['fork/orig', { ...mk('orig'), repo: 'me/orig' }]]);                         // 포크 'fork/orig' 는 원본 'me/orig' 로 확인된다
  const l = hiddenList(live);
  assert.equal(l.length, 2); const o = l.find(x => x.repo === 'me/orig');
  assert.deepEqual(o.keys.sort(), ['fork/orig', 'me/orig']); assert.ok(!o.inCard);
  assert.equal(l.find(x => x.repo === 'me/own').inCard, true);
  restoreProjects(o.keys); assert.equal(fresh().hiddenCount, 1);                                      // 같은 저장소의 이름을 모두 되살린다
});
