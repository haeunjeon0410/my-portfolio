const $ = (s) => document.querySelector(s);
// 서버가 거절(400/413/500 등)하면 그 이유를 그대로 오류로 던진다. (조용히 성공한 것처럼 넘어가지 않는다)
async function parse(res) { let j = {}; try { j = await res.json(); } catch { /* 본문 없음 */ } if (!res.ok) throw new Error(j.message || `요청이 실패했습니다 (${res.status})`); return j; }
const post = async (url, body) => parse(await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) }));
const get = async (url) => parse(await fetch(url));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let DATA = null, BUSY = false, AI = false;

const FIELDS = [['title', '설명 (제목)'], ['name', '프로젝트명'], ['period', '기간'], ['people', '인원'], ['env', '언어 및 환경'], ['role', '개발 담당'], ['result', '프로젝트 성과'], ['note', '비고']];

function setBusy(b, text) { BUSY = b; $('#make').disabled = b; $('#download').disabled = b; if (text !== undefined) $('#status').textContent = text; }
async function load() {
  DATA = await get('/api/projects'); get('/api/ai').then(r => { AI = r.available; }).catch(() => {});
  $('#stage').innerHTML = renderPages(DATA, true);
  layoutShots($('#stage'));
  if (!BUSY) $('#status').textContent = DATA.collectedAt ? `마지막 불러오기 ${new Date(DATA.collectedAt).toLocaleString('ko-KR')} · 프로젝트 ${DATA.projects.length}개` : '';
}

// ---------- 새 저장소: 한 번만 묻는다 (체크한 것은 넣고, 체크하지 않은 것은 빼고 다시 묻지 않음) ----------
function askNew(list) {
  return new Promise((done) => {
    const dlg = $('#confirm');
    $('#newList').innerHTML = list.map((c, i) => `<li><label><input type="checkbox" data-i="${i}" ${c.recommend ? 'checked' : ''}>
      <span class="thumb">${c.images[0] ? `<img src="${esc(c.images[0])}" alt="">` : ''}</span>
      <span class="txt"><b>${esc(c.repo)}</b><small>${c.private ? '비공개' : '공개'} · ${c.recommend ? '완성으로 보임' : '미완성으로 보임'}${c.warnings.length ? ' · 주의: ' + esc(c.warnings.join(', ')) : ''}</small></span></label></li>`).join('');
    dlg.addEventListener('close', async () => {
      // "확인"을 눌렀을 때만 결정한다. Esc 나 바깥 클릭으로 닫으면 아무것도 확정하지 않는다(다음 업데이트 때 다시 묻는다).
      if (dlg.returnValue === 'ok') for (const [i, c] of list.entries()) await post(dlg.querySelector(`input[data-i="${i}"]`).checked ? '/api/include' : '/api/hide', { key: c.key });
      done();
    }, { once: true });
    dlg.returnValue = '';
    dlg.showModal();
  });
}

async function make() {
  setBusy(true, 'GitHub에서 불러오는 중…');
  try {
    const r = await post('/api/collect'); if (!r.ok && r.message) throw new Error(r.message);
    for (;;) {
      const s = await get('/api/status');
      if (s.log.length) $('#status').textContent = 'GitHub에서 불러오는 중… ' + s.log[s.log.length - 1].trim();
      if (!s.running) { if (s.error) throw new Error(s.error); break; }
      await sleep(1200);
    }
    const s2 = await get('/api/status'), failedNote = (s2.log.find(l => l.startsWith('수집 완료')) || '').match(/확인 실패 (\d+)개/);
    const d = await get('/api/projects');
    if (d.pending.length) { $('#status').textContent = '새로 생긴 저장소를 확인해 주세요.'; await askNew(d.pending); }
    setBusy(false); await load();
    $('#status').textContent = failedNote ? `일부 저장소 ${failedNote[1]}개를 확인하지 못했습니다. 잠시 뒤 다시 업데이트해 보세요.` : `준비되었습니다. 연필 아이콘으로 고친 뒤 다운로드하세요. (프로젝트 ${DATA.projects.length}개)`;
  } catch (e) { setBusy(false, '실패했습니다: ' + e.message); }
}

async function download() {
  setBusy(true, 'PDF 만드는 중…');
  try {
    const m = await post('/api/make'); if (!m.ok) throw new Error(m.message);
    const a = document.createElement('a'); a.href = '/api/download'; a.download = '포트폴리오.pdf'; document.body.appendChild(a); a.click(); a.remove();
    setBusy(false, `PDF를 내려받았습니다. (${m.cards}개 · ${m.pages}쪽)`);
  } catch (e) { setBusy(false, 'PDF를 만들지 못했습니다: ' + e.message); }
}

