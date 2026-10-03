// Run from apps/web (needs @playwright/test): node ../../.planning/quick/261003-site-polish/round2/R2-5/shots.mjs
import { chromium } from '@playwright/test';
const OUT='/Users/koss/Developer/VamosTaxi.eu/.claude/worktrees/site-polish/.planning/quick/261003-site-polish/screens/';
const b = await chromium.launch({executablePath:'/Users/koss/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell'});
const CSS=process.env.PROPOSAL_CSS||'div:has(> [data-cta]){display:none!important}';
for (const lang of ['en','ar']) for (const w of [1440,1024,768,390]) for (const mode of ['before','after']) {
  const ctx = await b.newContext({viewport:{width:w,height:900}});
  await ctx.addInitScript(l=>{try{localStorage.setItem('vamosLang',l)}catch(e){}},lang);
  const p = await ctx.newPage();
  await p.route('**/api/**', r=>r.fulfill({status:200,contentType:'application/json',body:'{}'}));
  await p.goto('http://127.0.0.1:4801/app/home/home.dc.html');
  await p.waitForTimeout(3000);
  for(let i=0;i<40;i++){ await p.evaluate(()=>window.scrollTo(0,document.body.scrollHeight)); await p.waitForTimeout(400);
    if(await p.evaluate(()=>!!document.querySelector('[data-cta]')&&!!document.querySelector('footer [data-ft-band]'))) break; }
  await p.waitForTimeout(2000);
  if(mode==='after') await p.addStyleTag({content:CSS});
  await p.evaluate(()=>{window.scrollTo(0,document.body.scrollHeight)});
  await p.evaluate(()=>{document.querySelectorAll('body *').forEach(e=>{const c=getComputedStyle(e);if(c.position==='fixed'&&e.tagName!=='X-DC')e.style.setProperty('display','none','important')})});
  await p.waitForTimeout(800);
  const m = await p.evaluate(()=>{
    const f=document.querySelector('footer'); const fr=f.getBoundingClientRect(); const cta=document.querySelector('[data-cta]');
    const ctaShown=cta.getBoundingClientRect().height>0;
    const lim=ctaShown?cta.getBoundingClientRect().top:fr.top;
    const faq=[...document.querySelectorAll('section')].filter(s=>s!==cta&&s.getBoundingClientRect().height>0&&s.getBoundingClientRect().bottom<=lim+2).pop();
    const band=f.querySelector('[data-ft-band]'); const br=band&&band.getBoundingClientRect();
    return {fTop:Math.round(fr.top+scrollY), faqBottom:Math.round(faq.getBoundingClientRect().bottom+scrollY), faqLabel:faq?.getAttribute('data-screen-label'), bandTopInFooter:Math.round(br.top-fr.top), bandBottom:Math.round(br.bottom+scrollY), sw:document.documentElement.scrollWidth, dir:document.documentElement.dir};
  });
  const y0=Math.max(0,m.faqBottom-(w>=1024?420:340)), y1=m.bandBottom+(w>=1024?60:40);
  await p.screenshot({path:`${OUT}R2-5-${mode}-${lang}-${w}.png`,fullPage:true,clip:{x:0,y:y0,width:w,height:y1-y0}});
  console.log(lang,w,mode,JSON.stringify(m),'gapFaqToFooter',m.fTop-m.faqBottom);
  await ctx.close();
}
await b.close();
