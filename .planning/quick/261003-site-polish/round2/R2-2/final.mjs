import {chromium,exe,open,fs,pickAirport,SC} from './lib.mjs';
import crypto from 'node:crypto';
const D='/Users/koss/Developer/VamosTaxi.eu/.claude/worktrees/site-polish/.planning/quick/261003-site-polish/round2/R2-2/';
const cssA=fs.readFileSync(D+'optA.css','utf8'), cssB=fs.readFileSync(D+'optB.css','utf8'), jsB=fs.readFileSync(D+'optB.js','utf8');
const b=await chromium.launch({executablePath:exe});
const sizes=[[768,1024],[820,1180],[1024,768],[1024,1366]];
const hash=(buf)=>crypto.createHash('md5').update(buf).digest('hex').slice(0,8);
const report=[];
const f=(v,l,w,h,x='')=>`${SC}R2-2-${v}-${l}-${w}x${h}${x}.png`;
for (const lang of ['en','ar']){
 for (const [w,h] of sizes){
  // before
  let p=await open(b,w,h,lang); await p.screenshot({path:f('before',lang,w,h)});
  report.push([lang,w,h,'before',await p.evaluate(()=>{const e=document.querySelector('[data-bar-wrap]');return [Math.round(e.getBoundingClientRect().bottom),Math.round(document.querySelector('[data-trust]').getBoundingClientRect().bottom),Math.round(document.querySelector('[data-hero]').getBoundingClientRect().bottom),document.scrollingElement.scrollWidth,innerWidth]})]);
  await p.locator('[data-bb]').first().click(); await p.waitForTimeout(900); await p.screenshot({path:f('before',lang,w,h,'-sheet')}); await p.context().close();
  // A
  p=await open(b,w,h,lang,cssA); await p.screenshot({path:f('optA',lang,w,h)});
  report.push([lang,w,h,'A',await p.evaluate(()=>{const e=document.querySelector('[data-bookcard]');return [Math.round(e.getBoundingClientRect().bottom),Math.round(document.querySelector('[data-trust]').getBoundingClientRect().bottom),Math.round(document.querySelector('[data-hero]').getBoundingClientRect().bottom),document.scrollingElement.scrollWidth,innerWidth]})]);
  await p.context().close();
  p=await open(b,w,h,lang,cssA); await pickAirport(p); await p.screenshot({path:f('optA',lang,w,h,'-flight')});
  report.push([lang,w,h,'A-flight',await p.evaluate(()=>[Math.round(document.querySelector('[data-trust]').getBoundingClientRect().bottom),Math.round(document.querySelector('[data-hero]').getBoundingClientRect().bottom),document.scrollingElement.scrollWidth,innerWidth])]);
  await p.context().close();
  // B
  p=await open(b,w,h,lang,cssB); await p.evaluate(jsB); await p.waitForTimeout(300); await p.screenshot({path:f('optB',lang,w,h)});
  report.push([lang,w,h,'B',await p.evaluate(()=>{const e=document.querySelector('[data-bar-wrap]');return [Math.round(e.getBoundingClientRect().bottom),Math.round(document.querySelector('[data-trust]')?.getBoundingClientRect().bottom||0),Math.round(document.querySelector('[data-hero]').getBoundingClientRect().bottom),document.scrollingElement.scrollWidth,innerWidth]})]);
  await p.locator('[data-tgo]').click(); await p.waitForTimeout(900); await p.screenshot({path:f('optB',lang,w,h,'-sheet')});
  report.push([lang,w,h,'B-sheet',await p.evaluate(()=>{const bd=document.querySelector('[data-bs-body]');return [bd.scrollHeight,bd.clientHeight]})]);
  await p.context().close();
 }
 // unchanged proof 1440 / 390 / 1081
 for (const [w,h] of [[1440,900],[390,844],[680,900],[1081,800]]){
  const hs={};
  for (const [v,css,js] of [['before','',''],['optA',cssA,''],['optB',cssB,jsB]]){
   const p=await open(b,w,h,lang,css); if(js){await p.evaluate(js)} await p.waitForTimeout(300);
   const buf=await p.screenshot({path:f(v,lang,w,h)}); hs[v]=hash(buf); await p.context().close();
  }
  report.push([lang,w,h,'hashes',hs]);
 }
}
console.log(JSON.stringify(report));
await b.close();
