/* Verðreiknivél og tilboðsform á forsíðu P. Blöndal.
   Verðin eru í P hér fyrir neðan, öll án VSK. Fyrirspurnir fara á petur@pblondal.is í gegnum FormSubmit. */
(function(){
  /* price calculator
     Prices are P. Blöndal's own (ISK, ex VAT). Hours come from typical 3 t mini excavator output.
     Change the numbers in P and RATE to update every estimate. */
  (function(){
    var P={grafa:11900,madur:12990,verkamadur:9500,ferd:25900,hola:12500,sogun:7500,hellur:8500,sandur:2700,burdarlag:1953,drenmol:1372};
    /* efni á tonn án VSK: sandur = verð P. Blöndal, burðarlag og drenmöl = listaverð Steypustöðvar með kolefnisgjaldi */
    var DENS={sandur:1.6,burdarlag:2.0,drenmol:1.27};   /* tonn á m³ */
    var TRUCK_T=15,TRUCK_M3=10,SWELL=1.25;              /* hámark í hverri ferð vörubíls, losun uppgraftar */
    var MATN={sandur:'Sandur',burdarlag:'Burðarlag',drenmol:'Drenmöl'};
    var RATE=P.grafa+P.madur;            /* grafa + gröfumaður á klst. */
    /* skóflumaður (skóflumaður) með gröfumanni, hlutfall af vélartíma: lagnavinna, drenlögn og plön þurfa alltaf aukamann. Skóflumaður 9.500 kr. á klst. án vsk. */
    var CREW={skurdur:1,dren:1,plan:1,pottur:.5,grunnur:.5};
    var FLUTNINGUR=P.ferd;               /* flutningur tækja á staðinn (ein ferð vörubíls) */
    var LOW=0.9,HIGH=1.3,VSK=0.24;
    var DIG_TRENCH=5.5,DIG_HOUSE=4.5,DIG_BULK=8,FILL=12,GRADE=60,LEVEL=40;   /* m³ eða m² á klst. */
    var JOBS={
      skurdur:{n:'Lagnaskurður',f:[['L','Lengd skurðar','m',1,10],['d','Dýpt',[[0.6,'Um 60 cm'],[1,'Um 1 m'],[1.5,'Um 1,5 m']],1],['b','Mokað aftur í skurðinn?',[[1,'Já'],[0,'Nei']],1]],
        c:function(v,s,a){var w=v.d<=0.6?0.4:v.d<=1?0.5:0.7,V=v.L*w*v.d,sd=v.L*w*0.3;return {h:V/(DIG_TRENCH*s*a)+(v.b?V/(FILL*a):0),mat:{sandur:sd},out:v.b?sd:V,t:fq(v.L)+' m, '+fq(v.d)+' m djúpur'}},
        note:'Gröfumaður og skóflumaður vinna saman við lögnina. Sandur undir og yfir lögn reiknast með ef efni er valið. Lagnaefni ekki innifalið.'},
      dren:{n:'Drenlögn kringum hús',f:[['L','Ummál hússins','m',1,40],['d','Dýpt niður að sökkli',[[1,'Um 1 m'],[1.5,'Um 1,5 m'],[2,'Um 2 m']],1.5]],
        c:function(v,s,a){var V=v.L*0.8*v.d,dm=v.L*0.15;return {h:V/(DIG_HOUSE*s*a)+V/(10*a),mat:{drenmol:dm},out:dm,t:fq(v.L)+' m, '+fq(v.d)+' m djúpt'}},
        note:'Unnið varlega upp við sökkul, með skóflumanni í handgreftri. Drenmöl reiknast með ef efni er valið. Drenrör og dúkur ekki innifalin.'},
      plan:{n:'Innkeyrsla, plan eða verönd',f:[['A','Flatarmál','m²',5,40],['d','Tegund',[[0.3,'Verönd eða stétt'],[0.5,'Innkeyrsla eða bílaplan']],0.5],['hl','Hellulögn líka?',[[1,'Já, hellulögn líka'],[0,'Nei, bara undirvinna']],1]],
        c:function(v,s,a){var V=v.A*v.d;return {h:V/(DIG_BULK*s*a)+V/(FILL*a)+v.A/(LEVEL*a),fast:v.hl?v.A*P.hellur:0,mat:{burdarlag:v.A*(v.d-0.05),sandur:v.hl?v.A*0.05:0},out:V,t:fq(v.A)+' m²'+(v.hl?' með hellulögn':' undirvinna')}},
        note:'Innifalið: uppgröftur, fylling og jöfnun, með skóflumanni við þjöppun. Burðarlag og hellusandur reiknast með ef efni er valið. Hellur ekki innifaldar.'},
      holur:{n:'Undirstöður fyrir pall eða girðingu',f:[['n','Fjöldi hola','stk.',1,8]],
        c:function(v){return {h:0,fast:v.n*P.hola,out:v.n*0.1,t:fq(v.n)+' holur'}},
        note:'Gröftur við einfaldar aðstæður. Steypa og frágangur ekki innifalin.'},
      pottur:{n:'Heitur pottur',f:[['n','Fjöldi potta','stk.',1,1]],
        c:function(v,s,a){return {h:v.n*(1.5/s+0.5)/a,mat:{burdarlag:v.n*1.25},out:v.n*3.75,t:fq(v.n)+' stk.'}},
        note:'Gröftur og jöfnun undir hefðbundinn pott, skóflumaður hluta verksins. Möl undir pottinn reiknast með ef efni er valið. Lagnir ekki innifaldar.'},
      grunnur:{n:'Grunnur fyrir smáhýsi',f:[['A','Grunnflötur','m²',5,20],['d','Dýpt',[[0.6,'Um 60 cm, léttar undirstöður'],[1.2,'Um 1,2 m, frostfrítt']],1.2]],
        c:function(v,s,a){var sd=v.A?Math.sqrt(v.A)+1:0,V=sd*sd*v.d;return {h:V/(DIG_BULK*s*a)+v.A/(30*a),out:V,t:fq(v.A)+' m², '+fq(v.d)+' m'}},
        note:'Miðað við að grafið sé um 50 cm út fyrir grunninn, skóflumaður hluta verksins. Fylling ekki innifalin.'},
      jofnun:{n:'Lóðajöfnun og garður',f:[['A','Flatarmál','m²',10,100]],
        c:function(v,s,a){return {h:v.A/(GRADE*a)*(s<0.8?1.3:1),t:fq(v.A)+' m²'}},
        note:'Jöfnun og mótun á staðnum. Mold og þökur ekki innifalin.'},
      stubbar:{n:'Trjástubbar og stórir steinar',f:[['n','Fjöldi','stk.',1,3]],
        c:function(v,s,a){return {h:v.n*0.4/a,t:fq(v.n)+' stk.'}},
        note:'Förgun á stubbum og grjóti ekki innifalin.'},
      sogun:{n:'Steypusögun',f:[['L','Lengd sögunar','m',1,3]],
        c:function(v){return {h:0,fast:v.L*P.sogun,t:fq(v.L)+' m'}},
        note:'Miðað við venjulega veggja- eða plötuþykkt.'}
    };
    var ORDER=['skurdur','dren','plan','holur','pottur','grunnur','jofnun','stubbar','sogun'];
    var V={},sel={},calcText='';
    var MAX={L:500,A:2000,n:50};   /* hámark í hverjum reit svo innsláttarvilla gefi ekki fráleitt verð */
    function cap(k,x){return Math.min(x,MAX[k]||1e4)}
    function num(x){x=String(x).replace(/\s/g,'').replace(',','.');var y=parseFloat(x);return isFinite(y)&&y>0?y:0}
    function fq(x){return String(Math.round(x*10)/10).replace('.',',')}
    function fmt(x){return String(Math.round(x)).replace(/\B(?=(\d{3})+(?!\d))/g,'.')+' kr.'}
    function r1000(x){return Math.round(x/1000)*1000}
    function radio(name){var r=document.querySelector('input[name="'+name+'"]:checked');return r?+r.value:1}
    function esc(s){return String(s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}

    function panel(id){
      var J=JOBS[id];V[id]=V[id]||{};
      var g=J.f.map(function(f){
        var key=f[0],fid='c-'+id+'-'+key;
        if(V[id][key]==null)V[id][key]=Array.isArray(f[2])?f[3]:f[4];
        if(Array.isArray(f[2]))return '<div class="of"><span class="l">'+f[1]+'</span><div class="seg">'+f[2].map(function(o){return '<label><input type="radio" name="'+fid+'" data-job="'+id+'" data-k="'+key+'" value="'+o[0]+'"'+(V[id][key]==o[0]?' checked':'')+'><span>'+o[1]+'</span></label>'}).join('')+'</div></div>';
        return '<div class="of"><label for="'+fid+'">'+f[1]+' <em>('+f[2]+')</em></label><div class="qty"><button type="button" data-job="'+id+'" data-k="'+key+'" data-step="-'+f[3]+'" aria-label="Minnka">−</button><input id="'+fid+'" inputmode="decimal" data-job="'+id+'" data-k="'+key+'" value="'+fq(V[id][key])+'"><button type="button" data-job="'+id+'" data-k="'+key+'" data-step="'+f[3]+'" aria-label="Auka">+</button></div></div>';
      }).join('');
      return '<div class="opt" data-panel="'+id+'"><div class="opt-h"><b>'+J.n+'</b><span id="cr-'+id+'"></span></div><div class="opt-g">'+g+'</div><p class="opt-note">'+J.note+'</p></div>';
    }
    function drawPanels(){
      var ids=ORDER.filter(function(k){return sel[k]}),o=document.getElementById('opts');
      o.innerHTML=ids.length?ids.map(panel).join(''):'<div class="calc-empty">Veldu verk hér að ofan til að setja inn umfang.</div>';
      calc();
    }
    function calc(){
      var s=radio('soil'),a=radio('acc'),ids=ORDER.filter(function(k){return sel[k]});
      var R=document.getElementById('calcRange'),T=document.getElementById('calcVat'),L=document.getElementById('calcLines'),C=document.getElementById('calcCta');
      var M=document.getElementById('calcMini');
      if(!ids.length){M.dataset.on='';showMini();R.textContent='Veldu verk';T.textContent='Verðhugmyndin birtist hér um leið og þú velur verk.';L.hidden=true;C.setAttribute('aria-disabled','true');calcText='';return}
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
        txt.push('- '+JOBS[id].n+': '+r.t+(cw?(cw<1?', skóflumaður hluta verks':', með skóflumanni'):'')+' (u.þ.b. '+fmt(lo)+' – '+fmt(hi)+')');
      });
      if(!rows.length){M.dataset.on='';showMini();R.textContent='Sláðu inn stærð';T.textContent='Fylltu inn stærð verksins til að fá verðhugmynd.';L.hidden=true;C.setAttribute('aria-disabled','true');calcText='';return}
      tot+=FLUTNINGUR;
      rows.push('<div><span>Flutningur tækja á staðinn</span><span>'+fmt(r1000(FLUTNINGUR*LOW))+' – '+fmt(r1000(FLUTNINGUR*HIGH))+'</span></div>');
      function line(label,cost,extra){tot+=cost;rows.push('<div><span>'+label+'</span><span>'+fmt(r1000(cost*LOW))+' – '+fmt(r1000(cost*HIGH))+'</span></div>');txt.push('- '+label+(extra||'')+' (u.þ.b. '+fmt(r1000(cost*LOW))+' – '+fmt(r1000(cost*HIGH))+')')}
      if(wantMat){
        var tons=0,mcost=0,parts=[];
        Object.keys(mt).forEach(function(k){var tn=Math.ceil(mt[k]*2)/2;if(!tn)return;tons+=tn;mcost+=tn*P[k];parts.push(MATN[k]+' '+fq(tn)+' t')});
        if(tons){line('Efni: '+parts.join(', '),mcost);var trips=Math.ceil(tons/TRUCK_T);line('Akstur efnis, '+trips+(trips===1?' ferð':' ferðir'),trips*P.ferd)}
      }
      if(wantHaul&&outM3>0.2){var ht=Math.ceil(outM3*SWELL/TRUCK_M3);line('Brottflutningur uppgraftar, '+ht+(ht===1?' ferð':' ferðir'),ht*P.ferd,', um '+fq(outM3*SWELL)+' m³')}
      var lo=r1000(tot*LOW),hi=r1000(tot*HIGH);
      R.textContent=fmt(lo)+' – '+fmt(hi);
      document.getElementById('calcMiniV').textContent=fmt(lo)+' – '+fmt(hi);M.dataset.on='1';showMini();
      T.textContent='Með VSK: '+fmt(r1000(lo*(1+VSK)))+' – '+fmt(r1000(hi*(1+VSK)));
      if(hrs)rows.push('<div style="font-weight:700"><span>Áætlaður vinnutími gröfu</span><span>'+fq(Math.max(0.5,hrs*LOW))+' – '+fq(hrs*HIGH)+' klst.</span></div>');
      if(helper)rows.push('<div style="font-weight:700"><span>Þar af með skóflumanni</span><span>'+fq(Math.max(0.5,helper*LOW))+' – '+fq(helper*HIGH)+' klst.</span></div>');
      L.innerHTML=rows.join('');L.hidden=false;C.setAttribute('aria-disabled','false');
      var soilL=(document.querySelector('input[name="soil"]:checked')||{}).parentNode,accL=(document.querySelector('input[name="acc"]:checked')||{}).parentNode;
      calcText='Verðhugmynd úr reiknivél:\n'+txt.join('\n')+'\n- Jarðvegur: '+(soilL?soilL.textContent:'')+', aðgengi: '+(accL?accL.textContent:'')+(wantMat?'':', efni útvegað af viðskiptavini')+'\nSamtals án VSK: '+fmt(lo)+' – '+fmt(hi)+' (með VSK: '+fmt(r1000(lo*(1+VSK)))+' – '+fmt(r1000(hi*(1+VSK)))+')';
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
      if(ly){var i=ly.value.indexOf('Verðhugmynd úr reiknivél:');ly.value=(i>-1?ly.value.slice(0,i).trim():ly.value.trim());ly.value=(ly.value?ly.value+'\n\n':'')+calcText}
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
      [f.nafn,!n,'Vinsamlegast skráðu nafn.'],
      [f.simi,!p,'Vinsamlegast skráðu símanúmer.'],
      [f.simi,p&&p.replace(/\D/g,'').length<7,'Símanúmerið virðist ekki rétt slegið inn.'],
      [f.netfang,!em,'Vinsamlegast skráðu netfang.'],
      [f.netfang,em&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em),'Netfangið virðist ekki rétt slegið inn.'],
      [f.stadur,!f.stadur.value.trim(),'Vinsamlegast skráðu staðsetningu verksins.'],
      [f.lysing,!f.lysing.value.trim(),'Vinsamlegast lýstu verkinu í stuttu máli.']
    ];
    f.querySelectorAll('.bad').forEach(function(x){x.classList.remove('bad')});
    for(var i=0;i<checks.length;i++){if(checks[i][1]){var el=checks[i][0];el.classList.add('bad');m.className='msg err';m.textContent=checks[i][2];el.focus();return}}
    if(f._honey.value){return}
    var tegund=(f.querySelector('input[name="tegund"]:checked')||{}).value||'';
    var data={
      'Nafn':n,
      'Sími':p,
      'email':em,
      'Tegund verks':tegund,
      'Staðsetning':f.stadur.value.trim(),
      'Hvenær':f.hvenaer.value,
      'Lýsing':f.lysing.value.trim(),
      '_subject':'Ný fyrirspurn af vefnum: '+tegund+' ('+n+')',
      '_template':'table',
      '_autoresponse':'Takk fyrir fyrirspurnina til P. Blöndal ehf. Við höfum fengið hana og höfum samband fljótlega, yfirleitt samdægurs. Ef málið er brýnt geturðu hringt beint í 773-3363.',
      '_captcha':'false'
    };
    var btn=f.querySelector('button[type="submit"]');
    btn.disabled=true;btn.style.opacity='.6';
    m.className='msg';m.textContent='Sendi fyrirspurn…';
    fetch('https://formsubmit.co/ajax/petur@pblondal.is',{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify(data)})
      .then(function(r){return r.json().catch(function(){return {}}).then(function(j){if(!r.ok||String(j.success)!=='true')throw new Error(j.message||r.status);return j})})
      .then(function(){
        m.className='msg';
        m.textContent='Takk, '+n.split(' ')[0]+'. Fyrirspurnin er komin til okkar og við höfum samband fljótlega.';
        f.reset();
      })
      .catch(function(){
        m.className='msg err';
        m.textContent='Ekki tókst að senda fyrirspurnina. Reyndu aftur eða hringdu í 773-3363, eða sendu póst á petur@pblondal.is.';
      })
      .finally(function(){btn.disabled=false;btn.style.opacity=''});
  });
})();
