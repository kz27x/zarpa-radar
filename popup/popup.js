// Zarpa Radar · popup do ícone da extensão.
(() => {
  const C = globalThis.ZR.core;
  const $ = (id) => document.getElementById(id);
  $('by').href = C.LINKS.site; $('ig').href = C.LINKS.instagram; $('gh').href = C.LINKS.github;
  $('pixKey').textContent = C.PIX.key;

  $('open').addEventListener('click', async () => {
    $('open').disabled = true;
    await chrome.runtime.sendMessage({ type: 'zr-popup-open' });
    window.close();
  });
  const show = (donate) => { $('home').hidden = donate; $('donate').hidden = !donate; };
  $('heart').addEventListener('click', () => show($('donate').hidden));
  $('back').addEventListener('click', () => show(false));
  $('copyPix').addEventListener('click', async () => {
    await navigator.clipboard.writeText(C.PIX.payload);
    $('copyPix').textContent = 'Copiado! Cole no app do banco';
    setTimeout(() => ($('copyPix').textContent = 'Copiar Pix copia e cola'), 1800);
  });

  chrome.storage.local.get('zr_job', ({ zr_job: j }) => {
    if (!j || !j.results || !j.results.length) return;
    const box = $('last');
    const semSite = j.results.filter((r) => C.siteKind(r.site) !== 'site').length;
    box.append(Object.assign(document.createElement('span'), { className: 'label', textContent: j.running ? 'Varrendo agora' : 'Última varredura' }),
      Object.assign(document.createElement('strong'), { textContent: j.results.length + ' × ' + j.q + (j.where ? ' em ' + j.where : '') }),
      Object.assign(document.createElement('small'), { textContent: semSite + ' sem site próprio · abra o Maps para ver e baixar' }));
    box.hidden = false;
  });
})();
