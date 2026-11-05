// 선택 기능: AI가 카드 제목(한 줄 설명)의 초안을 쓴다. 키가 없거나 호출이 실패하면 null 을 돌려주고, 앱은 README에서 뽑은 기존 값을 그대로 쓴다.
// 사실(기간·인원·성과)은 건드리지 않는다. 제목 한 줄만 쓴다.
//
// 키: 환경변수 SCHOOL_GATEWAY_API_KEY, 또는 data/config.json 의 { "ai": { "envFile": ".env 경로" } } 에 적힌 파일의 같은 이름 값.
// (키 값은 이 프로젝트에 복사하지 않고, 필요할 때 그 파일에서 읽는다.)
const fs = require('fs');
const path = require('path');

const ROOT = process.env.PORTFOLIO_HOME || path.join(__dirname, '..');
const CONFIG = path.join(ROOT, 'data', 'config.json');
const URL_ = 'https://factchat-cloud.mindlogic.ai/v1/gateway/claude/v1/messages/';     // 학교 API Gateway (Anthropic Messages 형식 그대로)
const MODEL = 'claude-sonnet-5';
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

const SYSTEM = `너는 대학생 개발자의 포트폴리오 카드에 들어갈 프로젝트 제목(한 줄 설명)을 쓴다.
규칙:
- 입력(README·설명·언어)에 적힌 사실만 쓴다. 없는 기능·수치·성과를 지어내지 않는다.
- 무엇을 하는 어떤 서비스인지 한 줄로. 40자 안팎, 명사형으로 끝낸다. 예: "강의자료를 점자·그림 설명·색각 보정 자료로 바꿔 주는 Chrome 확장", "직원이 기록한 경력을 회사가 검증하고 인재를 추천하는 커리어 플랫폼"
- 프로젝트 이름, 기간, 인원, 수상, 배포 주소, 캠프·수업 이름은 넣지 않는다. 따옴표·마침표·설명 문장 없이 제목 한 줄만 출력한다.`;

async function suggestTitle(r) {
  const key = readKey(); if (!key) return null;
  if (String(r.readme || '').length + String(r.description || '').length < 50) { lastError = '근거가 될 README·설명이 거의 없습니다.'; return null; }     // 근거 없이 지어내지 않는다
  const langs = Object.keys(r.langs || {}).slice(0, 4).join(', ');
  const input = `저장소: ${r.name}\n설명: ${r.description || '(없음)'}\n언어: ${langs}\n의존성: ${(r.deps || []).slice(0, 20).join(', ')}\n\nREADME:\n${String(r.readme || '').slice(0, 6000)}`;
  try {
    const res = await fetch(URL_, {
      method: 'POST', signal: AbortSignal.timeout(60000),
      headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODEL, max_tokens: 200, system: SYSTEM, messages: [{ role: 'user', content: input }] }),
    });
    if (!res.ok) { lastError = res.status + ' ' + (await res.text()).slice(0, 200); return null; }
    const text = ((await res.json()).content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
    const line = text.split('\n')[0].replace(/^["'“”‘’「」\s]+|["'“”‘’「」.\s]+$/g, '');
    return line && line.length <= 80 ? line : null;
  } catch (e) { lastError = e.message; return null; }
}
module.exports = { suggestTitle, available, error: () => lastError };
