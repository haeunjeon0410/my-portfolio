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
function card(p, no, edit) {
  const imgs = p.images.slice(0, 3).map(u => `<img src="${esc(u)}" alt="">`).join('') || '<span class="none">스크린샷 없음</span>';
  const solo = /^1인/.test(p.people);
  return `<article class="card" data-key="${esc(p.key)}"><div class="shots">${imgs}</div><div class="info">
    <h3><span class="no">${no}.</span><span>${esc(p.title)}</span></h3>
    <dl>${row(p, 'name', '프로젝트명', 1)}${row(p, 'period', '기간', 1)}${row(p, 'people', '인원', 1)}${row(p, 'env', '언어 및 환경', 1)}${solo ? '' : row(p, 'role', '개발 담당', 1)}${row(p, 'result', '프로젝트 성과')}${row(p, 'note', '비고')}</dl>
  </div>${edit ? `<button class="pencil" data-edit="${esc(p.key)}" aria-label="수정" title="수정">${PENCIL}</button>` : ''}</article>`;
}
// ---------- 기술 스택 도우미 ----------
const CATS = [['Language', '언어'], ['Frontend', '프론트엔드'], ['Backend', '백엔드'], ['Database', '데이터베이스'], ['AI', 'AI'], ['Infra', '인프라·배포'], ['Build', '빌드'], ['Test', '테스트']];
const verKey = (v) => String(v || '').split(/[.\-]/).map(x => parseInt(x, 10) || 0);
const verGt = (a, b) => { const x = verKey(a), y = verKey(b); for (let i = 0; i < Math.max(x.length, y.length); i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); } return false; };
const stackByCat = (stack) => CATS.map(([k, label]) => [label, (stack || []).filter(s => s.cat === k)]).filter(([, l]) => l.length);
const chip = (s) => `<span class="chip">${esc(s.name)}${s.ver ? ` <i>${esc(s.ver)}</i>` : ''}</span>`;

// 전체 요약: 어떤 기술을 몇 개 프로젝트에서, 어떤 버전으로 썼는지
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

function summaryPages(d) {
  const agg = aggregate(d.projects), user = esc(d.user.name || d.user.login), pf = d.profile || {};
  const head = (t, sub) => `<header><h2>${t}</h2><span class="sub">${sub || ''}</span><span class="who">${user} · github.com/${esc(d.user.login)}</span></header>`;
  const rows = CATS.map(([k, label]) => {
    const l = agg.filter(a => a.cat === k).sort((x, y) => y.nos.length - x.nos.length || x.name.localeCompare(y.name));
    return l.length ? `<div class="srow"><b>${label}</b><div>${l.map(a => `<span class="chip">${esc(a.name)}${a.ver ? ` <i>${esc(a.ver)}</i>` : ''}${a.nos.length > 1 ? `<u>×${a.nos.length}</u>` : ''}</span>`).join('')}</div></div>` : '';
  }).join('');
  const awards = awardsOf(d), certs = pf.certs || [], ai = pf.ai || {};
  const block = (title, body) => body ? `<section class="sblock"><h4>${title}</h4>${body}</section>` : '';
  const p1 = `<section class="page summary">${head('요약', `프로젝트 ${d.projects.length}개`)}
    ${pf.tagline ? `<p class="tag">${esc(pf.tagline)}</p>` : ''}
    <div class="sgrid"><div class="scol">${block('기술 스택 <small>(선언된 버전 기준 · ×N은 사용한 프로젝트 수)</small>', rows)}</div>
    <div class="scol">${block('경진대회·수상', awards.length ? `<ul>${awards.map(a => `<li>${esc(a.text)}${a.project ? ` <small>${esc(a.project)}${a.no ? ` (${a.no}번)` : ''}</small>` : ''}</li>`).join('')}</ul>` : '')}
    ${block('자격증', certs.length ? `<ul>${certs.map(c => `<li>${esc(typeof c === 'string' ? c : [c.name, c.date].filter(Boolean).join(' · '))}</li>`).join('')}</ul>` : '')}
    ${block('AI 활용(바이브코딩) 기준', (ai.statement ? `<p>${esc(ai.statement)}</p>` : '') + (ai.criteria && ai.criteria.length ? `<ul>${ai.criteria.map(c => `<li>${esc(c)}</li>`).join('')}</ul>` : ''))}</div></div></section>`;
  // 2쪽: 프로젝트 한눈에 + 기술별 색인
  const half = Math.ceil(d.projects.length / 2);
  const trow = (p, i) => `<tr><td class="n">${i + 1}</td><td><b>${esc(p.name)}</b></td><td>${esc(p.period)}</td><td>${esc(p.people)}${p.role && !/^1인/.test(p.people) ? ' · ' + esc(p.role) : ''}</td></tr>`;
  const tbl = (from, to) => `<table class="ptable"><thead><tr><th>#</th><th>프로젝트</th><th>기간</th><th>인원 · 역할</th></tr></thead><tbody>${d.projects.slice(from, to).map((p, i) => trow(p, from + i)).join('')}</tbody></table>`;
  const idx = agg.filter(a => a.nos.length).sort((x, y) => y.nos.length - x.nos.length || x.name.localeCompare(y.name)).slice(0, 18);
  const p2 = `<section class="page summary">${head('프로젝트 · 기술별 분류', '한눈에 보기')}
    <div class="sgrid two"><div>${tbl(0, half)}</div><div>${tbl(half, d.projects.length)}</div></div>
    <section class="sblock idx"><h4>기술별 프로젝트 색인 <small>(숫자는 프로젝트 번호)</small></h4><div class="idxgrid">${idx.map(a => `<div><b>${esc(a.name)}</b><span>${a.nos.join(', ')}</span></div>`).join('')}</div></section></section>`;
  return p1 + p2;
}

