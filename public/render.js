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
function renderPages(d, edit) {
  let no = 0, html = '';
  for (const sec of ['team', 'solo']) {
    const list = d.projects.filter(p => p.section === sec);
    for (let i = 0; i < list.length; i += 2) {
      html += `<section class="page"><header><h2>${SECTIONS[sec]}</h2><span class="sub">최신순</span><span class="who">${esc(d.user.name || d.user.login)} · github.com/${esc(d.user.login)}</span></header>
        <div class="cards">${list.slice(i, i + 2).map(p => card(p, ++no, edit)).join('')}</div></section>`;
    }
  }
  return html || '<p class="empty">아직 카드가 없습니다. "업데이트"를 눌러 GitHub에서 불러오세요.</p>';
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
