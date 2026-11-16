/* Fyrirspurnir af vefnum P. Blöndal: sameiginlegt fyrir öll form.
   - tilboðsformið á forsíðunum (#quote, js/forsida/reiknivel.js)
   - fyrirspurn út frá verðhugmynd úr reiknivélinni (#calcQuote, sama skrá)
   - samstarfsfyrirspurn á /fyrirtaeki/ og /en/business/ (js/samstarf.js)
   Allt fer á petur@pblondal.is í gegnum FormSubmit (formsubmit.co), eins og áður.
   Staðfesting birtist aðeins þegar FormSubmit svarar success: true. Annars birtist villa með síma og tengli sem opnar
   tölvupóst á petur@pblondal.is með fyrirspurninni, svo hún komist til skila þótt FormSubmit svari ekki.
   Textar eru í tr('íslenska', 'English'); tungumálið ræðst af <html lang>. */
(function () {
  var EN = (document.documentElement.lang || '').slice(0, 2) === 'en';
  function tr(is, en) { return EN ? en : is; }
  var ENDPOINT = 'https://formsubmit.co/ajax/petur@pblondal.is';
  var EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  /* sendir gögnin; hafnar (reject) nema FormSubmit staðfesti móttöku.
     FormSubmit svarar með JSON (stundum merkt text/html) og success: "true" eða "false"; ástæðan fylgir í message,
     t.d. ef netfangið þarfnast virkjunar. Hættir að bíða eftir 20 sekúndur. */
  function post(data) {
    var ctl = window.AbortController ? new AbortController() : null;
    var timer = ctl ? setTimeout(function () { ctl.abort(); }, 20000) : 0;
    return fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }, body: JSON.stringify(data), signal: ctl ? ctl.signal : undefined })
      .then(function (r) {
        return r.text().then(function (t) {
          var j = {}; try { j = JSON.parse(t); } catch (e) {}
          if (!r.ok || String(j.success) !== 'true') { var err = new Error(j.message || ('HTTP ' + r.status)); err.reason = j.message || ('HTTP ' + r.status); throw err; }
          return j;
        });
      })
      .finally(function () { clearTimeout(timer); });
  }

  /* tölvupóstur með sömu fyrirspurn, ef sendingin tekst ekki */
  function mailto(data) {
    var lines = [];
    Object.keys(data).forEach(function (k) { if (k.charAt(0) !== '_' && data[k] && data[k] !== '-') lines.push((k === 'email' ? tr('Netfang', 'Email') : k) + ': ' + data[k]); });
    return 'mailto:petur@pblondal.is?subject=' + encodeURIComponent(data._subject || tr('Fyrirspurn af vefnum', 'Enquiry from the website')) + '&body=' + encodeURIComponent(lines.join('\n'));
  }

  /* algengar villuprófanir: [reitur, villa?, skilaboð] */
  function required(el, is, en) { return [el, !el.value.trim(), tr(is, en)]; }
  function phone(el) {
    var p = el.value.trim();
    return [[el, !p, tr('Vinsamlegast skráðu símanúmer.', 'Please enter your phone number.')],
            [el, p && p.replace(/\D/g, '').length < 7, tr('Símanúmerið virðist ekki rétt slegið inn.', 'The phone number does not look right.')]];
  }
  function email(el) {
    var e = el.value.trim();
    return [[el, !e, tr('Vinsamlegast skráðu netfang.', 'Please enter your email.')],
            [el, e && !EMAIL.test(e), tr('Netfangið virðist ekki rétt slegið inn.', 'The email address does not look right.')]];
  }

  /* fer yfir reitina í röð og sýnir fyrstu villuna; skilar true ef allt er í lagi */
  function check(form, msg, checks) {
    form.querySelectorAll('.bad').forEach(function (x) { x.classList.remove('bad'); x.removeAttribute('aria-invalid'); });
    for (var i = 0; i < checks.length; i++) {
      if (checks[i][1]) {
        var el = checks[i][0];
        el.classList.add('bad'); el.setAttribute('aria-invalid', 'true');
        msg.hidden = false; msg.className = 'msg err'; msg.textContent = checks[i][2];
        el.focus();
        return false;
      }
    }
    return true;
  }

  /* sendir og sýnir stöðuna í msg; ok(): skilar þakkartextanum eftir staðfesta sendingu */
  function send(form, msg, data, ok) {
    var btn = form.querySelector('button[type="submit"]');
    if (PB.preview) {   /* forskoðun utan pblondal.is: ekkert er sent og það kemur skýrt fram */
      msg.hidden = false; msg.className = 'msg';
      msg.textContent = tr('Þetta er forskoðun, svo ekkert var sent. Á pblondal.is fer fyrirspurnin beint til okkar.', 'This is a preview, so nothing was sent. On pblondal.is the enquiry goes straight to us.');
      return Promise.resolve(false);
    }
    if (btn) { btn.disabled = true; btn.style.opacity = '.6'; }
    msg.hidden = false; msg.className = 'msg'; msg.textContent = tr('Sendi fyrirspurn…', 'Sending your enquiry…');
    return PB.post(data)
      .then(function () { msg.className = 'msg ok'; msg.textContent = ok(); form.reset(); return true; })
      .catch(function (err) {
        if (window.console) console.warn('FormSubmit:', err && (err.reason || err.message));
        msg.className = 'msg err';
        msg.textContent = tr('Ekki tókst að senda fyrirspurnina. Reyndu aftur, hringdu í 773-3363 eða ', 'Your enquiry could not be sent. Please try again, call 773-3363 or ');
        var a = document.createElement('a');
        a.href = mailto(data);
        a.textContent = tr('sendu hana í tölvupósti á petur@pblondal.is', 'send it by email to petur@pblondal.is');
        msg.appendChild(a);
        msg.appendChild(document.createTextNode(tr(' (textinn fylgir með).', ' (the text is filled in for you).')));
        return false;
      })
      .finally(function () { if (btn) { btn.disabled = false; btn.style.opacity = ''; } });
  }

  /* fyrsta orðið í nafni, fyrir þakkarkveðjuna */
  function first(n) { return String(n).trim().split(/\s+/)[0]; }

  /* villumerking hverfur um leið og skrifað er í reitinn */
  function live(form) { form.addEventListener('input', function (e) { if (e.target.classList) { e.target.classList.remove('bad'); e.target.removeAttribute('aria-invalid'); } }); }

  var PB = window.PBForm = { EN: EN, tr: tr, post: post, mailto: mailto, required: required, phone: phone, email: email, check: check, send: send, first: first, live: live, preview: false };
})();
