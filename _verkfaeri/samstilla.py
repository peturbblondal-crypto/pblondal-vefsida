#!/usr/bin/env python3
"""Samstillir valmyndir, fót og þjónustulista á öllum síðum vefsins út frá _verkfaeri/vefur.json.

Vefurinn er hreinn HTML-vefur án byggingarskrefs. Sömu valmyndirnar eru því afritaðar á hverja síðu.
Þetta forrit skrifar þær upp á nýtt úr einni gagnaskrá, svo íslenska og enska útgáfan haldist eins:

  python3 _verkfaeri/samstilla.py           # uppfærir síðurnar og segir hverjar breyttust
  python3 _verkfaeri/samstilla.py --check   # breytir engu; skilar villu ef einhver síða er ekki í samræmi

Það sem er samstillt:
  - aðalvalmynd og símavalmynd (forsíður og undirsíður)
  - þjónustutenglar og fótarupplýsingar neðst á síðum
  - „Önnur þjónusta“ á þjónustusíðunum
Mappan byrjar á undirstriki svo GitHub Pages (Jekyll) birtir hana ekki á vefnum.
"""
import html, json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = json.load(open(os.path.join(ROOT, '_verkfaeri', 'vefur.json'), encoding='utf-8'))
PHONE_SVG = ('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5'
             'L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/></svg>')
E = lambda s: html.escape(s, quote=False)


def pages():
    for d, dirs, files in os.walk(ROOT):
        dirs[:] = sorted(x for x in dirs if not x.startswith(('.', '_')) and x != 'node_modules')
        for f in sorted(files):
            if f.endswith('.html'):
                yield os.path.relpath(os.path.join(d, f), ROOT).replace(os.sep, '/')


def ctx(path, src):
    lang = 'en' if re.search(r'<html lang="en"', src) else 'is'
    L = DATA[lang]
    pdir = os.path.dirname(path) + '/' if '/' in path else ''
    if path == '404.html':   # birtist á hvaða slóð sem er: slóðir frá rót
        return L, lang, pdir, '/' + L['heim'], True
    up = pdir.count('/') - L['heim'].count('/')
    return L, lang, pdir, '../' * up, False


def cur(L, pdir, slod):
    return ' aria-current="page"' if not slod.startswith('#') and L['heim'] + slod == pdir else ''


def en404():
    """Íslenskur texti og slóðir á 404-síðunni og ensk samsvörun, fyrir slóðir undir /en/."""
    I, N = DATA['is'], DATA['en']
    text, href = {}, {'/': '/en/'}
    for a, b in zip(I['valmynd'], N['valmynd']):
        text[a['texti']] = b['texti']
        if 'langt' in a: text[a['langt']] = b.get('langt', b['texti'])
        href['/' + a['slod']] = '/en/' + b['slod']
    for a, b in zip(I['thjonusta'], N['thjonusta']):
        text[a['stutt']] = b['stutt']
        href['/' + I['thjonusta_mappa'] + a['slug'] + '/'] = '/en/' + N['thjonusta_mappa'] + b['slug'] + '/'
    for a, b in zip(I['fotur'], N['fotur']):
        text[a['texti']] = b['texti']
        href['/' + a['slod']] = '/en/' + b['slod']
    for k in ('valmynd_heiti', 'simavalmynd_heiti', 'thjonusta_heiti', 'hringja', 'kt'):
        text[I[k]] = N[k]
    for k, v in I['vidmot'].items():
        text[v] = N['vidmot'][k]
    return json.dumps({'text': text, 'href': href}, ensure_ascii=False, sort_keys=True)