// ---------- 카드 수정 (연필) ----------
// 입력칸은 글 길이에 맞춰 알아서 늘어난다. (사용자가 크기를 조절하지 않는다)
const grow = (t) => { t.style.height = 'auto'; t.style.height = t.scrollHeight + 2 + 'px'; };
document.addEventListener('input', (e) => { if (e.target.matches('#edit textarea')) grow(e.target); });
let SEL = [];
function paintPick() {
  document.querySelectorAll('#edit .th').forEach(b => { const i = SEL.indexOf(b.dataset.u); b.classList.toggle('on', i >= 0); b.querySelector('i').textContent = i >= 0 ? i + 1 : ''; });
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('#edit .th'); if (!b) return;
  const i = SEL.indexOf(b.dataset.u);
  if (i >= 0) SEL.splice(i, 1); else if (SEL.length < 3) SEL.push(b.dataset.u); else return;
  paintPick();
});
function openEdit(key) {
  const p = DATA.projects.find(x => x.key === key); if (!p) return;
  const dlg = $('#edit'); dlg.dataset.key = key;
  $('#editTitle').textContent = p.name;
  $('#editFields').innerHTML = `<div class="radios"><span>구분</span><div>
    <label><input type="radio" name="sec" value="team" ${p.section === 'team' ? 'checked' : ''}>팀 / 공개 프로젝트</label>
    <label><input type="radio" name="sec" value="solo" ${p.section === 'solo' ? 'checked' : ''}>개인 프로젝트</label></div></div>` + FIELDS.map(([f, label]) => {
    const v = Array.isArray(p[f]) ? p[f].join('\n') : (p[f] || '');
    return `<label><span>${label}</span><textarea data-f="${f}" rows="1">${esc(v)}</textarea>${f === 'title' && AI ? '<button type="button" class="aibtn" data-ai>AI로 쓰기</button>' : ''}</label>`;
  }).join('');
  // 스크린샷 고르기: 누른 순서대로 최대 3장
  SEL = [...p.images];
  $('#editFields').insertAdjacentHTML('beforeend', `<div class="pick"><span>스크린샷</span><div>
    <div class="thumbs">${(p.candidates || []).map(u => `<button type="button" class="th" data-u="${esc(u)}"><img src="${esc(u)}" alt=""><i></i></button>`).join('') || '<em>고를 사진이 없습니다.</em>'}</div>
    <p class="pickhint">눌러서 고릅니다. 최대 3장이고, 누른 순서대로 카드에 들어갑니다.</p></div></div>`);
  paintPick();
  dlg.showModal();
  dlg.querySelectorAll('textarea').forEach(grow);       // 열자마자 내용 길이에 맞춘다
}
$('#editForm').addEventListener('submit', async (e) => {
  if (e.submitter && e.submitter.value !== 'save') return;
  const dlg = $('#edit'), key = dlg.dataset.key, p = DATA.projects.find(x => x.key === key), patch = {};
  dlg.querySelectorAll('textarea').forEach(t => {
    const f = t.dataset.f, now = t.value.trim(), was = (Array.isArray(p[f]) ? p[f].join('\n') : (p[f] || '')).trim();
    if (now === was) return;
    patch[f] = now === '' ? null : (f === 'result' && now.includes('\n') ? now.split('\n').map(s => s.trim()).filter(Boolean) : now);
  });
  const sec = dlg.querySelector('input[name=sec]:checked'); if (sec && sec.value !== p.section) patch.section = sec.value;
  if (JSON.stringify(SEL) !== JSON.stringify(p.images)) patch.images = SEL.length ? SEL : null;
  if (Object.keys(patch).length) { await post('/api/patch', { key, patch }); await load(); }
});

document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-ai]'); if (!b) return;
  const ta = b.parentElement.querySelector('textarea'), was = b.textContent; b.disabled = true; b.textContent = '쓰는 중…';
  try { const r = await post('/api/retitle', { key: $('#edit').dataset.key }); ta.value = r.title; grow(ta); b.textContent = '다시 쓰기'; }
  catch (err) { b.textContent = was; alert(err.message); }
  b.disabled = false;
});
document.addEventListener('click', (e) => { const b = e.target.closest('[data-edit]'); if (b) openEdit(b.dataset.edit); });
$('#make').onclick = make;
$('#download').onclick = download;
load();
