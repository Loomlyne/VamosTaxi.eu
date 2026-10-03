/* Round 2 directions (English only until the owner picks): routes-b/c/d, reviews-b/c/d, faq-a/b/c/d. Not product code. */
(function () {
  var s = new URLSearchParams(location.search).get('v') || '';
  var SETS = ['routes-b', 'routes-c', 'routes-d', 'reviews-b', 'reviews-c', 'reviews-d', 'faq-a', 'faq-b', 'faq-c', 'faq-d'];
  if (SETS.indexOf(s) < 0) return;
  var css = document.createElement('style');
  css.textContent = [
    '[data-cols3]{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));gap:20px}',
    '[data-apcol]{display:flex;flex-direction:column;min-inline-size:0}',
    '[data-apcol] img{display:block;inline-size:100%;aspect-ratio:16/9;object-fit:cover;border-radius:var(--vt-radius-lg)}',
    '[data-apname]{display:flex;align-items:baseline;gap:10px;margin:16px 0 4px;font-family:var(--vt-font-display);font-size:var(--vt-heading-3);font-weight:var(--vt-weight-semibold)}',
    '[data-apname] small{font-family:var(--vt-font-body);font-size:12px;letter-spacing:var(--vt-label-tracking);color:var(--vt-text-muted)}',
    '[data-li]{display:flex;align-items:center;justify-content:space-between;gap:12px;min-block-size:52px;border-block-end:1px solid var(--vt-border-subtle);font-size:15px;font-weight:var(--vt-weight-medium)}',
    '[data-li] [data-ico]{color:var(--vt-text-muted)}',
    '[data-li-l]{display:inline-flex;align-items:center;gap:10px;flex-wrap:wrap}',
    '[data-tabs2]{display:flex;flex-wrap:wrap;gap:8px;margin-block-end:24px}',
    '[data-tab2]{display:inline-flex;align-items:center;gap:8px;min-block-size:44px;padding-inline:18px;border-radius:var(--vt-radius-pill);border:1px solid var(--vt-border-subtle);background:var(--vt-white);font-size:13px;font-weight:var(--vt-weight-semibold);letter-spacing:var(--vt-label-tracking);text-transform:uppercase}',
    '[data-tab2][aria-selected="true"]{background:var(--vt-charcoal-900);border-color:var(--vt-charcoal-900);color:var(--vt-white)}',
    '[data-split2]{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:clamp(24px,4vw,56px);align-items:start}',
    '@media (max-width:900px){[data-split2]{grid-template-columns:1fr}}',
    '[data-split2] > img{inline-size:100%;aspect-ratio:4/3;object-fit:cover;border-radius:var(--vt-radius-lg)}',
    '[data-rail]{display:flex;gap:16px;overflow-x:auto;padding-block-end:8px;scroll-snap-type:x mandatory;overscroll-behavior-x:contain}',
    '[data-tall]{position:relative;flex:0 0 clamp(240px,26vw,300px);aspect-ratio:3/4;border-radius:var(--vt-radius-lg);overflow:hidden;color:var(--vt-white);scroll-snap-align:start;isolation:isolate;display:flex;flex-direction:column;justify-content:flex-end;padding:20px;gap:8px}',
    '[data-tall] img{position:absolute;inset:0;inline-size:100%;block-size:100%;object-fit:cover;z-index:-2}',
    '[data-tall]::after{content:"";position:absolute;inset:0;z-index:-1;background:linear-gradient(to top,rgb(30 31 31/.92),rgb(30 31 31/0) 65%)}',
    '[data-tall] b{font-family:var(--vt-font-display);font-size:22px;font-weight:var(--vt-weight-semibold);line-height:1.15}',
    '[data-tall] span{font-size:13px;color:rgb(255 255 255/.8)}',
    '[data-tall] [data-tag]{font-size:11px;color:var(--vt-yellow-500);background:var(--vt-charcoal-900)}',
    '[data-railhead]{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;flex-wrap:wrap}',
    '[data-arrows]{display:flex;gap:8px}',
    '[data-arr]{display:grid;place-items:center;inline-size:44px;block-size:44px;border-radius:50%;border:1px solid var(--vt-charcoal-900)}',
    '[data-dark] [data-arr]{border-color:var(--vt-white)}',
    '[data-big]{margin:0;font-family:var(--vt-font-display);font-size:clamp(24px,2.8vw,34px);font-weight:var(--vt-weight-medium);line-height:1.3;letter-spacing:-0.01em}',
    '[data-plat]{display:flex;flex-direction:column;gap:0}',
    '[data-platrow]{display:flex;align-items:center;justify-content:space-between;gap:16px;min-block-size:64px;border-block-end:1px solid var(--vt-border-inverse)}',
    '[data-platrow] img{box-sizing:content-box;inline-size:auto;block-size:20px;padding:10px 14px;background:var(--vt-white);border-radius:var(--vt-radius-pill)}',
    '[data-platrow] b{font-family:var(--vt-font-display);font-size:24px}',
    '[data-platrow] small{display:block;font-size:12px;color:rgb(255 255 255/.6);text-align:end}',
    '[data-chips2]{display:flex;flex-wrap:wrap;gap:12px;margin-block-end:28px}',
    '[data-pchip]{display:inline-flex;align-items:center;gap:12px;min-block-size:56px;padding-inline:18px;border:1px solid var(--vt-border-subtle);border-radius:var(--vt-radius-pill);background:var(--vt-white)}',
    '[data-pchip] img{block-size:20px}',
    '[data-pchip] b{font-family:var(--vt-font-display);font-size:20px}',
    '[data-pchip] small{font-size:12px;color:var(--vt-text-muted)}',
    '[data-wall]{columns:3 280px;column-gap:20px}',
    '[data-wall] > *{break-inside:avoid;margin-block-end:20px}',
    '[data-src]{block-size:18px;align-self:flex-start}',
    '[data-sample]{margin:0 0 20px;font-size:12px;color:var(--vt-text-muted)}',
    '[data-dark] [data-sample]{color:rgb(255 255 255/.55)}',
    '[data-scorebox]{flex:0 0 260px;display:flex;flex-direction:column;gap:10px;padding:24px;border-radius:var(--vt-radius-lg);background:var(--vt-charcoal-900);color:var(--vt-white);scroll-snap-align:start}',
    '[data-scorebox] [data-score]{font-size:56px}',
    '[data-scorebox] [data-stars]{color:var(--vt-yellow-500)}',
    '[data-scorebox] p{margin:0;font-size:13px;color:rgb(255 255 255/.72)}',
    '[data-mini]{flex:0 0 300px;scroll-snap-align:start}',
    '[data-dots]{display:flex;gap:8px;align-items:center}',
    '[data-dots] i{inline-size:8px;block-size:8px;border-radius:50%;background:rgb(255 255 255/.35)}',
    '[data-dots] i:first-child{inline-size:24px;border-radius:4px;background:var(--vt-yellow-500)}',
    /* FAQ */
    '[data-qa]{border-block-end:1px solid var(--vt-border-subtle)}',
    '[data-qa] [data-q]{border:0}',
    '[data-qa] [data-a2]{margin:0;padding:0 52px 22px 0;max-inline-size:62ch;font-size:var(--vt-body-sm);line-height:var(--vt-body-leading);color:var(--vt-text-secondary)}',
    '[dir="rtl"] [data-qa] [data-a2]{padding:0 0 22px 52px}',
    '[data-qcard]{background:var(--vt-white);border:1px solid var(--vt-border-subtle);border-radius:var(--vt-radius-lg);padding:4px 20px;margin-block:8px}',
    '[data-qcard] [data-q]{border:0}',
    '[data-qcard] [data-a2]{padding-inline-end:52px}',
    '[data-faq3]{display:grid;grid-template-columns:minmax(0,280px) minmax(0,1fr);gap:clamp(24px,5vw,72px)}',
    '@media (max-width:900px){[data-faq3]{grid-template-columns:1fr}}',
    '[data-faq3] > *{min-inline-size:0}',
    '[data-cats]{display:flex;flex-direction:column;gap:6px}',
    '@media (max-width:900px){[data-cats]{flex-direction:row;overflow-x:auto;overscroll-behavior-x:contain}}',
    '[data-cat]{display:flex;align-items:center;justify-content:space-between;gap:12px;min-block-size:48px;padding-inline:16px;border-radius:12px;font-size:14px;font-weight:var(--vt-weight-semibold);white-space:nowrap}',
    '[data-cat][aria-selected="true"]{background:var(--vt-charcoal-900);color:var(--vt-white)}',
    '[data-cat] small{font-family:var(--vt-font-display);font-size:13px;color:var(--vt-text-muted)}',
    '[data-cat][aria-selected="true"] small{color:var(--vt-yellow-500)}',
    '[data-help]{display:flex;flex-direction:column;gap:12px;margin-block-start:24px;padding:20px;border-radius:var(--vt-radius-lg);background:var(--vt-charcoal-900);color:var(--vt-white)}',
    '[data-help] p{margin:0;font-size:13px;color:rgb(255 255 255/.72)}',
    '[data-help] b{font-family:var(--vt-font-display);font-size:18px}',
    '[data-qgrid]{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,380px),1fr));gap:12px;align-items:start}',
    '[data-qgrid] [data-qcard]{margin:0}',
    '[data-helpband]{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:16px;margin-block-start:28px;padding:20px 24px;border-radius:var(--vt-radius-lg);background:var(--vt-white);border:1px solid var(--vt-border-subtle)}',
    '[data-helpband] b{font-family:var(--vt-font-display);font-size:20px}',
  ].join('\n');
  document.head.appendChild(css);

  var I = function (n, flip) { return '<span data-ico' + (flip ? ' data-flip' : '') + ' style="--m:url(../../../assets/icons/' + n + '.svg)" aria-hidden="true"></span>'; };
  var P = '../../../assets/photography/';
  var R = '../../../assets/reviews/';
  var BIZ = 'https://vamostaxi.site/photos/classes/7f4a6dd2-245c-499d-9d11-a8d9d4fd34f9/458aece6-c409-4f3f-af58-93abb941854f.png';
  var head = function (k, t, l) { return '<div data-head><p data-kicker>' + k + '</p><h2 data-title>' + t + '</h2>' + (l ? '<p data-lede>' + l + '</p>' : '') + '</div>'; };
  var sec = function (inner, dark) { return '<section data-sec' + (dark ? ' data-dark' : '') + '><div data-wrap>' + inner + '</div></section>'; };
  var tag = '<span data-tag>Fixed route</span>';
  var row = function (to, fixed) { return '<a data-li href="#book"><span data-li-l>' + to + (fixed ? tag : '') + '</span>' + I('chevron-right', 1) + '</a>'; };
  var stars = '<span data-stars>' + [1, 2, 3, 4, 5].map(function () { return I('star'); }).join('') + '</span>';
  var SAMPLE = '<p data-sample>Sample text. The connected platforms fill these with real reviews, updated automatically.</p>';
  var QUOTE = 'The review text appears here exactly as the traveller wrote it on the platform, two or three sentences long.';
  var rcard = function (src, quote) { return '<article data-card>' + stars + '<p data-quote>“' + (quote || QUOTE) + '”</p><div data-who><b>First name L.</b><span>Zurich Airport → Zermatt</span></div><img data-src src="' + R + src + '.svg" alt="' + src + '"></article>'; };
  var QS = [
    ['Where do I meet my driver?', 'After customs, in the arrivals hall. Your driver holds a board with your name.'],
    ['What if my flight is late?', 'We track your flight. The pickup time moves with the real arrival, at no extra cost.'],
    ['How long does the driver wait?', 'Sixty minutes of airport waiting are included on every airport pickup.'],
    ['What if I can’t find my driver?', 'Call or WhatsApp +41 79 626 70 82. We answer and guide you to your driver.'],
    ['Can I book a pickup for someone else?', 'Yes. Enter the traveller’s name and phone when you book.'],
  ];
  var CATS = [['Booking and price', 6], ['At the airport', 5], ['Luggage and seats', 4], ['Changes and cancellation', 4]];
  var html = '';

  if (s === 'routes-b') {
    var col = function (img, name, code, list) { return '<div data-apcol><img src="' + P + img + '" alt=""><p data-apname>' + name + ' <small class="vt-dir-keep">' + code + '</small></p>' + list.map(function (x) { return row(x[0], x[1]); }).join('') + '</div>'; };
    html = sec(head('Where we drive', 'Pick your airport, then your destination.', 'Every route below opens the booking card with both ends filled in.') + '<div data-cols3>' +
      col('dest-zrh.jpg', 'Zurich Airport', 'ZRH', [['Davos', 1], ['St. Moritz', 1], ['Zurich city'], ['Lucerne'], ['Interlaken'], ['Zermatt']]) +
      col('dest-gva.jpg', 'Geneva Airport', 'GVA', [['Geneva city'], ['Lausanne'], ['Zermatt'], ['Bern']]) +
      col('dest-bsl.jpg', 'Basel EuroAirport', 'BSL', [['Basel city'], ['Bern'], ['Lucerne'], ['Zurich city']]) + '</div>');
  } else if (s === 'routes-c') {
    html = sec(head('Where we drive', 'Choose an airport. See where we take you.') + '<div data-tabs2><span data-tab2 aria-selected="true">' + I('plane-landing') + 'Zurich ZRH</span><span data-tab2>' + I('plane-landing') + 'Geneva GVA</span><span data-tab2>' + I('plane-landing') + 'Basel BSL</span></div>' +
      '<div data-split2><img src="' + P + 'dest-zrh.jpg" alt=""><div>' + [['Davos', 1], ['St. Moritz', 1], ['Zurich city'], ['Lucerne'], ['Interlaken'], ['Zermatt'], ['Bern']].map(function (x) { return row('Zurich Airport → ' + x[0], x[1]); }).join('') + '<p data-p style="margin-top:16px">Not on the list? Type any address in the booking card.</p></div></div>');
  } else if (s === 'routes-d') {
    var tall = function (img, a, b, fixed) { return '<a data-tall href="#book"><img src="' + img + '" alt="">' + (fixed ? tag : '') + '<span>' + a + '</span><b>' + b + '</b></a>'; };
    html = sec('<div data-railhead>' + head('Popular routes', 'Where travellers go from the airport.') + '<div data-arrows style="margin-block-end:48px"><span data-arr>' + I('chevron-left', 1) + '</span><span data-arr>' + I('chevron-right', 1) + '</span></div></div><div data-rail>' +
      tall(P + 'why-alpine-route.jpg', 'Zurich Airport →', 'Davos', 1) + tall(BIZ, 'Zurich Airport →', 'St. Moritz', 1) + tall(P + 'svc-city.jpg', 'Zurich Airport →', 'Zurich city') + tall(P + 'fleet-van-street.jpg', 'Zurich Airport →', 'Lucerne') + tall(P + 'dest-gva.jpg', 'Geneva Airport →', 'Lausanne') + tall(P + 'dest-bsl.jpg', 'Basel EuroAirport →', 'Bern') + '</div>');
  } else if (s === 'reviews-b') {
    var plat = function (src, score, n) { return '<div data-platrow><img src="' + R + src + '" alt=""><span><b class="vt-dir-keep">' + score + '</b><small>' + n + ' reviews</small></span></div>'; };
    html = sec(head('Reviews', 'What travellers say.') + SAMPLE + '<div data-meet><div style="display:flex;flex-direction:column;gap:24px">' + '<span data-stars style="color:var(--vt-yellow-500);--sz:22px">' + [1, 2, 3, 4, 5].map(function () { return I('star'); }).join('') + '</span><p data-big>“' + QUOTE + '”</p><div data-who style="color:rgb(255 255 255/.7)"><b style="color:#fff">First name L.</b><span>Zurich Airport → Zermatt · Google</span></div><div style="display:flex;align-items:center;gap:20px"><span data-arrows><span data-arr>' + I('chevron-left', 1) + '</span><span data-arr>' + I('chevron-right', 1) + '</span></span><span data-dots><i></i><i></i><i></i><i></i></span></div></div>' +
      '<div data-plat>' + plat('google.svg', '0.0', '00') + plat('trustpilot.svg', '0.0', '00') + plat('tripadvisor.svg', '0.0', '00') + '</div></div>', true);
  } else if (s === 'reviews-c') {
    var pchip = function (src, score, n) { return '<span data-pchip><img src="' + R + src + '" alt=""><b class="vt-dir-keep">' + score + '</b>' + I('star') + '<small>' + n + ' reviews</small></span>'; };
    html = sec(head('Reviews', 'What travellers say.') + '<div data-chips2>' + pchip('google.svg', '0.0', '00') + pchip('trustpilot.svg', '0.0', '00') + pchip('tripadvisor.svg', '0.0', '00') + '</div>' + SAMPLE + '<div data-wall>' +
      rcard('google', 'A short review fits in one or two lines.') + rcard('trustpilot') + rcard('tripadvisor', 'A longer review keeps its full text in this layout, so the wall grows unevenly like a real set of reviews. Nothing is cut, the card simply gets taller.') + rcard('google', 'Short and clear.') + rcard('tripadvisor') + rcard('trustpilot', 'Medium length text, about two lines, from the traveller.') + '</div>');
  } else if (s === 'reviews-d') {
    html = sec(head('Reviews', 'What travellers say.') + SAMPLE + '<div data-rail><div data-scorebox><span data-score class="vt-dir-keep">0.0</span>' + '<span data-stars>' + [1, 2, 3, 4, 5].map(function () { return I('star'); }).join('') + '</span><p>Average of 00 reviews on Google, Trustpilot and Tripadvisor.</p><span data-link style="margin-top:auto">Read all' + I('arrow-right', 1) + '</span></div>' +
      ['google', 'trustpilot', 'tripadvisor', 'google'].map(function (x) { return '<div data-mini>' + rcard(x) + '</div>'; }).join('') + '</div>');
  } else if (s === 'faq-a') {
    html = sec('<div data-faq><div data-head style="margin:0"><p data-kicker>Answers</p><h2 data-title>Frequently asked questions</h2></div><div>' + QS.map(function (x, i) { return '<div data-qa><div data-q' + (i === 0 ? ' data-open' : '') + '><span>' + x[0] + '</span><span data-pm>' + I(i === 0 ? 'x' : 'plus') + '</span></div>' + (i === 0 ? '<p data-a2>' + x[1] + '</p>' : '') + '</div>'; }).join('') + '</div></div>');
  } else if (s === 'faq-b') {
    html = sec('<div data-faq><div data-head style="margin:0"><p data-kicker>Answers</p><h2 data-title>Frequently asked questions</h2></div><div>' + QS.map(function (x, i) { return i === 0 ? '<div data-qcard><div data-q data-open><span>' + x[0] + '</span><span data-pm>' + I('x') + '</span></div><p data-a2 style="margin:0;padding-block-end:20px;font-size:var(--vt-body-sm);line-height:var(--vt-body-leading);color:var(--vt-text-secondary)">' + x[1] + '</p></div>' : '<div data-qa style="padding-inline:20px"><div data-q><span>' + x[0] + '</span><span data-pm>' + I('plus') + '</span></div></div>'; }).join('') + '</div></div>');
  } else if (s === 'faq-c') {
    html = sec(head('Answers', 'Frequently asked questions') + '<div data-faq3><div><div data-cats>' + CATS.map(function (c, i) { return '<span data-cat aria-selected="' + (i === 1) + '">' + c[0] + '<small class="vt-dir-keep">' + c[1] + '</small></span>'; }).join('') + '</div><div data-help><b>Still a question?</b><p>We answer every day by phone, WhatsApp or email.</p><span data-link style="color:var(--vt-yellow-500)">' + I('message-circle') + 'WhatsApp us</span></div></div><div>' + QS.map(function (x, i) { return '<div data-qa><div data-q' + (i === 0 ? ' data-open' : '') + '><span>' + x[0] + '</span><span data-pm>' + I(i === 0 ? 'x' : 'plus') + '</span></div>' + (i === 0 ? '<p data-a2>' + x[1] + '</p>' : '') + '</div>'; }).join('') + '</div></div>');
    html = html.replace('We answer every day by phone', 'We answer by phone');
  } else if (s === 'faq-d') {
    html = sec(head('Answers', 'Frequently asked questions') + '<div data-tabs2>' + CATS.map(function (c, i) { return '<span data-tab2 aria-selected="' + (i === 1) + '">' + c[0] + '</span>'; }).join('') + '</div><div data-qgrid>' + QS.concat([['Is the price I see the final price?', '']]).map(function (x, i) { return '<div data-qcard><div data-q' + (i === 0 ? ' data-open' : '') + '><span>' + x[0] + '</span><span data-pm>' + I(i === 0 ? 'x' : 'plus') + '</span></div>' + (i === 0 ? '<p data-a2 style="margin:0;padding-block-end:20px;font-size:var(--vt-body-sm);line-height:var(--vt-body-leading);color:var(--vt-text-secondary)">' + x[1] + '</p>' : '') + '</div>'; }).join('') + '</div>' +
      '<div data-helpband><span style="display:flex;flex-direction:column;gap:4px"><b>Still a question?</b><span data-p>Call, WhatsApp or email us.</span></span><span style="display:flex;gap:12px;flex-wrap:wrap"><a data-btn href="/contact">Contact us' + I('arrow-right', 1) + '</a><a data-btn="ghost" href="#">' + I('message-circle') + 'WhatsApp</a></span></div>');
  }
  document.getElementById('root').innerHTML = html;
})();
