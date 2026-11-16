#!/usr/bin/env python3
"""Prófanir á vefnum, án nettengingar og án vafra:  python3 _verkfaeri/profa.py

Fer yfir allar HTML-síður og athugar:
  - valmyndir og fót í samræmi við _verkfaeri/vefur.json (samstilla.py --check)
  - titil, lýsingu, canonical, hreflang-pör og tungumálahnappinn á hverri síðu
  - að tenglar innan vefsins vísi á síður og kaflamerki (#) sem eru til
  - að ensku síðurnar vísi á ensku síðurnar og þær íslensku á íslensku (nema tungumálahnappurinn)
  - íslensk orð sem slæðast inn á ensku síðurnar
  - JSON-LD, alt-texta á myndum, veftré (sitemap.xml)
  - að verðin í reiknivélinni séu óbreytt og að öll form sendi á sama stað
Skilar villukóða 1 ef eitthvað fellur á prófi. Viðvaranir stöðva ekki.
"""
import html, json, os, re, subprocess, sys
from html.parser import HTMLParser

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = 'https://pblondal.is/'
fails, warns = [], []
def fail(m): fails.append(m)
def warn(m): warns.append(m)

# verðin í reiknivélinni (README: „Verð í reiknivélinni“). Breytist þau á þetta próf að falla þar til README og þessi lína eru uppfærð.
PRICES = "var P={grafa:11900,madur:12990,verkamadur:9500,ferd:25900,hola:12500,sogun:7500,hellur:8500,sandur:2700,burdarlag:1953,drenmol:1372};"
ENDPOINT = 'https://formsubmit.co/ajax/petur@pblondal.is'
# íslensk sérnöfn sem mega standa á ensku síðunum
NAMES = set('''Blöndal Garðabær Garðabæ Kópavogur Hafnarfjörður Mosfellsbær Reykjavík Seltjarnarnes Steypustöðin Steypustöðin's Urriðaholt Íslenska
Vinnueftirlitið Vinnueftirlitsins Veitur Ísland Íslands Persónuvernd Persónuverndar Skatturinn Umhverfisstofnun Heilbrigðiseftirlit Neyðarlínan'''.split())


