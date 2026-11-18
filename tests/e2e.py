# Teste de ponta a ponta: carrega a extensão de verdade num Chromium e varre um "Google Maps"
# de mentira (tests/mock-maps.html), sem internet. Uso: python3 tests/e2e.py [pasta-de-prints]
import json, os, sys, time, tempfile, csv, io
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
MOCK = (ROOT / 'tests' / 'mock-maps.html').read_text(encoding='utf-8')
SHOTS = Path(sys.argv[1] if len(sys.argv) > 1 else tempfile.mkdtemp())
SHOTS.mkdir(parents=True, exist_ok=True)

def ok(cond, msg):
    if not cond: raise AssertionError(msg)
    print('ok', msg)

with sync_playwright() as p:
    ctx = p.chromium.launch_persistent_context(tempfile.mkdtemp(), headless=False, viewport={'width': 1440, 'height': 900}, accept_downloads=True,
        args=['--headless=new', f'--disable-extensions-except={ROOT}', f'--load-extension={ROOT}'])
    ctx.route('https://www.google.com/maps**', lambda r: r.fulfill(status=200, content_type='text/html; charset=utf-8', body=MOCK))
    sw = ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event('serviceworker')
    ext = sw.url.split('/')[2]
    job = lambda: sw.evaluate("new Promise(r => chrome.storage.local.get('zr_job', o => r(o.zr_job || null)))")

    page = ctx.new_page()
    page.on('dialog', lambda dlg: dlg.accept())
    page.goto('https://www.google.com/maps/@-20.3,-40.32,13z?hl=pt-BR')
    page.wait_for_selector('zarpa-radar', state='attached')
    sr = page.locator('zarpa-radar')
    sr.locator('.panel').wait_for(state='visible')  # aberto sozinho na primeira instalação
    ok(True, 'painel abre sozinho depois de instalar')
    sr.locator('.welcome').wait_for()
    page.wait_for_timeout(300)
    page.screenshot(path=str(SHOTS / '0-boas-vindas.png'))
    ok(sr.locator('.intent').count() == 5, 'primeira vez pergunta para que vai usar')
    sr.locator('.intent', has_text='Vender site').click()
    sr.locator('.critbar').wait_for()
    ok('Sem site próprio' in sr.locator('.critbar').inner_text() and 'Com telefone' in sr.locator('.critbar').inner_text(), 'intenção "vender site" já filtra sem site e com telefone')
    ok(sr.locator('.switch input').is_disabled(), 'ficha completa travada quando filtra site/telefone')
    page.wait_for_timeout(300)
    page.screenshot(path=str(SHOTS / '1-busca.png'))

    # escolher nicho por chip, cidade, 100, ficha completa
    sr.locator('.chip', has_text='Barbearia').click()
    sr.locator('#zr-where').fill('Vitória ES')
    sr.locator('.seg button').get_by_text('50', exact=True).click()
    ok(sr.locator('.switch input').is_checked(), 'ficha completa ligada')
    t0 = time.time()
    sr.locator('button[type=submit]').click()
    time.sleep(1.5)
    ok(job()['steps'][0].startswith('https://www.google.com/maps/search/Barbearia+em+Vit%C3%B3ria+ES'), 'abre a busca certa no Maps')
    shot_mid = False
    while True:
        j = job()
        if j and not j['running']: break
        if j and len(j['results']) >= 12 and not shot_mid:
            page.wait_for_timeout(300); page.screenshot(path=str(SHOTS / '2-varrendo.png')); shot_mid = True
        if time.time() - t0 > 600: raise SystemExit('demorou demais')
        time.sleep(1)
    print('varredura de 50 em %.0fs' % (time.time() - t0))
    R = j['results']
    ok(len(R) == 50 and j['reason'] == 'meta', f"achou 50 (achou {len(R)}, motivo {j['reason']})")
    ok(len({r['id'] for r in R}) == 50, 'sem repetidos')
    ok(j['grid'] and j['step'] >= 1, f"ampliou para os arredores depois do limite de 60 (passo {j['step']})")
    ok(all(r['ficha'] for r in R), 'todas com ficha completa')
    import re
    kind = lambda u: 'none' if not u else 'insta' if 'instagram.com' in u else 'booking' if 'trinks' in u else 'site'
    ok(all(kind(r['site']) != 'site' and r['telefone'] for r in R), 'só entrou quem não tem site próprio e tem telefone')
    ok(j['rejected'] > 0 and j['checked'] == len(R) + j['rejected'] + j['skipped'], f"conferiu {j['checked']}, recusou {j['rejected']}")
    ok(not any('Fechou' in r['nome'] for r in R), 'fechado de vez ficou de fora')
    ok(all(r['endereco'].endswith('29015-100') for r in R), 'endereço completo da ficha')
    tel = [r for r in R if r['telefone']]
    ok(all(r['telefone'].startswith('(27) ') for r in tel), 'telefones formatados')
    ok(any(r.get('semDono') for r in R), 'marca ficha sem dono')

    sr.locator('.list .row').first.wait_for()
    page.wait_for_timeout(300)
    page.screenshot(path=str(SHOTS / '3-resultados.png'))
    ok(sr.locator('.fchip', has_text='Sem site').count() == 0, 'não mostra filtro "sem site" quando a busca já é só sem site')
    sr.locator('.fchip', has_text='WhatsApp').click()
    rows = sr.locator('.list .row')
    ok(rows.count() > 0 and rows.locator('a.wa').count() == rows.count(), 'filtro WhatsApp: todos com botão do WhatsApp')
    with page.expect_download() as d:
        sr.locator('.actions .btn.primary').click()
    path = d.value.path(); name = d.value.suggested_filename
    data = open(path, encoding='utf-8-sig').read()
    rd = list(csv.reader(io.StringIO(data), delimiter=';'))
    ok(name.startswith('radar-barbearia-vitoria-es-') and name.endswith('.csv'), 'nome da planilha: ' + name)
    ok(len(rd) - 1 == rows.count(), f'planilha respeita os filtros ({len(rd)-1} linhas)')
    ok(all(r[3].startswith('https://wa.me/55') for r in rd[1:]), 'coluna WhatsApp com link')
    page.screenshot(path=str(SHOTS / '4-filtros.png'))

    # doação
    sr.locator('.iconbtn.heart').click()
    sr.locator('.donate .qr').wait_for()
    ok(sr.locator('.donate .qr').evaluate('i => i.complete ? i.naturalWidth : new Promise(r => { i.onload = () => r(i.naturalWidth); i.onerror = () => r(0); })') > 100, 'QR do Pix carrega')
    page.screenshot(path=str(SHOTS / '5-apoiar.png'))
    sr.locator('.donate .btn', has_text='Voltar').click()

    # nova busca que abre um lugar só, sem ficha completa
    sr.locator('.summary .btn', has_text='Nova busca').click()
    # do meu jeito: com site, com WhatsApp, planilha só com telefone e site
    sr.locator('.critbar').click()
    sr.locator('.prefs').wait_for()
    sr.locator('.field', has_text='Site').locator('button', has_text='Com site').click()
    sr.locator('.field', has_text='Contato').locator('button', has_text='Com WhatsApp').click()
    for lab in ['Categoria', 'Link do WhatsApp', 'Instagram', 'Nota e avaliações', 'Endereço completo', 'Bairro, cidade, UF e CEP', 'Link do Google Maps', 'Nota de oportunidade', 'Termo buscado']:
        sr.locator('.check', has_text=lab).locator('input').uncheck()
    page.wait_for_timeout(200)
    page.screenshot(path=str(SHOTS / '7-preferencias.png'))
    ok(sr.locator('.intent[aria-checked=true]').inner_text().startswith('Do meu jeito'), 'mexer nos filtros vira "do meu jeito"')
    sr.locator('.prefs .btn.primary').click()
    sr.locator('#zr-q').fill('barbearia'); sr.locator('#zr-where').fill('Vitória ES')
    sr.locator('.seg button').get_by_text('20', exact=True).click()
    sr.locator('button[type=submit]').click()
    time.sleep(1.5)
    for _ in range(300):
        j = job()
        if j and not j['running']: break
        time.sleep(1)
    R = j['results']
    ok(len(R) == 20 and all(kind(r['site']) == 'site' and re.match(r'\(27\) 9', r['telefone']) for r in R), 'com site e com WhatsApp: 20 certinhos')
    with page.expect_download() as d:
        sr.locator('.actions .btn.primary').click()
    head = open(d.value.path(), encoding='utf-8-sig', newline='').read().split('\r\n')[0]
    ok(head == 'Nome;Telefone;Site;Situação do site', 'planilha só com as colunas escolhidas: ' + head)

    sr.locator('.summary .btn', has_text='Nova busca').click()
    sr.locator('#zr-q').fill('único lugar')
    sr.locator('#zr-where').fill('')
    sr.locator('.seg button').get_by_text('20', exact=True).click()
    sr.locator('button[type=submit]').click()
    for _ in range(60):
        j = job()
        if j and j['q'] == 'único lugar' and not j['running']: break
        time.sleep(0.5)
    ok(len(j['results']) + j['rejected'] == 1 and j['reason'] == 'acabou', 'busca com um lugar só')
    ok('/@' in j['steps'][0] and '+em+' not in j['steps'][0], 'campo Onde vazio usa a área do mapa: ' + j['steps'][0])

    # parar no meio
    sr.locator('.summary .btn', has_text='Nova busca').click()
    sr.locator('.critbar').click()
    sr.locator('.intent', has_text='Pesquisar mercado').click()
    sr.locator('.prefs .btn.primary').click()
    sr.locator('#zr-q').fill('barbearia'); sr.locator('#zr-where').fill('Vitória ES')
    sr.locator('.seg button').get_by_text('200', exact=True).click()
    sr.locator('.switch').click()  # desliga ficha completa
    sr.locator('button[type=submit]').click()
    time.sleep(1.5)
    sr.locator('.run .btn').wait_for(timeout=15000)
    page.wait_for_timeout(2500)
    sr.locator('.run .btn').click()
    page.wait_for_timeout(500)
    j = job()
    ok(not j['running'] and j['reason'] == 'parado' and len(j['results']) > 0, f"parar guarda o que já achou ({len(j['results'])})")
    ok(not any(r['ficha'] for r in j['results']), 'modo rápido lê só a lista')

    # popup
    pop = ctx.new_page(); pop.set_viewport_size({'width': 340, 'height': 520})
    pop.goto(f'chrome-extension://{ext}/popup/popup.html')
    pop.locator('#last').wait_for()
    pop.screenshot(path=str(SHOTS / '6-popup.png'), full_page=True)
    ok('barbearia' in pop.locator('#last').inner_text(), 'popup mostra a última varredura')
    ctx.close()
print('\nTudo certo. Prints em', SHOTS)
