// 포트폴리오 페이지를 그린다. 화면 미리보기(edit=true)와 PDF(edit=false)가 같은 코드를 쓴다.
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const SECTIONS = { team: '팀 / 공개 프로젝트', solo: '개인 프로젝트' };
const lines = (v) => Array.isArray(v) ? v : (v ? [v] : []);
const PENCIL = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17z"/><path d="M14 7l3 3"/></svg>';

function row(p, field, label, always) {
  const ls = lines(p[field]);
  if (!ls.length && !always) return '';
  const body = ls.length ? `${esc(ls[0])}${ls.slice(1).map(l => `<small>${esc(l)}</small>`).join('')}` : '<span class="empty-hint">-</span>';
  return `<dt>${label}</dt><dd>${body}</dd>`;
}

// ---------- 기술 스택 ----------
const CATS = [['Language', '언어'], ['Frontend', '프론트엔드'], ['Backend', '백엔드'], ['Database', '데이터베이스'], ['AI', 'AI'], ['Infra', '인프라·배포'], ['Build', '빌드'], ['Test', '테스트']];
const verKey = (v) => String(v || '').split(/[.\-]/).map(x => parseInt(x, 10) || 0);
const verGt = (a, b) => { const x = verKey(a), y = verKey(b); for (let i = 0; i < Math.max(x.length, y.length); i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); } return false; };
// 표기 기준: 라이브러리·프레임워크·런타임은 모두 버전을 쓴다(설정 파일에 버전이 없으면 "미고정"). 관리형 서비스·표준은 버전이 없어서 따로 모아 버전 없이 쓴다.
const SERVICES = new Set(['Redis', 'PostgreSQL', 'MySQL', 'SQLite', 'MongoDB', 'Docker', 'GitHub Actions', 'Vercel', 'Cloudflare Workers', 'PWA']);
const isService = (n) => SERVICES.has(n);
const tech = (s) => `${esc(s.name)}${s.ver ? ` <i>${esc(s.ver)}</i>` : (isService(s.name) || s.cat === 'Language' ? '' : ' <em>미고정</em>')}`;     // 언어(JavaScript 등)는 버전이 설정에서 확인될 때만 쓴다
// 카드 안에서는 3줄로 묶어 보여 준다: 프론트·화면 / 서버·DB / 인프라. 언어는 앞쪽 줄에 붙인다.
function stackLines(stack, extraLangs = []) {
  stack = [...(stack || [])]; for (const l of [...extraLangs].reverse()) if (!stack.some(s => s.name === l)) stack.unshift({ name: l, cat: 'Language', ver: '' });     // 많이 쓴 언어가 앞에 오도록
  const lib = stack.filter(s => !isService(s.name)), svc = stack.filter(s => isService(s.name));
  const g = [['언어', ['Language']], ['프론트', ['Frontend', 'Build']], ['서버·DB', ['Backend', 'Database', 'AI', 'Test']], ['인프라', ['Infra']]]
    .map(([label, cats]) => [label, lib.filter(s => cats.includes(s.cat))]); g.push(['서비스', svc]);
  return g.filter(([, l]) => l.length).map(([label, l]) => `<div class="sl"><b>${label}</b>${l.map(tech).join(' · ')}</div>`).join('');
}
function envCell(p) {                      // 기술 스택을 읽었으면 버전과 함께, 못 읽었으면(정적 사이트 등) 직접 적은 값
  const sl = stackLines(p.stack, p.langs);
  if (!sl) return row(p, 'env', '언어 및 환경', 1);
  // 직접 적어 둔 환경 값 중 스택에서 읽히지 않은 것(예: Vercel, AI API)은 잃지 않도록 '기타'로 붙인다
  const known = new Set([...(p.stack || []).map(s => s.name), ...(p.langs || [])].map(x => x.toLowerCase().replace(/[^a-z0-9가-힣]/g, '')));
  const norm = (t) => t.toLowerCase().replace(/\(.*\)/, '').replace(/[^a-z0-9가-힣]/g, '');
  const dup = (t) => known.has(norm(t)) || [...known].some(k => k && norm(t).length >= 4 && (k.startsWith(norm(t)) || norm(t).startsWith(k)));
  const extra = String(p.env || '').split(/,\s*/).map(t => t.trim()).filter(t => t && !dup(t) && !/^(react|vite|typescript|javascript|python|docker)|pwa|바닐라/i.test(t));
  return `<dt>언어 및 환경</dt><dd class="stk">${sl}${extra.length ? `<div class="sl"><b>기타</b>${extra.map(esc).join(' · ')}</div>` : ''}</dd>`;
}

