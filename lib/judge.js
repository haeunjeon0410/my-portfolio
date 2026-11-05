// 수집한 저장소 정보로 "완성 여부"를 판단하고 카드 항목(기간·인원·환경 등)을 자동으로 채운다.
const FRAMEWORKS = [['next', 'Next.js'], ['react', 'React'], ['vue', 'Vue'], ['svelte', 'Svelte'], ['vite', 'Vite'], ['@nestjs/core', 'NestJS'], ['express', 'Express'],
  ['prisma', 'Prisma'], ['@prisma/client', 'Prisma'], ['tailwindcss', 'Tailwind'], ['three', 'Three.js'], ['phaser', 'Phaser'], ['socket.io', 'Socket.IO'], ['socket.io-client', 'Socket.IO'],
  ['framer-motion', 'Framer Motion'], ['web-push', 'Web Push'], ['playwright', 'Playwright'], ['esbuild', 'esbuild'], ['zustand', 'Zustand'], ['@supabase/supabase-js', 'Supabase']];
const LANG_NAME = { JavaScript: 'JavaScript', TypeScript: 'TypeScript', Python: 'Python', Dart: 'Dart', Kotlin: 'Kotlin', Java: 'Java', Swift: 'Swift', 'C++': 'C++', PowerShell: 'PowerShell', HTML: 'HTML' };
const SKIP_LANG = new Set(['CSS', 'Shell', 'Batchfile', 'Dockerfile', 'VBScript', 'SCSS', 'Makefile', 'CMake', 'C', 'Objective-C']);
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu;
const clean = (s) => String(s).replace(EMOJI, '').replace(/[*_`#]/g, '').replace(/\s+>\s+/g, ' ').replace(/^["“]|["”]$/g, '').trim();

function duration(first, last) {
  const a = new Date(first), b = new Date(last);
  const d = Math.round((b - a) / 864e5) + 1;
  let txt;
  if (d < 7) txt = `${d}일`;
  else if (d < 30) txt = `약 ${Math.max(1, Math.round(d / 7))}주`;
  else txt = `약 ${Math.floor(d / 30)}개월`;      // 한 달 이상은 개월만 쓰고 내림한다 (주는 생략: 135일 → "약 4개월")
  return `${a.getFullYear()}.${String(a.getMonth() + 1).padStart(2, '0')} (${txt})`;
}

// README 의 팀 표(이름/담당자 헤더)에서 팀원 수·구성·내 역할을 읽는다.
function teamFromReadme(readme, user) {
  const rows = []; let inTeam = false;
  for (const line of readme.split('\n')) {
    if (!/^\s*\|/.test(line)) { inTeam = false; continue; }
    if (/^\s*\|[\s:|-]+\|?\s*$/.test(line)) continue;
    const cells = line.split('|').map(s => s.replace(/\*\*|`/g, '').trim()).filter(Boolean);
    // 팀 표는 첫 칸이 "이름/담당자/팀원/Name/Member" 이고 역할·담당 칸이 함께 있는 표만 인정한다.
    if (/^(이름|담당자|팀원|name|member|role)$/i.test(cells[0] || '')) { inTeam = /(역할|담당|role|github|학번|분야)/i.test(cells.join(' ')); continue; }
    if (/^[^|]*(종류|항목|방법|기능|구분|의미)/.test(cells[0] || '') && cells.length >= 2) { inTeam = false; continue; }
    const person = (n) => n.length <= 12 && !/[(){}:?!"“”]/.test(n) && n.split(/\s+/).length <= 2 && !/\d{3,}/.test(n);
    if (inTeam && cells.length >= 2) cells[0].split(/[,、]/).map(n => n.trim()).filter(person).forEach(n => rows.push([n, ...cells.slice(1)]));
  }
  if (rows.length < 2 || rows.length > 15) return null;
  const names = [user.login, user.name, ...(user.names || [])].filter(Boolean);
  const mine = rows.find(r => names.some(n => r.join(' ').includes(n)));
  const kind = (r) => {
    const t = r.slice(1).join(' ');
    return /(백엔드|backend|\bBE\b|supabase|서버)/i.test(t) ? '백엔드' : /(프론트|frontend|\bFE\b|UI|화면|상세|검색|필터|재료|레시피)/i.test(t) ? '프론트' : /기획/.test(t) ? '기획' : '개발';
  };
  const cnt = {}; rows.forEach(r => { const k = kind(r); cnt[k] = (cnt[k] || 0) + 1; });
  return { size: rows.length, composition: Object.entries(cnt).map(([k, n]) => `${k} ${n}`).join(' · '), role: mine ? kind(mine).replace('프론트', '프론트엔드') : '' };
}

