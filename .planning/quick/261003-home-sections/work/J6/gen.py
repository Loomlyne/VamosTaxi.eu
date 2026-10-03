import os
os.chdir('/Users/koss/Developer/VamosTaxi.eu/.claude/worktrees/design-home-sections/app/home')
src=open('Services.dc.html').read().split('\n')
head=[]
for l in src:
    head.append(l)
    if 'src="../vamos-page-transition.js"' in l: break
head='\n'.join(head)
common=''':root{--vt-icon-base:"../../assets/icons/";--vt-logo-base:"../../assets/logo/";--vt-pattern-base:"../../assets/patterns/";--vt-shadow-accent:none}
.vt-input--focus{box-shadow:none}
body{margin:0}
a{color:inherit;text-decoration:none;border-bottom:0}
[data-kicker]{margin:0;display:inline-flex;align-self:flex-start;align-items:center;gap:9px;box-sizing:border-box;inline-size:fit-content;max-inline-size:100%;min-block-size:32px;padding-block:0;padding-inline:12px 15px;border:1px solid var(--vt-grey-200);border-radius:var(--vt-radius-pill);background:var(--vt-white);font-family:var(--vt-font-body);font-size:12px;font-weight:var(--vt-weight-semibold);letter-spacing:var(--vt-label-tracking);text-transform:uppercase;line-height:1;white-space:nowrap;color:var(--vt-charcoal-900)}
[data-kicker]::before{content:"";flex:0 0 13px;inline-size:13px;block-size:13px;background:url(../../assets/patterns/checker-mark.png) center / contain no-repeat}
[data-title]{margin:0;max-inline-size:18ch;font-family:var(--vt-font-display);font-size:var(--vt-display-3);font-weight:var(--vt-weight-semibold);letter-spacing:var(--vt-display-tracking);line-height:var(--vt-display-leading);text-wrap:balance;color:var(--vt-text-primary)}
[data-wrap]{box-sizing:border-box;max-inline-size:var(--vt-container-lg);margin-inline:auto;padding-block:clamp(56px,7vw,96px);padding-inline:var(--vt-gutter)}
[data-head]{display:flex;flex-direction:column;align-items:flex-start;gap:12px;margin-block-end:clamp(28px,4vw,48px)}
:focus-visible:not(input):not(select):not(textarea){outline:none;box-shadow:var(--vt-ring)}
'''
trust_css='''[data-facts]{display:grid;grid-template-columns:minmax(0,1fr);gap:0;margin:0;padding:0;list-style:none;border-block-start:1px solid var(--vt-border-subtle)}
[data-fact]{display:flex;flex-direction:column;align-items:flex-start;gap:10px;min-inline-size:0;padding-block:24px;padding-inline:0 24px;border-block-end:1px solid var(--vt-border-subtle)}
@media (min-width:640px){[data-facts]{grid-template-columns:repeat(2,minmax(0,1fr))}[data-fact]{padding-inline:24px;border-inline-start:1px solid var(--vt-border-subtle)}[data-fact]:nth-child(odd){padding-inline-start:0;border-inline-start:0}}
@media (min-width:1024px){[data-facts]{grid-template-columns:repeat(4,minmax(0,1fr))}[data-fact]:nth-child(odd){padding-inline-start:24px;border-inline-start:1px solid var(--vt-border-subtle)}[data-fact]:first-child{padding-inline-start:0;border-inline-start:0}}
[data-tile]{display:grid;place-items:center;flex:0 0 auto;inline-size:44px;block-size:44px;border-radius:12px;background:var(--vt-charcoal-900);color:var(--vt-yellow-500)}
[data-fact] h3{margin:0;font-family:var(--vt-font-display);font-size:var(--vt-heading-4);font-weight:var(--vt-weight-semibold);letter-spacing:var(--vt-heading-tracking);line-height:var(--vt-heading-leading);text-wrap:balance;color:var(--vt-text-primary)}
[data-fact] p{margin:0;font-family:var(--vt-font-body);font-size:var(--vt-body-sm);line-height:var(--vt-body-leading);text-wrap:pretty;color:var(--vt-text-secondary)}
[data-fact] a{text-decoration:underline;text-underline-offset:3px;color:var(--vt-text-primary);border-radius:var(--vt-radius-xs)}
'''
biz_css='''[data-band]{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:clamp(24px,4vw,48px)}
[data-band-copy]{display:flex;flex-direction:column;align-items:flex-start;gap:14px;flex:1 1 420px;min-inline-size:0}
[data-lede]{margin:0;max-inline-size:46ch;font-family:var(--vt-font-body);font-size:var(--vt-body-md);line-height:var(--vt-body-leading);text-wrap:pretty;color:var(--vt-text-secondary)}
[data-chips]{display:flex;flex-wrap:wrap;gap:8px;margin:0;padding:0;list-style:none}
[data-chip]{display:inline-flex;align-items:center;gap:8px;min-block-size:32px;box-sizing:border-box;padding-inline:12px;border:1px solid var(--vt-border-subtle);border-radius:var(--vt-radius-pill);font-family:var(--vt-font-body);font-size:13px;font-weight:var(--vt-weight-medium);color:var(--vt-text-primary)}
[data-band-act]{display:flex;flex-wrap:wrap;align-items:center;gap:12px;flex:0 0 auto}
[data-btn]{display:inline-flex;align-items:center;justify-content:center;gap:10px;box-sizing:border-box;min-block-size:44px;padding-inline:20px;border:1px solid var(--vt-charcoal-900);border-radius:var(--vt-radius-pill);background:var(--vt-charcoal-900);color:var(--vt-text-inverse);font-family:var(--vt-font-body);font-size:13px;font-weight:var(--vt-weight-semibold);letter-spacing:var(--vt-label-tracking);text-transform:uppercase;white-space:nowrap;transition:background 140ms var(--vt-ease-standard),border-color 140ms var(--vt-ease-standard),transform 80ms var(--vt-ease-standard)}
[data-btn]:hover{background:var(--vt-charcoal-800)}
[data-btn]:active{transform:translateY(1px)}
[data-btn="ghost"]{background:transparent;color:var(--vt-text-primary)}
[data-btn="ghost"]:hover{background:var(--vt-grey-50);border-color:var(--vt-charcoal-900)}
@media (max-width:640px){[data-band-act]{flex-direction:column;align-items:stretch;inline-size:100%}[data-btn]{inline-size:100%}}
@media (prefers-reduced-motion:reduce){[data-btn]{transition:none}[data-btn]:active{transform:none}}
'''
def icon(n,s):
    px = 18 if s=="n18" else 20
    return '<x-import component-from-global-scope="VamosTaxiDesignSystem_245af1.Icon" name="%s" size="{{ %s }}" hint-size="%dpx,%dpx"></x-import>' % (n,s,px,px)