def sync(path, src):
    L, lang, pdir, pre, is404 = ctx(path, src)
    if is404:
        src = re.sub(r'/\*TEXTI\*/.*?/\*TEXTI\*/', lambda m: '/*TEXTI*/' + en404() + '/*TEXTI*/', src, flags=re.S)
    home = pdir == L['heim'] and path.endswith('index.html')
    out = src
    items = L['valmynd']

    def sub(pattern, new, count_ok=(1,)):
        nonlocal out
        n = len(re.findall(pattern, out, flags=re.S))
        if n not in count_ok:
            raise SystemExit('%s: fann %d eintök af %s' % (path, n, pattern[:60]))
        out = re.sub(pattern, lambda m: new, out, flags=re.S)

    if home:
        links = ''.join('<a href="%s">%s</a>' % (i['slod'], E(i['texti'])) for i in items)
        sub(r'<nav class="nav" aria-label="[^"]*">.*?</nav>', '<nav class="nav" aria-label="%s">\n      %s\n    </nav>' % (L['valmynd_heiti'], links))
        o = L['annad_mal']
        m = ''.join('<a href="%s">%s</a>' % (i['slod'], E(i.get('langt', i['texti']))) for i in items)
        m += '<a href="%s" hreflang="%s" lang="%s">%s</a><a href="tel:+3547733363">%s</a>' % (o['slod'], o['lang'], o['lang'], o['texti'], L['hringja'])
        sub(r'<nav class="mnav" id="mnav" aria-label="[^"]*" hidden>.*?</nav>', '<nav class="mnav" id="mnav" aria-label="%s" hidden>%s</nav>' % (L['simavalmynd_heiti'], m))
        ft = ''.join('<a href="%s%s/">%s</a>' % (L['thjonusta_mappa'], s['slug'], E(s['stutt'])) for s in L['thjonusta'])
        sub(r'<nav class="ft-links" aria-label="[^"]*">.*?</nav>', '<nav class="ft-links" aria-label="%s">%s</nav>' % (L['thjonusta_heiti'], ft))
        fl = ' · '.join('<a href="%s">%s</a>' % (f['slod'], E(f['texti'])) for f in L['fotur'])
        sub(r'<span>(?:<a href="[^"]*">[^<]*</a> · )+<a href="[^"]*" hreflang="[a-z]+" lang="[a-z]+">[^<]*</a></span>',
            '<span>%s · <a href="%s" hreflang="%s" lang="%s">%s</a></span>' % (fl, o['slod'], o['lang'], o['lang'], o['texti']))
        return out

    links = ''.join('\n      <a href="%s%s"%s>%s</a>' % (pre, i['slod'], cur(L, pdir, i['slod']), E(i['texti'])) for i in items)
    sub(r'<nav class="nav" aria-label="[^"]*">.*?</nav>',
        '<nav class="nav" aria-label="%s">%s\n      <a class="phone" href="tel:+3547733363">%s773-3363</a>\n    </nav>' % (L['valmynd_heiti'], links, PHONE_SVG))
    m = ''.join('\n    <a href="%s%s"%s>%s</a>' % (pre, i['slod'], cur(L, pdir, i['slod']), E(i.get('langt', i['texti']))) for i in items)
    sub(r'<nav class="mnav" id="mnav" aria-label="[^"]*" hidden>.*?</nav>',
        '<nav class="mnav" id="mnav" aria-label="%s" hidden>%s\n    <a href="tel:+3547733363">%s</a>\n  </nav>' % (L['simavalmynd_heiti'], m, L['hringja']))
    fi = '<a href="tel:+3547733363">773-3363</a><a href="mailto:petur@pblondal.is">petur@pblondal.is</a>'
    fi += ''.join('<a href="%s%s">%s</a>' % (pre, f['slod'], E(f['texti'])) for f in L['fotur'])
    fi += '<span>%s</span><span>© 2026 P. Blöndal ehf.</span>' % L['kt']
    sub(r'<div class="foot-info">.*?</div>', '<div class="foot-info">%s</div>' % fi)
    ft = ''.join('<a href="%s%s%s/">%s</a>' % (pre, L['thjonusta_mappa'], s['slug'], E(s['stutt'])) for s in L['thjonusta'])
    sub(r'<nav class="foot-links" aria-label="[^"]*">.*?</nav>', '<nav class="foot-links" aria-label="%s">%s</nav>' % (L['thjonusta_heiti'], ft))
    me = re.match(r'(?:en/)?(?:thjonusta|services)/([a-z-]+)/index\.html$', path)
    if me:
        rel = ''.join('<a href="../%s/">%s</a>' % (s['slug'], E(s['stutt'])) for s in L['thjonusta'] if s['slug'] != me.group(1))
        sub(r'<nav class="related" aria-labelledby="rel-t">.*?</nav>', '<nav class="related" aria-labelledby="rel-t">%s</nav>' % rel)
    return out


def main():
    check = '--check' in sys.argv
    changed = []
    for p in pages():
        fp = os.path.join(ROOT, p)
        src = open(fp, encoding='utf-8').read()
        new = sync(p, src)
        if new != src:
            changed.append(p)
            if not check:
                open(fp, 'w', encoding='utf-8').write(new)
    if check:
        if changed:
            print('Ekki í samræmi við _verkfaeri/vefur.json (%d síður):' % len(changed))
            for p in changed: print('  ' + p)
            sys.exit(1)
        print('Allar síður í samræmi við _verkfaeri/vefur.json.')
    else:
        print('Uppfærðar síður: %d' % len(changed))
        for p in changed: print('  ' + p)


if __name__ == '__main__':
    main()
