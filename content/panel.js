// Zarpa Radar · painel dentro do Google Maps e o "motor" da varredura.
// A varredura sobrevive à troca de página: o estado fica em chrome.storage.local e
// continua sozinho quando o Maps carrega a próxima busca.
(() => {
  if (window.__zarpaRadar) return;
  window.__zarpaRadar = true;
  const C = globalThis.ZR.core, S = globalThis.ZR.scan;
  const KEY = { job: 'zr_job', prefs: 'zr_prefs', open: 'zr_open' };
  const QTY = [20, 50, 100, 200, 500];
  const store = {
    get: (k) => new Promise((r) => { try { chrome.storage.local.get(k, (o) => r(o && o[k])); } catch (e) { r(undefined); } }),
    set: (k, v) => new Promise((r) => { try { chrome.storage.local.set({ [k]: v }, () => r()); } catch (e) { r(); } })
  };

  let job = null;
  let prefs = { q: '', where: '', target: 50, detail: true, intent: null, crit: { site: 'any', contato: 'any', notaMin: 0 }, data: C.ALL_DATA.slice() };
  const ui = { open: false, view: 'search', filters: { semSite: false, whats: false, nota4: false, quente: false }, sort: 'score', text: '', shown: 120 };

  /* ---------- helpers de DOM ---------- */
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'text') el.textContent = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of kids.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
    return el;
  }
  const ICON = {
    radar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9" opacity=".35"/><circle cx="12" cy="12" r="5" opacity=".6"/><path d="M12 12 19 5"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    heart: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg>',
    wa: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.8-1.4.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a.9.9 0 0 0-.7.3 2.8 2.8 0 0 0-.9 2.1 4.9 4.9 0 0 0 1 2.6 11.2 11.2 0 0 0 4.3 3.8c1.6.7 2.2.7 3 .6a2.6 2.6 0 0 0 1.7-1.2 2.1 2.1 0 0 0 .1-1.2c0-.1-.2-.2-.5-.3z"/></svg>',
    pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/></svg>',
    gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2.2"/><circle cx="10" cy="17" r="2.2"/></svg>',
    copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/></svg>',
    ig: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.2" cy="6.8" r="1" fill="currentColor" stroke="none"/></svg>',
    gh: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 0 0-3.2 19.5c.5.1.7-.2.7-.5v-1.7c-2.8.6-3.4-1.3-3.4-1.3-.4-1.2-1.1-1.5-1.1-1.5-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 .9 1.6 2.4 1.1 3 .9.1-.7.4-1.1.6-1.4-2.2-.3-4.6-1.1-4.6-5a3.9 3.9 0 0 1 1-2.7 3.6 3.6 0 0 1 .1-2.7s.8-.3 2.8 1a9.6 9.6 0 0 1 5 0c1.9-1.3 2.8-1 2.8-1a3.6 3.6 0 0 1 .1 2.7 3.9 3.9 0 0 1 1 2.7c0 3.9-2.4 4.7-4.6 5 .4.3.7.9.7 1.9V21c0 .3.2.6.7.5A10 10 0 0 0 12 2z"/></svg>'
  };
  const icon = (n, cls) => h('span', { class: 'ic ' + (cls || ''), 'aria-hidden': 'true', html: ICON[n] });

  /* ---------- montagem ---------- */
  const host = document.createElement('zarpa-radar');
  host.style.cssText = 'all:initial;position:fixed;z-index:2147483000;top:0;right:0;width:0;height:0;';
  const root = host.attachShadow({ mode: 'open' });
  /* o Maps escuta o teclado e a roda do mouse na página inteira: o que acontece no painel fica no painel */
  for (const ev of ['keydown', 'keyup', 'keypress', 'wheel', 'mousedown', 'dblclick', 'contextmenu']) host.addEventListener(ev, (e) => e.stopPropagation());
  root.append(h('style', { text: CSS() }));

  const badge = h('b', { class: 'badge', hidden: true });
  const launcher = h('button', { class: 'launcher', type: 'button', title: 'Zarpa Radar (Alt+Shift+R)', onclick: () => toggle() }, icon('radar', 'sweep'), h('span', { text: 'Radar' }), badge);
  const panel = h('aside', { class: 'panel', 'aria-label': 'Zarpa Radar', hidden: true });
  const toastEl = h('div', { class: 'toast', role: 'status', hidden: true });
  root.append(launcher, panel, toastEl);

  function mount() { if (!host.isConnected) (document.body || document.documentElement).append(host); }

  /* ---------- views ---------- */
  function header() {
    return h('header', { class: 'top' },
      h('span', { class: 'mark' }, icon('radar', job && job.running ? 'sweep on' : 'sweep')),
      h('div', { class: 'brand' }, h('strong', { text: 'Zarpa Radar' }), h('span', { text: 'Leads do Google Maps, na hora' })),
      prefs.intent ? h('button', { class: 'iconbtn' + (ui.view === 'prefs' ? ' on' : ''), type: 'button', title: 'O que procurar e quais dados baixar', 'aria-label': 'Preferências', onclick: () => { if (job && job.running) return toast('Pare a varredura para mudar as preferências.'); ui.view = ui.view === 'prefs' ? 'search' : 'prefs'; render(); } }, icon('gear')) : null,
      h('button', { class: 'iconbtn heart', type: 'button', title: 'Apoiar o projeto', 'aria-label': 'Apoiar o projeto', onclick: () => openDonate() }, icon('heart')),
      h('button', { class: 'iconbtn', type: 'button', title: 'Fechar', 'aria-label': 'Fechar', onclick: () => toggle(false) }, icon('close')));
  }

  function footer() {
    return h('footer', { class: 'foot' },
      h('a', { class: 'by', href: C.LINKS.site, target: '_blank', rel: 'noopener' }, 'Feito pela ', h('b', { text: 'Zarpa' })),
      h('span', { class: 'sep' }),
      h('a', { class: 'iconlink', href: C.LINKS.instagram, target: '_blank', rel: 'noopener', title: '@zarpa.dev no Instagram', 'aria-label': 'Instagram da Zarpa' }, icon('ig')),
      h('a', { class: 'iconlink', href: C.LINKS.github, target: '_blank', rel: 'noopener', title: 'Código aberto no GitHub', 'aria-label': 'GitHub' }, icon('gh')),
      h('button', { class: 'linkbtn', type: 'button', onclick: () => openDonate() }, icon('heart'), 'Apoiar'));
  }

  /* ---------- primeira vez: para que você vai usar? ---------- */
  function applyIntent(key) {
    const it = C.INTENTS[key];
    prefs.intent = key;
    if (it.crit) prefs.crit = Object.assign({}, it.crit);
    if (it.data) prefs.data = it.data.slice();
    if (it.sort) ui.sort = it.sort;
    savePrefs();
  }
  function intentCards(onPick) {
    return h('div', { class: 'intents', role: 'radiogroup', 'aria-label': 'Para que você vai usar' }, Object.entries(C.INTENTS).map(([k, it]) =>
      h('button', { type: 'button', role: 'radio', class: 'intent', 'aria-checked': String(prefs.intent === k), onclick: () => onPick(k) },
        h('strong', { text: it.t }), h('span', { text: it.d }))));
  }
  function welcomeView() {
    return h('section', { class: 'welcome' },
      h('h2', { text: 'Para que você vai usar o Radar?' }),
      h('p', { class: 'hint', text: 'Assim ele já busca só o que serve para você e monta a planilha com os dados certos. Dá para mudar depois na engrenagem.' }),
      intentCards((k) => { applyIntent(k); ui.view = k === 'custom' ? 'prefs' : 'search'; render(); }));
  }
  function prefsView() {
    const c = prefs.crit;
    const seg = (key, opts) => h('div', { class: 'seg s' + opts.length, role: 'radiogroup' }, opts.map(([v, l]) => h('button', { type: 'button', role: 'radio', 'aria-checked': String(c[key] === v), onclick: () => {
      c[key] = v; prefs.intent = 'custom'; savePrefs(); render(); } }, l)));
    const data = h('div', { class: 'checks' }, C.DATA.map(([k, l]) => h('label', { class: 'check' },
      h('input', { type: 'checkbox', checked: prefs.data.includes(k) || null, onchange: (e) => {
        prefs.data = e.target.checked ? prefs.data.concat(k) : prefs.data.filter((x) => x !== k); savePrefs(); } }), h('span', { text: l }))));
    return h('section', { class: 'prefs' },
      h('div', { class: 'label', text: 'Para que você vai usar' }),
      intentCards((k) => { applyIntent(k); render(); }),
      h('div', { class: 'label', text: 'Quem entra na lista' }),
      h('div', { class: 'field' }, h('span', { text: 'Site' }), seg('site', [['any', 'Tanto faz'], ['sem', 'Sem site próprio'], ['com', 'Com site']])),
      h('p', { class: 'hint', text: '"Sem site próprio" inclui quem só tem Instagram, rede social ou app de agenda.' }),
      h('div', { class: 'field' }, h('span', { text: 'Contato' }), seg('contato', [['any', 'Tanto faz'], ['tel', 'Com telefone'], ['whats', 'Com WhatsApp']])),
      h('div', { class: 'field' }, h('span', { text: 'Nota no Google' }), seg('notaMin', [[0, 'Qualquer'], [4, '4 ou mais'], [4.5, '4,5 ou mais']])),
      h('div', { class: 'label', text: 'Dados na planilha' }),
      h('p', { class: 'hint', text: 'O nome sempre vai. Marque o resto que você quer.' }), data,
      h('button', { class: 'btn primary', type: 'button', onclick: () => { ui.view = 'search'; render(); } }, 'Pronto, voltar para a busca'));
  }

  function searchView() {
    const q = h('input', { id: 'zr-q', type: 'text', value: prefs.q, placeholder: 'Ex.: barbearia, dentista, pet shop', autocomplete: 'off', spellcheck: 'false' });
    const where = h('input', { id: 'zr-where', type: 'text', value: prefs.where, placeholder: 'Ex.: Vitória ES, Savassi BH', autocomplete: 'off', spellcheck: 'false' });
    const chips = h('div', { class: 'chips' }, C.NICHOS.map((n) => h('button', { type: 'button', class: 'chip' + (C.deacc(prefs.q) === C.deacc(n) ? ' on' : ''), onclick: (e) => {
      q.value = n; prefs.q = n; savePrefs(); chips.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c === e.currentTarget)); where.focus();
    } }, n)));
    q.addEventListener('input', () => { prefs.q = q.value; savePrefs(); chips.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', C.deacc(c.textContent) === C.deacc(q.value))); });
    where.addEventListener('input', () => { prefs.where = where.value; savePrefs(); });
    const seg = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'Quantidade' }, QTY.map((n) => h('button', { type: 'button', role: 'radio', 'aria-checked': String(prefs.target === n), onclick: (e) => {
      prefs.target = n; savePrefs(); seg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-checked', String(b === e.currentTarget))); updEta();
    } }, String(n))));
    const forced = C.needsDetail(prefs.crit);
    const det = h('input', { type: 'checkbox', role: 'switch', checked: forced || prefs.detail || null, disabled: forced || null });
    const labels = C.critLabels(prefs.crit);
    const crit = h('button', { type: 'button', class: 'critbar', title: 'Mudar o que procurar', onclick: () => { ui.view = 'prefs'; render(); } },
      h('span', { class: 'label', text: (C.INTENTS[prefs.intent] || {}).t || 'Preferências' }),
      h('span', { class: 'pills' }, (labels.length ? labels : ['Todos os negócios']).map((l) => h('i', { text: l }))),
      h('em', { text: 'Mudar' }));
    const eta = h('p', { class: 'hint' });
    function updEta() {
      const slow = forced || prefs.detail;
      const s = (slow ? prefs.target * 1.8 : prefs.target * 0.12 + 6) * (C.critLabels(prefs.crit).length ? 1.7 : 1);
      eta.textContent = 'Tempo estimado: ' + (s < 60 ? 'menos de 1 minuto' : 'uns ' + Math.round(s / 60) + ' min') + '. Deixe esta aba aberta; dá para parar quando quiser.';
    }
    det.addEventListener('change', () => { prefs.detail = det.checked; savePrefs(); updEta(); });
    updEta();
    const go = h('button', { class: 'btn primary big', type: 'submit' }, icon('radar'), 'Começar varredura');
    const form = h('form', { class: 'search', onsubmit: (e) => { e.preventDefault(); start(q.value, where.value); } },
      crit,
      h('label', { class: 'step', for: 'zr-q' }, h('i', { text: '1' }), 'Que tipo de negócio?'), q, chips,
      h('label', { class: 'step', for: 'zr-where' }, h('i', { text: '2' }), 'Onde?', h('small', { text: 'vazio = área que está no mapa' })), where,
      h('div', { class: 'step' }, h('i', { text: '3' }), 'Quantos negócios?'), seg,
      h('label', { class: 'switch' }, h('span', {}, h('span', { text: 'Ficha completa' }), h('small', { text: forced ? 'Ligada porque você filtra por site ou telefone: só a ficha mostra isso com certeza.' : 'Abre cada negócio para pegar telefone, site e endereço exatos.' })), det, h('i', { 'aria-hidden': 'true' })),
      h('div', { class: 'gobar' }, go, eta));
    setTimeout(() => (prefs.q ? where : q).focus(), 30);
    return form;
  }

  function runView() {
    const n = job.results.length, pct = Math.min(100, Math.round((n / job.target) * 100));
    return h('section', { class: 'run' },
      h('div', { class: 'runtop' },
        h('div', {}, h('span', { class: 'label', text: 'Varrendo' }), h('strong', { class: 'runq', text: job.q + (job.where ? ' · ' + job.where : '') }), C.critLabels(job.crit).length ? h('span', { class: 'hint', text: C.critLabels(job.crit).join(' · ') }) : null),
        h('div', { class: 'count' }, h('b', { text: String(n) }), h('span', { text: 'de ' + job.target }))),
      h('div', { class: 'bar' }, h('i', { style: 'width:' + pct + '%' })),
      job.checked ? h('p', { class: 'hint', text: job.checked + ' conferidos · ' + n + ' com o que você pediu' }) : null,
      h('p', { class: 'hint live', text: job.status || 'Carregando a busca no Maps…' }),
      h('button', { class: 'btn', type: 'button', onclick: () => stop('parado') }, 'Parar e ver o que já achou'));
  }

  function donateView() {
    const copyBtn = (label, value, primary) => h('button', { class: 'btn' + (primary ? ' primary' : ''), type: 'button', onclick: (e) => copy(value, e.currentTarget, label) }, label);
    return h('section', { class: 'donate' },
      h('img', { class: 'qr', src: chrome.runtime.getURL('icons/pix-qr.png'), alt: 'QR Code Pix para doação', width: '200', height: '200' }),
      h('p', { class: 'lead', text: 'O Zarpa Radar é grátis e de código aberto. Se ele te ajudou a fechar cliente, pague um café pro dev ☕ (valor livre, no Pix).' }),
      h('div', { class: 'pixkey' }, h('span', { class: 'label', text: 'Chave Pix' }), h('code', { text: C.PIX.key })),
      copyBtn('Copiar Pix copia e cola', C.PIX.payload, true),
      copyBtn('Copiar chave Pix', C.PIX.key),
      h('div', { class: 'ad' }, h('strong', { text: 'Precisa de site, sistema ou automação?' }), h('span', { text: 'A Zarpa Dev faz sob medida, do jeito que este Radar foi feito.' }),
        h('a', { class: 'btn ghost', href: C.LINKS.site, target: '_blank', rel: 'noopener' }, 'Conhecer a Zarpa Dev')),
      h('button', { class: 'btn', type: 'button', onclick: () => openDonate(false) }, 'Voltar'));
  }
  function openDonate(on) {
    if (on === false || ui.view === 'donate') ui.view = ui.prev || 'search';
    else { ui.prev = ui.view; ui.view = 'donate'; }
    render();
  }

  /* ---------- resultados ---------- */
  function filtered() {
    const f = ui.filters, t = C.deacc(ui.text);
    let L = (job ? job.results : []).filter((r) => {
      if (f.semSite && C.siteKind(r.site) === 'site') return false;
      if (f.whats && !C.isCel(r.telefone)) return false;
      if (f.nota4 && !(r.nota >= 4)) return false;
      if (f.quente && C.score(r) < 70) return false;
      if (t && !C.deacc([r.nome, r.categoria, r.endereco].join(' ')).includes(t)) return false;
      return true;
    });
    if (ui.sort === 'score' && !selling()) ui.sort = 'aval';
    const by = { score: (a, b) => C.score(b) - C.score(a) || b.avaliacoes - a.avaliacoes, aval: (a, b) => b.avaliacoes - a.avaliacoes, nota: (a, b) => b.nota - a.nota || b.avaliacoes - a.avaliacoes, nome: (a, b) => a.nome.localeCompare(b.nome, 'pt-BR'), ordem: () => 0 }[ui.sort];
    return L.slice().sort(by);
  }

  function row(r) {
    const sc = C.score(r), heat = C.heat(sc), kind = C.siteKind(r.site), cel = C.isCel(r.telefone);
    const addr = C.splitAddress(r.endereco);
    const meta = [r.categoria, r.nota ? '★ ' + String(r.nota).replace('.', ',') + (r.avaliacoes ? ' (' + r.avaliacoes + ')' : '') : 'sem avaliações', addr.bairro || addr.cidade || ''].filter(Boolean).join(' · ');
    const tags = h('div', { class: 'tags' },
      kind === 'site'
        ? h('a', { class: 'tag site', href: r.site, target: '_blank', rel: 'noopener', title: r.site, text: C.prettyUrl(r.site).slice(0, 34) })
        : h('span', { class: 'tag ' + kind, text: C.SITE_LABEL[kind] }),
      r.instagram && kind !== 'insta' ? h('span', { class: 'tag soft', text: r.instagram }) : null,
      r.semDono ? h('span', { class: 'tag soft', title: 'A ficha no Google não foi reivindicada pelo dono', text: 'Ficha sem dono' }) : null,
      r.temporario ? h('span', { class: 'tag warn', text: 'Fechado temporariamente' }) : null,
      r.anuncio ? h('span', { class: 'tag soft', title: 'Apareceu como anúncio patrocinado no Maps: já investe em divulgação', text: 'Anuncia no Google' }) : null,
      !r.ficha && job && job.detail ? h('span', { class: 'tag soft', title: 'Não deu para abrir a ficha; dados vieram da lista', text: 'dados parciais' }) : null);
    const tel = r.telefone
      ? h('div', { class: 'tel' },
          h('button', { class: 'telnum', type: 'button', title: 'Copiar telefone', onclick: (e) => copy(C.fmtTel(r.telefone), e.currentTarget) }, C.fmtTel(r.telefone)),
          cel ? h('a', { class: 'wa', href: C.waLink(r.telefone), target: '_blank', rel: 'noopener', title: 'Abrir no WhatsApp', 'aria-label': 'WhatsApp de ' + r.nome }, icon('wa')) : null)
      : h('div', { class: 'tel none', text: 'sem telefone' });
    return h('li', { class: 'row' },
      selling() ? h('span', { class: 'heat ' + heat, title: 'Oportunidade ' + sc + '/100 (' + heat + ')' }, String(sc))
        : h('span', { class: 'heat star', title: r.avaliacoes ? r.avaliacoes + ' avaliações' : 'Sem avaliações' }, r.nota ? String(r.nota).replace('.', ',') : '–'),
      h('div', { class: 'main' },
        h('a', { class: 'name', href: r.maps, target: '_blank', rel: 'noopener', title: 'Abrir no Google Maps', text: r.nome }),
        h('div', { class: 'meta', text: meta }), tags),
      tel);
  }

  const selling = () => !!job && (job.intent === 'vender' || (job.crit && job.crit.site === 'sem'));
  function resultsView() {
    const all = job.results, L = filtered();
    const semSite = all.filter((r) => C.siteKind(r.site) !== 'site').length, whats = all.filter((r) => C.isCel(r.telefone)).length;
    const fchip = (k, label, n) => h('button', { type: 'button', class: 'fchip', 'aria-pressed': String(!!ui.filters[k]), onclick: () => { ui.filters[k] = !ui.filters[k]; ui.shown = 120; renderResults(); } }, label, n != null ? h('em', { text: String(n) }) : null);
    const sort = h('select', { 'aria-label': 'Ordenar', onchange: (e) => { ui.sort = e.target.value; renderResults(); } },
      [selling() ? ['score', 'Oportunidade'] : null, ['aval', 'Mais avaliados'], ['nota', 'Maior nota'], ['nome', 'Nome A-Z'], ['ordem', 'Ordem do Maps']].filter(Boolean).map(([v, l]) => h('option', { value: v, selected: ui.sort === v || null }, l)));
    const find = h('input', { type: 'search', placeholder: 'Filtrar por nome ou bairro', value: ui.text, oninput: (e) => { ui.text = e.target.value; ui.shown = 120; renderList(); } });
    const list = h('ul', { class: 'list' });
    const more = h('button', { class: 'btn ghost more', type: 'button', onclick: () => { ui.shown += 200; renderList(); } });
    const dl = h('button', { class: 'btn primary', type: 'button', onclick: () => download(filtered()) });
    function renderList() {
      const F = filtered(); list.replaceChildren(...F.slice(0, ui.shown).map(row));
      if (!F.length) list.append(h('li', { class: 'empty', text: all.length ? 'Nenhum negócio com esses filtros.' : 'Nenhum negócio com o que você pediu nesta busca. Tente outra cidade, mais quantidade ou afrouxe as preferências na engrenagem.' }));
      more.hidden = F.length <= ui.shown; more.textContent = 'Mostrar mais ' + Math.min(200, F.length - ui.shown);
      dl.textContent = 'Baixar planilha (' + F.length + ')';
    }
    renderList();
    const ended = !job.running && job.endedAt;
    return h('section', { class: 'results' },
      ended ? h('div', { class: 'summary' },
        h('div', {}, h('strong', { text: all.length + ' negócios' }), h('span', { text: job.q + (job.where ? ' · ' + job.where : '') }),
          h('button', { class: 'btn ghost sm', type: 'button', onclick: () => { ui.view = 'search'; render(true); } }, 'Nova busca')),
        C.critLabels(job.crit).length ? h('div', { class: 'pills' }, C.critLabels(job.crit).map((l) => h('i', { text: l }))) : null,
        h('p', { class: 'hint', text: endNote() })) : null,
      h('div', { class: 'filters' }, job.crit && job.crit.site !== 'any' ? null : fchip('semSite', 'Sem site', semSite), job.crit && job.crit.contato === 'whats' ? null : fchip('whats', 'WhatsApp', whats), fchip('nota4', 'Nota 4+'), selling() ? fchip('quente', 'Quentes') : null),
      h('div', { class: 'tools' }, find, sort),
      list, more,
      ended ? h('div', { class: 'actions' }, dl,
        h('button', { class: 'btn', type: 'button', title: 'Copia em formato de tabela para colar no Google Planilhas ou no Excel', onclick: (e) => copy(C.toTSV(filtered(), job.data), e.currentTarget, 'Copiar tabela') }, 'Copiar tabela')) : null);
  }
  function endNote() {
    const n = job.results.length;
    const why = { meta: 'Chegou na quantidade pedida.', acabou: 'Esses são todos os resultados que o Maps mostrou para essa busca.', parado: 'Você parou a varredura.', erro: 'O Maps não respondeu; tente de novo daqui a pouco.' }[job.reason] || '';
    const skip = (job.rejected ? ' ' + job.rejected + ' conferido(s) não tinham o que você pediu.' : '') + (job.skipped ? ' ' + job.skipped + ' fechado(s) de vez ficaram de fora.' : '');
    return (n < job.target && job.reason === 'acabou' ? 'Achou ' + n + ' de ' + job.target + '. ' : '') + why + skip;
  }
  let renderResults = () => render();

  function render(forceSearch) {
    mount();
    const running = job && job.running;
    badge.hidden = !(job && job.results.length);
    badge.textContent = job ? String(job.results.length) : '';
    launcher.classList.toggle('running', !!running);
    launcher.hidden = ui.open;
    panel.hidden = !ui.open;
    if (!ui.open) return;
    let body;
    if (ui.view === 'donate') body = donateView();
    else if (!prefs.intent && !running) body = welcomeView();
    else if (ui.view === 'prefs' && !running) body = prefsView();
    else if (running) body = h('div', { class: 'stack' }, runView(), job.results.length ? resultsView() : null);
    else if (job && (job.results.length || job.endedAt) && !forceSearch && ui.view !== 'search') body = resultsView();
    else { ui.view = 'search'; body = h('div', { class: 'stack' }, searchView(), job && job.results.length ? h('button', { class: 'btn ghost back', type: 'button', onclick: () => { ui.view = 'results'; render(); } }, 'Ver a última varredura (' + job.results.length + ')') : null); }
    const scroller = panel.querySelector('.body');
    const keep = scroller && ui.view !== 'search' ? scroller.scrollTop : 0;
    panel.replaceChildren(header(), h('div', { class: 'body' }, body), footer());
    if (keep) panel.querySelector('.body').scrollTop = keep;
  }
  /* durante a varredura, só a parte de cima muda: evita "pular" a lista a cada negócio */
  let pend = 0;
  function liveUpdate() {
    if (pend) return;
    pend = requestAnimationFrame(() => { pend = 0; render(); });
  }

  function toggle(on) {
    ui.open = on == null ? !ui.open : on;
    if (ui.open && job && job.endedAt && !job.running && ui.view !== 'donate' && ui.view !== 'prefs') ui.view = 'results';
    store.set(KEY.open, ui.open);
    render();
  }

  /* ---------- ações ---------- */
  function toast(msg, ms) {
    toastEl.textContent = msg; toastEl.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(() => (toastEl.hidden = true), ms || 2600);
  }
  async function copy(text, btn, label) {
    try { await navigator.clipboard.writeText(text); }
    catch (e) { const t = h('textarea', { style: 'position:fixed;opacity:0' }); t.value = text; root.append(t); t.select(); document.execCommand('copy'); t.remove(); }
    if (btn) { const old = label || btn.textContent; btn.textContent = 'Copiado!'; setTimeout(() => { btn.textContent = old; }, 1400); }
  }
  function download(rows) {
    if (!rows.length) return toast('Nenhum negócio para baixar com esses filtros.');
    const name = 'radar-' + C.slug(job.q + ' ' + (job.where || '')) + '-' + new Date().toISOString().slice(0, 10) + '.csv';
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([C.toCSV(rows, job.data)], { type: 'text/csv;charset=utf-8' }));
    a.download = name; root.append(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 800);
    toast('Planilha baixada: abre no Excel e no Google Planilhas.');
  }
  const savePrefs = () => store.set(KEY.prefs, prefs);
  const saveJob = () => store.set(KEY.job, job);

  async function start(q, where) {
    q = C.clean(q); where = C.clean(where);
    if (!q) { toast('Escreva o que você procura (ex.: barbearia).'); return root.getElementById?.('zr-q')?.focus(); }
    if (job && job.running) return;
    if (job && job.results.length && !confirm('Começar uma nova varredura? A lista atual (' + job.results.length + ') será trocada. Baixe a planilha antes, se quiser guardar.')) return;
    prefs.q = q; prefs.where = where; savePrefs();
    const here = C.viewFrom(location.href);
    const first = where ? C.searchUrl(q, where) : C.searchUrl(q, '', here ? { lat: here.lat, lng: here.lng, z: Math.max(13, Math.round(here.z)) } : null);
    const crit = Object.assign({ site: 'any', contato: 'any', notaMin: 0 }, prefs.crit);
    job = { v: 2, id: Date.now().toString(36), q, where, target: prefs.target, detail: !!prefs.detail || C.needsDetail(crit), crit, intent: prefs.intent, data: prefs.data.slice(), checked: 0, rejected: 0, steps: [first], step: 0, grid: false,
      running: true, results: [], skipped: 0, status: 'Abrindo a busca no Maps…', startedAt: new Date().toISOString(), endedAt: null, reason: '' };
    ui.view = 'run'; ui.filters = { semSite: false, whats: false, nota4: false, quente: false }; ui.text = ''; ui.shown = 120;
    await saveJob(); render();
    location.href = first;
  }

  async function stop(reason) {
    if (!job) return;
    job.running = false; job.reason = reason; job.endedAt = new Date().toISOString(); job.status = '';
    await saveJob(); ui.view = 'results'; render();
    if (reason !== 'parado') toast(job.results.length + ' negócios encontrados.', 4000);
  }

  /* ---------- motor ---------- */
  let busy = false;
  async function run() {
    if (busy || !job || !job.running) return;
    busy = true;
    try { await runStep(); } catch (e) { console.warn('[Zarpa Radar]', e); job.status = 'Algo saiu do esperado; tentando continuar…'; }
    busy = false;
  }

  function add(r) {
    r.busca = job.q + (job.where ? ' em ' + job.where : '');
    r.coletadoEm = new Date().toISOString();
    delete r.coords;
    job.results.push(r);
  }

  async function runStep() {
    const label = job.step === 0 ? 'Carregando a busca…' : 'Ampliando a área (' + job.step + ' de ' + (job.steps.length - 1) + ')…';
    job.status = label; liveUpdate();
    const state = await S.waitResults();
    if (!job.running) return;
    const seen = new Set(job.results.map((r) => r.id));
    let endReached = false;

    if (state === 'place') {
      const main = S.placeMain();
      const r = S.readDetail(main, { id: C.placeId(location.href) || C.clean(main.getAttribute('aria-label')).toLowerCase() });
      endReached = true;
      if (!seen.has(r.id)) { job.checked = (job.checked || 0) + 1; if (r.fechado) job.skipped++; else if (!C.matches(r, job.crit)) job.rejected++; else add(r); }
    } else if (state === 'list') {
      while (job.running && job.results.length < job.target) {
        const fresh = S.cardLinks().filter((a) => !seen.has(C.placeId(a.href) || C.clean(a.getAttribute('aria-label')).toLowerCase()));
        if (!fresh.length) {
          job.status = 'Rolando a lista do Maps…'; liveUpdate();
          const more = await S.loadMore(seen, Math.min(20, job.target - job.results.length));
          if (!more) { endReached = S.endOfList(); break; }
          continue;
        }
        for (const a of fresh) {
          if (!job.running || job.results.length >= job.target) break;
          if (!a.isConnected) break; /* a lista foi refeita: pega de novo */
          const base = S.readCard(a);
          if (seen.has(base.id)) continue;
          seen.add(base.id);
          job.checked = (job.checked || 0) + 1;
          if (base.fechado) { job.skipped++; continue; }
          /* a nota já vem certa na lista: não precisa abrir a ficha de quem não passa */
          if (job.crit && job.crit.notaMin && !(base.nota >= job.crit.notaMin)) { job.rejected++; continue; }
          /* site próprio já aparecendo no cartão: quem pediu "sem site" não precisa abrir a ficha */
          if (job.crit && job.crit.site === 'sem' && C.siteKind(base.site) === 'site') { job.rejected++; continue; }
          let r = base;
          if (job.detail) {
            job.status = 'Lendo a ficha: ' + base.nome; liveUpdate();
            r = await S.openAndRead(base);
            await S.jitter(250, 650);
          } else r.telefone = r.telefone ? C.fmtTel(r.telefone) : '';
          if (r.fechado) { job.skipped++; continue; }
          if (!C.matches(r, job.crit)) { job.rejected++; if (job.checked % 5 === 0) { await saveJob(); liveUpdate(); } continue; }
          add(r);
          await saveJob(); liveUpdate();
        }
      }
      if (!endReached) endReached = S.endOfList();
    } else if (state === 'timeout') {
      job.status = 'O Maps demorou para responder.';
    }
    if (!job.running) return;

    if (job.results.length >= job.target) return stop('meta');
    /* a primeira busca bateu no limite do Maps (e não no fim da lista): varre os arredores em grade */
    /* (com 100+ cartões, o fim da lista costuma ser o teto do Maps, não o fim dos negócios) */
    if (!job.grid && job.step === 0 && state === 'list' && (!endReached || S.cardLinks().length >= 100)) {
      const c = C.viewFrom(location.href);
      if (c) {
        const need = (job.target - job.results.length) * (C.critLabels(job.crit).length ? 2.5 : 1);
        const rings = need > 300 ? 4 : need > 150 ? 3 : 2;
        job.steps.push(...C.gridAround(c, rings).map((p) => C.searchUrl(job.q, '', p)));
        job.grid = true;
      }
    }
    if (job.step + 1 < job.steps.length) {
      job.step++; job.status = 'Ampliando a área (' + job.step + ' de ' + (job.steps.length - 1) + ')…';
      await saveJob(); liveUpdate();
      await S.sleep(700);
      if (job.running) location.href = job.steps[job.step];
      return;
    }
    return stop(state === 'timeout' && !job.results.length ? 'erro' : 'acabou');
  }

  /* ---------- início ---------- */
  chrome.runtime.onMessage.addListener((m) => { if (m && m.type === 'zr-toggle') toggle(); if (m && m.type === 'zr-open') toggle(true); });
  chrome.storage.onChanged.addListener((ch, area) => {
    /* outra aba do Maps parou ou trocou a varredura */
    if (area === 'local' && ch[KEY.job] && !busy) { job = ch[KEY.job].newValue || null; liveUpdate(); }
  });

  (async () => {
    const [j, p, o] = await Promise.all([store.get(KEY.job), store.get(KEY.prefs), store.get(KEY.open)]);
    if (p) prefs = Object.assign(prefs, p);
    if (!QTY.includes(prefs.target)) prefs.target = 50;
    if (!prefs.crit) prefs.crit = { site: 'any', contato: 'any', notaMin: 0 };
    if (!Array.isArray(prefs.data)) prefs.data = C.ALL_DATA.slice();
    job = j || null;
    ui.open = !!o || !!(job && job.running);
    if (job && job.endedAt && !job.running) ui.view = 'results';
    if (document.readyState === 'loading') await new Promise((r) => document.addEventListener('DOMContentLoaded', r, { once: true }));
    render();
    if (job && job.running) run();
  })();

  /* ---------- estilo ---------- */
  function CSS() {
    return `
:host { all: initial; }
* { box-sizing: border-box; }
[hidden] { display: none !important; }
.launcher, .panel, .toast { --bg:#0b0d10; --s1:#14171c; --s2:#1d2128; --s3:#262b34; --line:#2a303a; --text:#f2f4f7; --muted:#97a0b0; --acc:#c8f542; --ink:#0b0d10;
  --hot:#ff7a45; --warm:#ffc24a; --cold:#5f6b7d; --r:12px; --ease:cubic-bezier(.2,.8,.2,1);
  font: 13.5px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif; color: var(--text); -webkit-font-smoothing: antialiased; }
button, input, select { font: inherit; color: inherit; }
a { color: inherit; }
:focus-visible { outline: 2px solid var(--acc); outline-offset: 2px; }
.ic { display: inline-grid; place-items: center; width: 16px; height: 16px; flex: none; }
.ic svg { width: 100%; height: 100%; }

.launcher { position: fixed; top: 76px; right: 16px; display: flex; align-items: center; gap: 8px; height: 40px; padding: 0 14px 0 11px; border: 0; border-radius: 99px;
  background: var(--bg); color: var(--text); font-weight: 650; letter-spacing: .01em; cursor: pointer; box-shadow: 0 6px 24px -6px rgba(0,0,0,.45), inset 0 0 0 1px rgba(255,255,255,.06);
  transition: transform .18s var(--ease); }
.launcher:hover { transform: translateY(-1px); }
.launcher .ic { width: 20px; height: 20px; color: var(--acc); }
.launcher .badge { min-width: 22px; height: 20px; padding: 0 6px; border-radius: 99px; background: var(--acc); color: var(--ink); font-size: 11.5px; display: grid; place-items: center; }
.launcher.running .sweep svg path, .mark .sweep.on svg path { transform-origin: 12px 12px; animation: spin 1.6s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.panel { position: fixed; top: 76px; right: 16px; width: 404px; max-width: calc(100vw - 32px); height: min(760px, calc(100vh - 92px)); display: flex; flex-direction: column;
  background: var(--bg); border-radius: 18px; overflow: hidden; box-shadow: 0 24px 60px -20px rgba(0,0,0,.6), inset 0 0 0 1px rgba(255,255,255,.06); animation: in .26s var(--ease); }
@keyframes in { from { opacity: 0; transform: translateY(-6px) scale(.985); } }
.top { display: flex; align-items: center; gap: 10px; padding: 14px 12px 12px 14px; border-bottom: 1px solid var(--line); }
.mark { width: 34px; height: 34px; border-radius: 10px; background: var(--acc); color: var(--ink); display: grid; place-items: center; flex: none; }
.mark .ic { width: 22px; height: 22px; }
.brand { flex: 1; min-width: 0; display: grid; line-height: 1.2; }
.brand strong { font-size: 15px; font-weight: 700; letter-spacing: -.01em; }
.brand span { font-size: 12px; color: var(--muted); }
.iconbtn { width: 34px; height: 34px; border: 0; border-radius: 10px; background: transparent; color: var(--muted); display: grid; place-items: center; cursor: pointer; }
.iconbtn:hover { background: var(--s2); color: var(--text); }
.iconbtn.heart:hover { color: #ff6b8b; }
.body { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; overscroll-behavior: contain; padding: 14px; scrollbar-width: thin; scrollbar-color: var(--s3) transparent; }
.stack, .results, .search, .prefs, .welcome, .run, .donate { grid-template-columns: minmax(0, 1fr); min-width: 0; }
.stack { display: grid; gap: 14px; }

.search { display: grid; gap: 9px; }
.step { display: flex; align-items: center; gap: 8px; font-weight: 650; font-size: 13px; margin-top: 6px; }
.step:first-child { margin-top: 0; }
.step i { font-style: normal; width: 20px; height: 20px; border-radius: 50%; background: var(--s2); color: var(--acc); display: grid; place-items: center; font-size: 11px; font-weight: 750; }
.step small { margin-left: auto; font-weight: 500; color: var(--muted); font-size: 11.5px; }
input[type="text"], input[type="search"], select { width: 100%; height: 42px; padding: 0 13px; border-radius: var(--r); border: 1px solid var(--line); background: var(--s1); outline: none; transition: border-color .15s; }
input::placeholder { color: #6f7889; }
input:focus, select:focus { border-color: var(--acc); }
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.chip { height: 28px; padding: 0 10px; border-radius: 99px; border: 1px solid var(--line); background: transparent; color: var(--muted); cursor: pointer; font-size: 12.5px; }
.chip:hover { color: var(--text); border-color: #3a4250; }
.chip.on { background: var(--acc); border-color: transparent; color: var(--ink); font-weight: 650; }
.seg { display: grid; grid-template-columns: repeat(5, 1fr); padding: 3px; gap: 3px; background: var(--s1); border: 1px solid var(--line); border-radius: var(--r); }
.seg button { height: 34px; border: 0; border-radius: 9px; background: transparent; color: var(--muted); font-weight: 650; cursor: pointer; font-variant-numeric: tabular-nums; }
.seg button[aria-checked="true"] { background: var(--s3); color: var(--text); box-shadow: inset 0 0 0 1px #3a4250; }
.switch { display: flex; align-items: center; gap: 12px; padding: 11px 12px; margin-top: 6px; border-radius: var(--r); background: var(--s1); border: 1px solid var(--line); cursor: pointer; }
.switch > span { flex: 1; display: grid; gap: 1px; }
.switch > span > span { font-weight: 650; }
.switch small { color: var(--muted); font-size: 12px; }
.switch input { position: absolute; opacity: 0; pointer-events: none; }
.switch > i { width: 38px; height: 22px; border-radius: 99px; background: var(--s3); position: relative; flex: none; transition: background .18s; }
.switch > i::after { content: ""; position: absolute; top: 3px; left: 3px; width: 16px; height: 16px; border-radius: 50%; background: #c9cfd9; transition: transform .2s var(--ease), background .18s; }
.switch input:checked + i { background: var(--acc); }
.switch input:checked + i::after { transform: translateX(16px); background: var(--ink); }
.switch input:focus-visible + i { outline: 2px solid var(--acc); outline-offset: 2px; }

.btn { height: 40px; padding: 0 14px; border-radius: var(--r); border: 1px solid var(--line); background: var(--s2); font-weight: 650; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 8px; text-decoration: none; white-space: nowrap;
  transition: transform .15s var(--ease), filter .15s, background .15s; }
.btn:hover { background: var(--s3); }
.btn:active { transform: scale(.98); }
.btn.primary { background: var(--acc); color: var(--ink); border-color: transparent; }
.btn.primary:hover { filter: brightness(1.06); background: var(--acc); }
.gobar { position: sticky; bottom: -14px; margin: 4px -14px -14px; padding: 10px 14px 14px; display: grid; gap: 8px; background: linear-gradient(to bottom, rgba(11,13,16,0), var(--bg) 22%); z-index: 1; }
.btn.big { height: 50px; font-size: 15px; box-shadow: 0 12px 30px -14px rgba(200,245,66,.6); }
.btn.big .ic { width: 20px; height: 20px; }
.btn.ghost { background: transparent; }
.btn.ghost:hover { background: var(--s1); }
.hint { margin: 0; font-size: 12px; color: var(--muted); }
.label { font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); }
.lead { margin: 0; color: var(--muted); text-align: center; }

.run { display: grid; gap: 12px; padding: 14px; border-radius: 14px; background: var(--s1); border: 1px solid var(--line); }
.runtop { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; }
.runtop > div:first-child { display: grid; min-width: 0; }
.runq { font-size: 15px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.count { display: flex; align-items: baseline; gap: 5px; font-variant-numeric: tabular-nums; }
.count b { font-size: 30px; line-height: 1; color: var(--acc); letter-spacing: -.02em; }
.count span { color: var(--muted); font-size: 12.5px; }
.bar { height: 6px; border-radius: 99px; background: var(--s3); overflow: hidden; }
.bar i { display: block; height: 100%; background: var(--acc); border-radius: inherit; transition: width .4s var(--ease); }
.live { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.results { display: grid; gap: 10px; }
.summary { display: grid; gap: 4px; }
.summary > div:first-child { display: flex; align-items: baseline; gap: 8px; }
.summary > div:first-child > span { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.summary strong { font-size: 18px; letter-spacing: -.01em; }
.summary span { color: var(--muted); }
.filters { display: flex; flex-wrap: wrap; gap: 6px; }
.fchip { height: 30px; padding: 0 11px; border-radius: 99px; border: 1px solid var(--line); background: transparent; color: var(--muted); cursor: pointer; display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; font-weight: 600; }
.fchip em { font-style: normal; font-size: 11px; padding: 1px 6px; border-radius: 99px; background: var(--s2); color: var(--text); }
.fchip[aria-pressed="true"] { background: var(--acc); color: var(--ink); border-color: transparent; }
.fchip[aria-pressed="true"] em { background: rgba(11,13,16,.14); color: var(--ink); }
.tools { display: grid; grid-template-columns: minmax(0, 1fr) 138px; gap: 6px; }
.tools input, .tools select { height: 36px; font-size: 12.5px; }
select { appearance: none; background-image: linear-gradient(45deg, transparent 50%, var(--muted) 50%), linear-gradient(135deg, var(--muted) 50%, transparent 50%);
  background-position: calc(100% - 15px) 16px, calc(100% - 10px) 16px; background-size: 5px 5px; background-repeat: no-repeat; padding-right: 26px; cursor: pointer; }
option { background: var(--s1); }
.list { list-style: none; margin: 0; padding: 0; display: grid; gap: 1px; background: var(--line); border-radius: var(--r); overflow: hidden; border: 1px solid var(--line); }
.row { display: grid; grid-template-columns: 30px 1fr auto; gap: 10px; align-items: start; padding: 11px 11px 11px 10px; background: var(--s1); }
.row:hover { background: #171b21; }
.heat { width: 30px; height: 22px; border-radius: 7px; display: grid; place-items: center; font-size: 11px; font-weight: 750; font-variant-numeric: tabular-nums; margin-top: 1px; }
.heat.quente { background: rgba(255,122,69,.16); color: var(--hot); }
.heat.morno { background: rgba(255,194,74,.13); color: var(--warm); }
.heat.frio { background: var(--s2); color: var(--muted); }
.heat.star { background: var(--s2); color: var(--warm); }
.heat.star::before { content: "★"; font-size: 9px; margin-right: 1px; }
.main { min-width: 0; display: grid; gap: 3px; }
.name { font-weight: 650; text-decoration: none; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.name:hover { color: var(--acc); }
.meta { font-size: 12px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tags { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 2px; }
.tag { font-size: 11px; font-weight: 650; padding: 2px 7px; border-radius: 6px; background: var(--s2); color: var(--muted); text-decoration: none; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tag.none { background: rgba(200,245,66,.14); color: var(--acc); }
.tag.insta, .tag.social, .tag.booking { background: rgba(255,194,74,.12); color: var(--warm); }
.tag.site:hover { color: var(--text); }
.tag.warn { color: var(--hot); }
.tel { display: flex; align-items: center; gap: 4px; }
.tel.none { font-size: 11.5px; color: #6f7889; padding-top: 2px; }
.telnum { border: 0; background: transparent; padding: 3px 5px; border-radius: 6px; font-size: 12.5px; font-variant-numeric: tabular-nums; cursor: copy; white-space: nowrap; }
.telnum:hover { background: var(--s2); }
.wa { width: 28px; height: 28px; border-radius: 8px; display: grid; place-items: center; color: #25d366; }
.wa:hover { background: rgba(37,211,102,.12); }
.wa .ic { width: 18px; height: 18px; }
.empty { padding: 22px; text-align: center; color: var(--muted); background: var(--s1); }
.more { width: 100%; }
.actions { position: sticky; bottom: -14px; margin: 0 -14px -14px; padding: 12px 14px 14px; display: grid; grid-template-columns: 1fr auto; gap: 6px;
  background: linear-gradient(to bottom, rgba(11,13,16,0), var(--bg) 26%); }
.back { width: 100%; margin-top: 2px; }
.btn.sm { height: 30px; padding: 0 10px; font-size: 12px; border-radius: 9px; }
.iconbtn.on { background: var(--s2); color: var(--acc); }

.welcome { display: grid; gap: 10px; }
.welcome h2 { margin: 2px 0 0; font-size: 19px; line-height: 1.25; letter-spacing: -.015em; font-weight: 750; }
.intents { display: grid; gap: 6px; }
.intent { text-align: left; display: grid; gap: 2px; padding: 11px 13px; border-radius: var(--r); border: 1px solid var(--line); background: var(--s1); cursor: pointer; transition: border-color .15s, background .15s; }
.intent:hover { border-color: #3a4250; background: #171b21; }
.intent strong { font-size: 13.5px; }
.intent span { font-size: 12px; color: var(--muted); }
.intent[aria-checked="true"] { border-color: var(--acc); background: rgba(200,245,66,.06); }
.intent[aria-checked="true"] strong { color: var(--acc); }
.prefs { display: grid; gap: 9px; }
.prefs > .label { margin-top: 10px; }
.prefs > .label:first-child { margin-top: 0; }
.prefs .intent { padding: 9px 12px; }
.prefs .intent span { display: none; }
.prefs .intent[aria-checked="true"] span { display: block; }
.field { display: grid; gap: 6px; }
.field > span { font-weight: 650; font-size: 12.5px; }
.seg.s3 { grid-template-columns: repeat(3, 1fr); }
.seg.s3 button { font-size: 12.5px; padding: 0 4px; }
.checks { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.check { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-radius: 10px; background: var(--s1); border: 1px solid var(--line); cursor: pointer; font-size: 12.5px; }
.check input { accent-color: #c8f542; width: 15px; height: 15px; margin: 0; flex: none; }
.check:has(input:checked) { border-color: #3a4250; }
.critbar { display: grid; grid-template-columns: 1fr auto; gap: 6px 8px; align-items: center; text-align: left; padding: 10px 12px; border-radius: var(--r); border: 1px dashed #3a4250; background: transparent; cursor: pointer; }
.critbar .label { grid-column: 1; }
.critbar .pills { grid-column: 1; }
.critbar em { grid-row: 1 / span 2; grid-column: 2; font-style: normal; font-size: 12px; font-weight: 650; color: var(--acc); }
.critbar:hover { background: var(--s1); }
.pills { display: flex; flex-wrap: wrap; gap: 4px; }
.pills i { font-style: normal; font-size: 11.5px; font-weight: 650; padding: 2px 8px; border-radius: 99px; background: var(--s2); color: var(--text); }

.donate { display: grid; gap: 10px; }
.qr { width: 200px; height: 200px; justify-self: center; background: #fff; border-radius: 14px; padding: 6px; image-rendering: pixelated; }
.pixkey { display: grid; gap: 4px; justify-items: center; padding: 10px; border-radius: var(--r); background: var(--s1); border: 1px solid var(--line); }
.pixkey code { font: 13px ui-monospace, Consolas, monospace; user-select: all; }
.ad { display: grid; gap: 4px; padding: 12px; margin-top: 4px; border-radius: var(--r); border: 1px dashed #3a4250; }
.ad strong { font-size: 13px; }
.ad span { color: var(--muted); font-size: 12px; }
.ad .btn { margin-top: 6px; }

.foot { display: flex; align-items: center; gap: 4px; padding: 9px 12px 10px 14px; border-top: 1px solid var(--line); font-size: 12px; color: var(--muted); }
.by { text-decoration: none; margin-right: auto; }
.by b { color: var(--text); font-weight: 750; letter-spacing: .02em; }
.by:hover b { color: var(--acc); }
.iconlink, .linkbtn { height: 28px; min-width: 28px; border-radius: 8px; display: inline-flex; align-items: center; justify-content: center; gap: 5px; color: var(--muted); text-decoration: none; border: 0; background: transparent; cursor: pointer; padding: 0 6px; font-size: 12px; font-weight: 600; }
.iconlink:hover, .linkbtn:hover { background: var(--s2); color: var(--text); }
.linkbtn:hover .ic { color: #ff6b8b; }
.linkbtn .ic, .iconlink .ic { width: 15px; height: 15px; }
.sep { flex: 0; }
.toast { position: fixed; top: 24px; right: 16px; max-width: 360px; padding: 10px 14px; border-radius: 12px; background: var(--acc); color: var(--ink); font-weight: 650; box-shadow: 0 12px 30px -10px rgba(0,0,0,.5); animation: in .2s var(--ease); }
@media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
`;
  }
})();
