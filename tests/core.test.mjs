// node tests/core.test.mjs — testes da lógica pura (telefone, site, planilha, Pix, grade).
import assert from 'node:assert/strict';
import '../content/core.js';

const C = globalThis.ZR.core;
let n = 0;
const t = (name, fn) => { fn(); n++; console.log('ok', name); };

t('telefone', () => {
  assert.equal(C.fmtTel('027996413277'), '(27) 99641-3277');
  assert.equal(C.fmtTel('+55 27 3222-1111'), '(27) 3222-1111');
  assert.ok(C.isCel('(27) 99641-3277'));
  assert.ok(!C.isCel('(27) 3222-1111'));
  assert.equal(C.waLink('027996413277'), 'https://wa.me/5527996413277');
  assert.equal(C.waLink('(27) 3222-1111'), '');
  assert.equal(C.findPhone('Aberto · Fecha 22:00 · (27) 99641-3277'), '(27) 99641-3277');
  assert.equal(C.findPhone('Barbearia · R. Joaquim Lírio, 189 - Sl 12'), '');
  assert.ok(C.isNational('0800 123 4567'));
});

t('site', () => {
  assert.equal(C.siteKind(''), 'none');
  assert.equal(C.siteKind('https://www.instagram.com/barbearia_taig_blessed?igsh=x'), 'insta');
  assert.equal(C.siteKind('https://cashbarber.com.br/seculo'), 'booking');
  assert.equal(C.siteKind('https://sites.appbarber.com.br/x'), 'booking');
  assert.equal(C.siteKind('https://linktr.ee/x'), 'social');
  assert.equal(C.siteKind('https://barberrock.com.br/'), 'site');
  assert.equal(C.instaFrom('https://instagram.com/dondukebarbearia?utm_medium=copy_link'), '@dondukebarbearia');
  assert.equal(C.unwrapUrl('https://www.google.com/url?q=https://exemplo.com.br/&sa=U'), 'https://exemplo.com.br/');
  assert.equal(C.prettyUrl('https://www.exemplo.com.br/?a=1'), 'exemplo.com.br');
});

t('números e ids do Maps', () => {
  assert.deepEqual(C.parseStars('4,8 estrelas 289 comentários'), { nota: 4.8, avaliacoes: 289 });
  assert.deepEqual(C.parseStars('4.6 stars 1,204 Reviews'), { nota: 4.6, avaliacoes: 1204 });
  assert.deepEqual(C.parseStars('4,6 estrelas 1.204 comentários'), { nota: 4.6, avaliacoes: 1204 });
  const href = 'https://www.google.com/maps/place/Barber+Rock/data=!4m7!3m6!1s0xb817e96e1ae95d:0x9d2e5825608e470e!8m2!3d-20.2995901!4d-40.29444!16s%2Fg%2F11bbtqk52m!19sChIJXekabukXuAARDkeOYCVYLp0?authuser=0&hl=pt-BR';
  assert.equal(C.placeId(href), '0xb817e96e1ae95d:0x9d2e5825608e470e');
  assert.deepEqual(C.coordsFrom(href), { lat: -20.2995901, lng: -40.29444 });
  assert.equal(C.shortMaps(href, 'Barber Rock'), 'https://www.google.com/maps/place/Barber+Rock/data=!4m2!3m1!1s0xb817e96e1ae95d:0x9d2e5825608e470e');
  assert.deepEqual(C.splitAddress('R. Gama Rosa, 216 - Centro, Vitória - ES, 29015-100'), { bairro: 'Centro', cidade: 'Vitória', uf: 'ES', cep: '29015-100' });
  assert.deepEqual(C.viewFrom('https://www.google.com/maps/search/x/@-20.301789,-40.3214876,14z/data=!3m1'), { lat: -20.301789, lng: -40.3214876, z: 14 });
});

t('busca e grade', () => {
  assert.equal(C.searchUrl('barbearia', 'Vitória ES'), 'https://www.google.com/maps/search/barbearia+em+Vit%C3%B3ria+ES?hl=pt-BR');
  assert.equal(C.searchUrl('pet shop', '', { lat: -20.27, lng: -40.3 }), 'https://www.google.com/maps/search/pet+shop/@-20.27,-40.3,15z?hl=pt-BR');
  const g2 = C.gridAround({ lat: -20.3, lng: -40.3 }, 2);
  assert.equal(g2.length, 24);
  assert.equal(new Set(g2.map((p) => p.lat + ',' + p.lng)).size, 24);
  const d = (p) => Math.hypot(p.lat + 20.3, p.lng + 40.3);
  assert.ok(d(g2[0]) <= d(g2[23]), 'do mais perto para o mais longe');
});

