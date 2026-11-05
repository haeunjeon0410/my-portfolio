// 실행: npm test   (Node 내장 테스트 러너, 설치할 것 없음)
// 판단 기준이나 추출 규칙을 고친 뒤 돌려서, 예전에 맞게 나오던 것이 깨지지 않았는지 확인한다.
const test = require('node:test');
const assert = require('node:assert/strict');
const { judge, autoFields, teamFromReadme, readmeRange, duration } = require('../lib/judge');

const user = { login: 'haeunjeon0410', name: '', names: ['전하은'] };
const repo = (o = {}) => ({ repo: 'me/proj', name: 'proj', readme: '', description: '', langs: {}, deps: [], images: [], codeFiles: 10,
  contributors: [{ login: 'haeunjeon0410', n: 5 }], span: { first: '2026-10-01T00:00:00Z', last: '2026-10-03T00:00:00Z', count: 5 }, pushedAt: '2026-10-03T00:00:00Z', ...o });
const LONG = '프로젝트 소개 '.repeat(40);

test('완성 판단: 스크린샷이 든 README 가 1차 기준', () => {
  assert.equal(judge(repo({ readme: `${LONG}\n![화면](docs/a.png)` }), user).complete, true);
  assert.equal(judge(repo({ readme: `${LONG}\n<img src="docs/a.png">` }), user).complete, true);
  const r = judge(repo({ readme: LONG }), user);
  assert.equal(r.complete, false); assert.ok(r.reasons.includes('README에 스크린샷 없음'));
});
test('배지(shields.io)·svg 는 스크린샷으로 치지 않는다', () => {
  assert.equal(judge(repo({ readme: `${LONG}\n![b](https://img.shields.io/x.svg)` }), user).complete, false);
});
test('커밋이 적거나 코드가 적어도 제외하지 않고 "주의"만 표시한다', () => {
  const j = judge(repo({ readme: `${LONG}\n![화면](a.png)`, codeFiles: 1, span: { first: null, last: null, count: 1 } }), user);
  assert.equal(j.complete, true); assert.equal(j.warnings.length, 2);
});
test('프로필 저장소와 .github 는 프로젝트가 아니다', () => {
  assert.equal(judge(repo({ name: 'haeunjeon0410', readme: `${LONG}\n![a](a.png)` }), user).complete, false);
  assert.equal(judge(repo({ name: '.github', readme: `${LONG}\n![a](a.png)` }), user).complete, false);
});

test('팀 표: 쉼표로 묶인 이름도 한 명씩 센다 (쑥맵)', () => {
  const t = teamFromReadme('| 이름 | 역할 |\n|---|---|\n| 윤아현, 노민주 | 기획 |\n| 신정원, 전하은, 전민서 | 개발 |', user);
  assert.equal(t.size, 5); assert.match(t.composition, /기획 2/); assert.equal(t.role, '개발');
});
test('팀 표: 담당자 표에서 내 역할을 찾는다 (냉장고)', () => {
  const t = teamFromReadme('| 담당자 | 담당 영역 |\n|---|---|\n| **전하은** | 팀장, UI 디자인 |\n| **이소민** | 재료 관리 및 검색 |\n| **강채린** | 데이터 관리 및 Supabase 연동 |', user);
  assert.equal(t.size, 3); assert.equal(t.role, '프론트엔드');
});
test('팀 표가 아닌 표를 팀원으로 읽지 않는다 (Uh Money 가 7명으로 나오던 오류)', () => {
  assert.equal(teamFromReadme('| 종류 | 항목 | 판정 방법 |\n|---|---|---|\n| 매일 보상 | 운동 | 운동 인증 앱 |\n| | 공부 | 집중 모드 |', user), null);
  assert.equal(teamFromReadme('| | 의미 |\n|---|---|\n| 실제 금융 상태 | 잔액 |\n| 소비 허용량 | 규칙 |', user), null);
});

test('README 의 개발 기간을 읽는다 (커밋을 몰아서 올린 Petory)', () => {
  const r = readmeRange('### 개발 기간\n* **2026.01.08 ~ 2026.01.14** (약 1주일)');
  assert.equal(r.start.getDate(), 8); assert.equal(r.end.getDate(), 14);
  const f = autoFields(repo({ readme: '### 개발 기간\n**2026.01.08 ~ 2026.01.14**', span: { first: '2026-01-14T00:00:00Z', last: '2026-01-14T00:00:00Z', count: 5 } }), user);
  assert.equal(f.period, '2026.01 (약 1주)');
});
test('기간 표기: 일 → 주 → 개월', () => {
  assert.equal(duration('2026-10-05', '2026-10-05'), '2026.10 (1일)');
  assert.equal(duration('2026-10-05', '2026-10-10'), '2026.10 (6일)');       // 5일~10일 = 6일 (시작일 포함)
  assert.equal(duration('2026-10-05', '2026-10-11'), '2026.10 (약 1주)');    // 7일부터는 주 단위
  assert.equal(duration('2026-10-01', '2026-10-21'), '2026.10 (약 3주)');
  assert.equal(duration('2026-05-19', '2026-09-30'), '2026.05 (약 4개월)');
});
test('혼자 커밋했으면 1인 개발, 여럿이면 N명', () => {
  assert.equal(autoFields(repo(), user).people, '1인 개발');
  assert.equal(autoFields(repo({ contributors: [{ login: 'haeunjeon0410', n: 3 }, { login: 'friend', n: 2 }] }), user).people, '2명');
});
test('설명에 안내 문구가 섞이지 않는다', () => {
  const f = autoFields(repo({ readme: '# 앱\n\n> 스크린샷은 예시입니다.\n\n실제 소개 문장입니다 여기에.' }), user);
  assert.ok(!f.title.includes('스크린샷'));
});

// ---------- 성과(수상) 자동 채움: "대상" 같은 흔한 단어를 성과로 오인하지 않는다 ----------
test('성과: 대회와 상 이름이 함께 있는 줄만 수상으로 본다', () => {
  const { autoFields } = require('../lib/judge');
  const res = (s) => autoFields({ name: 'x', readme: s, description: '', contributors: [], langs: {}, deps: [], span: {}, images: [], pushedAt: '' }, { login: 'me' }).result;
  assert.equal(res('2026 SW MVP 경진대회 최우수상 수상작'), '2026 SW MVP 경진대회 최우수상');
  assert.equal(res('Kirothon 우수상 수상'), 'Kirothon 우수상 수상');
  assert.equal(res('제5회 해커톤 대상(1등)'), '제5회 해커톤 대상(1등)');
  for (const s of ['- 삭제 대상: 임시 파일, 캐시', '대상 사용자는 대학생입니다', '공모전 대상 도전 예정', '수상 이력 없음']) assert.equal(res(s), '', s);
});
