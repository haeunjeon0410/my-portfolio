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

const SYSTEM = `포트폴리오 카드 제목(한 줄 설명)을 쓴다. 읽는 사람은 면접관·멘토이고, 카드 한 장에 한눈에 들어와야 한다.

형식: "[무엇을/누가] [어떻게] [하는] [서비스 종류]" 한 줄. 25~35자. 40자를 넘기지 않는다. 명사형으로 끝낸다.
서비스 종류는 웹사이트, 웹 서비스, 플랫폼, 앱, Chrome 확장, 게임 중 하나로 짧게 쓴다.

좋은 예 (이 문체와 길이를 따른다):
강의자료를 점자·그림 설명·색각 보정 자료로 바꿔 주는 Chrome 확장
직원이 기록한 경력을 회사가 검증하고 인재를 추천하는 커리어 플랫폼
축제 부스 지도와 공연 일정을 모바일·PC 맞춤 UI로 보여 주는 웹사이트
보유 재료로 만들 요리를 추천하고 영수증으로 재료를 등록하는 웹 서비스
학점이수표를 분석해 수강 로드맵과 시간표를 짜 주는 AI 웹 서비스
캠퍼스를 탐험하며 미니게임을 풀고 편지를 배달하는 픽셀 스토리 게임

나쁜 예: "영수증 분석으로 재료를 등록하고 보유 식재료에 맞는 요리와 장보기 품목을 추천하는 냉장고 관리 서비스" (기능을 다 나열해 길다. 핵심 둘만 고른다)

규칙:
- 입력(README·설명·언어)에 적힌 사실만 쓴다. 없는 기능·수치·성과는 쓰지 않는다.
- 기능은 가장 핵심인 한두 개만 고른다. 부가 기능, 형용사, "맞춤형·통합·효율적" 같은 수식어는 뺀다.
- 프로젝트 이름, 기간, 인원, 수상, 배포 주소, 캠프·수업 이름은 넣지 않는다.
- 따옴표·마침표·설명 없이 제목 한 줄만 출력한다.`;
const MAX_LEN = 42;                                         // 이보다 길면 한 번 줄여 달라고 다시 요청한다

async function ask(key, messages) {
  const res = await fetch(URL_, {
    method: 'POST', signal: AbortSignal.timeout(60000),
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: MODEL, max_tokens: 1000, reasoning_effort: 'low', messages: [{ role: 'system', content: SYSTEM }, ...messages] }),     // max_tokens 에는 생각 토큰도 포함된다
  });
  if (!res.ok) { lastError = res.status + ' ' + (await res.text()).slice(0, 200); return null; }
  const choice = (await res.json()).choices?.[0];
  const line = String(choice?.message?.content || '').trim().split('\n')[0].replace(/^["'“”‘’「」\s]+|["'“”‘’「」.\s]+$/g, '');
  if (!line) lastError = choice?.finish_reason === 'length' ? '출력이 한도에서 잘렸습니다.' : '제목을 만들지 못했습니다.';
  return line || null;
}

async function suggestTitle(r) {
  const key = readKey(); if (!key) return null;
  if (String(r.readme || '').length + String(r.description || '').length < 50) { lastError = '근거가 될 README·설명이 거의 없습니다.'; return null; }     // 근거 없이 지어내지 않는다
  const langs = Object.keys(r.langs || {}).slice(0, 4).join(', ');
  const user = { role: 'user', content: `저장소: ${r.name}\n설명: ${r.description || '(없음)'}\n언어: ${langs}\n의존성: ${(r.deps || []).slice(0, 20).join(', ')}\n\nREADME:\n${String(r.readme || '').slice(0, 6000)}` };
  try {
    let line = await ask(key, [user]);
    if (line && line.length > MAX_LEN) {                     // 길면 한 번만 더 줄이게 한다
      const short = await ask(key, [user, { role: 'assistant', content: line }, { role: 'user', content: `${line.length}자입니다. 핵심 기능 한두 개만 남기고 35자 안팎으로 줄여 한 줄만 다시 써 주세요.` }]);
      if (short && short.length < line.length) line = short;
    }
    if (!line || line.length > 80) { if (line) lastError = '제목이 너무 깁니다.'; return null; }
    return line;
  } catch (e) { lastError = e.message; return null; }
}
module.exports = { suggestTitle, available, error: () => lastError };
