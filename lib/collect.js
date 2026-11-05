// 내가 커밋한 저장소를 모아 README·스크린샷·커밋 기간·팀 정보를 .cache/collected.json 에 저장한다.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { api, paginate, graphql, download, rawFile } = require('./github');

const ROOT = process.env.PORTFOLIO_HOME || path.join(__dirname, '..');
const CACHE = path.join(ROOT, '.cache');
const IMG_DIR = path.join(CACHE, 'images');
const OUT = path.join(CACHE, 'collected.json');
const FILES_CACHE = path.join(CACHE, 'commitfiles.json');
const DOC = /(\.(md|txt|png|jpe?g|gif|webp|svg|pdf|mp4|mov|docx?|pptx?|lock)$)|(^|\/)(README|LICENSE|\.gitignore|\.gitattributes)|^(docs|screenshots|screens)\//i;
const CODE = /\.(js|jsx|ts|tsx|py|java|kt|swift|dart|c|cpp|h|cs|go|rs|rb|php|vue|svelte|html|css|scss|sh|ps1|bat|sql|prisma|mjs|cjs)$/i;
const BOT = /(\[bot\]|^bot$|^claude$|actions-user|github-actions|dependabot)/i;

fs.mkdirSync(IMG_DIR, { recursive: true });
const IMG_EXT = { png: 'png', jpeg: 'jpg', jpg: 'jpg', gif: 'gif', webp: 'webp' };      // 이 밖의 형식(svg 등)은 받지 않는다
let cachedImages = null;                                                                  // 사진 폴더는 한 번만 읽는다
const imageIndex = () => cachedImages ||= new Map(fs.readdirSync(IMG_DIR).map(f => [f.split('.')[0], f]));
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const filesCache = readJson(FILES_CACHE, {});

async function myRepos(login, createdYear, log) {
  const names = new Map();
  const add = (r) => r && names.set(r.nameWithOwner.toLowerCase(), r);
  for (let y = createdYear; y <= new Date().getFullYear(); y++) {
    const d = await graphql(`query{viewer{contributionsCollection(from:"${y}-01-01T00:00:00Z",to:"${y}-12-31T23:59:59Z"){commitContributionsByRepository(maxRepositories:100){repository{nameWithOwner isPrivate isFork isArchived pushedAt}}}}}`);
    d.viewer.contributionsCollection.commitContributionsByRepository.forEach(x => add(x.repository));
  }
  const owned = await paginate('/user/repos?affiliation=owner&sort=pushed');
  owned.forEach(r => add({ nameWithOwner: r.full_name, isPrivate: r.private, isFork: r.fork, isArchived: r.archived, pushedAt: r.pushed_at }));
  log(`저장소 ${names.size}개 확인`);
  return [...names.values()];
}

function parseImages(readme, repo, branch) {
  const urls = [];
  const push = (u) => { if (u && !urls.includes(u)) urls.push(u); };
  for (const m of readme.matchAll(/!\[[^\]]*\]\(\s*<?([^)\s>]+)/g)) push(m[1]);
  for (const m of readme.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)) push(m[1]);
  return urls.filter(u => !/shields\.io|badge|img\.shields|\.svg(\?|$)|github\.com\/[^/]+\/[^/]+\/(actions|workflows)|logo|icon|favicon/i.test(u))
    .filter(u => /^https?:/i.test(u) || !/(^|\/)\.\.(\/|$)/.test(u))                    // 저장소 밖을 가리키는 상대 경로(..)는 버린다
    .map(u => /^https?:/i.test(u) ? u : `https://raw.githubusercontent.com/${repo}/${branch}/${u.replace(/^\.?\//, '')}`);
}