t('oportunidade', () => {
  const quente = { site: '', telefone: '(27) 99641-3277', avaliacoes: 289, nota: 4.8 };
  const frio = { site: 'https://barberrock.com.br', telefone: '(27) 3222-1111', avaliacoes: 3, nota: 3.9 };
  assert.ok(C.score(quente) >= 70 && C.heat(C.score(quente)) === 'quente');
  assert.ok(C.score(frio) < 45 && C.heat(C.score(frio)) === 'frio');
  assert.equal(C.score({ ...quente, fechado: true }), 8);
});

t('planilha', () => {
  const rows = [{ nome: 'Bar "do Zé"; e cia', categoria: 'Bar', telefone: '027996413277', site: '', endereco: 'R. A, 1 - Centro, Vitória - ES, 29015-100', nota: 4.5, avaliacoes: 10, maps: 'https://maps', busca: 'bar em Vitória' },
                { nome: '=HYPERLINK("x")', categoria: '', telefone: '', site: 'https://x.com.br', endereco: '', nota: 0, avaliacoes: 0, maps: '', busca: '' }];
  const csv = C.toCSV(rows);
  assert.equal(csv.charCodeAt(0), 0xfeff, 'BOM para o Excel');
  const lines = csv.slice(1).split('\r\n');
  assert.equal(lines.length, 3);
  assert.ok(lines[0].startsWith('Nome;Categoria;Telefone;WhatsApp;Site'));
  assert.ok(lines[1].startsWith('"Bar ""do Zé""; e cia";Bar;(27) 99641-3277;https://wa.me/5527996413277;;Sem site'));
  assert.ok(lines[1].includes(';Centro;Vitória;ES;29015-100;'));
  assert.ok(lines[2].startsWith('"\'=HYPERLINK(""x"")"'), 'fórmula neutralizada');
  const tsv = C.toTSV(rows).split('\n');
  assert.equal(tsv[0].split('\t').length, C.COLS.length);
});

t('Pix', () => {
  assert.equal(C.crc16('123456789'), 0x29b1);
  const p = C.PIX.payload;
  assert.equal(C.crc16(p.slice(0, -4)).toString(16).toUpperCase().padStart(4, '0'), p.slice(-4));
  assert.ok(p.includes(C.PIX.key));
});

t('sem acento', () => assert.equal(C.deacc('Salão de Beleza Ótica'), 'salao de beleza otica'));

t('bairro', () => {
  assert.deepEqual(C.splitAddress('R. José Alexandre Buaiz, 190 - Sl 611 - Enseada do Suá, Vitória - ES, 29050-918'), { bairro: 'Enseada do Suá', cidade: 'Vitória', uf: 'ES', cep: '29050-918' });
  assert.deepEqual(C.splitAddress('Av. Minas Gerais, N° 102 - Res. Jacaraipe, Serra - ES, 29175-568'), { bairro: 'Res. Jacaraipe', cidade: 'Serra', uf: 'ES', cep: '29175-568' });
  assert.deepEqual(C.splitAddress('Av. Pres. Florentino Avidos, 289 - Centro, Vitória - ES, 29018-190').bairro, 'Centro');
  assert.deepEqual(C.splitAddress('R. Joaquim Lírio, 189 - Sl 12'), { bairro: '', cidade: '', uf: '', cep: '' });
  assert.equal(C.siteKind('https://vix360.com.br/neo24h/'), 'social');
});
t('preferências', () => {
  const r = { site: 'https://www.instagram.com/x', telefone: '(27) 99641-3277', nota: 4.6 };
  assert.ok(C.matches(r, { site: 'sem', contato: 'whats', notaMin: 4.5 }));
  assert.ok(!C.matches(r, { site: 'com', contato: 'any', notaMin: 0 }));
  assert.ok(!C.matches({ ...r, telefone: '(27) 3222-1111' }, { site: 'any', contato: 'whats', notaMin: 0 }));
  assert.ok(C.matches({ ...r, telefone: '(27) 3222-1111' }, { site: 'any', contato: 'tel', notaMin: 0 }));
  assert.ok(!C.matches({ ...r, nota: 4.4 }, { site: 'any', contato: 'any', notaMin: 4.5 }));
  assert.ok(C.needsDetail({ site: 'sem', contato: 'any' }) && !C.needsDetail({ site: 'any', contato: 'any', notaMin: 4 }));
  assert.equal(C.toTSV([r], ['telefone']).split('\n')[0], 'Nome\tTelefone');
  assert.deepEqual(C.critLabels(C.INTENTS.vender.crit), ['Sem site próprio', 'Com telefone']);
});

console.log(`\n${n} grupos de testes passaram`);
