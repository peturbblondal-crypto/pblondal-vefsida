# P. Blöndal ehf.

Vefsíða P. Blöndal ehf., gröfuþjónusta og jarðvinna á höfuðborgarsvæðinu.

## Skrár

- `index.html`: forsíða með myndasögu af framkvæmd í átta áföngum, verðreiknivél og tilboðsformi
- `en/index.html`: sama forsíða á ensku. Hún notar sömu CSS- og JS-skrár og myndir og íslenska forsíðan, svo breyting á útliti, myndum eða verðum gildir á báðum
- `css/forsida.css`: útlit forsíðunnar, ljóst og dökkt (litirnir eru breytur efst í skránni)
- `js/forsida/afangar.js`: myndasagan á forsíðunni (sjá „Myndasagan á forsíðunni“ hér fyrir neðan)
- `js/forsida/page.js`: hreyfingar á forsíðu: mjúkt skrun (Lenis), ScrollTrigger og SplitText (GSAP), kynning, valmynd og ljóst/dökkt útlit
- `js/forsida/reiknivel.js`: verðreiknivél og tilboðsform fyrir báðar forsíðurnar. Textar eru í `tr('íslenska', 'English')`
- `js/vendor/`: GSAP 3.13.0 og Lenis 1.3.24, hýst á vefnum sjálfum eins og letrið
- `img/afangar/`: myndirnar átta í myndasögunni (`afangi-1.webp` … `afangi-8.webp`) og myndirnar á þjónustuspjöldunum (`spjald-<heiti>.webp`), skornar úr sömu myndum
- `thjonusta/<heiti>/index.html`: sérsíða fyrir hverja þjónustu
- `stefnur/`: 17 stefnur og verklagsreglur (útgáfa 1.0, samþykkt 27. október 2026), hver á sinni síðu, með PDF í `stefnur/pdf/` og öll skjölin saman í `stefnur/pdf/p-blondal-stefnur-og-verklag.pdf`. Ensk þýðing allra skjalanna er í `en/policies/` með PDF í `en/policies/pdf/`.
- `css/site.css`: sameiginlegt útlit fyrir aðrar síður en forsíðuna
- `fonts/`: leturgerðirnar Schibsted Grotesk og IBM Plex Mono á undirsíðum og Archivo og Instrument Serif á forsíðu (allar OFL-leyfi), hýstar á vefnum sjálfum
- `404.html`: síða sem birtist ef slóð finnst ekki
- `sitemap.xml`, `robots.txt`: fyrir leitarvélar
- `og.png`: myndin sem birtist þegar síðunni er deilt
- `logo.png`, `logo-ljost.png`, `favicon-32.png`, `apple-touch-icon.png`: merki og tákn

## Myndasagan á forsíðunni

Sagan sýnir okkar hluta framkvæmdarinnar: allt sem húsið stendur á og allt í kringum það. Átta myndir af sömu lóð, ein fyrir hvern áfanga:

1. Framkvæmdasvæði: lagnaskurður, uppgröftur, efni og vinnusvæðisgirðing
2. Lagnir í opnum skurði, brunnur og sandbeð
3. Fyllingar og þjöppun
4. Púði tilbúinn fyrir undirstöður
5. Húsið risið, dren og fylling meðfram sökklum
6. Lóðarfrágangur: kantsteinar, malbik, hellur og gróður
7. Grindverk og rennihlið
8. Fullbúin lóð

