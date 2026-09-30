import sharp from "sharp";
import { readFileSync, writeFileSync } from "node:fs";
const R = (process.env.REPO ?? "..") + "/";
const bg = await sharp(R+"assets/photography/hero-airport.jpg").resize(1200,630,{fit:"cover",position:"centre"}).toBuffer();
const scrim = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><defs><linearGradient id="g" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#1E1F1F" stop-opacity="0.92"/><stop offset="0.55" stop-color="#1E1F1F" stop-opacity="0.45"/><stop offset="1" stop-color="#1E1F1F" stop-opacity="0.15"/></linearGradient></defs><rect width="1200" height="630" fill="url(#g)"/></svg>`);
const word = await sharp(readFileSync(R+"assets/logo/wordmark-white.svg"),{density:300}).resize({width:560}).png().toBuffer();
const out = await sharp(bg).composite([{input:scrim},{input:word,left:72,top:630-72-Math.round(560*344/2490)}]).jpeg({quality:86,mozjpeg:true}).toBuffer();
writeFileSync(R+"apps/web/public/og-image.jpg",out); console.log(out.length);
