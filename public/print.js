// PDF 로 찍힐 페이지. (서버가 Chrome 으로 /print.html 을 PDF 로 저장한다)
// 주소에 ?keys=a/b,c/d 가 있으면 그 카드만 담는다. (지원 분야별로 골라 내려받기)
(async () => {
  const d = await (await fetch('/api/projects')).json();
  const keys = new URLSearchParams(location.search).get('keys');
  if (keys) { const want = new Set(keys.split(',').map(k => k.toLowerCase())); d.projects = d.projects.filter(p => want.has(p.key.toLowerCase())); }
  document.getElementById('stage').innerHTML = renderPages(d, false);
  await layoutShots();
  await document.fonts.load('16px Pretendard'); await document.fonts.load('700 16px Pretendard'); await document.fonts.ready;     // 글꼴까지 준비된 뒤에 찍는다
  document.title = 'ready';
})();