def page(css,body,logic):
    return head+'\n<style>'+common+css+'</style>\n</helmet>\n'+body+'\n</x-dc>\n<script type="text/x-dc" data-dc-script>\n'+logic+'\n</script>\n</body>\n</html>\n'
logic='''/** Re-renders when the platform language changes. Static copy, no data fetching. */
class Component extends DCLogic {
  state = { lang: null };
  componentDidMount() {
    this._offLocale = window.VamosLocale.onChange((v) => this.setState({ lang: v.lang }));
  }
  componentWillUnmount() {
    if (this._offLocale) this._offLocale();
  }
  renderVals() {
    return { n18: 18, n20: 20 };
  }
}'''
facts=[('shield-check','Registered Swiss company','Vamos Taxi, Dietikon ZH. UID <span class="vt-dir-keep" data-vt-no-i18n>CHE-296.035.710</span>.'),
('credit-card','Paid by card or TWINT','Payments go through Stripe. We never see your card number.'),
('receipt','Price fixed in writing','The fare is confirmed before you pay and does not change afterwards.'),
('calendar','Free cancellation','Cancel free of charge until <a href="/cancellation">24 hours before pickup</a>.')]
fl=''.join('\n<li data-fact="1"><span data-tile="1" aria-hidden="true">%s</span><h3>%s</h3><p>%s</p></li>' % (icon(i,"n20"),t,p) for i,t,p in facts)
body='''<section data-screen-label="TrustFacts" aria-labelledby="trust-title" style="background:var(--vt-bg-page);color:var(--vt-text-primary);font-family:var(--vt-font-body)">
<div data-wrap="1">
<div data-head="1"><p data-kicker="1">Why book with us</p><h2 data-title="1" id="trust-title">A Swiss company, a price in writing.</h2></div>
<ul data-facts="1">'''+fl+'''
</ul>
</div>
</section>'''
open('TrustFacts.dc.html','w').write(page(trust_css,'<x-dc>\n'+body if False else body,logic))
body='''<section data-screen-label="BusinessTravel" aria-labelledby="biz-title" style="background:var(--vt-bg-page);color:var(--vt-text-primary);font-family:var(--vt-font-body)">
<div data-wrap="1">
<div data-band="1">
<div data-band-copy="1">
<p data-kicker="1">Business travel</p>
<h2 data-title="1" id="biz-title" style="max-inline-size:22ch">Booking for guests or a team?</h2>
<p data-lede="1">Book a ride in your guest’s name and send them the voucher.</p>
<ul data-chips="1">
<li data-chip="1">'''+icon("check","n18")+'''Book in a guest’s name</li>
<li data-chip="1">'''+icon("check","n18")+'''One contact for every ride</li>
</ul>
</div>
<div data-band-act="1">
<a data-btn="1" href="/contact">Contact us'''+icon("arrow-right","n18")+'''</a>
<a data-btn="ghost" href="https://wa.me/41796267082" rel="noopener" target="_blank">'''+icon("message-circle","n18")+'''WhatsApp</a>
</div>
</div>
</div>
</section>'''
open('BusinessTravel.dc.html','w').write(page(biz_css,body,logic))