class Page(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.links, self.ids, self.imgs, self.text, self.h1 = [], set(), [], [], 0
        self.meta, self.alts, self.title, self._in = {}, [], None, []
        self.lang_btn = None
    def handle_starttag(self, tag, a):
        a = dict(a)
        if 'id' in a: self.ids.add(a['id'])
        if tag == 'a' and 'name' in a: self.ids.add(a['name'])
        if tag in ('a', 'link') and 'href' in a: self.links.append((tag, a['href'], a))
        if tag in ('img', 'script', 'source') and 'src' in a: self.links.append((tag, a['src'], a))
        if tag == 'img': self.imgs.append(a)
        if tag == 'h1': self.h1 += 1
        if tag == 'meta':
            k = a.get('name') or a.get('property')
            if k: self.meta[k] = a.get('content', '')
        if tag == 'link' and a.get('rel') in ('canonical', 'alternate'):
            self.alts.append(a)
        if tag == 'a' and 'lang' in (a.get('class') or '').split() and 'tbtn' in (a.get('class') or ''): self.lang_btn = a.get('href')
        if tag == 'a' and (a.get('class') or '') == 'lang': self.lang_btn = a.get('href')
        self._in.append(tag)
    def handle_endtag(self, tag):
        while self._in and self._in.pop() != tag: pass
    def handle_data(self, d):
        if self._in and self._in[-1] == 'title': self.title = (self.title or '') + d
        if not any(t in ('script', 'style', 'title', 'template') for t in self._in): self.text.append(d)


def pages():
    for d, dirs, files in os.walk(ROOT):
        dirs[:] = sorted(x for x in dirs if not x.startswith(('.', '_')) and x != 'node_modules')
        for f in sorted(files):
            if f.endswith('.html'):
                yield os.path.relpath(os.path.join(d, f), ROOT).replace(os.sep, '/')


def url_of(p):
    return SITE + (p[:-len('index.html')] if p.endswith('index.html') else p)


def resolve(page, href):
    """slóð á skrá innan vefsins út frá tengli, eða None ef tengillinn fer út af vefnum"""
    if re.match(r'^(https?:|mailto:|tel:|data:|javascript:|//)', href):
        if href.startswith(SITE): href = '/' + href[len(SITE):]
        else: return None
    h = href.split('#')[0].split('?')[0]
    frag = href.split('#')[1] if '#' in href else None
    if h == '': target = page
    elif h.startswith('/'): target = h.lstrip('/')
    else: target = os.path.normpath(os.path.join(os.path.dirname(page), h)).replace(os.sep, '/')
    if target in ('.', ''): target = ''
    if target == '' or target.endswith('/') or os.path.isdir(os.path.join(ROOT, target)):
        target = (target.rstrip('/') + '/index.html').lstrip('/')
    return target, frag


def main():
    r = subprocess.run([sys.executable, os.path.join(ROOT, '_verkfaeri', 'samstilla.py'), '--check'], capture_output=True, text=True)
    if r.returncode: fail('Valmyndir og fótur ekki í samræmi við vefur.json:\n' + r.stdout)
    parsed, titles, descs = {}, {}, {}
    for p in pages():
        src = open(os.path.join(ROOT, p), encoding='utf-8').read()
        pg = Page(); pg.feed(src); pg.src = src
        parsed[p] = pg
    for p, pg in parsed.items():
        src = pg.src
        lang = (re.search(r'<html lang="([a-z]+)"', src) or [None, None])[1]
        if lang not in ('is', 'en'): fail('%s: vantar <html lang>' % p); continue
        if p != '404.html' and (lang == 'en') != p.startswith('en/'): fail('%s: lang="%s" passar ekki við slóðina' % (p, lang))
        t = (pg.title or '').strip()
        if not t: fail('%s: vantar <title>' % p)
        elif len(t) > 72: warn('%s: titill er %d stafir (Google sýnir um 60–70): %s' % (p, len(t), t))
        titles.setdefault(t, []).append(p)
        d = pg.meta.get('description', '')
        if not d: fail('%s: vantar meta description' % p)
        elif not 70 <= len(d) <= 170: warn('%s: lýsing er %d stafir' % (p, len(d)))
        descs.setdefault(d, []).append(p)
        if pg.h1 != (2 if p == '404.html' else 1): fail('%s: %d h1-fyrirsagnir (á að vera ein; 404 hefur eina á hvoru tungumáli)' % (p, pg.h1))
        loc = pg.meta.get('og:locale')
        if loc and loc != {'is': 'is_IS', 'en': 'en_GB'}[lang]: fail('%s: og:locale %s passar ekki við %s' % (p, loc, lang))
        for m in re.findall(r'<script type="application/ld\+json">(.*?)</script>', src, re.S):
            try: json.loads(m)
            except Exception as e: fail('%s: JSON-LD ógilt: %s' % (p, e))
        for im in pg.imgs:
            if 'alt' not in im: fail('%s: mynd án alt: %s' % (p, im.get('src')))
            if not (im.get('width') and im.get('height')) and im.get('src'): warn('%s: mynd án width/height: %s' % (p, im.get('src', '')[:60]))
        if p == '404.html':
            continue
        canon = [a['href'] for a in pg.alts if a.get('rel') == 'canonical']
        if canon != [url_of(p)]: fail('%s: canonical %s, átti að vera %s' % (p, canon, url_of(p)))
        hl = {a.get('hreflang'): a['href'] for a in pg.alts if a.get('rel') == 'alternate' and a.get('hreflang')}
        if set(hl) != {'is', 'en', 'x-default'}: fail('%s: hreflang vantar eða er ofaukið: %s' % (p, sorted(hl)))
        elif hl[lang] != url_of(p): fail('%s: hreflang="%s" vísar ekki á síðuna sjálfa' % (p, lang))
        else:
            other = 'en' if lang == 'is' else 'is'
            op = hl[other][len(SITE):] + 'index.html'
            if op not in parsed: fail('%s: hreflang="%s" vísar á síðu sem er ekki til: %s' % (p, other, hl[other]))
            else:
                ohl = {a.get('hreflang'): a['href'] for a in parsed[op].alts if a.get('rel') == 'alternate' and a.get('hreflang')}
                if ohl.get(lang) != url_of(p): fail('%s og %s vísa ekki hvor á aðra (hreflang)' % (p, op))
                if hl.get('x-default') != hl['is']: fail('%s: x-default á að vera íslenska síðan' % p)
                if pg.lang_btn is None: fail('%s: vantar tungumálahnapp' % p)
                else:
                    tb = resolve(p, pg.lang_btn)
                    if not tb or tb[0] != op: fail('%s: tungumálahnappurinn vísar á %s en ekki %s' % (p, pg.lang_btn, op))
    for t, ps in titles.items():
        if len(ps) > 1: fail('Sami titill á %d síðum: %s (%s)' % (len(ps), t, ', '.join(ps)))
    for d, ps in descs.items():
        if len(ps) > 1 and d: warn('Sama lýsing á %d síðum: %s' % (len(ps), ', '.join(ps)))

    # tenglar
    nlinks = 0
    for p, pg in parsed.items():
        lang = 'en' if p.startswith('en/') else 'is'
        for tag, href, a in pg.links:
            if tag == 'link' and a.get('rel') in ('canonical', 'alternate'): continue
            res = resolve(p, href)
            if res is None: continue
            target, frag = res
            nlinks += 1
            if p == '404.html' and href.startswith('/') and not os.path.exists(os.path.join(ROOT, target)):
                pass
            if not os.path.exists(os.path.join(ROOT, target)):
                fail('%s: tengill á skrá sem er ekki til: %s' % (p, href)); continue
            if frag and target.endswith('.html'):
                tp = parsed.get(target)
                if tp and frag not in tp.ids: fail('%s: kaflamerkið #%s er ekki til á %s' % (p, frag, target))
            if tag == 'a' and target.endswith('.html') and p != '404.html':
                tl = 'en' if target.startswith('en/') else 'is'
                if tl != lang and not a.get('hreflang'): fail('%s: tengill á síðu á hinu tungumálinu án hreflang: %s' % (p, href))
    # íslenska á ensku síðunum
    for p, pg in parsed.items():
        if not p.startswith('en/'): continue
        words = set(re.findall(r"[A-Za-zÀ-ÿþðÞÐæÆ'’]+", ' '.join(pg.text)))
        odd = sorted(w for w in words if re.search('[þðÞÐæÆáéíóúýöÁÉÍÓÚÝÖ]', w) and re.sub("['’]s$", '', w).strip("'’") not in NAMES)
        if odd: warn('%s: orð með íslenskum stöfum (athugið hvort þau eigi heima þar): %s' % (p, ', '.join(odd[:12])))
    # veftré
    sm = open(os.path.join(ROOT, 'sitemap.xml'), encoding='utf-8').read()
    locs = re.findall(r'<loc>([^<]+)</loc>', sm)
    for u in locs:
        f = u[len(SITE):] + ('index.html' if u.endswith('/') else '')
        if f not in parsed: fail('sitemap.xml: %s er ekki til' % u)
    for p in parsed:
        if p != '404.html' and url_of(p) not in locs: fail('sitemap.xml: vantar %s' % url_of(p))
    # reiknivélin og formin
    calc = open(os.path.join(ROOT, 'js', 'forsida', 'reiknivel.js'), encoding='utf-8').read()
    if PRICES not in calc: fail('Verðin í reiknivélinni (var P=…) hafa breyst. Uppfærðu README og PRICES í profa.py ef það var ætlunin.')
    if 'VSK=0.24' not in calc: fail('VSK í reiknivélinni er ekki 24%')
    js = ''.join(open(os.path.join(dp, f), encoding='utf-8').read() for dp, _, fs in os.walk(os.path.join(ROOT, 'js')) if 'vendor' not in dp for f in fs if f.endswith('.js'))
    eps = set(re.findall(r"https://formsubmit\.co/[^'\"]+", js))
    if eps != {ENDPOINT}: fail('Formin senda ekki öll á %s: %s' % (ENDPOINT, eps))
    for p, pg in parsed.items():
        if re.search(r'<input[^>]+type="file"', pg.src): fail('%s: skráareitur (type=file) á síðunni, en engin örugg upphleðsla er til' % p)
        if re.search(r'\bISO[- ]?(9001|14001|45001)\b', pg.src) and not re.search(r'ekki vottun|not a certification', pg.src):
            fail('%s: nefnir ISO án fyrirvara um að það sé markmið en ekki vottun' % p)

    print('Síður: %d · tenglar innan vefsins: %d' % (len(parsed), nlinks))
    for w in warns: print('  viðvörun: ' + w)
    for f in fails: print('  VILLA: ' + f)
    print('Í lagi.' if not fails else '%d villur.' % len(fails))
    sys.exit(1 if fails else 0)


if __name__ == '__main__':
    main()