async function fetchImage(url, repo) {
  const key = crypto.createHash('sha1').update(url).digest('hex').slice(0, 16);
  const hit = imageIndex().get(key);
  if (hit) return hit;
  let got = null;
  const m = url.match(/^https:\/\/raw\.githubusercontent\.com\/([^/]+\/[^/]+)\/([^/]+)\/(.+)$/);
  if (m) {                                        // 비공개 저장소 이미지는 인증 받아서 가져온다
    const buf = await rawFile(m[1], decodeURI(m[3]).split('?')[0], m[2]);
    if (buf) got = { buf, type: 'image/' + (m[3].split('?')[0].split('.').pop() || 'png') };
  }
  if (!got) got = await download(url);
  if (!got || got.buf.length > 8e6 || got.buf.length < 3000) return null;
  const ext = IMG_EXT[(got.type.split('/')[1] || '').split(';')[0].toLowerCase()];
  if (!ext) return null;
  const name = `${key}.${ext}`;
  fs.writeFileSync(path.join(IMG_DIR, name), got.buf);
  imageIndex().set(key, name);
  return name;
}

async function commitSpan(repo, login) {
  const commits = await paginate(`/repos/${repo}/commits?author=${login}`, 5);
  if (!commits.length) return { first: null, last: null, count: 0 };
  const dated = commits.map(c => ({ sha: c.sha, date: c.commit.author.date })).sort((a, b) => a.date.localeCompare(b.date));
  const isCode = async (c) => {
    const k = `${repo}@${c.sha}`;
    if (!(k in filesCache)) {
      const d = await api(`/repos/${repo}/commits/${c.sha}`);
      filesCache[k] = d && d.files ? d.files.some(f => !DOC.test(f.filename)) : true;
    }
    return filesCache[k];
  };
  const scan = async (list, fallback) => { for (const c of list) if (await isCode(c)) return c; return fallback; };
  const [first, last] = await Promise.all([scan(dated.slice(0, 25), dated[0]), scan(dated.slice(-25).reverse(), dated[dated.length - 1])]);     // 앞·뒤를 동시에
  return { first: first.date, last: last.date, count: dated.length };
}

async function collectRepo(fullName, login, log) {
  let meta = await api(`/repos/${fullName}`);
  if (!meta) return null;
  if (meta.fork && meta.source) meta = await api(`/repos/${meta.source.full_name}`) || meta;     // 포크는 원본 기준
  const repo = meta.full_name, branch = meta.default_branch;
  const [langs, readme, tree, contribs, span, pkg] = await Promise.all([
    api(`/repos/${repo}/languages`), api(`/repos/${repo}/readme`, { raw: true }),
    api(`/repos/${repo}/git/trees/${branch}?recursive=1`), paginate(`/repos/${repo}/contributors`, 2),
    commitSpan(repo, login), api(`/repos/${repo}/contents/package.json`, { raw: true })]);
  const files = (tree && tree.tree || []).filter(t => t.type === 'blob');
  const codeFiles = files.filter(f => CODE.test(f.path) && !/node_modules|\/dist\/|\.min\./.test(f.path)).length;
  const shotPaths = files.filter(f => /(screenshots?|screens?|assets|docs|images?|readme)\/[^/]*\.(png|jpe?g|webp|gif)$/i.test(f.path) && f.size > 8000 && !/logo|icon/i.test(f.path)).map(f => f.path);
  const readmeImgs = parseImages(readme || '', repo, branch);
  const fromTree = shotPaths.slice(0, 6).map(p => `https://raw.githubusercontent.com/${repo}/${branch}/${p}`);
  // 후보 사진은 그 저장소 README 에 들어 있는 사진만 쓴다. (README 에 사진이 하나도 없을 때만 저장소 폴더의 스크린샷으로 대신한다)
  const candidates = (readmeImgs.length ? readmeImgs : fromTree).slice(0, 12);
  const images = [];
  for (const u of candidates) { if (images.length >= 6) break; const n = await fetchImage(u, repo).catch(() => null); if (n && !images.includes(n)) images.push(n); }
  let deps = [];
  try { const j = JSON.parse(pkg || '{}'); deps = Object.keys({ ...j.dependencies, ...j.devDependencies }); } catch { /* package.json 없음 */ }
  log(`  ${repo}: 커밋 ${span.count}, 이미지 ${images.length}`);
  return { repo, name: meta.name, private: meta.private, archived: meta.archived, description: meta.description || '', homepage: meta.homepage || '',
    topics: meta.topics || [], createdAt: meta.created_at, pushedAt: meta.pushed_at, langs: langs || {}, readme: (readme || '').slice(0, 20000), images, imageCandidates: candidates.length,
    v: 3, codeFiles, deps, contributors: contribs.filter(c => !BOT.test(c.login)).map(c => ({ login: c.login, n: c.contributions })), span };
}

