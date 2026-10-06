const http=require('http');
const fs=require('fs');
const path=require('path');
const {S3Client,GetObjectCommand,PutObjectCommand}=require('@aws-sdk/client-s3');

const PORT=process.env.PORT||3000;
const PUBLIC=__dirname;
const DATA=process.env.DATA_FILE||path.join(__dirname,'data.json');
const S3_BUCKET=process.env.S3_BUCKET||'';
const S3_KEY=process.env.S3_KEY||'planner/data.json';
const S3_ENDPOINT=process.env.S3_ENDPOINT||'https://s3.twcstorage.ru';
const S3_REGION=process.env.S3_REGION||'ru-1';
const USE_S3=Boolean(S3_BUCKET);
const s3=USE_S3?new S3Client({region:S3_REGION,endpoint:S3_ENDPOINT}):null;

const seed=()=>({projects:[],people:[],tasks:[],workload:[],meta:{updatedAt:new Date().toISOString()}});
let state=null;
let writeQueue=Promise.resolve();

function isMissing(err){return err&&(err.name==='NoSuchKey'||err.name==='NotFound'||err.$metadata?.httpStatusCode===404)}
async function bodyText(body){
  if(!body)return '';
  if(typeof body.transformToString==='function')return body.transformToString();
  const chunks=[];for await(const c of body)chunks.push(Buffer.from(c));
  return Buffer.concat(chunks).toString('utf8');
}
async function s3Read(){
  try{
    const out=await s3.send(new GetObjectCommand({Bucket:S3_BUCKET,Key:S3_KEY}));
    const text=await bodyText(out.Body);
    if(!text.trim())throw new Error('S3 state object is empty');
    return JSON.parse(text);
  }catch(e){if(isMissing(e))return null;throw e}
}
async function s3Write(data){
  await s3.send(new PutObjectCommand({
    Bucket:S3_BUCKET,Key:S3_KEY,
    Body:JSON.stringify(data,null,2),
    ContentType:'application/json; charset=utf-8'
  }));
}
function localRead(){
  if(!fs.existsSync(DATA))fs.writeFileSync(DATA,JSON.stringify(seed(),null,2),'utf8');
  return JSON.parse(fs.readFileSync(DATA,'utf8'));
}
async function localWrite(data){await fs.promises.writeFile(DATA,JSON.stringify(data,null,2),'utf8')}

async function initStorage(){
  if(USE_S3){
    const saved=await s3Read();
    if(saved){state=saved;console.log('Planner state loaded from S3')}
    else{state=seed();await s3Write(state);console.log('Initial planner state created in S3')}
  }else{
    state=localRead();
    console.warn('S3 is not configured; using local data.json');
  }
}
function persist(next){
  next.meta={...(next.meta||{}),updatedAt:new Date().toISOString()};
  writeQueue=writeQueue.catch(()=>{}).then(()=>USE_S3?s3Write(next):localWrite(next));
  return writeQueue;
}
function json(res,code,body){
  res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
  res.end(JSON.stringify(body));
}
function parseBody(req){
  return new Promise((resolve,reject)=>{
    let body='';
    req.on('data',c=>{body+=c;if(body.length>2e6){reject(new Error('Request body too large'));req.destroy()}});
    req.on('end',()=>{try{resolve(body?JSON.parse(body):{})}catch(e){reject(e)}});
    req.on('error',reject);
  });
}
function serveStatic(req,res){
  const raw=decodeURIComponent(req.url.split('?')[0]);
  const rel=raw==='/'?'/index.html':raw;
  const file=path.normalize(path.join(PUBLIC,rel));
  if(!file.startsWith(PUBLIC))return json(res,403,{error:'Forbidden'});
  fs.stat(file,(err,st)=>{
    if(err||!st.isFile())return json(res,404,{error:'Not found'});
    const ext=path.extname(file);
    const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon'}[ext]||'application/octet-stream';
    res.writeHead(200,{'Content-Type':mime});
    fs.createReadStream(file).pipe(res);
  });
}

const server=http.createServer(async(req,res)=>{
  try{
    if(req.url.startsWith('/api/state')){
      if(req.method==='GET')return json(res,200,state);
      if(req.method==='PUT'){
        const incoming=await parseBody(req);
        if(!incoming||!Array.isArray(incoming.projects)||!Array.isArray(incoming.tasks)||!Array.isArray(incoming.people)||!Array.isArray(incoming.workload))return json(res,400,{error:'Invalid state'});
        await persist(incoming);
        state=incoming;
        return json(res,200,{ok:true,updatedAt:state.meta.updatedAt});
      }
    }
    if(req.url==='/api/reset'&&req.method==='POST'){
      const empty=seed();
      await persist(empty);
      state=empty;
      return json(res,200,{ok:true});
    }
    if(req.url==='/api/health')return json(res,200,{ok:true,storage:USE_S3?'s3':'local',key:USE_S3?S3_KEY:undefined});
    return serveStatic(req,res);
  }catch(e){console.error(e);return json(res,500,{error:'Server error'})}
});

initStorage()
  .then(()=>server.listen(PORT,'0.0.0.0',()=>console.log('HAUSWERK Planner on :'+PORT+' | storage='+(USE_S3?'S3':'local'))))
  .catch(e=>{console.error('Failed to initialize storage:',e);process.exit(1)});