// ---------- 카드 (한 쪽에 두 개) ----------
function card(p, no, edit) {
  const imgs = p.images.slice(0, 3).map(u => `<img src="${esc(u)}" alt="">`).join('') || '<span class="none">스크린샷 없음</span>';
  const solo = /^1인/.test(p.people);
  const list = (title, v) => { const l = lines(v); return l.length ? `<div class="blk"><h4>${title}</h4><ul>${l.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''; };
  const blocks = list('역할', p.roleDetail) + list('핵심 성과', p.achievements) + list('지표', p.metrics) + (p.ai ? list('AI 활용', p.ai) : '');
  return `<article class="card" data-key="${esc(p.key)}"><div class="shots">${imgs}</div><div class="info">
    <h3><span class="no">${no}.</span><span>${esc(p.title)}</span></h3>
    <dl>${row(p, 'name', '프로젝트명', 1)}${row(p, 'period', '기간', 1)}${row(p, 'people', '인원', 1)}${solo ? '' : row(p, 'role', '개발 담당', 1)}${envCell(p)}${row(p, 'result', '프로젝트 성과')}${row(p, 'note', '비고')}</dl>
    ${blocks ? `<div class="blocks">${blocks}</div>` : ''}
  </div>${edit ? `<button class="pencil" data-edit="${esc(p.key)}" aria-label="수정" title="수정">${PENCIL}</button>` : ''}</article>`;
}

function cardWide(p, no, edit) {
  const imgs = p.images.slice(0, 3).map(u => `<img src="${esc(u)}" alt="">`).join('') || '<span class="none">스크린샷 없음</span>';
  const solo = /^1인/.test(p.people);
  const list = (title, v) => { const l = lines(v); return l.length ? `<div class="blk"><h4>${title}</h4><ul>${l.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''; };
  const blocks = list('역할', p.roleDetail) + list('핵심 성과', p.achievements) + list('지표', p.metrics) + list('AI 활용', p.ai);
  return `<article class="card l2" data-key="${esc(p.key)}"><div class="lcol"><div class="shots">${imgs}</div><div class="facts"><dl>${row(p, 'name', '프로젝트명', 1)}${row(p, 'period', '기간', 1)}${row(p, 'people', '인원', 1)}${solo ? '' : row(p, 'role', '개발 담당', 1)}${row(p, 'result', '프로젝트 성과')}${row(p, 'note', '비고')}${envCell(p)}</dl></div></div>
    <div class="info"><h3><span class="no">${no}.</span><span>${esc(p.title)}</span></h3>${blocks ? `<div class="blocks">${blocks}</div>` : '<p class="nodetail">역할·핵심 성과를 연필(수정)에서 적으면 이 칸에 표시됩니다.</p>'}</div>
  ${edit ? `<button class="pencil" data-edit="${esc(p.key)}" aria-label="수정" title="수정">${PENCIL}</button>` : ''}</article>`;
}

// ---------- 맨 위 요약 (한 쪽): 기술 스택 전체 + 경진대회 + 자격증 + AI 활용 기준 ----------
function aggregate(projects) {
  const m = new Map();
  projects.forEach((p, i) => {
    for (const s of (p.stack || [])) { const e = m.get(s.name) || { name: s.name, cat: s.cat, ver: '', nos: [] }; if (s.ver && (!e.ver || verGt(s.ver, e.ver))) e.ver = s.ver; if (!e.nos.includes(i + 1)) e.nos.push(i + 1); m.set(s.name, e); }
    for (const l of (p.langs || [])) { const e = m.get(l) || { name: l, cat: 'Language', ver: '', nos: [] }; if (!e.nos.includes(i + 1)) e.nos.push(i + 1); m.set(l, e); }
  });
  return [...m.values()];
}
const PRIZE_RE = /(최우수상|우수상|대상|금상|은상|동상|장려상|특별상|입상)/;
function awardsOf(d) {
  const list = [];
  d.projects.forEach((p, i) => lines(p.result).filter(l => PRIZE_RE.test(l)).forEach(l => list.push({ text: l, project: p.name, no: i + 1 })));
  for (const c of (d.profile && d.profile.competitions) || []) list.push({ text: typeof c === 'string' ? c : [c.name, c.award].filter(Boolean).join(' '), project: typeof c === 'string' ? '' : (c.project || ''), no: 0 });
  return list;
}
function summaryPage(d) {
  const agg = aggregate(d.projects), pf = d.profile || {}, ai = pf.ai || {}, awards = awardsOf(d), certs = pf.certs || [];
  const chipOf = (a) => `<span class="chip">${tech(a)}<u>${a.nos.length > 5 ? '×' + a.nos.length : a.nos.join(',')}</u></span>`;
  const sortAgg = (l) => l.sort((x, y) => y.nos.length - x.nos.length || x.name.localeCompare(y.name));
  const rows = CATS.map(([k, label]) => {
    const l = sortAgg(agg.filter(a => a.cat === k && !isService(a.name)));
    return l.length ? `<div class="srow"><b>${label}</b><div>${l.map(chipOf).join('')}</div></div>` : '';
  }).join('') + (() => { const l = sortAgg(agg.filter(a => isService(a.name))); return l.length ? `<div class="srow"><b>서비스·표준</b><div>${l.map(chipOf).join('')}</div></div>` : ''; })();
  const block = (title, body) => body ? `<section class="sblock"><h4>${title}</h4>${body}</section>` : '';
  return `<section class="page summary"><header><h2>요약</h2><span class="sub">프로젝트 ${d.projects.length}개</span><span class="who">${esc(d.user.name || d.user.login)} · github.com/${esc(d.user.login)}</span></header>
    ${pf.tagline ? `<p class="tag">${esc(pf.tagline)}</p>` : ''}
    <div class="sgrid"><div class="scol">${block('기술 스택 <small>(설정 파일에 선언된 버전 · 옆 숫자는 사용한 프로젝트 번호 · 서비스·표준은 버전 없음)</small>', rows)}</div>
    <div class="scol">${block('경진대회·수상', awards.length ? `<ul>${awards.map(a => `<li>${esc(a.text)}${a.project ? ` <small>${esc(a.project)}${a.no ? ` (${a.no}번)` : ''}</small>` : ''}</li>`).join('')}</ul>` : '')}
    ${block('자격증', certs.length ? `<ul>${certs.map(c => `<li>${esc(typeof c === 'string' ? c : [c.name, c.date].filter(Boolean).join(' · '))}</li>`).join('')}</ul>` : '')}
    ${block('AI 활용(바이브코딩) 기준', (ai.statement ? `<p>${esc(ai.statement)}</p>` : '') + (ai.criteria && ai.criteria.length ? `<ul>${ai.criteria.map(c => `<li>${esc(c)}</li>`).join('')}</ul>` : ''))}</div></div></section>`;
}

function renderPages(d, edit) {
  if (!d.projects.length) return '<p class="empty">아직 카드가 없습니다. "업데이트"를 눌러 GitHub에서 불러오세요.</p>';
  // 요약의 프로젝트 번호와 카드 번호를 같게 한다 (팀 먼저, 개인 다음)
  const ordered = ['team', 'solo'].flatMap(sec => d.projects.filter(p => p.section === sec));
  const per = ordered.length <= 6 ? 1 : 2;                                   // 카드가 적으면 한 쪽에 하나씩 크게
  let no = 0, html = summaryPage({ ...d, projects: ordered });
  for (const sec of ['team', 'solo']) {
    const list = ordered.filter(p => p.section === sec);
    for (let i = 0; i < list.length; i += per) {
      html += `<section class="page${per === 1 ? ' one' : ''}"><header><h2>${SECTIONS[sec]}</h2><span class="sub">최신순</span><span class="who">${esc(d.user.name || d.user.login)} · github.com/${esc(d.user.login)}</span></header>
        <div class="cards">${list.slice(i, i + per).map(p => (per === 1 ? cardWide : card)(p, ++no, edit)).join('')}</div></section>`;
    }
  }
  return html;
}

// 사진 개수와 가로·세로 비율을 보고 사진 칸 배치를 정한다. (화면 미리보기와 PDF 모두 같은 규칙)
async function layoutShots(root = document) {
  await Promise.all([...root.querySelectorAll('.shots img')].map(i => i.decode().catch(() => {})));
  root.querySelectorAll('.shots').forEach(box => {
    const imgs = [...box.querySelectorAll('img')], land = imgs.map(i => i.naturalWidth >= i.naturalHeight * 0.95);
    let mode = 'one';
    if (imgs.length === 2) mode = land.every(Boolean) ? 'stack' : 'row';
    if (imgs.length >= 3) mode = land.every(x => !x) ? 'row' : 'big';     // 3장 모두 세로형이면 한 줄, 아니면 첫 장을 크게
    box.dataset.layout = mode;
    // 좌우로 놓을 때는 사진 비율만큼 너비를 나눠서 모두 같은 높이가 되게 한다.
    box.style.gridTemplateColumns = mode === 'row' ? imgs.map(i => (i.naturalWidth / i.naturalHeight).toFixed(3) + 'fr').join(' ') : '';
  });
}
