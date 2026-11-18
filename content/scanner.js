// Zarpa Radar · leitura da página do Google Maps.
// Só lê o que o próprio Maps mostra na tela: a lista de resultados e a ficha de cada lugar.
// Nada de pedidos escondidos a servidores: é como alguém rolando e clicando, só que sem cansar.
(() => {
  const C = globalThis.ZR.core;
  const { clean } = C;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const jitter = (a, b) => sleep(a + Math.random() * (b - a));

  const feedEl = () => document.querySelector('div[role="feed"]');
  const cardLinks = () => [...document.querySelectorAll('div[role="feed"] a.hfpxzc, div[role="feed"] a[href*="/maps/place/"][aria-label]')]
    .filter((a, i, arr) => arr.indexOf(a) === i && a.getAttribute('aria-label'));
  const endOfList = () => { const f = feedEl(); return !!f && (!!f.querySelector('span.HlvSq') || /final da lista|end of the list|fin de la lista/i.test(f.innerText.slice(-400))); };
  const CLOSED_RX = /fechado permanentemente|permanently closed|cerrado permanentemente/i;
  const TEMP_RX = /fechado temporariamente|temporarily closed|cerrado temporalmente/i;

  /** O que a busca abriu: lista, um lugar só, nenhum resultado, ou ainda carregando. */
  function pageState() {
    if (cardLinks().length) return 'list';
    if (feedEl() && endOfList()) return 'empty';
    const main = placeMain();
    if (main) return 'place';
    const txt = (document.querySelector('div[role="main"]') || document.body).innerText || '';
    if (/não (foi possível|encontramos)|nenhum resultado|can.t find|no results/i.test(txt)) return 'empty';
    return 'loading';
  }
  async function waitResults(ms = 20000) {
    const t = Date.now();
    while (Date.now() - t < ms) { const s = pageState(); if (s !== 'loading') return s; await sleep(250); }
    return 'timeout';
  }

  /* ---------- cartão da lista ---------- */
  function readCard(a) {
    const card = a.closest('div[role="article"]') || a.parentElement;
    const nome = clean(a.getAttribute('aria-label'));
    const href = a.href;
    const st = C.parseStars((card.querySelector('span[role="img"][aria-label]') || {}).getAttribute?.('aria-label') || '');
    const lines = (card.innerText || '').split('\n').map(clean).filter(Boolean).filter((l) => l !== nome);
    let categoria = '', endereco = '';
    const info = lines.find((l) => l.includes('·') && !/^(aberto|fechado|abre|fecha|open|closed|24 horas)/i.test(l));
    if (info) {
      const parts = info.split('·').map(clean);
      categoria = parts[0] && !/^\d[.,]\d/.test(parts[0]) ? parts[0] : '';
      const rest = parts.slice(1).filter((p) => p && !/^[$€£]+$|^R\$/.test(p) && !/^\d+[.,]?\d*\s*km$/i.test(p));
      endereco = rest.length ? rest[rest.length - 1] : '';
    }
    let telefone = '';
    for (const l of lines) { if (l === info || /^\d[.,]\d\s*\(/.test(l)) continue; const p = C.findPhone(l); if (p) { telefone = p; break; } }
    let site = '';
    for (const x of card.querySelectorAll('a[href]')) {
      if (x === a || /(^|\.)google\.[a-z.]+$/i.test(x.hostname)) continue; /* ficha, anúncio (aclk) e afins */
      const lab = (x.getAttribute('aria-label') || '') + ' ' + (x.getAttribute('data-value') || '');
      const u = C.unwrapUrl(x.getAttribute('href'));
      if (/site|website/i.test(lab)) { site = u; break; }
      if (!site) site = u; /* link de agenda (Trinks, Booksy…) também conta: mostra que não tem site próprio */
    }
    const all = lines.join(' ');
    return {
      id: C.placeId(href) || nome.toLowerCase(), nome, categoria, telefone, site, endereco,
      nota: st.nota, avaliacoes: st.avaliacoes, maps: C.shortMaps(href, nome), coords: C.coordsFrom(href),
      fechado: CLOSED_RX.test(all), temporario: TEMP_RX.test(all), anuncio: /^(patrocinado|sponsored|anúncio)$/im.test(card.innerText || ''), ficha: false
    };
  }

  /* ---------- ficha do lugar ---------- */
  function placeMain(name) {
    const mains = [...document.querySelectorAll('div[role="main"]')];
    const ok = (m) => m.querySelector('[data-item-id="address"], [data-item-id^="phone"], a[data-item-id="authority"], button[jsaction*="category"]');
    if (name) {
      const n = clean(name).toLowerCase();
      return mains.find((m) => (clean(m.getAttribute('aria-label')).toLowerCase() === n || clean((m.querySelector('h1') || {}).textContent).toLowerCase() === n) && ok(m)) || null;
    }
    return mains.find((m) => m.querySelector('h1') && ok(m)) || null;
  }
  function readDetail(main, base) {
    const q = (s) => main.querySelector(s);
    const r = Object.assign({}, base || {});
    r.nome = r.nome || clean(main.getAttribute('aria-label')) || clean((q('h1') || {}).textContent);
    const cat = clean((q('button[jsaction*="category"]') || {}).textContent);
    if (cat) r.categoria = cat;
    const addr = q('button[data-item-id="address"]');
    if (addr) r.endereco = clean((addr.getAttribute('aria-label') || addr.textContent).replace(/^[^:]{0,24}:\s*/, ''));
    const tel = q('button[data-item-id^="phone:tel:"], a[data-item-id^="phone:tel:"]');
    if (tel) { const raw = (tel.getAttribute('data-item-id') || '').replace('phone:tel:', ''); r.telefone = C.fmtTel(raw || C.findPhone(tel.getAttribute('aria-label') || tel.textContent)); }
    else r.telefone = r.telefone ? C.fmtTel(r.telefone) : '';
    const web = q('a[data-item-id="authority"]');
    r.site = web ? C.unwrapUrl(web.getAttribute('href')) : (r.site && C.siteKind(r.site) === 'booking' ? r.site : '');
    const rb = q('div.F7nice');
    if (rb) { const t = rb.textContent || ''; const m1 = /(\d[.,]\d)/.exec(t); if (m1) r.nota = C.rate(m1[1]); const m2 = /\(([\d.,]+)\)/.exec(t); if (m2) r.avaliacoes = Math.round(C.num(m2[1].replace(/[.,](?=\d{3}\b)/g, ''))); }
    const txt = main.innerText || '';
    r.fechado = CLOSED_RX.test(txt); r.temporario = TEMP_RX.test(txt);
    r.semDono = /reivindicar (esta|este) (empresa|neg[oó]cio)|claim this business|reclamar (esta|este) (empresa|negocio)/i.test(txt);
    r.instagram = C.instaFrom(r.site);
    r.ficha = true;
    if (!r.maps) r.maps = C.shortMaps(location.href, r.nome);
    return r;
  }

  const backBtn = () => document.querySelector('button[jsaction^="omnibox.back"], button[jsaction*="pane.place.backToList"], button[aria-label="Voltar"], button[aria-label="Back"]');
  async function waitFor(fn, ms) { const t = Date.now(); while (Date.now() - t < ms) { const v = fn(); if (v) return v; await sleep(150); } return null; }

  /** Abre a ficha do cartão, lê, e volta para a lista. Devolve a ficha lida (ou o cartão, se a ficha não abrir). */
  async function openAndRead(base) {
    const find = () => cardLinks().find((x) => (C.placeId(x.href) || clean(x.getAttribute('aria-label')).toLowerCase()) === base.id);
    const a = find();
    if (!a) return base;
    a.scrollIntoView({ block: 'center' });
    a.click();
    const main = await waitFor(() => placeMain(base.nome), 9000);
    let r = base;
    if (main) { await sleep(250); r = readDetail(placeMain(base.nome) || main, base); }
    /* em janela estreita a ficha toma o lugar da lista: voltar */
    if (!cardLinks().length) {
      const b = backBtn(); if (b) b.click(); else history.back();
      await waitFor(() => cardLinks().length > 0, 9000);
    }
    return r;
  }

  /** Rola a lista até aparecerem `want` cartões novos ou a lista acabar. */
  async function loadMore(seen, want) {
    const f = feedEl(); if (!f) return false;
    let last = cardLinks().length, still = 0;
    while (still < 7) {
      const fresh = cardLinks().filter((a) => !seen.has(C.placeId(a.href) || clean(a.getAttribute('aria-label')).toLowerCase())).length;
      if (fresh >= want || endOfList()) return fresh > 0;
      f.scrollTop = f.scrollHeight;
      await sleep(900);
      const n = cardLinks().length;
      if (n === last) still++; else { still = 0; last = n; }
    }
    return cardLinks().some((a) => !seen.has(C.placeId(a.href) || clean(a.getAttribute('aria-label')).toLowerCase()));
  }

  globalThis.ZR.scan = { sleep, jitter, feedEl, cardLinks, endOfList, pageState, waitResults, readCard, placeMain, readDetail, openAndRead, loadMore };
})();