- Skrunið stýrir einni tölu, `t`, frá 0 upp í 7. Hver heil tala er einn kafli (`.ch` í `index.html`). Hver mynd stendur í sínum kafla og sú næsta strýkst inn yfir hana á milli kafla, frá vinstri til hægri.
- Myndin er í breiðum borða undir hausnum og textinn hvers kafla er undir henni. Sjónarhornið líður hægt yfir myndina meðan skrunað er; í síma ferðast það yfir alla breiddina. `FOCUS` í `afangar.js` segir hvar verkið er á hverri mynd (hlutfall af breidd).
- Ef gestur hefur beðið um minni hreyfingu í stýrikerfinu (prefers-reduced-motion) er engin hreyfing á myndunum og þær skiptast í miðju skrefi í stað þess að strjúkast inn.
- Myndirnar eru 3148 × 968 dílar. Upphaflegu myndirnar voru 1574 × 484 og nokkuð óskýrar, svo þær voru stækkaðar tvöfalt og skerptar með Real-ESRGAN (meðaltal af `RealESRGAN_x4plus` á hálfstærð og `RealESRGAN_x2plus` á upphaflegu stærðinni). Myndirnar á þjónustuspjöldunum eru skornar úr skerptu myndunum.
- Til að skipta um mynd: settu nýja skrá með sama nafni í `img/afangar/`, helst 3148 × 968 dílar eða önnur stærð í sama hlutfalli (3,25 : 1).
- Myndirnar eru tölvugerðar skýringarmyndir, ekki ljósmyndir af verkum P. Blöndal, og það stendur smátt neðst á myndborðanum.
- `?nosnap` aftan við slóðina opnar prófunarkrók (`window.__pbDev`) sem er notaður við skjámyndatöku.

Fyrri útgáfa sögunnar var þrívíddarsena í three.js. Hún er geymd í sögu greinarinnar `jardvinnusaga` (commit 993c5d9) ef einhvern tíma á að taka hana upp aftur.

## Verð í reiknivélinni

Verðin eru efst í `js/forsida/reiknivel.js` (leitaðu að `var P=`), öll án VSK:

- `grafa`, `madur`: 3 tonna grafa og gröfumaður á klst. (11.900 + 12.990)
- `verkamadur`: skóflumaður (skóflumaður) á klst. (9.500). Í `CREW` er stillt hvaða verk fá skóflumann og hve stóran hluta vélartímans (lagnaskurður, drenlögn og plön 100%, heitur pottur og grunnur 50%)
- `ferd`: ein ferð vörubíls (25.900), notuð fyrir flutning tækja, akstur efnis og brottflutning uppgraftar
- `hola`, `sogun`, `hellur`: undirstöðuhola á stk., sögun á lm, hellulögn á m²
- `sandur`: 2.700 kr./t (verð P. Blöndal)
- `burdarlag`, `drenmol`: listaverð Steypustöðvarinnar á tonn með kolefnisgjaldi, án VSK (1.953 og 1.372)

`TRUCK_T` og `TRUCK_M3` segja hve mikið vörubíllinn tekur í ferð (15 t af efni eða 10 m³ af uppgreftri).
Verðhugmyndin er sýnd sem bil frá 90% upp í 130% af útreiknuðu verði. Hámark í hverjum reit er í `var MAX=` (500 m, 2.000 m², 50 stk.) svo innsláttarvilla gefi ekki fráleitt verð.
Íslenska og enska forsíðan nota sömu skrá, svo verðið þarf bara að breyta á einum stað.

## Tilboðsform

Fyrirspurnir eru sendar á petur@pblondal.is í gegnum FormSubmit (formsubmit.co).
Viðskiptavinur fær sjálfvirkan staðfestingarpóst.

## Lén

Síðan er á https://pblondal.is. DNS er hjá ISNIC: fjórar A-færslur á IP-tölur GitHub Pages og CNAME fyrir www á peturbblondal-crypto.github.io. Skráin `CNAME` segir GitHub hvaða lén síðan notar.

## Tungumál og útlit

- Ensk útgáfa er á `/en/` (forsíða), `/en/services/<heiti>/` (þjónustusíður) og `/en/policies/` (stefnur).
- Hnappurinn „EN / IS“ efst skiptir á milli samsvarandi síðna á hvoru tungumáli.
- Hnappurinn með tungli/sól skiptir á milli ljóss og dökks útlits á öllum síðum. Valið er munað í vafranum (`pb-theme`) og gildir á öllum síðum. Síðan opnast í ljósu útliti nema gestur hafi valið dökkt.
- Á forsíðunni eru myndirnar í sögunni ögn dekktar í dökku útliti.
- Fyrirspurnir af ensku síðunni berast á petur@pblondal.is merktar „Tungumál: Enska“.
