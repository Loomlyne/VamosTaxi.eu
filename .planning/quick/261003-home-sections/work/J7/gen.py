import re
p='app/home/FAQ.dc.html'
L=open(p).read().split('\n')
head='\n'.join(L[:46])          # through line 46
patt=[l for l in L if 'background-image:url(data:image' in l][0]                      # bg pattern div
kick=[l for l in L if 'Answers</p>' in l][0]                      # kicker p
ICON='<x-import component-from-global-scope="VamosTaxiDesignSystem_245af1.Icon" name="%s" size="{{ n18 }}" color="currentColor" hint-size="18px,18px"></x-import>'
def btn(variant,href,label,w):
    return '<x-import component-from-global-scope="VamosTaxiDesignSystem_245af1.Button" size="md" variant="%s" href="%s" hint-size="%spx,44px">%s</x-import>'%(variant,href,w,label)
def acts(*b): return '<div data-faq-acts="1">\n'+'\n'.join(b)+'\n</div>'
P=lambda t:'<p data-faq-a="1">%s</p>'%t
PHONE='<a href="tel:+41796267082" class="vt-dir-keep" data-vt-no-i18n="1">+41 79 626 70 82</a>'
T=[
('Booking and price',[
 ('Is the price I see the final price?',[P('Yes. Your fare is calculated from the route and the vehicle class before you book, confirmed in writing, and it does not change afterwards. No meter, no surge, nothing added at the airport.')]),
 ('Do I need an account to book?',[P('No. Guest checkout takes an email address and a mobile number — the address for your confirmation, the number for the driver to call on arrival. You can open an account later if you want your transfers in one place.')]),
 ('How far in advance do I need to book?',[P('Every transfer is booked ahead and assigned to a named driver. You are not waiting for a car to be found — at the agreed time it is already there.')]),
 ('What payment methods do you accept?',[P('Card or TWINT, processed by Stripe. Every method available for your booking is shown at checkout before you pay.')]),
]),
('At the airport',[
 ('Where do I meet my driver?',[P('After customs, in the arrivals hall. Your driver holds a board with your name.')]),
 ('What if my flight is late?',[P('We track your flight. The pickup time moves with the real arrival, at no extra cost.')]),
 ('How long does the driver wait?',[P('Sixty minutes of airport waiting are included on every airport pickup.')]),
 ('What if I can’t find my driver?',[P('Call or WhatsApp '+PHONE+'.'),acts(btn('secondary','tel:+41796267082','Call',120),btn('ghost','https://wa.me/41796267082','WhatsApp',160))]),
]),
('Luggage and seats',[
 ('How many bags fit?',[P('Each class shows its seats and bags before you pay.')]),
 ('Skis, bikes or child seats?',[P('Skis, folding bicycles, collapsible wheelchairs, instruments and pets all travel — declare them when you book so the right vehicle is assigned. Child and booster seats on request, and your own is welcome.')]),
]),
('Changes and cancellation',[
 ('Can I cancel or change my booking?',[P('Change or cancel from the link in your confirmation email, or from your account if you made one. A change is effective when we confirm it in writing, not when you send it.'),P('We do not restate the windows or the shares here, on purpose. One page owns them, and it is kept correct.'),acts(btn('secondary','/manage-booking','Manage a booking',190),btn('ghost','/cancellation','Read the cancellation &amp; refund policy',320))]),
 ('Until when is cancellation free?',[P('Until 24 hours before pickup.'),acts(btn('ghost','/cancellation','Cancellation policy',200))]),
]),
]
HELP=lambda pos:'''<div data-faq-help="%s">
<b>Still a question?</b>
<p>We answer by phone, WhatsApp or email.</p>
<a href="https://wa.me/41796267082" target="_blank" rel="noopener" data-faq-wa="1">%s<span>WhatsApp us</span></a>
</div>'''%(pos,ICON%'message-circle')
tabs=[];panels=[];n=0
for ti,(name,items) in enumerate(T):
    sel='1' if ti==0 else '0'
    tabs.append('<button type="button" role="tab" data-faq-topic="1" id="faq-t%d" aria-selected="%s" aria-controls="faq-s%d" tabindex="%s"><span>%s</span><small class="vt-dir-keep" data-vt-no-i18n="1">%d</small></button>'%(ti+1,'true' if ti==0 else 'false',ti+1,'0' if ti==0 else '-1',name,len(items)))
    cards=[]
    for ii,(q,ans) in enumerate(items):
        n+=1; op='1' if ii==0 else '0'
        cards.append('''<div data-faq-card="1" data-open="%s">
<h3 style="margin:0">
<button type="button" data-faq-toggle="1" id="faq-q%d" aria-expanded="%s" aria-controls="faq-a%d"><span data-faq-q="1">%s</span>
<span data-faq-mark="1" aria-hidden="true"><span data-faq-plus="1">%s</span></span>
</button>
</h3>
<div data-faq-panel="1" id="faq-a%d" role="region" aria-labelledby="faq-q%d">
<div data-faq-inner="1">
%s
</div>
</div>
</div>'''%(op,n,'true' if op=='1' else 'false',n,q,ICON%'plus',n,n,'\n'.join(ans)))
    panels.append('<div data-faq-set="1" role="tabpanel" id="faq-s%d" aria-labelledby="faq-t%d" data-on="%s">\n%s\n</div>'%(ti+1,ti+1,sel,'\n\n'.join(cards)))
body='''<section id="faq" data-faq="1" data-screen-label="FAQ" aria-labelledby="faq-title" ref="{{ rootRef }}" style="color:var(--vt-text-primary);font-family:var(--vt-font-body);position:relative;overflow:hidden">
%s
<div data-faq-wrap="1" style="position:relative;z-index:1">
<div data-faq-intro="1">
%s
<h2 id="faq-title">Frequently asked questions</h2>
</div>
<div data-faq-layout="1">
<div data-faq-rail="1">
<div data-faq-topics="1" role="tablist" aria-label="Question topics" aria-orientation="vertical">
%s
</div>
%s
</div>
<div data-faq-main="1">
%s
%s
</div>
</div>
</div>
</section>
</x-dc>'''%(patt,kick,'\n'.join(tabs),HELP('rail'),'\n'.join(panels),HELP('after'))
css=open('.planning/quick/261003-home-sections/work/J7/faq.css').read()
script=open('.planning/quick/261003-home-sections/work/J7/faq.js.html').read()
open(p,'w').write(head+'\n'+css+'\n'+body+'\n'+script)
