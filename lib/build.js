// 수집 결과 + 내가 정한 값(data/overrides.json) -> 화면에 그릴 카드 목록.
//  - 카드에 들어가는 것: overrides.projects 에 있는 것만. (내가 "넣기"로 확정한 것)
//  - 빠지는 것: overrides.hidden 에 있는 것. 새로 불러와도 다시 묻지 않는다.
//  - 그 밖의 새 저장소: "확인 필요(pending)" 로 두고, 자동 판단은 추천(recommend)으로만 보여 준다.
const fs = require('fs');
const path = require('path');
const { judge, autoFields } = require('./judge');

const ROOT = process.env.PORTFOLIO_HOME || path.join(__dirname, '..');        // 시험·시연용으로 다른 폴더를 쓸 수 있다
const DATA_DIR = path.join(ROOT, 'data');
const OVR = path.join(DATA_DIR, 'overrides.json');
const COLLECTED = path.join(ROOT, '.cache', 'collected.json');
const CONFIG = path.join(DATA_DIR, 'config.json');
const read = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const lower = (s) => String(s).toLowerCase();

// ---------- 입력 검증 (화면에서 오는 값은 믿지 않는다) ----------
const bad = (msg) => Object.assign(new Error(msg), { code: 'BAD_INPUT' });
const KEY = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;                              // "소유자/저장소"
const EDITABLE = new Set(['title', 'name', 'period', 'people', 'role', 'env', 'result', 'note', 'images', 'section']);
const MAX_TEXT = 500;
function checkKey(key) {
  const dots = (s) => /^\.+$/.test(s);                                                    // "." ".." 처럼 점으로만 된 이름은 GitHub 저장소 이름이 될 수 없다
  if (typeof key !== 'string' || key.length > 140 || !KEY.test(key) || key.split('/').some(dots)) throw bad('저장소 이름이 올바르지 않습니다.');
  return lower(key);
}
function checkPatch(patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw bad('수정 내용이 올바르지 않습니다.');
  const out = {};
  for (const [k, v] of Object.entries(patch)) {
    if (!EDITABLE.has(k)) throw bad(`고칠 수 없는 항목입니다: ${k}`);
    if (v === null) { out[k] = null; continue; }
    if (k === 'section') { if (v !== 'team' && v !== 'solo') throw bad('구분은 team 또는 solo 여야 합니다.'); out[k] = v; continue; }
    if (k === 'images') {                                                       // 사진은 이 앱이 내려받은 파일 주소만 허용한다
      if (!Array.isArray(v) || v.length > 3 || !v.every(u => typeof u === 'string' && /^\/(img|dimg)\/[\w.%-]+$/.test(u))) throw bad('사진 선택이 올바르지 않습니다.');
      out[k] = v; continue;
    }
    if (k === 'result') {                                                       // 문자열 또는 문자열 배열(여러 줄)
      const arr = Array.isArray(v) ? v : [v];
      if (arr.length > 6 || !arr.every(s => typeof s === 'string' && s.length <= MAX_TEXT)) throw bad('성과 내용이 올바르지 않습니다.');
      out[k] = Array.isArray(v) ? arr : arr[0]; continue;
    }
    if (typeof v !== 'string' || v.length > MAX_TEXT) throw bad(`${k} 내용이 올바르지 않습니다. (문자열, ${MAX_TEXT}자 이하)`);
    out[k] = v;
  }
  return out;
}

// ---------- 저장 / 백업 ----------
function loadOverrides() {
  const o = read(OVR, { projects: {}, hidden: [] });
  return { projects: Object.assign(Object.create(null), o.projects || {}), hidden: Array.isArray(o.hidden) ? o.hidden : [] };
}
// 내가 다듬은 내용(overrides.json)은 이 앱에서 가장 소중한 데이터라, 바꾸기 전에 항상 백업해 둔다. (최근 30개 보관)
function backupOverrides() {
  try {
    if (!fs.existsSync(OVR)) return;
    const dir = path.join(DATA_DIR, 'backups'); fs.mkdirSync(dir, { recursive: true });
    const cur = fs.readFileSync(OVR), files = fs.readdirSync(dir).filter(f => /^overrides-.*\.json$/.test(f)).sort();
    if (files.length && fs.readFileSync(path.join(dir, files[files.length - 1])).equals(cur)) return;     // 마지막 백업과 같으면 건너뜀
    fs.writeFileSync(path.join(dir, `overrides-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`), cur);
    files.slice(0, Math.max(0, files.length + 1 - 30)).forEach(f => fs.unlinkSync(path.join(dir, f)));
  } catch { /* 백업 실패가 저장을 막지는 않는다 */ }
}
function saveOverrides(o) {
  backupOverrides(); fs.mkdirSync(DATA_DIR, { recursive: true });
  const t = OVR + '.tmp'; fs.writeFileSync(t, JSON.stringify({ projects: { ...o.projects }, hidden: o.hidden }, null, 1), 'utf8'); fs.renameSync(t, OVR);   // 쓰다 끊겨도 원본이 깨지지 않게 임시 파일로
}

