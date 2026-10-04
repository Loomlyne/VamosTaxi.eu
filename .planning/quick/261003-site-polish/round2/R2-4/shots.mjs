import { chromium } from '@playwright/test';
import fs from 'node:fs';
const ROOT='/Users/koss/Developer/VamosTaxi.eu/.claude/worktrees/site-polish/.planning/quick/261003-site-polish';
const OUT=ROOT+'/screens', R=ROOT+'/round2/R2-4';
const cssA=fs.readFileSync(R+'/proposal.css','utf8'), cssB=fs.readFileSync(R+'/proposalB.css','utf8');
const BASE='http://localhost:4800/app/home/home.dc.html';
const T=[
 ['google',5,'Maya R.','Zurich Airport to Lucerne','The driver was waiting at arrivals with my name on a sign. Smooth ride, clean car, no surprises on the fare.'],
 ['trustpilot',5,'Jonas K.','','Booked in a minute. Pickup was on time and the driver helped with two heavy bags.'],
 ['tripadvisor',4,'Lena S.','Zurich to Zermatt (Täsch)','Long drive in the snow, handled calmly. Arrived a little late because of the road, but we were kept informed.'],
 ['google',5,'Amir H.','','Early flight, car was there before I was. Would book again.'],
 ['trustpilot',4,'Claire D.','Geneva Airport to Zurich','Comfortable van for five of us. Plenty of room for the luggage.'],
 ['tripadvisor',5,'Tom W.','','Good communication before the trip, and the driver knew the quickest way out of the city when a road was closed. Calm, friendly, professional from start to finish.'],
 ['google',5,'Sofia M.','Zurich Airport to Zug','Quiet and clean.'],
 ['trustpilot',5,'David L.','','Flight landed early and the driver was already there. Easy.'],
 ['tripadvisor',5,'Nadia B.','Zurich to St. Moritz','We travelled with a child seat, which was fitted and ready. Thank you.'],
 ['google',4,'Peter F.','','Fine service, fair fixed price as promised in the booking.'],
 ['trustpilot',5,'Elif T.','Basel to Zurich Airport','Third time using Vamos. Always the same standard.'],
 ['google',5,'Marc A.','','Driver spoke English and German, and gave us a few tips for the weekend. Very kind.'],
 ['tripadvisor',5,'Hana Y.','Zurich to Interlaken','Beautiful drive, comfortable seats, no stress about parking or timing.'],
 ['trustpilot',4,'Luca P.','','Reliable. Pickup point was easy to find thanks to the message.'],
];
const rows=(n)=>T.slice(0,n).map((t,i)=>({id:'r'+i,source:t[0],rating:t[1],authorName:t[2],routeLabel:t[3],body:t[4],published:true,sortOrder:i,sourceUrl:i%3==0?'https://www.google.com/maps/place/x':''}));
const exe=process.env.CHROME;
const browser=await chromium.launch({executablePath:exe});
const W={1440:[1440,900],1024:[1024,768],768:[768,1024],390:[390,844]};
async function open(w,lang,n,reduced){
  const ctx=await browser.newContext({viewport:{width:W[w][0],height:W[w][1]},reducedMotion:reduced?'reduce':'no-preference'});
  const page=await ctx.newPage();
  await page.route('**/api/reviews',r=>r.fulfill({json:{ok:true,data:rows(n)}}));
  await page.route('**/api/**',r=>r.request().url().includes('/api/reviews')?r.fallback():r.fulfill({json:{ok:true,data:[]}}));
  await page.addInitScript(l=>localStorage.setItem('vamosLang',l),lang);
  await page.goto(BASE,{waitUntil:'load'});
  await page.waitForSelector('[data-rv-wall] [data-rv-item]',{timeout:20000});
  await page.waitForTimeout(800);
  return page;
}
// builds the proposed DOM from the rendered static wall
const build=(mode)=>{
  const wall=document.querySelector('ul[data-rv-wall]');
  const items=[...wall.children];
  const w=innerWidth, n= mode==='x'?1:(w<=680?1:w<=1080?2:3);
  const div=document.createElement('div');
  div.setAttribute('data-rv-wall','1'); div.setAttribute('data-rv-drift',mode); div.style.setProperty('--rv-cols',n);
  const cols=[...Array(n)].map(()=>{const u=document.createElement('ul');u.setAttribute('data-rv-col','1');div.appendChild(u);return u;});
  items.forEach((li,i)=>cols[i%n].appendChild(li));
  cols.forEach(u=>{const orig=[...u.children];u.style.setProperty('--rv-count',orig.length);
    orig.forEach(li=>{const c=li.cloneNode(true);c.setAttribute('aria-hidden','true');c.setAttribute('inert','');c.setAttribute('data-rv-clone','1');u.appendChild(c);});});
  wall.replaceWith(div);
};
async function shotWall(page,name,sel){
  const el=await page.$(sel); await el.scrollIntoViewIfNeeded(); await page.waitForTimeout(100);
  await el.screenshot({path:`${OUT}/${name}.png`});
}
const sec='#reviews';
for(const lang of ['en','ar']) for(const w of [1440,1024,768,390]){
  // before: today, 14
  let p=await open(w,lang,14); await shotWall(p,`R2-4-before-14-${lang}-${w}`,sec); await p.context().close();
  // threshold: 6 -> unchanged static wall (proposal does not engage)
  if(lang==='en'||w===1440){p=await open(w,lang,6); await shotWall(p,`R2-4-after-6-static-${lang}-${w}`,sec); await p.context().close();}
  for(const [opt,css,mode] of [['optA',cssA,'y'],['optB',cssB,'x']]){
    if(opt==='optB' && !(w===1440||w===390)) continue;
    p=await open(w,lang,14); await p.addStyleTag({content:css}); await p.evaluate(build,mode); await p.waitForTimeout(200);
    for(const [k,ms] of [['t0',0],['t1',9000],['t2',21000]]){
      await p.evaluate(ms=>{document.getAnimations().forEach(a=>{a.pause();a.currentTime=ms*(a.effect&&a.effect.getComputedTiming().duration>0?1:1)});},ms);
      await p.waitForTimeout(150);
      await shotWall(p,`R2-4-${opt}-14-${k}-${lang}-${w}`,sec);
    }
    if(opt==='optA'&&lang==='en'&&(w===1440||w===390)){
      // frame strip: 6 frames, 4s apart, wall only
      const frames=[];
      for(let i=0;i<6;i++){await p.evaluate(ms=>document.getAnimations().forEach(a=>{a.pause();a.currentTime=ms}),i*4000);await p.waitForTimeout(120);
        const b=await (await p.$('[data-rv-wall]')).screenshot();frames.push(b.toString('base64'));}
      const q=await browser.newPage({viewport:{width:w===1440?2400:1200,height:900}});
      await q.setContent(`<body style="margin:0;background:#F6F6F6;display:flex;gap:12px;padding:12px;align-items:flex-start">${frames.map(f=>`<img style="width:${w===1440?'380':'180'}px" src="data:image/png;base64,${f}">`).join('')}</body>`);
      await q.screenshot({path:`${OUT}/R2-4-optA-strip-en-${w}.png`,fullPage:true});await q.close();
    }
    // reduced motion + hover pause proof (1440 en only)
    if(opt==='optA'&&lang==='en'&&w===1440){
      await p.hover('[data-rv-wall]'); const a1=await p.evaluate(()=>document.querySelector('[data-rv-col]').getAnimations()[0].playState);
      console.log('hover playState (paused set by script earlier; check css rule):',await p.evaluate(()=>getComputedStyle(document.querySelector('[data-rv-col]')).animationPlayState));
    }
    await p.context().close();
  }
  if(w===1440||w===390){
    const rp=await open(w,lang,14,true); await rp.addStyleTag({content:cssA}); await rp.evaluate(build,'y'); await rp.waitForTimeout(300);
    console.log('reduced',lang,w,await rp.evaluate(()=>({anim:getComputedStyle(document.querySelector('[data-rv-col]')).animationName,cl:getComputedStyle(document.querySelector('[data-rv-clone]')).display,h:document.querySelector('[data-rv-wall]').getBoundingClientRect().height,sw:document.documentElement.scrollWidth<=innerWidth})));
    await shotWall(rp,`R2-4-optA-reduced-${lang}-${w}`,sec); await rp.context().close();
  }
}
await browser.close();
