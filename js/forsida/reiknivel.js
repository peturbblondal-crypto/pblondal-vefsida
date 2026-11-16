/* Verðreiknivél og tilboðsform á forsíðu P. Blöndal, bæði á íslensku (/) og ensku (/en/).
   Verðin eru í P hér fyrir neðan, öll án VSK, og gilda fyrir báðar síðurnar.
   VSK (24%) er lagður einu sinni á heildarverðið, aldrei á einstakar línur, svo hann tvítelst ekki.
   Textar eru í tr('íslenska', 'English'); tungumálið ræðst af <html lang>.
   Fyrirspurnir fara á petur@pblondal.is í gegnum FormSubmit (js/fyrirspurn.js). */
(function(){
  var EN=(document.documentElement.lang||'').slice(0,2)==='en';
  function tr(is,en){return EN?en:is}
  var F=window.PBForm;
  var reduce=!!(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches);
  /* sama sjálfvirka svar og áður (FormSubmit sendir það ekki alltaf þegar sent er með AJAX, sjá README) */
  var AUTORESPONSE=tr('Takk fyrir fyrirspurnina til P. Blöndal ehf. Við höfum fengið hana og höfum samband fljótlega, yfirleitt samdægurs. Ef málið er brýnt geturðu hringt beint í 773-3363.','Thank you for your enquiry to P. Blöndal ehf. We have received it and will be in touch soon, usually the same day. If it is urgent, you can call us on 773-3363.');
  var DISCLAIMER=tr('Útreiknað verð er áætlað og ekki bindandi tilboð. Endanlegt verð getur breyst eftir aðstæðum á verkstað, umfangi og nánara samkomulagi.','The calculated price is an estimate, not a binding quote. The final price may change depending on site conditions, scope and further agreement.');
  /* price calculator
     Prices are P. Blöndal's own (ISK, ex VAT). Hours come from typical 3 t mini excavator output.
     Change the numbers in P and RATE to update every estimate. */
  (function(){
    var P={grafa:11900,madur:12990,verkamadur:9500,ferd:25900,hola:12500,sogun:7500,hellur:8500,sandur:2700,burdarlag:1953,drenmol:1372};
    /* efni á tonn án VSK: sandur = verð P. Blöndal, burðarlag og drenmöl = listaverð Steypustöðvar með kolefnisgjaldi */
    var DENS={sandur:1.6,burdarlag:2.0,drenmol:1.27};   /* tonn á m³ */
    var TRUCK_T=15,TRUCK_M3=10,SWELL=1.25;              /* hámark í hverri ferð vörubíls, losun uppgraftar */
    var MATN={sandur:tr('Sandur','Sand'),burdarlag:tr('Burðarlag','Base course'),drenmol:tr('Drenmöl','Drainage gravel')};
    var RATE=P.grafa+P.madur;            /* grafa + gröfumaður á klst. */
    /* skóflumaður með gröfumanni, hlutfall af vélartíma: lagnavinna, drenlögn og plön þurfa alltaf aukamann. Skóflumaður 9.500 kr. á klst. án vsk. */
    var CREW={skurdur:1,dren:1,plan:1,pottur:.5,grunnur:.5};
    var FLUTNINGUR=P.ferd;               /* flutningur tækja á staðinn (ein ferð vörubíls) */
    var LOW=0.9,HIGH=1.3,VSK=0.24;       /* VSK: almennt þrep virðisaukaskatts, 24% (Skatturinn, 2026) */
    var DIG_TRENCH=5.5,DIG_HOUSE=4.5,DIG_BULK=8,FILL=12,GRADE=60,LEVEL=40;   /* m³ eða m² á klst. */
    var PCS=tr('stk.','pcs');
    var JOBS={
      skurdur:{n:tr('Lagnaskurður','Utility trench'),f:[['L',tr('Lengd skurðar','Trench length'),'m',1,10],['d',tr('Dýpt','Depth'),[[0.6,tr('Um 60 cm','About 60 cm')],[1,tr('Um 1 m','About 1 m')],[1.5,tr('Um 1,5 m','About 1.5 m')]],1],['b',tr('Mokað aftur í skurðinn?','Backfill the trench?'),[[1,tr('Já','Yes')],[0,tr('Nei','No')]],1]],
        c:function(v,s,a){var w=v.d<=0.6?0.4:v.d<=1?0.5:0.7,V=v.L*w*v.d,sd=v.L*w*0.3;return {h:V/(DIG_TRENCH*s*a)+(v.b?V/(FILL*a):0),mat:{sandur:sd},out:v.b?sd:V,t:fq(v.L)+' m, '+fq(v.d)+tr(' m djúpur',' m deep')}},
        note:tr('Gröfumaður og skóflumaður vinna saman við lögnina. Sandur undir og yfir lögn reiknast með ef efni er valið. Lagnaefni ekki innifalið.','The operator and a labourer work together on the pipe. Sand bedding under and over the pipe is included if you choose materials. Pipes not included.')},
      dren:{n:tr('Drenlögn kringum hús','Foundation drainage'),f:[['L',tr('Ummál hússins','Perimeter of the house'),'m',1,40],['d',tr('Dýpt niður að sökkli','Depth to the footing'),[[1,tr('Um 1 m','About 1 m')],[1.5,tr('Um 1,5 m','About 1.5 m')],[2,tr('Um 2 m','About 2 m')]],1.5]],
        c:function(v,s,a){var V=v.L*0.8*v.d,dm=v.L*0.15;return {h:V/(DIG_HOUSE*s*a)+V/(10*a),mat:{drenmol:dm},out:dm,t:fq(v.L)+' m, '+fq(v.d)+tr(' m djúpt',' m deep')}},
        note:tr('Unnið varlega upp við sökkul, með skóflumanni í handgreftri. Drenmöl reiknast með ef efni er valið. Drenrör og dúkur ekki innifalin.','Careful work along the footing, with a labourer for hand digging. Drainage gravel is included if you choose materials. Drain pipe and membrane not included.')},
      plan:{n:tr('Innkeyrsla, plan eða verönd','Driveway, parking area or patio'),f:[['A',tr('Flatarmál','Area'),'m²',5,40],['d',tr('Tegund','Type'),[[0.3,tr('Verönd eða stétt','Patio or path')],[0.5,tr('Innkeyrsla eða bílaplan','Driveway or parking area')]],0.5],['hl',tr('Hellulögn líka?','Paving as well?'),[[1,tr('Já, hellulögn líka','Yes, paving too')],[0,tr('Nei, bara undirvinna','No, groundwork only')]],1]],
        c:function(v,s,a){var V=v.A*v.d;return {h:V/(DIG_BULK*s*a)+V/(FILL*a)+v.A/(LEVEL*a),fast:v.hl?v.A*P.hellur:0,mat:{burdarlag:v.A*(v.d-0.05),sandur:v.hl?v.A*0.05:0},out:V,t:fq(v.A)+' m²'+(v.hl?tr(' með hellulögn',' with paving'):tr(' undirvinna',' groundwork only'))}},
        note:tr('Innifalið: uppgröftur, fylling og jöfnun, með skóflumanni við þjöppun. Burðarlag og hellusandur reiknast með ef efni er valið. Hellur ekki innifaldar.','Included: excavation, fill and levelling, with a labourer for compaction. Base course and bedding sand are included if you choose materials. Pavers not included.')},
      holur:{n:tr('Undirstöður fyrir pall eða girðingu','Deck or fence supports'),f:[['n',tr('Fjöldi hola','Number of holes'),PCS,1,8]],
        c:function(v){return {h:0,fast:v.n*P.hola,out:v.n*0.1,t:fq(v.n)+tr(' holur',' holes')}},
        note:tr('Gröftur við einfaldar aðstæður. Steypa og frágangur ekki innifalin.','Digging in simple conditions. Concrete and finishing not included.')},
      pottur:{n:tr('Heitur pottur','Hot tub'),f:[['n',tr('Fjöldi potta','Number of tubs'),PCS,1,1]],
        c:function(v,s,a){return {h:v.n*(1.5/s+0.5)/a,mat:{burdarlag:v.n*1.25},out:v.n*3.75,t:fq(v.n)+' '+PCS}},
        note:tr('Gröftur og jöfnun undir hefðbundinn pott, skóflumaður hluta verksins. Möl undir pottinn reiknast með ef efni er valið. Lagnir ekki innifaldar.','Digging and levelling for a standard hot tub, with a labourer for part of the job. Gravel under the tub is included if you choose materials. Pipework not included.')},
      grunnur:{n:tr('Grunnur fyrir smáhýsi','Foundation for a small building'),f:[['A',tr('Grunnflötur','Footprint'),'m²',5,20],['d',tr('Dýpt','Depth'),[[0.6,tr('Um 60 cm, léttar undirstöður','About 60 cm, light footings')],[1.2,tr('Um 1,2 m, frostfrítt','About 1.2 m, frost-free')]],1.2]],
        c:function(v,s,a){var sd=v.A?Math.sqrt(v.A)+1:0,V=sd*sd*v.d;return {h:V/(DIG_BULK*s*a)+v.A/(30*a),out:V,t:fq(v.A)+' m², '+fq(v.d)+' m'}},
        note:tr('Miðað við að grafið sé um 50 cm út fyrir grunninn, skóflumaður hluta verksins. Fylling ekki innifalin.','Assumes digging about 50 cm beyond the footprint, with a labourer for part of the job. Fill not included.')},
      jofnun:{n:tr('Lóðajöfnun og garður','Garden levelling'),f:[['A',tr('Flatarmál','Area'),'m²',10,100]],
        c:function(v,s,a){return {h:v.A/(GRADE*a)*(s<0.8?1.3:1),t:fq(v.A)+' m²'}},
        note:tr('Jöfnun og mótun á staðnum. Mold og þökur ekki innifalin.','Levelling and shaping on site. Topsoil and turf not included.')},
      stubbar:{n:tr('Trjástubbar og stórir steinar','Stumps and large rocks'),f:[['n',tr('Fjöldi','Quantity'),PCS,1,3]],
        c:function(v,s,a){return {h:v.n*0.4/a,t:fq(v.n)+' '+PCS}},
        note:tr('Förgun á stubbum og grjóti ekki innifalin.','Disposal of stumps and rock not included.')},
      sogun:{n:tr('Steypusögun','Concrete cutting'),f:[['L',tr('Lengd sögunar','Cut length'),'m',1,3]],
        c:function(v){return {h:0,fast:v.L*P.sogun,t:fq(v.L)+' m'}},
        note:tr('Miðað við venjulega veggja- eða plötuþykkt.','Assumes normal wall or slab thickness.')}
    };
    var ORDER=['skurdur','dren','plan','holur','pottur','grunnur','jofnun','stubbar','sogun'];
    var V={},sel={},calcText='',est=null,vat=0;
    var CALC_HEAD=tr('Verðhugmynd úr reiknivél:','Estimate from the price calculator:');
    var MAX={L:500,A:2000,n:50};   /* hámark í hverjum reit svo innsláttarvilla gefi ekki fráleitt verð */
    function cap(k,x){return Math.min(x,MAX[k]||1e4)}
    /* tala úr reit: 1,5 og 1.5 eru einn og hálfur; 1.500 (íslenska) og 1,500 (enska) eru þúsundir */
    function num(x){x=String(x).replace(/\s/g,'');if((EN?/^\d{1,3}(,\d{3})+$/:/^\d{1,3}(\.\d{3})+$/).test(x))x=x.replace(/[.,]/g,'');x=x.replace(',','.');var y=parseFloat(x);return isFinite(y)&&y>0?y:0}
    function fq(x){var s=String(Math.round(x*10)/10);return EN?s:s.replace('.',',')}
    function n3(x){return String(Math.round(x)).replace(/\B(?=(\d{3})+(?!\d))/g,EN?',':'.')}
    function fmt(x){return n3(x)+(EN?' ISK':' kr.')}
    /* bil: 686.000 – 991.000 kr. (eitt krónumerki, línan brotnar bara á eftir strikinu) */
    function rng(a,b){return n3(a)+'\u00a0– '+n3(b)+(EN?'\u00a0ISK':'\u00a0kr.')}
    function r1000(x){return Math.round(x/1000)*1000}
    function radio(name){var r=document.querySelector('input[name="'+name+'"]:checked');return r?+r.value:1}
    function esc(s){return String(s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
    function trips(n){return n+(n===1?tr(' ferð',' trip'):tr(' ferðir',' trips'))}
    function $(id){return document.getElementById(id)}

    function panel(id){
      var J=JOBS[id];V[id]=V[id]||{};
      var g=J.f.map(function(f){
        var key=f[0],fid='c-'+id+'-'+key;
        if(V[id][key]==null)V[id][key]=Array.isArray(f[2])?f[3]:f[4];
        if(Array.isArray(f[2]))return '<div class="of"><span class="l">'+f[1]+'</span><div class="seg">'+f[2].map(function(o){return '<label><input type="radio" name="'+fid+'" data-job="'+id+'" data-k="'+key+'" value="'+o[0]+'"'+(V[id][key]==o[0]?' checked':'')+'><span>'+o[1]+'</span></label>'}).join('')+'</div></div>';
        return '<div class="of"><label for="'+fid+'">'+f[1]+' <em>('+f[2]+')</em></label><div class="qty"><button type="button" data-job="'+id+'" data-k="'+key+'" data-step="-'+f[3]+'" aria-label="'+tr('Minnka','Decrease')+'">−</button><input id="'+fid+'" inputmode="decimal" autocomplete="off" data-job="'+id+'" data-k="'+key+'" data-u="'+f[2]+'" value="'+fq(V[id][key])+'" aria-describedby="e-'+id+'-'+key+'"><button type="button" data-job="'+id+'" data-k="'+key+'" data-step="'+f[3]+'" aria-label="'+tr('Auka','Increase')+'">+</button></div><p class="of-err" id="e-'+id+'-'+key+'" hidden></p></div>';
      }).join('');
      return '<div class="opt" data-panel="'+id+'"><div class="opt-h"><b>'+J.n+'</b><span id="cr-'+id+'"></span></div><div class="opt-g">'+g+'</div><p class="opt-note">'+J.note+'</p></div>';
    }
    function drawPanels(){
      var ids=ORDER.filter(function(k){return sel[k]}),o=$('opts');
      o.innerHTML=ids.length?ids.map(panel).join(''):'<div class="calc-empty">'+tr('Veldu verk hér að ofan til að setja inn umfang.','Choose a job above to enter its size.')+'</div>';
      calc();
    }
    /* skýr skilaboð við reitinn: ekki tala, eða meira en reiknivélin tekur */
    function fieldMsg(t,raw){
      var k=t.dataset.k,e=$('e-'+t.dataset.job+'-'+k),v=num(raw),m='',mx=MAX[k]||1e4;
      if(String(raw).trim()&&!v)m=tr('Sláðu inn tölu stærri en 0, til dæmis 12.','Enter a number above 0, for example 12.');
      else if(v>mx)m=tr('Reiknivélin tekur mest '+fq(mx)+' '+t.dataset.u+'. Fyrir stærri verk er best að senda okkur fyrirspurn.','The calculator goes up to '+fq(mx)+' '+t.dataset.u+'. For larger jobs, please send us an enquiry.');
      if(e){e.textContent=m;e.hidden=!m}
      t.classList.toggle('bad',!!m);if(m)t.setAttribute('aria-invalid','true');else t.removeAttribute('aria-invalid');
    }

    var R=$('calcRange'),T=$('calcVat'),L=$('calcLines'),C=$('calcCta'),M=$('calcMini'),lab=$('calcLabel'),box=$('calcVatBox'),miniV=$('calcMiniV'),miniL=$('calcMiniL');
    function setCta(on){C.setAttribute('aria-disabled',on?'false':'true');document.querySelectorAll('.calc-tools button').forEach(function(b){b.disabled=!on})}
    function empty(r,t){est=null;calcText='';M.dataset.on='';showMini();R.textContent=r;T.textContent=t;T.hidden=false;L.hidden=true;if(box)box.hidden=true;setCta(false);label();save()}
    function label(){if(lab)lab.textContent=vat?tr('Verðhugmynd með VSK','Estimate incl. VAT'):tr('Verðhugmynd án VSK','Estimate excl. VAT')}
    function bump(el){if(reduce||!el)return;el.classList.remove('bump');void el.offsetWidth;el.classList.add('bump')}
    function calc(){
      var s=radio('soil'),a=radio('acc'),ids=ORDER.filter(function(k){return sel[k]});
      if(!ids.length){empty(tr('Veldu verk','Choose a job'),tr('Verðhugmyndin birtist hér um leið og þú velur verk.','Your estimate appears here as soon as you choose a job.'));return}
      var tot=0,hrs=0,helper=0,rows=[],txt=[],mt={},outM3=0,wantMat=radio('mat')===1,wantHaul=radio('haul')===1;
      ids.forEach(function(id){
        var r=JOBS[id].c(V[id],s,a),h=Math.ceil((r.h||0)*4)/4,cw=CREW[id]||0,cost=h*RATE+h*cw*P.verkamadur+(r.fast||0);helper+=h*cw;
        if(r.mat)Object.keys(r.mat).forEach(function(k){mt[k]=(mt[k]||0)+r.mat[k]*DENS[k]});
        outM3+=r.out||0;
        tot+=cost;hrs+=h;
        var lo=r1000(cost*LOW),hi=r1000(cost*HIGH),el=$('cr-'+id);
        if(el)el.textContent=cost?rng(lo,hi):'';
        if(!cost)return;
        rows.push('<div><span>'+esc(JOBS[id].n)+'</span><span>'+rng(lo,hi)+'</span></div>');
        txt.push('- '+JOBS[id].n+': '+r.t+(cw?(cw<1?tr(', skóflumaður hluta verks',', labourer for part of the job'):tr(', með skóflumanni',', with a labourer')):'')+tr(' (u.þ.b. ',' (approx. ')+rng(lo,hi)+')');
      });
      if(!rows.length){empty(tr('Sláðu inn stærð','Enter the size'),tr('Fylltu inn stærð verksins til að fá verðhugmynd.','Enter the size of the job to get a price estimate.'));return}
      tot+=FLUTNINGUR;
      rows.push('<div><span>'+tr('Flutningur tækja á staðinn','Machine transport to site')+'</span><span>'+rng(r1000(FLUTNINGUR*LOW),r1000(FLUTNINGUR*HIGH))+'</span></div>');
      txt.push('- '+tr('Flutningur tækja á staðinn','Machine transport to site')+tr(' (u.þ.b. ',' (approx. ')+rng(r1000(FLUTNINGUR*LOW),r1000(FLUTNINGUR*HIGH))+')');
      function line(label,cost,extra){tot+=cost;rows.push('<div><span>'+label+'</span><span>'+rng(r1000(cost*LOW),r1000(cost*HIGH))+'</span></div>');txt.push('- '+label+(extra||'')+tr(' (u.þ.b. ',' (approx. ')+rng(r1000(cost*LOW),r1000(cost*HIGH))+')')}
      if(wantMat){
        var tons=0,mcost=0,parts=[];
        Object.keys(mt).forEach(function(k){var tn=Math.ceil(mt[k]*2)/2;if(!tn)return;tons+=tn;mcost+=tn*P[k];parts.push(MATN[k]+' '+fq(tn)+' t')});
        if(tons){line(tr('Efni: ','Materials: ')+parts.join(', '),mcost);var tr1=Math.ceil(tons/TRUCK_T);line(tr('Akstur efnis, ','Material delivery, ')+trips(tr1),tr1*P.ferd)}
      }
      if(wantHaul&&outM3>0.2){var ht=Math.ceil(outM3*SWELL/TRUCK_M3);line(tr('Brottflutningur uppgraftar, ','Soil removal, ')+trips(ht),ht*P.ferd,tr(', um ',', approx. ')+fq(outM3*SWELL)+' m³')}
      var lo=r1000(tot*LOW),hi=r1000(tot*HIGH);
      if(hrs)rows.push('<div style="font-weight:700"><span>'+tr('Áætlaður vinnutími gröfu','Estimated excavator time')+'</span><span>'+fq(Math.max(0.5,hrs*LOW))+' – '+fq(hrs*HIGH)+tr(' klst.',' hrs')+'</span></div>');
      if(helper)rows.push('<div style="font-weight:700"><span>'+tr('Þar af með skóflumanni','Of which with a labourer')+'</span><span>'+fq(Math.max(0.5,helper*LOW))+' – '+fq(helper*HIGH)+tr(' klst.',' hrs')+'</span></div>');
      L.innerHTML='<div class="calc-lh"><span>'+tr('Sundurliðun, án VSK','Breakdown, excl. VAT')+'</span></div>'+rows.join('');L.hidden=false;
      var soilL=(document.querySelector('input[name="soil"]:checked')||{}).parentNode,accL=(document.querySelector('input[name="acc"]:checked')||{}).parentNode;
      var cond=tr('Jarðvegur: ','Soil: ')+(soilL?soilL.textContent:'')+tr(', aðgengi: ',', access: ')+(accL?accL.textContent:'')+(wantMat?'':tr(', efni útvegað af viðskiptavini',', customer supplies materials'))+(wantHaul?'':tr(', uppgröftur verður eftir á lóðinni',', excavated soil stays on site'));
      var hours=hrs?tr('Áætlaður vinnutími gröfu: ','Estimated excavator time: ')+fq(Math.max(0.5,hrs*LOW))+' – '+fq(hrs*HIGH)+tr(' klst.',' hrs'):'';
      /* VSK einu sinni, á heildarverðið án VSK; upphæðir með VSK námundaðar að næsta þúsundi eins og áður */
      est={lo:lo,hi:hi,ilo:r1000(lo*(1+VSK)),ihi:r1000(hi*(1+VSK)),txt:txt,cond:cond,hours:hours,ids:ids};
      calcText=CALC_HEAD+'\n'+txt.join('\n')+'\n- '+cond+(hours?'\n- '+hours:'')+'\n'+totals();
      render(true);
      save();
    }
    function totals(){
      return tr('Áætlað verð án VSK: ','Estimated price excl. VAT: ')+rng(est.lo,est.hi)+'\n'+
        tr('VSK (24%): ','VAT (24%): ')+rng(est.ilo-est.lo,est.ihi-est.hi)+'\n'+
        tr('Áætlað heildarverð með VSK: ','Estimated total incl. VAT: ')+rng(est.ilo,est.ihi);
    }
    /* sýnir verðið með eða án VSK eftir vali; sundurliðunin er alltaf án VSK */
    function render(changed){
      label();
      if(!est)return;
      var a=vat?est.ilo:est.lo,b=vat?est.ihi:est.hi,s=rng(a,b);
      if(R.textContent!==s){R.textContent=s;if(changed!==false)bump(R)}
      T.hidden=true;
      if(box){$('vEx').textContent=rng(est.lo,est.hi);$('vVat').textContent=rng(est.ilo-est.lo,est.ihi-est.hi);$('vInc').textContent=rng(est.ilo,est.ihi);box.hidden=false}
      if(miniL)miniL.textContent=vat?tr('Með VSK','Incl. VAT'):tr('Án VSK','Excl. VAT');
      miniV.textContent=s;M.dataset.on='1';showMini();
      setCta(true);
    }

    /* valið geymist á meðan flipinn er opinn: farið er milli skrefa, á aðra síðu og til baka, eða skipt um tungumál */
    var KEY='pb-calc',restoring=false;
    function save(){if(restoring)return;try{sessionStorage.setItem(KEY,JSON.stringify({sel:sel,V:V,r:{soil:radio('soil'),acc:radio('acc'),mat:radio('mat'),haul:radio('haul')},vat:vat}))}catch(e){}}
    function restore(){
      var d=null;try{d=JSON.parse(sessionStorage.getItem(KEY)||'null')}catch(e){}
      if(!d||typeof d!=='object')return;
      restoring=true;
      try{
        Object.keys(d.r||{}).forEach(function(n){var i=document.querySelector('input[name="'+n+'"][value="'+(+d.r[n])+'"]');if(i)i.checked=true});
        Object.keys(d.V||{}).forEach(function(id){if(!JOBS[id])return;V[id]={};Object.keys(d.V[id]||{}).forEach(function(k){var x=+d.V[id][k];if(isFinite(x)&&x>=0)V[id][k]=cap(k,x)})});
        Object.keys(d.sel||{}).forEach(function(id){if(JOBS[id]&&d.sel[id]){var cb=document.querySelector('#jobs input[value="'+id+'"]');if(cb){cb.checked=true;sel[id]=true}}});
        if(d.vat===1){vat=1;var vi=document.querySelector('input[name="vat"][value="1"]');if(vi)vi.checked=true}
      }catch(e){}
      restoring=false;
    }

    var inSec=false,sumVis=false;
    function showMini(){M.hidden=!(M.dataset.on&&inSec&&!sumVis)}
    if('IntersectionObserver' in window){new IntersectionObserver(function(e){inSec=e[0].isIntersecting;showMini()}).observe($('reiknivel'));new IntersectionObserver(function(e){sumVis=e[0].isIntersecting;showMini()}).observe($('calcSum'))}
    M.addEventListener('click',function(){$('calcSum').scrollIntoView({behavior:reduce?'auto':'smooth',block:'start'})});
    $('jobs').addEventListener('change',function(e){sel[e.target.value]=e.target.checked;drawPanels()});
    var opts=$('opts');
    opts.addEventListener('input',function(e){var t=e.target;if(t.dataset.job&&t.type!=='radio'){V[t.dataset.job][t.dataset.k]=cap(t.dataset.k,num(t.value));fieldMsg(t,t.value);calc()}});
    opts.addEventListener('change',function(e){var t=e.target;if(t.type==='radio'&&t.dataset.job){V[t.dataset.job][t.dataset.k]=+t.value;calc()}});
    opts.addEventListener('focusout',function(e){var t=e.target;if(t.tagName==='INPUT'&&t.type!=='radio'&&t.dataset.job){var big=num(t.value)>(MAX[t.dataset.k]||1e4);t.value=fq(V[t.dataset.job][t.dataset.k]);if(!big)fieldMsg(t,t.value)}});
    opts.addEventListener('click',function(e){var b=e.target.closest('[data-step]');if(!b)return;var j=b.dataset.job,k=b.dataset.k,i=$('c-'+j+'-'+k),want=Math.max(0,(V[j][k]||0)+(+b.dataset.step));V[j][k]=cap(k,want);if(i){i.value=fq(V[j][k]);fieldMsg(i,want>V[j][k]?String(want):i.value)}calc()});
    ['g-soil','g-acc','g-mat','g-haul'].forEach(function(id){$(id).addEventListener('change',calc)});
    var vs=$('g-vat');if(vs)vs.addEventListener('change',function(e){if(e.target.name==='vat'){vat=+e.target.value?1:0;render(true);save()}});
    restore();
    try{var pv=new URLSearchParams(location.search).get('verk');if(pv&&JOBS[pv]){var cb=document.querySelector('#jobs input[value="'+pv+'"]');if(cb){cb.checked=true;sel[pv]=true}}}catch(e){}
    drawPanels();
    document.addEventListener('click',function(e){
      var a=e.target.closest&&e.target.closest('[data-verk]');if(!a)return;
      var v=a.getAttribute('data-verk'),cb=document.querySelector('#jobs input[value="'+v+'"]');
      if(cb&&!cb.checked){cb.checked=true;sel[v]=true;drawPanels()}
    });

    /* ---------- samantekt: afrita eða sækja sem textaskrá (ekkert sent) ---------- */
    function today(){var d=new Date();return EN?d.toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'}):d.getDate()+'.'+(d.getMonth()+1)+'.'+d.getFullYear()}
    function summary(){
      if(!est)return '';
      return tr('P. Blöndal ehf. – verðhugmynd úr reiknivél','P. Blöndal ehf. – estimate from the price calculator')+'\n'+today()+' · '+location.origin+location.pathname+'#reiknivel\n\n'+
        tr('Verk og forsendur (verð án VSK):','Jobs and assumptions (prices excl. VAT):')+'\n'+est.txt.join('\n')+'\n- '+est.cond+(est.hours?'\n- '+est.hours:'')+'\n\n'+
        totals()+'\n'+tr('Verðbil frá 90% upp í 130% af útreiknuðu verði. Upphæðir með VSK eru námundaðar að næsta þúsundi.','Range from 90% to 130% of the calculated price. Amounts incl. VAT are rounded to the nearest thousand.')+'\n\n'+
        DISCLAIMER+'\n\n'+tr('P. Blöndal ehf. · kt. 570125-0950 · sími 773-3363 · petur@pblondal.is','P. Blöndal ehf. · company ID 570125-0950 · phone 773-3363 · petur@pblondal.is');
    }
    var tmsg=$('calcToolMsg');
    function toolMsg(s){if(tmsg){tmsg.textContent=s;tmsg.hidden=!s}}
    function manual(s){var t=$('calcCopyTxt');if(!t)return;t.value=s;t.hidden=false;t.focus();t.select()}
    function copyOld(s){var t=document.createElement('textarea');t.value=s;t.setAttribute('readonly','');t.style.cssText='position:fixed;top:0;left:0;opacity:0';document.body.appendChild(t);t.select();var ok=false;try{ok=document.execCommand('copy')}catch(e){}t.remove();return ok}
    var cp=$('calcCopy'),dl=$('calcDl');
    if(cp)cp.addEventListener('click',function(){
      var s=summary();if(!s)return;
      var done=function(){toolMsg(tr('Samantektin er afrituð. Þú getur límt hana inn í tölvupóst eða skjal.','The summary is copied. You can paste it into an email or a document.'))};
      var fail=function(){if(copyOld(s))done();else{manual(s);toolMsg(tr('Ekki tókst að afrita sjálfkrafa. Textinn er valinn hér fyrir neðan, afritaðu hann með Ctrl+C eða Cmd+C.','Automatic copying did not work. The text is selected below; copy it with Ctrl+C or Cmd+C.'))}};
      try{if(navigator.clipboard&&window.isSecureContext)navigator.clipboard.writeText(s).then(done,fail);else fail()}catch(e){fail()}
    });
    if(dl)dl.addEventListener('click',function(){
      var s=summary();if(!s)return;
      try{var u=URL.createObjectURL(new Blob(['﻿'+s.replace(/\n/g,'\r\n')],{type:'text/plain;charset=utf-8'})),a=document.createElement('a');a.href=u;a.download=tr('verdhugmynd-p-blondal.txt','price-estimate-p-blondal.txt');document.body.appendChild(a);a.click();setTimeout(function(){URL.revokeObjectURL(u);a.remove()},1000);toolMsg('')}
      catch(e){manual(s);toolMsg(tr('Ekki tókst að sækja skrána. Textinn er hér fyrir neðan til að afrita.','The file could not be downloaded. The text is below for you to copy.'))}
    });

    /* ---------- fyrirspurn út frá verðhugmyndinni: form í glugga, með verðhugmyndinni og forsendunum ---------- */
    var dlg=$('calcDlg'),df=$('calcQuote'),dm=$('calcDlgMsg'),back=null;
    function stopScroll(on){var l=window.pbLenis;if(l){try{on?l.stop():l.start()}catch(e){}}document.documentElement.classList.toggle('dlg-open',!!on)}
    function fillDialog(){
      var inc=rng(est.ilo,est.ihi),ex=rng(est.lo,est.hi);
      $('calcDlgEst').innerHTML='<div class="qest-h"><span>'+tr('Verðhugmyndin sem fylgir','The estimate that goes with it')+'</span><b>'+ex+' <small>'+tr('án VSK','excl. VAT')+'</small></b><em>'+inc+' '+tr('með VSK','incl. VAT')+' · '+tr('VSK 24%','VAT 24%')+': '+rng(est.ilo-est.lo,est.ihi-est.hi)+'</em></div>'+
        '<ul class="qest-l">'+est.txt.concat(['- '+est.cond]).map(function(t){return '<li>'+esc(t.replace(/^- /,''))+'</li>'}).join('')+'</ul>'+
        '<button type="button" class="qest-edit" data-close>'+tr('Breyta forsendum í reiknivélinni','Change the details in the calculator')+'</button>';
    }
    /* án <dialog> (mjög gamlir vafrar): verðhugmyndin fer inn í tilboðsformið neðst eins og áður */
    function fallback(){
      var ly=$('lysing');
      if(ly){var i=ly.value.indexOf(CALC_HEAD);ly.value=(i>-1?ly.value.slice(0,i).trim():ly.value.trim());ly.value=(ly.value?ly.value+'\n\n':'')+calcText}
      var map={skurdur:'c3',dren:'c3',plan:'c4',grunnur:'c4',jofnun:'c4',pottur:'c1',holur:'c1',stubbar:'c1',sogun:'c5'},first=ORDER.filter(function(k){return sel[k]})[0],r=first&&$(map[first]);
      if(r)r.checked=true;
      var h=$('hafa-samband');if(h)h.scrollIntoView({behavior:reduce?'auto':'smooth'});
    }
    C.addEventListener('click',function(e){
      e.preventDefault();
      if(!est)return;
      if(!dlg||typeof dlg.showModal!=='function'){fallback();return}
      fillDialog();if(dm){dm.hidden=true;dm.textContent=''}
      back=document.activeElement;
      dlg.showModal();stopScroll(true);
      var n=$('d-nafn');if(n)n.focus();
    });
    if(dlg){
      dlg.addEventListener('close',function(){stopScroll(false);if(back&&back.focus)back.focus()});
      dlg.addEventListener('click',function(e){if(e.target===dlg||(e.target.closest&&e.target.closest('[data-close]')))dlg.close()});
    }
    if(df){
      F.live(df);
      df.addEventListener('submit',function(e){
        e.preventDefault();
        if(!est)return;
        var n=df.nafn.value.trim();
        var checks=[F.required(df.nafn,'Vinsamlegast skráðu nafn.','Please enter your name.')].concat(F.phone(df.simi),F.email(df.netfang),[F.required(df.stadur,'Vinsamlegast skráðu staðsetningu verksins.','Please enter the location of the job.')]);
        if(!F.check(df,dm,checks))return;
        if(df._honey.value)return;
        var jobs=est.ids.map(function(id){return JOBS[id].n}).join(', ');
        var data={
          'Nafn':n,
          'Sími':df.simi.value.trim(),
          'email':df.netfang.value.trim(),
          'Tegund verks':tr('Úr verðreiknivél: ','From the price calculator: ')+jobs,
          'Staðsetning':df.stadur.value.trim(),
          'Hvenær':df.hvenaer.value,
          'Verðhugmynd':calcText,
          'Nánari upplýsingar':df.lysing.value.trim()||'-'
        };
        if(EN)data['Tungumál']='Enska (English)';
        data['_subject']=tr('Fyrirspurn úr verðreiknivél: ','Price calculator enquiry (English site): ')+jobs+' ('+n+')';
        data['_template']='table';
        data['_autoresponse']=AUTORESPONSE;
        data['_captcha']='false';
        F.send(df,dm,data,function(){return tr('Takk, '+F.first(n)+'. Fyrirspurnin og verðhugmyndin eru komnar til okkar og við höfum samband fljótlega.','Thanks, '+F.first(n)+'. We have received your enquiry and the estimate, and will be in touch soon.')});
      });
    }
  })();

  /* ---------- tilboðsformið neðst á síðunni ---------- */
  var f=document.getElementById('quote'),m=document.getElementById('msg');
  F.live(f);
  f.addEventListener('submit',function(e){
    e.preventDefault();
    var n=f.nafn.value.trim(),p=f.simi.value.trim(),em=f.netfang.value.trim();
    var checks=[F.required(f.nafn,'Vinsamlegast skráðu nafn.','Please enter your name.')].concat(F.phone(f.simi),F.email(f.netfang),[
      F.required(f.stadur,'Vinsamlegast skráðu staðsetningu verksins.','Please enter the location of the job.'),
      F.required(f.lysing,'Vinsamlegast lýstu verkinu í stuttu máli.','Please describe the job briefly.')]);
    if(!F.check(f,m,checks))return;
    if(f._honey.value){return}
    var tegund=(f.querySelector('input[name="tegund"]:checked')||{}).value||'';
    /* the e-mail to P. Blöndal keeps Icelandic field names; English enquiries are marked with Tungumál */
    var data={
      'Nafn':n,
      'Sími':p,
      'email':em,
      'Tegund verks':tegund,
      'Staðsetning':f.stadur.value.trim(),
      'Hvenær':f.hvenaer.value,
      'Lýsing':f.lysing.value.trim()
    };
    if(EN)data['Tungumál']='Enska (English)';
    data['_subject']=tr('Ný fyrirspurn af vefnum: ','New enquiry (English site): ')+tegund+' ('+n+')';
    data['_template']='table';
    data['_autoresponse']=AUTORESPONSE;
    data['_captcha']='false';
    F.send(f,m,data,function(){return tr('Takk, '+n.split(' ')[0]+'. Fyrirspurnin er komin til okkar og við höfum samband fljótlega.','Thanks, '+n.split(' ')[0]+'. We have received your enquiry and will be in touch soon.')});
  });
})();