// README 의 "개발 기간 2026.01.08 ~ 2026.01.14" 표기를 읽는다. (커밋을 몰아서 올린 프로젝트 보정용)
function readmeRange(readme) {
  const re = /(\d{4})[.\-/]\s*(\d{1,2})[.\-/]\s*(\d{1,2})\s*[~\-–]\s*(?:(\d{4})[.\-/]\s*)?(\d{1,2})[.\-/]\s*(\d{1,2})/;
  const ls = readme.split('\n').slice(0, 150);
  for (let i = 0; i < ls.length; i++) {
    const line = ls[i];
    if (!/(기간|period)/i.test(line) && !/(기간|period)/i.test(ls[i - 1] || '')) continue;
    const m = line.match(re);
    if (m) return { start: new Date(+m[1], +m[2] - 1, +m[3]), end: new Date(+m[4] || +m[1], +m[5] - 1, +m[6]) };
  }
  return null;
}

function judge(r, user) {
  const readme = r.readme || '';
  // 1차 기준: "스크린샷이 들어간 README"가 있으면 완성으로 본다. (끝낸 프로젝트는 그렇게 정리해 두는 습관)
  const shots = readme.split('\n').filter(l => !/(shields\.io|badge|\.svg)/i.test(l)).join('\n').match(/!\[[^\]]*\]\(|<img[^>]+src=/gi) || [];
  const reasons = [], warnings = [];
  if (r.name.toLowerCase() === user.login.toLowerCase() || r.name === '.github') reasons.push('프로필 저장소');
  if (readme.length < 200) reasons.push('README가 없거나 짧음');
  if (!shots.length) reasons.push('README에 스크린샷 없음');
  // 보조: 제외 사유가 아니라 확인용 주의 표시
  if (r.codeFiles < 3) warnings.push('코드가 거의 없음');
  if (r.span.count < 3) warnings.push('내 커밋이 3개 미만');
  if (/(WIP|미완성|작업 중|공사 중)/i.test(readme.slice(0, 1500))) warnings.push('README에 미완성 표시');
  return { complete: reasons.length === 0, reasons, warnings };
}

function autoFields(r, user) {
  const readme = r.readme || '';
  const h1 = clean((readme.match(/^#\s+(.+)$/m) || [])[1] || '');
  const name = h1 && h1.length <= 28 ? h1 : r.name;
  const quote = (readme.match(/^>\s*\*{0,2}(?!.*(스크린샷|아래|참고|주의|예시))(.+?)\*{0,2}\s*$/m) || [])[2];
  const para = readme.split('\n').find(l => l.trim().length > 10 && !/^[#!<|>\[\-*`=]/.test(l.trim()) && !/(스크린샷|예시|설치|실행)/.test(l)) || '';
  const title = clean(r.description || quote || para).slice(0, 80);
  const team = teamFromReadme(readme, user);
  const others = r.contributors.filter(c => c.login.toLowerCase() !== user.login.toLowerCase());
  let people, role = '';
  if (team) { people = `${team.size}명 (${team.composition})`; role = team.role; }
  else if (!others.length) people = '1인 개발';
  else people = `${others.length + 1}명`;
  const langs = Object.entries(r.langs).filter(([k]) => !SKIP_LANG.has(k)).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k]) => LANG_NAME[k] || k);
  const fw = []; r.deps.forEach(d => { const f = FRAMEWORKS.find(x => x[0] === d); if (f && !fw.includes(f[1])) fw.push(f[1]); });
  const env = [...new Set([...fw.slice(0, 5), ...langs])].join(', ');
  const award = (readme + '\n' + r.description).split('\n').find(l => /(최우수상|우수상|대상|장려상|수상)/.test(l));
  let first = r.span.first, last = r.span.last;
  const rr = readmeRange(readme);
  if (rr && (!first || (rr.end - rr.start) > (new Date(last) - new Date(first)))) { first = rr.start; last = rr.end; }
  return { name, title, people, role, env, period: first ? duration(first, last) : '', result: award ? clean(award).slice(0, 60) : '', lastCommit: r.span.last || r.pushedAt };
}
module.exports = { judge, autoFields, teamFromReadme, readmeRange, duration };
