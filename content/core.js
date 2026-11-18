// Zarpa Radar · lógica pura (sem DOM): telefone, site, oportunidade, planilha, Pix.
// Usada pelo painel, pelo popup e pelos testes (node tests/core.test.mjs).
(() => {
  const clean = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  const deacc = (s) => String(s || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

  /* ---------- telefone (Brasil) ---------- */
  function telDigits(s) {
    let d = String(s || '').replace(/\D/g, '');
    if (d.startsWith('55') && d.length >= 12) d = d.slice(2);
    if (d.startsWith('0') && d.length >= 11) d = d.slice(1);
    return d;
  }
  function fmtTel(s) {
    const d = telDigits(s);
    if (d.length === 11) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 7) + '-' + d.slice(7);
    if (d.length === 10) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 6) + '-' + d.slice(6);
    return clean(s);
  }
  /** Celular brasileiro (DDD + 9 + 8 dígitos): quase sempre tem WhatsApp. */
  const isCel = (s) => { const d = telDigits(s); return d.length === 11 && d[2] === '9'; };
  const waLink = (s) => (isCel(s) ? 'https://wa.me/55' + telDigits(s) : '');
  /** Primeiro telefone brasileiro dentro de um texto solto (cartão da lista). */
  function findPhone(text) {
    const m = String(text || '').match(/(?:\+55\s?)?\(?\b([1-9]\d)\)?[\s.-]?(9\s?\d{4}|\d{4})[\s.-]?(\d{4})\b/);
    return m ? m[0] : '';
  }
  /** 0800, 4004 e afins: atendimento nacional, não serve para contato direto. */
  const isNational = (s) => /^(0300|0500|0800|0900|400\d)/.test(String(s || '').replace(/\D/g, '').replace(/^55(?=\d{10})/, ''));

  /* ---------- site ---------- */
  function unwrapUrl(href) {
    try {
      const u = new URL(href, 'https://www.google.com');
      if (/(^|\.)google\./.test(u.hostname) && u.pathname === '/url') return u.searchParams.get('q') || u.searchParams.get('url') || '';
      return u.href;
    } catch (e) { return String(href || ''); }
  }
  const SOCIAL = /facebook\.com|fb\.me|fb\.com|linktr\.ee|linktree|wa\.me|whatsapp|api\.whatsapp|ifood|beacons\.ai|bio\.link|taplink|linkbio|tiktok\.com|youtube\.com|twitter\.com|x\.com\/|business\.site|g\.page|maps\.app|sites\.google|wixsite|negocio\.site|instabio|lnk\.bio|vix360/i;
  const BOOKING = /trinks|booksy|appbarber|cashbarber|avec\.app|agendor|simplesagenda|agendafacil|doctoralia|boaconsulta|zenklub|anota\.ai|goomer|aiqfome|deliverydireto|menudino|cardapioweb/i;
  /** 'none' sem nada · 'insta' só Instagram · 'social' rede/link de bio · 'booking' app de agenda/cardápio · 'site' site próprio */
  function siteKind(u) {
    if (!u) return 'none';
    if (/instagram\.com/i.test(u)) return 'insta';
    if (SOCIAL.test(u)) return 'social';
    if (BOOKING.test(u)) return 'booking';
    return 'site';
  }
  const SITE_LABEL = { none: 'Sem site', insta: 'Só Instagram', social: 'Só rede social', booking: 'Só app de agenda', site: 'Tem site' };
  function instaFrom(u) {
    const m = /instagram\.com\/([A-Za-z0-9._]{1,30})/i.exec(u || '');
    return m && !/^(p|reel|reels|explore|stories|accounts)$/i.test(m[1]) ? '@' + m[1] : '';
  }
  const prettyUrl = (u) => String(u || '').replace(/^https?:\/\/(www\.)?/i, '').replace(/[?#].*$/, '').replace(/\/$/, '');

  /* ---------- números do Maps ---------- */
  const rate = (s) => { const n = parseFloat(String(s || '').replace(',', '.')); return isFinite(n) ? n : 0; };
  const num = (s) => { const t = String(s || '').replace(/\./g, '').replace(',', '.'); const n = parseFloat(t); return isFinite(n) ? n : 0; };
  /** "4,8 estrelas 289 comentários" / "4.8 stars 289 Reviews" */
  function parseStars(label) {
    const s = String(label || '');
    const r = /(\d[.,]\d)/.exec(s);
    const c = /(\d[\d.,]*)\s*(coment|avalia|review|opini)/i.exec(s);
    return { nota: r ? rate(r[1]) : 0, avaliacoes: c ? Math.round(num(c[1].replace(/[.,](?=\d{3}\b)/g, ''))) : 0 };
  }
  /** id estável do lugar a partir do link da ficha */
  function placeId(href) {
    const s = String(href || '');
    const a = /!1s(0x[0-9a-f]+:0x[0-9a-f]+)/i.exec(s); if (a) return a[1].toLowerCase();
    const b = /!19s([A-Za-z0-9_-]{10,})/.exec(s); if (b) return b[1];
    return '';
  }
  function coordsFrom(href) {
    const m = /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/.exec(String(href || ''));
    return m ? { lat: +m[1], lng: +m[2] } : null;
  }
  /** link curto e estável da ficha (o da barra de endereço muda com o zoom) */
  function shortMaps(href, name) {
    const id = placeId(href);
    if (/^0x/.test(id)) return 'https://www.google.com/maps/place/' + encodeURIComponent(name || '').replace(/%20/g, '+') + '/data=!4m2!3m1!1s' + id;
    return String(href || '').replace(/[?&](authuser|hl|g_ep|rclk|entry)=[^&]*/g, '');
  }
  /** "R. Gama Rosa, 216 - Centro, Vitória - ES, 29015-100" → { bairro, cidade, uf, cep } */
  function splitAddress(addr) {
    const out = { bairro: '', cidade: '', uf: '', cep: '' };
    const parts = clean(addr).split(/,\s*/);
    const cep = /\b(\d{5}-?\d{3})\b/.exec(clean(addr)); if (cep) out.cep = cep[1];
    let k = -1;
    for (let i = parts.length - 1; i >= 0; i--) if (/\s-\s*[A-Z]{2}$/.test(parts[i]) || /^[A-Z]{2}$/.test(parts[i])) { k = i; break; }
    if (k < 0) return out;
    const m = /^(.*?)\s*-\s*([A-Z]{2})$/.exec(parts[k]);
    if (m) { out.cidade = clean(m[1]); out.uf = m[2]; } else { out.uf = parts[k]; out.cidade = clean(parts[k - 1] || ''); k--; }
    const prev = parts[k - 1] || '';
    if (/\s-\s/.test(prev)) out.bairro = clean(prev.split(/\s-\s/).pop());
    return out;
  }

  /* ---------- oportunidade ---------- */
  /** Nota 0-100 para quem vende site/marketing: sem site e com WhatsApp sobe; muita avaliação = negócio ativo. */
  function score(r) {
    let s = 0;
    const k = siteKind(r.site);
    s += { none: 40, insta: 32, social: 30, booking: 22, site: 0 }[k];
    if (isCel(r.telefone)) s += 22; else if (r.telefone) s += 10;
    const a = r.avaliacoes || 0;
    s += a >= 200 ? 22 : a >= 50 ? 17 : a >= 15 ? 11 : a > 0 ? 5 : 0;
    if (r.nota >= 4.5) s += 8; else if (r.nota >= 4) s += 5;
    if (r.fechado) s = 0;
    return Math.max(0, Math.min(100, s + 8));
  }
  const heat = (sc) => (sc >= 70 ? 'quente' : sc >= 45 ? 'morno' : 'frio');

  /* ---------- planilha ---------- */
  /* [grupo, título, valor] — o grupo liga a coluna à escolha "Dados na planilha" */
  const COLS = [
    ['nome', 'Nome', (r) => r.nome], ['categoria', 'Categoria', (r) => r.categoria], ['telefone', 'Telefone', (r) => fmtTel(r.telefone)],
    ['whatsapp', 'WhatsApp', (r) => waLink(r.telefone)], ['site', 'Site', (r) => r.site], ['site', 'Situação do site', (r) => SITE_LABEL[siteKind(r.site)]],
    ['instagram', 'Instagram', (r) => r.instagram || instaFrom(r.site)], ['avaliacao', 'Nota', (r) => (r.nota ? String(r.nota).replace('.', ',') : '')],
    ['avaliacao', 'Avaliações', (r) => r.avaliacoes || ''], ['endereco', 'Endereço', (r) => r.endereco], ['local', 'Bairro', (r) => splitAddress(r.endereco).bairro],
    ['local', 'Cidade', (r) => splitAddress(r.endereco).cidade], ['local', 'UF', (r) => splitAddress(r.endereco).uf], ['local', 'CEP', (r) => splitAddress(r.endereco).cep],
    ['oportunidade', 'Oportunidade', (r) => score(r)], ['oportunidade', 'Temperatura', (r) => heat(score(r))], ['maps', 'Google Maps', (r) => r.maps], ['busca', 'Busca', (r) => r.busca]
  ];
  const DATA = [['categoria', 'Categoria'], ['telefone', 'Telefone'], ['whatsapp', 'Link do WhatsApp'], ['site', 'Site'], ['instagram', 'Instagram'],
    ['avaliacao', 'Nota e avaliações'], ['endereco', 'Endereço completo'], ['local', 'Bairro, cidade, UF e CEP'], ['maps', 'Link do Google Maps'], ['oportunidade', 'Nota de oportunidade'], ['busca', 'Termo buscado']];
  const ALL_DATA = DATA.map((d) => d[0]);
  const pick = (groups) => { const g = new Set(['nome'].concat(groups || ALL_DATA)); return COLS.filter((c) => g.has(c[0])); };
  /** CSV que o Excel em português abre certo: separador ';', BOM e quebras CRLF. */
  function toCSV(rows, groups) {
    const cols = pick(groups);
    const q = (v) => { const t = String(v == null ? '' : v); return /[";\r\n]/.test(t) || /^[=+\-@]/.test(t) ? '"' + (/^[=+\-@]/.test(t) ? "'" : '') + t.replace(/"/g, '""') + '"' : t; };
    return String.fromCharCode(0xfeff) + [cols.map((c) => c[1])].concat(rows.map((r) => cols.map((c) => c[2](r)))).map((l) => l.map(q).join(';')).join('\r\n');
  }
  /** Tabela com TAB para colar direto no Google Planilhas ou no Excel. */
  function toTSV(rows, groups) {
    const cols = pick(groups);
    const q = (v) => String(v == null ? '' : v).replace(/[\t\r\n]+/g, ' ');
    return [cols.map((c) => c[1])].concat(rows.map((r) => cols.map((c) => c[2](r)))).map((l) => l.map(q).join('\t')).join('\n');
  }

  /* ---------- o que a pessoa quer ---------- */
  /** crit: { site: 'any'|'sem'|'com', contato: 'any'|'tel'|'whats', notaMin: 0|4|4.5 } */
  function matches(r, crit) {
    const c = crit || {};
    const k = siteKind(r.site);
    if (c.site === 'sem' && k === 'site') return false;
    if (c.site === 'com' && k !== 'site') return false;
    if (c.contato === 'tel' && !telDigits(r.telefone)) return false;
    if (c.contato === 'whats' && !isCel(r.telefone)) return false;
    if (c.notaMin && !(r.nota >= c.notaMin)) return false;
    return true;
  }
  /** site e telefone só aparecem com certeza na ficha do lugar */
  const needsDetail = (crit) => !!crit && (crit.site !== 'any' || crit.contato !== 'any');
  const INTENTS = {
    vender: { t: 'Vender site, tráfego ou marketing', d: 'Negócios sem site próprio e com telefone, com a nota de oportunidade de cada um.',
      crit: { site: 'sem', contato: 'tel', notaMin: 0 }, data: ALL_DATA, sort: 'score' },
    contatos: { t: 'Montar uma lista de contatos', d: 'Para vender produto, serviço ou parceria. Só entra quem tem telefone.',
      crit: { site: 'any', contato: 'tel', notaMin: 0 }, data: ['categoria', 'telefone', 'whatsapp', 'local', 'maps'], sort: 'aval' },
    mercado: { t: 'Pesquisar mercado ou concorrência', d: 'Todos os negócios da região, com nota, avaliações, site e endereço.',
      crit: { site: 'any', contato: 'any', notaMin: 0 }, data: ['categoria', 'telefone', 'site', 'instagram', 'avaliacao', 'endereco', 'local', 'maps'], sort: 'aval' },
    pessoal: { t: 'Achar um lugar bom para mim', d: 'Só os bem avaliados (nota 4,5 ou mais), para escolher com calma.',
      crit: { site: 'any', contato: 'any', notaMin: 4.5 }, data: ['categoria', 'telefone', 'whatsapp', 'site', 'avaliacao', 'endereco', 'maps'], sort: 'nota' },
    custom: { t: 'Do meu jeito', d: 'Você escolhe o que entra e quais dados saem na planilha.', crit: null, data: null, sort: null }
  };
  function critLabels(c) {
    if (!c) return [];
    return [c.site === 'sem' ? 'Sem site próprio' : c.site === 'com' ? 'Com site próprio' : '', c.contato === 'tel' ? 'Com telefone' : c.contato === 'whats' ? 'Com WhatsApp' : '',
      c.notaMin ? 'Nota ' + String(c.notaMin).replace('.', ',') + '+' : ''].filter(Boolean);
  }

  const slug = (s) => deacc(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'radar';

  /* ---------- área de busca ---------- */
  /** "/@-20.30,-40.32,14z" da barra de endereço */
  function viewFrom(url) {
    const m = /@(-?\d+\.\d+),(-?\d+\.\d+),(\d+(?:\.\d+)?)z/.exec(String(url || ''));
    return m ? { lat: +m[1], lng: +m[2], z: +m[3] } : null;
  }
  /** Anéis de pontos em volta do centro (zoom 15, ~3,5 km entre pontos), do mais perto para o mais longe. */
  function gridAround(c, rings) {
    const pts = [], d = 0.032, dl = d / Math.max(0.3, Math.cos((c.lat * Math.PI) / 180));
    for (let r = 1; r <= rings; r++) {
      for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) {
        if (Math.max(Math.abs(i), Math.abs(j)) !== r) continue;
        pts.push({ lat: +(c.lat + i * d).toFixed(5), lng: +(c.lng + j * dl).toFixed(5), dist: Math.hypot(i, j) });
      }
    }
    return pts.sort((a, b) => a.dist - b.dist).map(({ lat, lng }) => ({ lat, lng }));
  }
  function searchUrl(q, where, at) {
    const term = clean(q) + (clean(where) ? ' em ' + clean(where) : '');
    const base = 'https://www.google.com/maps/search/' + encodeURIComponent(term).replace(/%20/g, '+');
    return base + (at ? '/@' + at.lat + ',' + at.lng + ',' + (at.z || 15) + 'z' : '') + '?hl=pt-BR';
  }

  /* ---------- doação ---------- */
  const PIX = {
    key: 'contato@zarpadev.com.br',
    payload: '00020126450014br.gov.bcb.pix0123contato@zarpadev.com.br5204000053039865802BR5911KAUA PESSIN6007VITORIA62070503***6304A70B'
  };
  /** CRC16-CCITT-FALSE, o mesmo do padrão Pix (confere o payload acima nos testes) */
  function crc16(s) {
    let c = 0xffff;
    for (const b of new TextEncoder().encode(s)) { c ^= b << 8; for (let i = 0; i < 8; i++) c = c & 0x8000 ? ((c << 1) ^ 0x1021) & 0xffff : (c << 1) & 0xffff; }
    return c;
  }
  const LINKS = { site: 'https://zarpadev.com.br/?utm_source=zarpa-radar', instagram: 'https://www.instagram.com/zarpa.dev/', github: 'https://github.com/kakazi7/zarpa-radar' };

  const NICHOS = ['Barbearia', 'Dentista', 'Clínica', 'Salão de beleza', 'Pet shop', 'Academia', 'Hamburgueria', 'Pizzaria', 'Restaurante', 'Advogado', 'Contabilidade', 'Imobiliária', 'Oficina mecânica', 'Estética', 'Psicólogo', 'Loja de roupas'];

  globalThis.ZR = globalThis.ZR || {};
  globalThis.ZR.core = { clean, deacc, telDigits, fmtTel, isCel, waLink, findPhone, isNational, unwrapUrl, siteKind, SITE_LABEL, instaFrom, prettyUrl,
    num, rate, parseStars, placeId, coordsFrom, shortMaps, splitAddress, score, heat, COLS, DATA, ALL_DATA, toCSV, toTSV, matches, needsDetail, INTENTS, critLabels, slug, viewFrom, gridAround, searchUrl, PIX, crc16, LINKS, NICHOS };
})();
