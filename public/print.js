// PDF 로 찍힐 페이지. (서버가 Chrome 으로 /print.html 을 PDF 로 저장한다)
(async () => {
  const d = await (await fetch('/api/projects')).json();
  document.getElementById('stage').innerHTML = renderPages(d, false);
  await layoutShots();
  document.title = 'ready';
})();
