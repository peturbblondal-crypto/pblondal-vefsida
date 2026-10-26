# P. Blöndal ehf.

Vefsíða P. Blöndal ehf., gröfuþjónusta og jarðvinna á höfuðborgarsvæðinu.

## Skrár

- `index.html`: forsíða með verðreiknivél og tilboðsformi
- `thjonusta/<heiti>/index.html`: sérsíða fyrir hverja þjónustu
- `css/site.css`: sameiginlegt útlit fyrir allar síður
- `404.html`: síða sem birtist ef slóð finnst ekki
- `sitemap.xml`, `robots.txt`: fyrir leitarvélar
- `og.png`: myndin sem birtist þegar síðunni er deilt
- `logo.png`, `logo-ljost.png`, `favicon-32.png`, `apple-touch-icon.png`: merki og tákn

## Verð í reiknivélinni

Verðin eru efst í reiknivélarkóðanum í `index.html` (leitaðu að `var P=`), öll án VSK:

- `grafa`, `madur`: 3 tonna grafa og gröfumaður á klst. (11.900 + 12.990)
- `ferd`: ein ferð vörubíls (25.900), notuð fyrir flutning tækja, akstur efnis og brottflutning uppgraftar
- `hola`, `sogun`, `hellur`: undirstöðuhola á stk., sögun á lm, hellulögn á m²
- `sandur`: 2.700 kr./t (verð P. Blöndal)
- `burdarlag`, `drenmol`: listaverð Steypustöðvarinnar á tonn með kolefnisgjaldi, án VSK (1.953 og 1.372)

`TRUCK_T` og `TRUCK_M3` segja hve mikið vörubíllinn tekur í ferð (15 t af efni eða 10 m³ af uppgreftri).
Verðhugmyndin er sýnd sem bil frá 90% upp í 130% af útreiknuðu verði. Hámark í hverjum reit er í `var MAX=` (500 m, 2.000 m², 50 stk.) svo innsláttarvilla gefi ekki fráleitt verð.
Eftir breytingu á `index.html` þarf að endurgera ensku síðuna `en/index.html` svo verðin séu þau sömu.

## Tilboðsform

Fyrirspurnir eru sendar á petur@pblondal.is í gegnum FormSubmit (formsubmit.co).
Viðskiptavinur fær sjálfvirkan staðfestingarpóst.

## Lén

Síðan er á https://pblondal.is. DNS er hjá ISNIC: fjórar A-færslur á IP-tölur GitHub Pages og CNAME fyrir www á peturbblondal-crypto.github.io. Skráin `CNAME` segir GitHub hvaða lén síðan notar.

## Tungumál og útlit

- Ensk útgáfa er á `/en/` (forsíða) og `/en/services/<heiti>/` (þjónustusíður).
- Hnappurinn „EN / IS“ efst skiptir á milli samsvarandi síðna á hvoru tungumáli.
- Hnappurinn með tungli/sól skiptir á milli ljóss og dökks útlits. Valið er munað í vafranum.
- Fyrirspurnir af ensku síðunni berast á petur@pblondal.is merktar „Tungumál: Enska“.
