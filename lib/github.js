// GitHub API 호출. 토큰은 환경변수 GITHUB_TOKEN 또는 `gh auth token`(이미 로그인된 gh)에서 읽고, 이 PC 밖으로 보내지 않는다.
const { execFileSync } = require('child_process');

const TIMEOUT_MS = 30000;                                   // 응답이 없으면 30초 뒤 포기한다 (영원히 기다리지 않는다)
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

let TOKEN = process.env.GITHUB_TOKEN || '';
function token() {
  if (TOKEN) return TOKEN;
  try { TOKEN = execFileSync('gh', ['auth', 'token'], { encoding: 'utf8', timeout: 10000 }).trim(); } catch { TOKEN = ''; }
  if (!TOKEN) throw new Error('GitHub 토큰이 없습니다. 터미널에서 `gh auth login` 을 하거나 GITHUB_TOKEN 을 설정하세요.');
  return TOKEN;
}
const H = (extra = {}) => ({ Authorization: `Bearer ${token()}`, 'User-Agent': 'portfolio-cards', Accept: 'application/vnd.github+json', ...extra });

// 일시적인 실패(5xx, 429, 연결 끊김)는 짧게 쉬었다가 최대 3번 다시 시도한다.
async function request(url, init, tries = 3) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (res.status === 429 || (res.status === 403 && res.headers.get('retry-after'))) {
        const wait = Math.min(Number(res.headers.get('retry-after')) || 2, 10) * 1000; await sleep(wait); last = new Error('GitHub가 요청을 잠시 제한했습니다.'); continue;
      }
      if (res.status >= 500) { last = new Error(`GitHub 서버 오류(${res.status})`); await sleep(400 * (i + 1)); continue; }
      return res;
    } catch (e) { last = e.name === 'TimeoutError' ? new Error('GitHub 응답이 너무 늦습니다.') : e; await sleep(400 * (i + 1)); }
  }
  throw last;
}

async function api(path, { raw = false } = {}) {
  const res = await request(path.startsWith('http') ? path : `https://api.github.com${path}`, { headers: H(raw ? { Accept: 'application/vnd.github.raw+json' } : {}) });
  if (res.status === 403 && res.headers.get('x-ratelimit-remaining') === '0') throw new Error('GitHub 호출 한도를 넘었습니다. 잠시 뒤 다시 시도하세요.');
  if (res.status === 401) throw new Error('GitHub 토큰이 올바르지 않거나 만료되었습니다. `gh auth login` 을 다시 해 주세요.');
  if (!res.ok) return null;                                  // 404(없음)·409(빈 저장소) 등은 "없다"로 취급한다
  return raw ? res.text() : res.json();
}
async function paginate(path, max = 5) {
  const out = [];
  for (let page = 1; page <= max; page++) {
    const r = await api(`${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`);
    if (!Array.isArray(r) || !r.length) break;
    out.push(...r);
    if (r.length < 100) break;
  }
  return out;
}
async function graphql(query) {
  const res = await request('https://api.github.com/graphql', { method: 'POST', headers: H({ 'Content-Type': 'application/json' }), body: JSON.stringify({ query }) });
  if (res.status === 401) throw new Error('GitHub 토큰이 올바르지 않거나 만료되었습니다. `gh auth login` 을 다시 해 주세요.');
  const j = await res.json();
  if (j.errors) throw new Error(j.errors[0].message);
  return j.data;
}
async function download(url) {
  for (const withAuth of [false, true]) {
    try {
      const res = await request(url, { headers: withAuth ? { Authorization: `Bearer ${token()}`, 'User-Agent': 'portfolio-cards' } : { 'User-Agent': 'portfolio-cards' }, redirect: 'follow' }, 2);
      const type = res.headers.get('content-type') || '';
      if (res.ok && /^image\//.test(type)) return { buf: Buffer.from(await res.arrayBuffer()), type };
    } catch { /* 다음 방법 */ }
  }
  return null;
}
async function rawFile(repo, filePath, ref) {
  try {
    const res = await request(`https://api.github.com/repos/${repo}/contents/${filePath.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(ref)}`, { headers: H({ Accept: 'application/vnd.github.raw+json' }) }, 2);
    return res.ok ? Buffer.from(await res.arrayBuffer()) : null;
  } catch { return null; }
}
module.exports = { api, paginate, graphql, download, rawFile };
