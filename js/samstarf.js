/* Samstarfsfyrirspurn á /fyrirtaeki/ og /en/business/.
   Sent á petur@pblondal.is í gegnum FormSubmit (js/fyrirspurn.js). Íslensk reitaheiti í póstinum á báðum síðum;
   fyrirspurnir af ensku síðunni eru merktar „Tungumál: Enska“, eins og á forsíðunni.
   Engin skráaupphleðsla: FormSubmit getur ekki sannreynt skráargerð á bakenda, svo í staðinn er reitur fyrir tengil á gögn. */
(function () {
  var F = window.PBForm, f = document.getElementById('samstarfForm'), m = document.getElementById('samstarfMsg');
  if (!F || !f || !m) return;
  var tr = F.tr;
  F.live(f);
  function url(el) {
    var v = el.value.trim();
    return [el, v && !/^https?:\/\/[^\s.]+\.[^\s]+$/i.test(v), tr('Tengillinn þarf að byrja á https:// og vísa á gögnin, til dæmis sameiginlega möppu.', 'The link needs to start with https:// and point to the files, for example a shared folder.')];
  }
  f.addEventListener('submit', function (e) {
    e.preventDefault();
    var co = f.fyrirtaeki.value.trim(), n = f.tengilidur.value.trim();
    var checks = [
      F.required(f.fyrirtaeki, 'Vinsamlegast skráðu nafn fyrirtækis.', 'Please enter the company name.'),
      F.required(f.tengilidur, 'Vinsamlegast skráðu nafn tengiliðar.', 'Please enter the contact person’s name.')
    ].concat(F.email(f.netfang), F.phone(f.simi), [
      F.required(f.tegund, 'Vinsamlegast veldu tegund verkefnis.', 'Please choose the type of project.'),
      F.required(f.stadur, 'Vinsamlegast skráðu staðsetningu framkvæmdar.', 'Please enter the location of the project.'),
      F.required(f.lysing, 'Vinsamlegast lýstu verkefninu í stuttu máli.', 'Please describe the project briefly.'),
      url(f.gogn)
    ]);
    if (!F.check(f, m, checks)) return;
    if (f._honey.value) return;
    var tegund = f.tegund.value;
    var data = {
      'Fyrirtæki': co,
      'Tengiliður': n,
      'email': f.netfang.value.trim(),
      'Sími': f.simi.value.trim(),
      'Tegund verkefnis': tegund,
      'Staðsetning': f.stadur.value.trim(),
      'Framkvæmdatími': f.timi.value.trim() || '-',
      'Lýsing': f.lysing.value.trim(),
      'Gögn (tengill)': f.gogn.value.trim() || '-'
    };
    if (F.EN) data['Tungumál'] = 'Enska (English)';
    data['_subject'] = tr('Samstarfsfyrirspurn: ', 'Business enquiry (English site): ') + co + ' (' + tegund + ')';
    data['_template'] = 'table';
    data['_autoresponse'] = tr('Takk fyrir samstarfsfyrirspurnina til P. Blöndal ehf. Við höfum fengið hana og höfum samband til að ræða verkið. Ef málið er brýnt geturðu hringt beint í 773-3363.', 'Thank you for your business enquiry to P. Blöndal ehf. We have received it and will be in touch to discuss the project. If it is urgent, you can call us on 773-3363.');
    data['_captcha'] = 'false';
    F.send(f, m, data, function () {
      return tr('Takk, ' + F.first(n) + '. Fyrirspurnin frá ' + co + ' er komin til okkar og við höfum samband til að ræða verkið.', 'Thanks, ' + F.first(n) + '. We have received the enquiry from ' + co + ' and will be in touch to discuss the project.');
    });
  });
})();
