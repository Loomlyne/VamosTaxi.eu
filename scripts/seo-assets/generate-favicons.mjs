import { favicons } from "favicons";
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
const B = (f) => readFileSync(f);
const r = await favicons(B("scripts/seo-assets/icon.svg"), {
  path:"/", appName:"Vamos Taxi", appShortName:"Vamos Taxi", appDescription:"Pre-booked taxi transfers in Switzerland",
  background:"#1E1F1F", theme_color:"#1E1F1F", display:"browser", orientation:"any", start_url:"/", lang:"en",
  manifestMaskable:B("scripts/seo-assets/icon-maskable.svg"), appleStatusBarStyle:"default",
  icons:{android:true,appleIcon:{source:B("scripts/seo-assets/icon-apple.svg")},favicons:true,appleStartup:false,windows:false,yandex:false}});
mkdirSync("out",{recursive:true});
for (const i of r.images) writeFileSync("out/"+i.name,i.contents);
for (const f of r.files) writeFileSync("out/"+f.name,f.contents);
console.log(r.images.map(i=>i.name),r.files.map(f=>f.name));console.log(r.html.join("\n"));