// 프로젝트 상세: 한 쪽에 한 프로젝트
function detailCard(p, no, total, user, edit) {
  const imgs = p.images.slice(0, 3).map(u => `<img src="${esc(u)}" alt="">`).join('') || '<span class="none">스크린샷 없음</span>';
  const solo = /^1인/.test(p.people);
  const list = (title, v) => { const l = lines(v); return l.length ? `<div class="blk"><h4>${title}</h4><ul>${l.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''; };
  const stackRows = stackByCat(p.stack).map(([label, l]) => `<div class="srow2"><b>${label}</b><div>${l.map(chip).join('')}</div></div>`).join('');
  const header = `<header><h2>${SECTIONS[p.section]}</h2><span class="sub">${no} / ${total}</span><span class="who">${esc(user.name || user.login)} · github.com/${esc(user.login)}</span></header>`;
  return `<section class="page detail">${header}<article class="dcard" data-key="${esc(p.key)}"><div class="shots">${imgs}</div><div class="dinfo">
    <h3><span class="no">${no}.</span><span>${esc(p.title)}</span></h3>
    <dl>${row(p, 'name', '프로젝트명', 1)}${row(p, 'period', '기간', 1)}${row(p, 'people', '인원', 1)}${solo ? '' : row(p, 'role', '개발 담당', 1)}${row(p, 'env', '언어 및 환경', 1)}${row(p, 'result', '프로젝트 성과')}${row(p, 'note', '비고')}</dl>
    ${stackRows ? `<div class="stackbox"><h4>기술 스택 <small>(버전)</small></h4>${stackRows}</div>` : ''}
    <div class="blocks">${list('역할', p.roleDetail)}${list('핵심 성과', p.achievements)}${list('지표', p.metrics)}${list('기술 근거', p.facts)}${p.ai ? list('AI 활용', p.ai) : ''}</div>
  </div>${edit ? `<button class="pencil" data-edit="${esc(p.key)}" aria-label="수정" title="수정">${PENCIL}</button>` : ''}</article></section>`;
}

function renderPages(d, edit, layout = 'detail') {
  if (!d.projects.length) return '<p class="empty">아직 카드가 없습니다. "업데이트"를 눌러 GitHub에서 불러오세요.</p>';
  if (layout === 'compact') {                                              // 예전 방식: 한 쪽에 두 개
    let no = 0, html = '';
    for (const sec of ['team', 'solo']) {
      const list = d.projects.filter(p => p.section === sec);
      for (let i = 0; i < list.length; i += 2) html += `<section class="page"><header><h2>${SECTIONS[sec]}</h2><span class="sub">최신순</span><span class="who">${esc(d.user.name || d.user.login)} · github.com/${esc(d.user.login)}</span></header>
        <div class="cards">${list.slice(i, i + 2).map(p => card(p, ++no, edit)).join('')}</div></section>`;
    }
    return html;
  }
  // 상세: 요약 2쪽 + 프로젝트마다 한 쪽. 번호는 요약과 같다(팀 먼저, 개인 다음).
  const ordered = ['team', 'solo'].flatMap(sec => d.projects.filter(p => p.section === sec));
  return summaryPages({ ...d, projects: ordered }) + ordered.map((p, i) => detailCard(p, i + 1, ordered.length, d.user, edit)).join('');
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
