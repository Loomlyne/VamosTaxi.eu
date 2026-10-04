import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const root='/Users/koss/Developer/VamosTaxi.eu/.claude/worktrees/site-polish/apps/web/public';
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.woff2':'font/woff2','.woff':'font/woff','.otf':'font/otf','.ttf':'font/ttf'};
http.createServer((q,s)=>{let u=decodeURIComponent(q.url.split('?')[0]);if(u.startsWith('/api/')){s.writeHead(200,{'content-type':'application/json'});return s.end('{}')}
 let f=path.join(root,u);fs.readFile(f,(e,d)=>{if(e){s.writeHead(404);return s.end()}s.writeHead(200,{'content-type':mime[path.extname(f)]||'application/octet-stream'});s.end(d)})}).listen(4798);
