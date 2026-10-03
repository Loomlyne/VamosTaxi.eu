// R2-2 option B — picture-only injection of the strip (the coder builds this as BookingBar variant="strip").
(() => {
  const t = (s) => (window.VamosLocale && window.VamosLocale.t ? window.VamosLocale.t(s) : s);
  const wrap = document.querySelector('[data-bar-wrap]');
  const open = () => document.querySelector('[data-bb]').click();
  const seg = (icon, k, v) => `<button type="button" data-tseg="1"><span data-tseg-ic="1" aria-hidden="true" style="--ic:url(/assets/icons/${icon}.svg)"></span><span data-tseg-tx="1"><span data-tseg-k="1">${t(k)}</span><span data-tseg-v="1">${t(v)}</span></span></button>`;
  const strip = document.createElement('div');
  strip.setAttribute('data-tbar', '1');
  strip.innerHTML = seg('map-pin', 'From', 'Pickup address') + seg('map-pin', 'To', 'Drop-off address') + seg('calendar', 'When', 'Add date and time') + '<div data-tgo="1"></div>';
  /* Picture only: clone the kit Button the card already renders. The coder uses
     <x-import component-from-global-scope="VamosTaxiDesignSystem_245af1.Button" variant="primary" size="lg" iconEnd="arrow-right" onClick="{{ openFromHero }}"> instead. */
  const kit = document.querySelector('[data-bookcard] [data-bx="cta"] .vt-btn').cloneNode(true);
  kit.style.width = 'auto'; strip.querySelector('[data-tgo]').appendChild(kit);
  strip.addEventListener('click', open);
  wrap.insertBefore(strip, wrap.firstChild);
})();
