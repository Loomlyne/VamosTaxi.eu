import {chromium,exe,open,fs,SC} from './lib.mjs';
import crypto from 'node:crypto';
const D='/Users/koss/Developer/VamosTaxi.eu/.claude/worktrees/site-polish/.planning/quick/261003-site-polish/round2/R2-2/';
const cssA=fs.readFileSync(D+'optA.css','utf8'), cssB=fs.readFileSync(D+'optB.css','utf8'), jsB=fs.readFileSync(D+'optB.js','utf8');
const b=await chromium.launch({executablePath:exe});
const out=[];
for (const lang of ['en','ar']) for (const [w,h] of [[1440,900],[390,844],[680,900],[1081,800]]){
 const hs={};
 for (const [v,css,js] of [['before','',''],['optA',cssA,''],['optB',cssB,jsB]]){
  const p=await open(b,w,h,lang,css); if(js&&w>=681&&w<=1080) await p.evaluate(js); await p.waitForTimeout(300);
  const buf=await p.screenshot({path:`${SC}R2-2-${v}-${lang}-${w}x${h}.png`}); hs[v]=crypto.createHash('md5').update(buf).digest('hex').slice(0,8); await p.context().close();
 }
 out.push([lang,w,h,hs]);
}
console.log(JSON.stringify(out));
await b.close();
