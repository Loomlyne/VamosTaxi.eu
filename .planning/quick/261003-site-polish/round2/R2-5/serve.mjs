// Static server for apps/web/public (replaces python http.server, which dropped requests under load).
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const root = path.resolve('../../../../../apps/web/public'); const port = +process.argv[2] || 4801;
const T = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.jpg':'image/jpeg','.png':'image/png','.ttf':'font/ttf','.woff2':'font/woff2','.json':'application/json'};
http.createServer((q,r)=>{ let f=path.join(root,decodeURIComponent(q.url.split('?')[0])); if(!f.startsWith(root)){r.writeHead(403);return r.end()}
 fs.readFile(f,(e,d)=>{ if(e){r.writeHead(404);return r.end()} r.writeHead(200,{'content-type':T[path.extname(f)]||'application/octet-stream'}); r.end(d)}) }).listen(port,'127.0.0.1',()=>console.log('up',port,root));
