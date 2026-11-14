/* Verðreiknivél og tilboðsform á forsíðu P. Blöndal, bæði á íslensku (/) og ensku (/en/).
   Verðin eru í P hér fyrir neðan, öll án VSK, og gilda fyrir báðar síðurnar.
   Textar eru í tr('íslenska', 'English'); tungumálið ræðst af <html lang>.
   Fyrirspurnir fara á petur@pblondal.is í gegnum FormSubmit. */
(function(){
  var EN=(document.documentElement.lang||'').slice(0,2)==='en';
  function tr(is,en){return EN?en:is}
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
    var LOW=0.9,HIGH=1.3,VSK=0.24;
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
    var V={},sel={},calcText='';
    var CALC_HEAD=tr('Verðhugmynd úr reiknivél:','Estimate from the price calculator:');
    var MAX={L:500,A:2000,n:50};   /* hámark í hverjum reit svo innsláttarvilla gefi ekki fráleitt verð */
    function cap(k,x){return Math.min(x,MAX[k]||1e4)}
    function num(x){x=String(x).replace(/\s/g,'').replace(',','.');var y=parseFloat(x);return isFinite(y)&&y>0?y:0}
    function fq(x){var s=String(Math.round(x*10)/10);return EN?s:s.replace('.',',')}
    function fmt(x){return String(Math.round(x)).replace(/\B(?=(\d{3})+(?!\d))/g,EN?',':'.')+(EN?' ISK':' kr.')}
    function r1000(x){return Math.round(x/1000)*1000}
    function radio(name){var r=document.querySelector('input[name="'+name+'"]:checked');return r?+r.value:1}
    function esc(s){return String(s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
    function trips(n){return n+(n===1?tr(' ferð',' trip'):tr(' ferðir',' trips'))}

    function panel(id){
      var J=JOBS[id];V[id]=V[id]||{};
      var g=J.f.map(function(f){
        var key=f[0],fid='c-'+id+'-'+key;
        if(V[id][key]==null)V[id][key]=Array.isArray(f[2])?f[3]:f[4];
        if(Array.isArray(f[2]))return '<div class="of"><span class="l">'+f[1]+'</span><div class="seg">'+f[2].map(function(o){return '<label><input type="radio" name="'+fid+'" data-job="'+id+'" data-k="'+key+'" value="'+o[0]+'"'+(V[id][key]==o[0]?' checked':'')+'><span>'+o[1]+'</span></label>'}).join('')+'</div></div>';
        return '<div class="of"><label for="'+fid+'">'+f[1]+' <em>('+f[2]+')</em></label><div class="qty"><button type="button" data-job="'+id+'" data-k="'+key+'" data-step="-'+f[3]+'" aria-label="'+tr('Minnka','Decrease')+'">−</button><input id="'+fid+'" inputmode="decimal" data-job="'+id+'" data-k="'+key+'" value="'+fq(V[id][key])+'"><button type="button" data-job="'+id+'" data-k="'+key+'" data-step="'+f[3]+'" aria-label="'+tr('Auka','Increase')+'">+</button></div></div>';
      }).join('');
      return '<div class="opt" data-panel="'+id+'"><div class="opt-h"><b>'+J.n+'</b><span id="cr-'+id+'"></span></div><div class="opt-g">'+g+'</div><p class="opt-note">'+J.note+'</p></div>';
    }
    function drawPanels(){
      var ids=ORDER.filter(function(k){return sel[k]}),o=document.getElementById('opts');
      o.innerHTML=ids.length?ids.map(panel).join(''):'<div class="calc-empty">'+tr('Veldu verk hér að ofan til að setja inn umfang.','Choose a job above to enter its size.')+'</div>';
      calc();
    }
    function calc(){
      var s=radio('soil'),a=radio('acc'),ids=ORDER.filter(function(k){return sel[k]});
      var R=document.getElementById('calcRange'),T=document.getElementById('calcVat'),L=document.getElementById('calcLines'),C=document.getElementById('calcCta');
      var M=document.getElementById('calcMini');
      if(!ids.length){M.dataset.on='';showMini();R.textContent=tr('Veldu verk','Choose a job');T.textContent=tr('Verðhugmyndin birtist hér um leið og þú velur verk.','Your estimate appears here as soon as you choose a job.');L.hidden=true;C.setAttribute('aria-disabled','true');calcText='';return}
      var tot=0,hrs=0,helper=0,rows=[],txt=[],mt={},outM3=0,wantMat=radio('mat')===1,wantHaul=radio('haul')===1;
      ids.forEach(function(id){
        var r=JOBS[id].c(V[id],s,a),h=Math.ceil((r.h||0)*4)/4,cw=CREW[id]||0,cost=h*RATE+h*cw*P.verkamadur+(r.fast||0);helper+=h*cw;
        if(r.mat)Object.keys(r.mat).forEach(function(k){mt[k]=(mt[k]||0)+r.mat[k]*DENS[k]});
        outM3+=r.out||0;
        tot+=cost;hrs+=h;
        var lo=r1000(cost*LOW),hi=r1000(cost*HIGH),el=document.getElementById('cr-'+id);
        if(el)el.textContent=cost?fmt(lo)+' – '+fmt(hi):'';
        if(!cost)return;
        rows.push('<div><span>'+esc(JOBS[id].n)+'</span><span>'+fmt(lo)+' – '+fmt(hi)+'</span></div>');
        txt.push('- '+JOBS[id].n+': '+r.t+(cw?(cw<1?tr(', skóflumaður hluta verks',', labourer for part of the job'):tr(', með skóflumanni',', with a labourer')):'')+tr(' (u.þ.b. ',' (approx. ')+fmt(lo)+' – '+fmt(hi)+')');
      });
      if(!rows.length){M.dataset.on='';showMini();R.textContent=tr('Sláðu inn stærð','Enter the size');T.textContent=tr('Fylltu inn stærð verksins til að fá verðhugmynd.','Enter the size of the job to get a price estimate.');L.hidden=true;C.setAttribute('aria-disabled','true');calcText='';return}
      tot+=FLUTNINGUR;
      rows.push('<div><span>'+tr('Flutningur tækja á staðinn','Machine transport to site')+'</span><span>'+fmt(r1000(FLUTNINGUR*LOW))+' – '+fmt(r1000(FLUTNINGUR*HIGH))+'</span></div>');
      function line(label,cost,extra){tot+=cost;rows.push('<div><span>'+label+'</span><span>'+fmt(r1000(cost*LOW))+' – '+fmt(r1000(cost*HIGH))+'</span></div>');txt.push('- '+label+(extra||'')+tr(' (u.þ.b. ',' (approx. ')+fmt(r1000(cost*LOW))+' – '+fmt(r1000(cost*HIGH))+')')}
      if(wantMat){
        var tons=0,mcost=0,parts=[];
        Object.keys(mt).forEach(function(k){var tn=Math.ceil(mt[k]*2)/2;if(!tn)return;tons+=tn;mcost+=tn*P[k];parts.push(MATN[k]+' '+fq(tn)+' t')});
        if(tons){line(tr('Efni: ','Materials: ')+parts.join(', '),mcost);var tr1=Math.ceil(tons/TRUCK_T);line(tr('Akstur efnis, ','Material delivery, ')+trips(tr1),tr1*P.ferd)}
      }
      if(wantHaul&&outM3>0.2){var ht=Math.ceil(outM3*SWELL/TRUCK_M3);line(tr('Brottflutningur uppgraftar, ','Soil removal, ')+trips(ht),ht*P.ferd,tr(', um ',', approx. ')+fq(outM3*SWELL)+' m³')}
      var lo=r1000(tot*LOW),hi=r1000(tot*HIGH);
      R.textContent=fmt(lo)+' – '+fmt(hi);
      document.getElementById('calcMiniV').textContent=fmt(lo)+' – '+fmt(hi);M.dataset.on='1';showMini();
      T.textContent=tr('Með VSK: ','Incl. VAT: ')+fmt(r1000(lo*(1+VSK)))+' – '+fmt(r1000(hi*(1+VSK)));
      if(hrs)rows.push('<div style="font-weight:700"><span>'+tr('Áætlaður vinnutími gröfu','Estimated excavator time')+'</span><span>'+fq(Math.max(0.5,hrs*LOW))+' – '+fq(hrs*HIGH)+tr(' klst.',' hrs')+'</span></div>');
      if(helper)rows.push('<div style="font-weight:700"><span>'+tr('Þar af með skóflumanni','Of which with a labourer')+'</span><span>'+fq(Math.max(0.5,helper*LOW))+' – '+fq(helper*HIGH)+tr(' klst.',' hrs')+'</span></div>');
      L.innerHTML=rows.join('');L.hidden=false;C.setAttribute('aria-disabled','false');
      var soilL=(document.querySelector('input[name="soil"]:checked')||{}).parentNode,accL=(document.querySelector('input[name="acc"]:checked')||{}).parentNode;
      calcText=CALC_HEAD+'\n'+txt.join('\n')+tr('\n- Jarðvegur: ','\n- Soil: ')+(soilL?soilL.textContent:'')+tr(', aðgengi: ',', access: ')+(accL?accL.textContent:'')+(wantMat?'':tr(', efni útvegað af viðskiptavini',', customer supplies materials'))+tr('\nSamtals án VSK: ','\nTotal excl. VAT: ')+fmt(lo)+' – '+fmt(hi)+tr(' (með VSK: ',' (incl. VAT: ')+fmt(r1000(lo*(1+VSK)))+' – '+fmt(r1000(hi*(1+VSK)))+')';
    }
    var inSec=false,sumVis=false;
    function showMini(){var M=document.getElementById('calcMini');M.hidden=!(M.dataset.on&&inSec&&!sumVis)}
    if('IntersectionObserver' in window){new IntersectionObserver(function(e){inSec=e[0].isIntersecting;showMini()}).observe(document.getElementById('reiknivel'));new IntersectionObserver(function(e){sumVis=e[0].isIntersecting;showMini()}).observe(document.getElementById('calcSum'))}
    document.getElementById('calcMini').addEventListener('click',function(){document.getElementById('calcSum').scrollIntoView({behavior:'smooth',block:'start'})});
    document.getElementById('jobs').addEventListener('change',function(e){sel[e.target.value]=e.target.checked;drawPanels()});
    var opts=document.getElementById('opts');
    opts.addEventListener('input',function(e){var t=e.target;if(t.dataset.job&&t.type!=='radio'){V[t.dataset.job][t.dataset.k]=cap(t.dataset.k,num(t.value));calc()}});
    opts.addEventListener('change',function(e){var t=e.target;if(t.type==='radio'&&t.dataset.job){V[t.dataset.job][t.dataset.k]=+t.value;calc()}});
    opts.addEventListener('focusout',function(e){var t=e.target;if(t.tagName==='INPUT'&&t.type!=='radio'&&t.dataset.job)t.value=fq(V[t.dataset.job][t.dataset.k])});
    opts.addEventListener('click',function(e){var b=e.target.closest('[data-step]');if(!b)return;var j=b.dataset.job,k=b.dataset.k;V[j][k]=cap(k,Math.max(0,(V[j][k]||0)+(+b.dataset.step)));var i=document.getElementById('c-'+j+'-'+k);if(i)i.value=fq(V[j][k]);calc()});
    document.getElementById('g-soil').addEventListener('change',calc);
    try{var pv=new URLSearchParams(location.search).get('verk');if(pv&&JOBS[pv]){var cb=document.querySelector('#jobs input[value="'+pv+'"]');if(cb){cb.checked=true;sel[pv]=true;drawPanels()}}}catch(e){}
    document.getElementById('g-acc').addEventListener('change',calc);
    document.getElementById('g-mat').addEventListener('change',calc);
    document.getElementById('g-haul').addEventListener('change',calc);
    document.addEventListener('click',function(e){
      var a=e.target.closest&&e.target.closest('[data-verk]');if(!a)return;
      var v=a.getAttribute('data-verk'),cb=document.querySelector('#jobs input[value="'+v+'"]');
      if(cb&&!cb.checked){cb.checked=true;sel[v]=true;drawPanels()}
    });
    document.getElementById('calcCta').addEventListener('click',function(){
      if(!calcText)return;
      var ly=document.getElementById('lysing');
      if(ly){var i=ly.value.indexOf(CALC_HEAD);ly.value=(i>-1?ly.value.slice(0,i).trim():ly.value.trim());ly.value=(ly.value?ly.value+'\n\n':'')+calcText}
      var map={skurdur:'c3',dren:'c3',plan:'c4',grunnur:'c4',jofnun:'c4',pottur:'c1',holur:'c1',stubbar:'c1',sogun:'c5'},first=ORDER.filter(function(k){return sel[k]})[0],r=first&&document.getElementById(map[first]);
      if(r)r.checked=true;
    });
  })();

  var f=document.getElementById('quote'),m=document.getElementById('msg');
  f.addEventListener('input',function(e){e.target.classList.remove('bad')});
  f.addEventListener('submit',function(e){
    e.preventDefault();
    var n=f.nafn.value.trim(),p=f.simi.value.trim(),em=f.netfang.value.trim();
    m.hidden=false;
    var checks=[
      [f.nafn,!n,tr('Vinsamlegast skráðu nafn.','Please enter your name.')],
      [f.simi,!p,tr('Vinsamlegast skráðu símanúmer.','Please enter your phone number.')],
      [f.simi,p&&p.replace(/\D/g,'').length<7,tr('Símanúmerið virðist ekki rétt slegið inn.','The phone number does not look right.')],
      [f.netfang,!em,tr('Vinsamlegast skráðu netfang.','Please enter your email.')],
      [f.netfang,em&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em),tr('Netfangið virðist ekki rétt slegið inn.','The email address does not look right.')],
      [f.stadur,!f.stadur.value.trim(),tr('Vinsamlegast skráðu staðsetningu verksins.','Please enter the location of the job.')],
      [f.lysing,!f.lysing.value.trim(),tr('Vinsamlegast lýstu verkinu í stuttu máli.','Please describe the job briefly.')]
    ];
    f.querySelectorAll('.bad').forEach(function(x){x.classList.remove('bad')});
    for(var i=0;i<checks.length;i++){if(checks[i][1]){var el=checks[i][0];el.classList.add('bad');m.className='msg err';m.textContent=checks[i][2];el.focus();return}}
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
    data['_autoresponse']=tr('Takk fyrir fyrirspurnina til P. Blöndal ehf. Við höfum fengið hana og höfum samband fljótlega, yfirleitt samdægurs. Ef málið er brýnt geturðu hringt beint í 773-3363.','Thank you for your enquiry to P. Blöndal ehf. We have received it and will be in touch soon, usually the same day. If it is urgent, you can call us on 773-3363.');
    data['_captcha']='false';
    var btn=f.querySelector('button[type="submit"]');
    btn.disabled=true;btn.style.opacity='.6';
    m.className='msg';m.textContent=tr('Sendi fyrirspurn…','Sending your enquiry…');
    fetch('https://formsubmit.co/ajax/petur@pblondal.is',{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify(data)})
      .then(function(r){return r.json().catch(function(){return {}}).then(function(j){if(!r.ok||String(j.success)!=='true')throw new Error(j.message||r.status);return j})})
      .then(function(){
        m.className='msg';
        m.textContent=tr('Takk, '+n.split(' ')[0]+'. Fyrirspurnin er komin til okkar og við höfum samband fljótlega.','Thanks, '+n.split(' ')[0]+'. We have received your enquiry and will be in touch soon.');
        f.reset();
      })
      .catch(function(){
        m.className='msg err';
        m.textContent=tr('Ekki tókst að senda fyrirspurnina. Reyndu aftur eða hringdu í 773-3363, eða sendu póst á petur@pblondal.is.','Your enquiry could not be sent. Please try again, call 773-3363 or email petur@pblondal.is.');
      })
      .finally(function(){btn.disabled=false;btn.style.opacity=''});
  });
})();