async function collect(log = console.log) {
  const me = await api('/user');
  const createdYear = new Date(me.created_at).getFullYear();
  const all = await myRepos(me.login, createdYear, log);
  // 이미 뺀 저장소는 건너뛰고, 마지막 확인 뒤 바뀐 게 없는 저장소는 지난번 결과를 그대로 쓴다. 바뀐 것만 새로 확인한다.
  const prev = new Map((readJson(OUT, { repos: [] }).repos).filter(p => p.via).map(p => [p.via.toLowerCase(), p]));
  const hidden = new Set((readJson(path.join(ROOT, 'data', 'overrides.json'), { hidden: [] }).hidden || []).map(h => h.toLowerCase()));
  const reuse = [], todo = [], changed = []; let skippedHidden = 0;
  for (const r of all) {
    const k = r.nameWithOwner.toLowerCase();
    if (hidden.has(k)) { skippedHidden++; continue; }
    const p = prev.get(k);
    if (p && p.v === 3 && p.listedPushedAt && p.listedPushedAt === r.pushedAt) reuse.push(p);
    else if (p) changed.push({ r, p });
    else todo.push(r);
  }
  // 바뀐 저장소는 가장 최근 커밋 한 건만 먼저 본다. 봇이 자동으로 올린 것이면 다시 확인하지 않는다.
  await Promise.all(changed.map(async ({ r, p }) => {
    const c = await api(`/repos/${r.nameWithOwner}/commits?per_page=1`).catch(() => null);
    const who = c && c[0] ? ((c[0].author && c[0].author.login) || c[0].commit.author.name || '') : '';
    if (BOT.test(who)) reuse.push({ ...p, listedPushedAt: r.pushedAt }); else todo.push(r);
  }));
  log(`뺀 저장소 ${skippedHidden}개·변경 없는 ${reuse.length}개는 건너뛰고, ${todo.length}개만 확인`);
  const fetched = [], failed = [];
  let next = 0;
  const worker = async () => {                          // 4개씩 동시에
    while (next < todo.length) {
      const r = todo[next++];
      const c = await collectRepo(r.nameWithOwner, me.login, log).catch(e => { failed.push(r.nameWithOwner); log(`  ! ${r.nameWithOwner}: ${e.message}`); return null; });
      if (c) fetched.push({ ...c, via: r.nameWithOwner, listedPushedAt: r.pushedAt });
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  const out = []; const seen = new Set();
  for (const c of [...reuse, ...fetched]) if (!seen.has(c.repo.toLowerCase())) { seen.add(c.repo.toLowerCase()); out.push(c); }
  fs.writeFileSync(FILES_CACHE, JSON.stringify(filesCache));
  fs.writeFileSync(OUT, JSON.stringify({ at: new Date().toISOString(), user: { login: me.login, name: me.name || '' }, repos: out }));
  // 더 이상 쓰이지 않는 사진 캐시는 지운다. (내가 카드에 고른 사진은 남긴다)
  try {
    const keep = new Set(out.flatMap(r => r.images));
    const ovr = readJson(path.join(ROOT, 'data', 'overrides.json'), { projects: {} });
    Object.values(ovr.projects).forEach(p => (p.images || []).forEach(u => { if (String(u).startsWith('/img/')) keep.add(decodeURIComponent(String(u).slice(5))); }));
    fs.readdirSync(IMG_DIR).filter(f => !keep.has(f)).forEach(f => fs.unlinkSync(path.join(IMG_DIR, f)));
  } catch { /* 정리 실패는 무시 */ }
  log(failed.length ? `수집 완료: ${out.length}개 (확인 실패 ${failed.length}개: ${failed.join(', ')})` : `수집 완료: ${out.length}개`);
  return out;
}
module.exports = { collect, OUT, IMG_DIR };
