import { chromium } from '/Users/koss/Developer/VamosTaxi.eu/.claude/worktrees/site-polish/apps/web/node_modules/@playwright/test/index.mjs';
import fs from 'node:fs';
export const exe='/Users/koss/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell';
export const SC='/Users/koss/Developer/VamosTaxi.eu/.claude/worktrees/site-polish/.planning/quick/261003-site-polish/screens/';
export async function open(b,w,h,lang='en',css=''){
 const ctx=await b.newContext({viewport:{width:w,height:h}});
 const p=await ctx.newPage();
 await stub(p);
 await p.goto('http://localhost:4798/app/home/home.dc.html',{waitUntil:'load'});
 await p.waitForTimeout(2500);
 const n=p.getByRole('button',{name:/Necessary only/i}); if(await n.isVisible().catch(()=>false)) await n.click();
 if(lang!=='en'){await p.evaluate(l=>window.VamosLocale.setLang(l),lang);}
 if(css) await p.addStyleTag({content:css});
 if(css.includes('data-bookcard') && w>=681 && w<=1080) await p.evaluate(()=>{const o=document.getElementById('book'); if(o) o.removeAttribute('id'); document.querySelector('[data-bookcard]').id='book';});
 await p.waitForTimeout(900);
 return p;
}
export {chromium,fs};

const SUG=[{mapbox_id:'mb-zrh',name:'Zurich Airport (ZRH)',address:'Flughafenstrasse, Kloten',air:true},{mapbox_id:'mb-st',name:'Bahnhofstrasse 1',address:'Zurich',air:false}];
export async function stub(p){
 await p.route('**/api/geo/suggest**',r=>{const q=(new URL(r.request().url()).searchParams.get('q')||'').toLowerCase();r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({suggestions:SUG.filter(s=>s.name.toLowerCase().includes(q)).map(({mapbox_id,name,address})=>({mapbox_id,name,address}))})})});
 await p.route('**/api/geo/retrieve**',r=>{const id=new URL(r.request().url()).searchParams.get('mapbox_id');const h=SUG.find(s=>s.mapbox_id===id);r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,place:h?{mapbox_id:id,name:h.name,isAirport:h.air}:null})})});
}
export async function pickAirport(p){
 const from=p.getByRole('combobox',{name:/^(From|Von|De|من)$/});
 await from.first().fill('Zurich'); await p.waitForTimeout(700);
 await p.getByRole('option').first().click(); await p.waitForTimeout(900);
}
