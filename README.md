# P. Blöndal ehf.

Vefsíða P. Blöndal ehf., gröfuþjónusta og jarðvinna á höfuðborgarsvæðinu.

## Skrár

- `index.html`: forsíða með þrívíddarsenu af lóð, verðreiknivél og tilboðsformi
- `en/index.html`: sama forsíða á ensku. Hún notar sömu CSS- og JS-skrár og íslenska forsíðan, svo breyting á útliti, senu eða verðum gildir á báðum
- `css/forsida.css`: útlit forsíðunnar, ljóst og dökkt (litirnir eru breytur efst í skránni)
- `js/forsida/scene.js`: þrívíddarsenan á forsíðunni (three.js): vöruhúsið, lóðin, lögin undir yfirborðinu, grunnurinn, lagnirnar og girðingin. Merkingar í senunni eru á íslensku eða ensku eftir `<html lang>`
- `js/forsida/page.js`: hreyfingar á forsíðu: mjúkt skrun (Lenis), ScrollTrigger og SplitText (GSAP), myndir á þjónustuspjöldum (teknar úr senunni, `SNAP`)
- `js/forsida/reiknivel.js`: verðreiknivél og tilboðsform fyrir báðar forsíðurnar. Textar eru í `tr('íslenska', 'English')`
- `js/vendor/`: three.js r170, GSAP 3.13.0 og Lenis 1.3.24, hýst á vefnum sjálfum eins og letrið
- `img/lod/`: áferðir (gras, hellur, steypa, timbur, jarðlög) sem senan notar
- `thjonusta/<heiti>/index.html`: sérsíða fyrir hverja þjónustu
- `stefnur/`: 17 stefnur og verklagsreglur (útgáfa 1.0, samþykkt 27. október 2026), hver á sinni síðu, með PDF í `stefnur/pdf/` og öll skjölin saman í `stefnur/pdf/p-blondal-stefnur-og-verklag.pdf`. Ensk þýðing allra skjalanna er í `en/policies/` með PDF í `en/policies/pdf/`.
- `css/site.css`: sameiginlegt útlit fyrir aðrar síður en forsíðuna
- `fonts/`: leturgerðirnar Schibsted Grotesk og IBM Plex Mono á undirsíðum og Archivo og Instrument Serif á forsíðu (allar OFL-leyfi), hýstar á vefnum sjálfum
- `404.html`: síða sem birtist ef slóð finnst ekki
- `sitemap.xml`, `robots.txt`: fyrir leitarvélar
- `og.png`: myndin sem birtist þegar síðunni er deilt
- `logo.png`, `logo-ljost.png`, `favicon-32.png`, `apple-touch-icon.png`: merki og tákn

## Sagan á forsíðunni

Þegar skrunað er byggist lóðin upp í sömu röð og verkið er unnið. Síðan opnast beint á fyrsta kaflanum, án merkis á undan, og lagnirnar eru lagðar á meðan myndavélin rennur inn.

0. Lagnir: séð í gegnum jörðina (stofnlagnir, heimæðar, fráveita, ofanvatn, dren)
1. Undirstöður: grafið, sökklar og súlufætur steyptir, púðinn fylltur í lögum. Síðan rís byggingin, sem er ekki okkar verk og birtist bara
2. Malbik: athafnasvæðið fyrir framan dyrnar, með sýnishorni af lögunum undir
3. Steyptar stéttir og plön: plönin við dyrnar og stéttin við skrifstofuna, með snjóbræðslu
4. Hellur: bílaplanið, hellurnar á sýnishorninu lagðar ein af annarri
5. Gras: mold og túnþökur, tré og limgerði vaxa
6. Girðing: staurarnir fara niður, grindverkið fellur á þá og rennihliðið lokast
7. Fullbúin lóð með bílum

Tímarnir eru í `apply(t)` í `scene.js` (heila talan er kaflinn) og sjónarhornin í `K`. Kaflatextarnir eru í `index.html` og `en/index.html` (`.ch`), einn á kafla í sömu röð.

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
- Á forsíðunni stýrir útlitið líka birtunni í þrívíddarsenunni: síðdegisbirta í ljósu útliti, sólsetur með kveikt ljós í dökku.
- Fyrirspurnir af ensku síðunni berast á petur@pblondal.is merktar „Tungumál: Enska“.
