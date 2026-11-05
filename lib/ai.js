// 선택 기능: AI가 카드 제목(한 줄 설명)의 초안을 쓴다. 키가 없거나 호출이 실패하면 null 을 돌려주고, 앱은 README에서 뽑은 기존 값을 그대로 쓴다.
// 사실(기간·인원·성과)은 건드리지 않는다. 제목 한 줄만 쓴다.
//
// 키: 환경변수 SCHOOL_GATEWAY_API_KEY, 또는 data/config.json 의 { "ai": { "envFile": ".env 경로" } } 에 적힌 파일의 같은 이름 값.
// (키 값은 이 프로젝트에 복사하지 않고, 필요할 때 그 파일에서 읽는다.)
const fs = require('fs');
const path = require('path');

const ROOT = process.env.PORTFOLIO_HOME || path.join(__dirname, '..');
const CONFIG = path.join(ROOT, 'data', 'config.json');
const URL_ = 'https://factchat-cloud.mindlogic.ai/v1/gateway/chat/completions/';     // 학교 API Gateway (OpenAI chat/completions 형식)
const MODEL = 'gpt-6-luna';
const KEY_NAME = 'SCHOOL_GATEWAY_API_KEY';

function readKey() {
  if (process.env[KEY_NAME]) return process.env[KEY_NAME];
  try {
    const file = JSON.parse(fs.readFileSync(CONFIG, 'utf8')).ai.envFile;
    const line = fs.readFileSync(file, 'utf8').split(/\r?\n/).find(l => l.startsWith(KEY_NAME + '='));
    return line ? line.slice(KEY_NAME.length + 1).trim().replace(/^['"]|['"]$/g, '') : '';
  } catch { return ''; }
}
const available = () => !!readKey();
let lastError = '';

// 1단계: README에서 이 앱이 하는 일을 빠짐없이 뽑는다 (사실만).
const SYSTEM_FEATURES = `README에서 이 프로젝트의 주요 기능과 대상 사용자를 뽑는다.
- 첫 줄: 누구를 위한 어떤 종류의 서비스인지 (예: 대학생용 웹 서비스, Chrome 확장, 게임)
- 다음 줄부터: 주요 기능을 한 줄에 하나씩, 3~6개. 짧은 명사구로.
- README에 적힌 것만 쓴다. 없는 기능은 쓰지 않는다. 설치·실행 방법, 기술 스택, 팀 정보는 쓰지 않는다.`;

// 2단계: 뽑은 기능을 "전부 포함하되 나열하지 않는" 한 문장으로 묶는다.
const SYSTEM = `포트폴리오 카드 제목(한 줄 설명)을 쓴다. 이 제목은 카드에서 이 프로젝트를 설명하는 유일한 문장이다.
그래서 주요 기능이 모두 담겨야 하지만, 읽는 사람(면접관·멘토)이 한눈에 이해해야 한다.

방법: 기능을 하나씩 나열하지 않는다. 기능들을 모두 아우르는 상위 개념(예: 기록·관리, 분석·추천, 변환, 검증, 탐험)으로 묶어서 "누가/무엇을 + 어떻게 + 서비스 종류" 한 문장으로 쓴다.
- 25~40자, 명사형으로 끝낸다. 서비스 종류는 웹사이트, 웹 서비스, 플랫폼, 앱, Chrome 확장, 게임 등 짧게.
- 수식어("맞춤형·통합·효율적")와 기술 이름은 뺀다.

예 (기능이 여러 개여도 한 문장에 다 들어간 것):
강의자료를 점자·그림 설명·색각 보정 자료로 바꿔 주는 Chrome 확장   ← 변환 3종을 "점자·그림 설명·색각 보정"으로 병렬 압축
직원이 기록한 경력을 회사가 검증하고 인재를 추천하는 커리어 플랫폼   ← 기록·검증·추천의 흐름을 주체별로 연결
체중·진료·일상을 기록하고 AI 건강 상담을 받는 반려동물 앱   ← 기록 대상 3개를 묶고 상담을 덧붙임
학점이수표를 분석해 수강 로드맵과 시간표를 짜 주는 AI 웹 서비스   ← 하나의 입력에서 나오는 두 결과물
캠퍼스를 탐험하며 미니게임을 풀고 편지를 배달하는 픽셀 스토리 게임   ← 한 흐름의 세 행동

나쁜 예:
"영수증으로 재료를 등록하고 보유 식재료에 맞는 요리와 장보기 품목을 추천하는 냉장고 관리 서비스" → 길고 나열식
"반려동물의 건강 변화를 관리하는 앱" → 너무 포괄적이라 기능이 안 보임

규칙:
- 주어진 기능 목록에 있는 것만 쓴다. 없는 기능·수치·성과는 쓰지 않는다.
- 프로젝트 이름, 기간, 인원, 수상, 배포 주소, 캠프·수업 이름은 넣지 않는다.
- 따옴표·마침표·설명 없이 제목 한 줄만 출력한다.`;
const MAX_LEN = 44;                                         // 이보다 길면 한 번 줄여 달라고 다시 요청한다

async function ask(key, system, messages) {
  const res = await fetch(URL_, {
    method: 'POST', signal: AbortSignal.timeout(60000),
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: MODEL, max_tokens: 1200, reasoning_effort: 'low', messages: [{ role: 'system', content: system }, ...messages] }),     // max_tokens 에는 생각 토큰도 포함된다
  });
  if (!res.ok) { lastError = res.status + ' ' + (await res.text()).slice(0, 200); return null; }
  const choice = (await res.json()).choices?.[0];
  const text = String(choice?.message?.content || '').trim();
  if (!text) lastError = choice?.finish_reason === 'length' ? '출력이 한도에서 잘렸습니다.' : '응답이 비어 있습니다.';
  return text || null;
}
const oneLine = (t) => String(t || '').split('\n')[0].replace(/^["'“”‘’「」\s]+|["'“”‘’「」.\s]+$/g, '');

// 스타일별 추가 지시: 같은 기능 목록으로 서로 다른 제목을 쓴다 (사용자가 고른다)
const STYLES = [
  ['포괄형', ''],
  ['간결형', '\n\n이번 제목은 25자 안팎으로 짧게. 가장 핵심이 되는 동작과 서비스 종류만 담고, 나머지 기능은 상위 개념 한 단어로 뭉뚱그린다.'],
  ['문제해결형', '\n\n이번 제목은 누구의 어떤 불편·목적을 해결하는지가 드러나게 쓴다. 30~40자.'],
];

async function readFeatures(key, r) {
  const langs = Object.keys(r.langs || {}).slice(0, 4).join(', ');
  const source = { role: 'user', content: `저장소: ${r.name}\n설명: ${r.description || '(없음)'}\n언어: ${langs}\n의존성: ${(r.deps || []).slice(0, 20).join(', ')}\n\nREADME:\n${String(r.readme || '').slice(0, 6000)}` };
  return ask(key, SYSTEM_FEATURES, [source]);
}
async function writeTitle(key, features, extra) {
  const system = SYSTEM + extra, user = { role: 'user', content: `기능 목록:\n${features}` };
  let line = oneLine(await ask(key, system, [user]));
  if (line && line.length > MAX_LEN) {                       // 길면 한 번만 더 줄이게 한다 (기능은 빼지 않고 표현만 압축)
    const short = oneLine(await ask(key, system, [user, { role: 'assistant', content: line }, { role: 'user', content: `${line.length}자입니다. 기능은 빼지 말고 더 상위 개념으로 묶어 40자 이내로 한 줄만 다시 써 주세요.` }]));
    if (short && short.length < line.length) line = short;
  }
  return line && line.length <= 80 ? line : null;
}
const enough = (r) => String(r.readme || '').length + String(r.description || '').length >= 50;

// 후보 3개 (수정 창): 기능은 한 번만 뽑고, 스타일별 제목을 동시에 쓴다
async function suggestTitles(r) {
  const key = readKey(); if (!key) return [];
  if (!enough(r)) { lastError = '근거가 될 README·설명이 거의 없습니다.'; return []; }     // 근거 없이 지어내지 않는다
  try {
    const features = await readFeatures(key, r); if (!features) return [];
    const out = await Promise.all(STYLES.map(async ([style, extra]) => ({ style, title: await writeTitle(key, features, extra).catch(() => null) })));
    const seen = new Set();
    return out.filter(o => o.title && !seen.has(o.title) && seen.add(o.title));
  } catch (e) { lastError = e.message; return []; }
}
// 새 저장소를 넣을 때: 포괄형 한 개만
async function suggestTitle(r) {
  const key = readKey(); if (!key) return null;
  if (!enough(r)) { lastError = '근거가 될 README·설명이 거의 없습니다.'; return null; }
  try { const features = await readFeatures(key, r); return features ? await writeTitle(key, features, '') : null; }
  catch (e) { lastError = e.message; return null; }
}
module.exports = { suggestTitle, suggestTitles, available, error: () => lastError };
