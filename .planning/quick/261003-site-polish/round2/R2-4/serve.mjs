import http from 'node:http';import fs from 'node:fs';import path from 'node:path';
const root=process.argv[2],port=+process.argv[3];
const T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.woff2':'font/woff2','.json':'application/json'};
http.createServer((q,s)=>{let p=path.join(root,decodeURIComponent(q.url.split('?')[0]));fs.readFile(p,(e,d)=>{if(e){s.statusCode=404;return s.end();}s.setHeader('content-type',T[path.extname(p)]||'application/octet-stream');s.end(d);});}).listen(port,'127.0.0.1');