// ---------- 카드 목록 만들기 (파일이 바뀌지 않았으면 지난 결과를 그대로 쓴다) ----------
let memo = { sig: '', value: null };
const mtime = (f) => { try { return fs.statSync(f).mtimeMs; } catch { return 0; } };
function build() {
  const sig = [COLLECTED, OVR, CONFIG].map(mtime).join('|');
  if (memo.sig === sig && memo.value) return memo.value;
  const value = compute(); memo = { sig, value }; return value;
}
function compute() {
  const col = read(COLLECTED, null);
  const ovr = loadOverrides();
  const cfg = read(CONFIG, { names: [] });
  const user = { ...(col ? col.user : { login: '', name: '' }), names: cfg.names || [] };
  const byRepo = new Map((col ? col.repos : []).map(r => [lower(r.repo), r]));
  const hidden = new Set(ovr.hidden.map(lower));
  const projects = [], pending = [], used = new Set();

  const make = (key, o, r, all) => {
    const a = r ? autoFields(r, user) : {};
    const pick = (k) => (o && o[k] !== undefined && o[k] !== '') ? o[k] : (a[k] ?? '');
    const toUrl = (f) => /^\//.test(f) ? f : `/dimg/${encodeURIComponent(f)}`;           // 내가 고른 사진은 주소로, 처음 값은 data/images 파일명으로 저장돼 있다
    const imgs = o && o.images && o.images.length ? o.images.map(toUrl) : (r ? r.images.map(f => `/img/${f}`) : []);
    const candidates = [...new Set([...((o && o.images) || []).map(toUrl), ...(all || (r ? [r] : [])).flatMap(x => x.images.map(f => `/img/${f}`))])];
    const people = pick('people');
    return { key, repos: (o && o.repos) || [r.repo], name: pick('name'), title: pick('title'), period: pick('period'), people, role: pick('role'),
      env: pick('env'), result: pick('result'), note: (o && o.note) || '', images: imgs, candidates, private: !!(r && r.private),
      section: (o && o.section) || (/^1인/.test(people) ? 'solo' : 'team'), lastCommit: a.lastCommit || (r && r.pushedAt) || '', order: (o && o.order) || 999 };
  };

  for (const [key, o] of Object.entries(ovr.projects)) {
    const repos = (o.repos || [key]).map(lower);
    repos.forEach(x => used.add(x));
    if (repos.some(x => hidden.has(x))) continue;
    const found = repos.map(x => byRepo.get(x)).filter(Boolean);
    const p = make(key, o, found[0] || null, found);
    if (found.length > 1) p.lastCommit = found.map(f => f.span.last || f.pushedAt).sort().pop();
    projects.push(p);
  }
  for (const r of byRepo.values()) {
    const k = lower(r.repo);
    if (used.has(k) || hidden.has(k)) continue;
    const j = judge(r, user);
    pending.push({ key: k, repo: r.repo, private: r.private, recommend: j.complete, reasons: j.reasons, warnings: j.warnings, pushedAt: r.pushedAt, preview: autoFields(r, user), images: r.images.map(f => `/img/${f}`) });
  }
  const rank = { team: 0, solo: 1 };
  projects.sort((x, y) => (rank[x.section] - rank[y.section]) || String(y.lastCommit).localeCompare(String(x.lastCommit)) || x.order - y.order);
  pending.sort((a, b) => (b.recommend - a.recommend) || String(b.pushedAt).localeCompare(String(a.pushedAt)));
  return { collectedAt: col ? col.at : null, user, projects, pending };
}

function includeProject(rawKey) {       // "넣기": 카드로 확정하고, 이후 수집에서도 항상 카드로 둔다
  const key = checkKey(rawKey);
  const o = loadOverrides(); const col = read(COLLECTED, { repos: [] });
  const repo = (col.repos.find(r => lower(r.repo) === key) || { repo: rawKey }).repo;
  if (!o.projects[key]) o.projects[key] = { repos: [repo] };
  o.hidden = o.hidden.filter(h => lower(h) !== key);
  saveOverrides(o);
}
function patchProject(rawKey, rawPatch) {
  const key = checkKey(rawKey), patch = checkPatch(rawPatch);
  const o = loadOverrides();
  if (!o.projects[key]) { includeProject(rawKey); return patchProject(rawKey, rawPatch); }
  const next = { ...o.projects[key] };
  for (const [k, v] of Object.entries(patch)) { if (v === null) delete next[k]; else next[k] = v; }
  o.projects[key] = next; saveOverrides(o);
}
function hideProject(rawKey) {          // "빼기": 이후 수집에서도 다시 묻지 않는다
  const key = checkKey(rawKey);
  const o = loadOverrides(); const cur = o.projects[key];
  (cur ? cur.repos : [rawKey]).forEach(r => { if (!o.hidden.map(lower).includes(lower(r))) o.hidden.push(r); });
  saveOverrides(o);
}
module.exports = { build, patchProject, includeProject, hideProject, DATA_DIR, ROOT, checkPatch, checkKey };
