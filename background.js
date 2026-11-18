// Zarpa Radar · service worker: atalho de teclado e mensagens do popup.
const MAPS = /^https:\/\/(www\.google\.com(\.br)?\/maps|maps\.google\.com\/)/;

async function openOnMaps(tab, type) {
  if (tab && tab.id != null && MAPS.test(tab.url || '')) {
    try { await chrome.tabs.sendMessage(tab.id, { type }); return 'ok'; }
    catch (e) { await chrome.tabs.reload(tab.id); return 'reloaded'; } /* aba aberta antes de instalar: recarrega para o Radar entrar */
  }
  await chrome.storage.local.set({ zr_open: true });
  await chrome.tabs.create({ url: 'https://www.google.com/maps?hl=pt-BR' });
  return 'created';
}

chrome.commands.onCommand.addListener(async (cmd) => {
  if (cmd !== 'toggle-radar') return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  openOnMaps(tab, 'zr-toggle');
});

chrome.runtime.onMessage.addListener((m, _s, reply) => {
  if (m && m.type === 'zr-popup-open') {
    chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => openOnMaps(tab, 'zr-open')).then(reply);
    return true;
  }
});

chrome.runtime.onInstalled.addListener((d) => {
  if (d.reason === 'install') { chrome.storage.local.set({ zr_open: true }); chrome.tabs.create({ url: 'https://www.google.com/maps?hl=pt-BR' }); }
});
