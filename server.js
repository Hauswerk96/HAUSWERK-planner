const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');
const DATA = process.env.DATA_FILE || path.join(__dirname, 'data.json');

const seed = {
  projects: [
    {id:"p1", name:"VILLA 01", client:"Частный заказчик", stage:"ЭП", progress:68, deadline:"2026-10-24", priority:"Высокий"},
    {id:"p2", name:"HOUSE 17", client:"HAUSWERK", stage:"АР", progress:42, deadline:"2026-11-14", priority:"Средний"},
    {id:"p3", name:"RESIDENCE M", client:"Частный заказчик", stage:"Концепция", progress:24, deadline:"2026-10-18", priority:"Высокий"}
  ],
  people: [
    {id:"u1", name:"Богдан", role:"Главный архитектор"},
    {id:"u2", name:"Архитектор 01", role:"Архитектор"},
    {id:"u3", name:"Архитектор 02", role:"Архитектор"}
  ],
  tasks: [
    {id:"t1", title:"Фасады — вариант 03", projectId:"p1", assigneeId:"u1", status:"В работе", priority:"Высокий", deadline:"2026-10-09", progress:70},
    {id:"t2", title:"Корректировка планировки", projectId:"p1", assigneeId:"u2", status:"На проверке", priority:"Средний", deadline:"2026-10-07", progress:90},
    {id:"t3", title:"Узлы кровли", projectId:"p2", assigneeId:"u3", status:"В работе", priority:"Средний", deadline:"2026-10-16", progress:35},
    {id:"t4", title:"Концепция благоустройства", projectId:"p3", assigneeId:"u2", status:"К выполнению", priority:"Высокий", deadline:"2026-10-11", progress:10}
  ],
  workload: [
    {personId:"u1", weeks:[34,38,31,29]},
    {personId:"u2", weeks:[40,42,37,34]},
    {personId:"u3", weeks:[28,32,36,30]}
  ],
  meta:{updatedAt:new Date().toISOString()}
};

function ensureData() {
  if (!fs.existsSync(DATA)) fs.writeFileSync(DATA, JSON.stringify(seed, null, 2), 'utf8');
}
function readData() {
  ensureData();
  return JSON.parse(fs.readFileSync(DATA, 'utf8'));
}
let writeQueue = Promise.resolve();
function writeData(data) {
  data.meta = {updatedAt:new Date().toISOString()};
  writeQueue = writeQueue.then(() => fs.promises.writeFile(DATA, JSON.stringify(data, null, 2), 'utf8'));
  return writeQueue;
}
function json(res, code, body) {
  res.writeHead(code, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
  res.end(JSON.stringify(body));
}
function parseBody(req) {
  return new Promise((resolve,reject)=>{
    let body='';
    req.on('data', c => { body += c; if (body.length > 2e6) req.destroy(); });
    req.on('end',()=>{ try{ resolve(body ? JSON.parse(body) : {}); }catch(e){ reject(e);} });
    req.on('error',reject);
  });
}
function serveStatic(req,res) {
  const raw = decodeURIComponent(req.url.split('?')[0]);
  const rel = raw === '/' ? '/index.html' : raw;
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC)) return json(res,403,{error:'Forbidden'});
  fs.stat(file,(err,st)=>{
    if (err || !st.isFile()) return json(res,404,{error:'Not found'});
    const ext = path.extname(file);
    const mime = {
      '.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8',
      '.js':'application/javascript; charset=utf-8','.svg':'image/svg+xml',
      '.png':'image/png','.ico':'image/x-icon'
    }[ext] || 'application/octet-stream';
    res.writeHead(200, {'Content-Type':mime});
    fs.createReadStream(file).pipe(res);
  });
}

const server = http.createServer(async (req,res)=>{
  try {
    if (req.url.startsWith('/api/state')) {
      if (req.method === 'GET') return json(res,200,readData());
      if (req.method === 'PUT') {
        const incoming = await parseBody(req);
        if (!incoming || !Array.isArray(incoming.projects) || !Array.isArray(incoming.tasks) || !Array.isArray(incoming.people)) {
          return json(res,400,{error:'Invalid state'});
        }
        await writeData(incoming);
        return json(res,200,{ok:true, updatedAt: incoming.meta?.updatedAt});
      }
    }
    if (req.url === '/api/reset' && req.method === 'POST') {
      await writeData(JSON.parse(JSON.stringify(seed)));
      return json(res,200,{ok:true});
    }
    if (req.url === '/api/health') return json(res,200,{ok:true});
    return serveStatic(req,res);
  } catch (e) {
    console.error(e);
    return json(res,500,{error:'Server error'});
  }
});
server.listen(PORT,'0.0.0.0',()=>console.log(`HAUSWERK Planner on :${PORT}`));
