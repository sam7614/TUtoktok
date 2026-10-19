import {createHmac,randomBytes,timingSafeEqual,createCipheriv} from 'node:crypto';

const SESSION_SECONDS=7200;
const WINDOW_MS=10*60*1000;
const attempts=new Map();
const sessionName='tu_prof_access';
const attemptsName='tu_prof_attempts';
const json=(body,status=200,headers={})=>{const result=new Headers(headers);result.set('Cache-Control','private, no-store');result.set('Vary','Cookie');return Response.json(body,{status,headers:result});};
function secret(){const value=process.env.PROFESSOR_SESSION_SECRET;if(!value||value.length<40)throw new Error('not_configured');return value;}
function mac(value){return createHmac('sha256',secret()).update(value).digest('base64url');}
function signed(value){const encoded=Buffer.from(JSON.stringify(value)).toString('base64url');return `${encoded}.${mac(encoded)}`;}
function verified(value){try{if(!value||value.length>4096)return null;const [encoded,signature]=value.split('.');const expected=mac(encoded);if(!signature||signature.length!==expected.length||!timingSafeEqual(Buffer.from(signature),Buffer.from(expected)))return null;return JSON.parse(Buffer.from(encoded,'base64url').toString('utf8'));}catch{return null;}}
function cookies(request){return Object.fromEntries((request.headers.get('cookie')||'').split(';').map(v=>v.trim().split(/=(.*)/s).slice(0,2)).filter(v=>v.length===2));}
function cookie(name,value,request,maxAge){return `${name}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${new URL(request.url).protocol==='https:'?'; Secure':''}`;}
function vaultKey(professor){return createHmac('sha256',secret()).update(`tu-professor-vault-v1:${professor}`).digest();}
function encrypt(records,professor){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',vaultKey(professor),iv);const encrypted=Buffer.concat([cipher.update(JSON.stringify(records),'utf8'),cipher.final(),cipher.getAuthTag()]);return {version:1,iv:iv.toString('base64url'),ciphertext:encrypted.toString('base64url')};}
function validLegacy(value){return value&&typeof value==='object'&&!Array.isArray(value)&&Object.entries(value).length<=6&&Object.entries(value).every(([key,v])=>/^[01]-[012]$/.test(key)&&v&&typeof v==='object'&&['date','course','mentor','notes'].every(k=>typeof v[k]==='string')&&['answers','extra','summary'].every(k=>v[k]&&typeof v[k]==='object'&&!Array.isArray(v[k])&&Object.values(v[k]).every(x=>typeof x==='string'))&&typeof v.complete==='boolean');}
function retry(request,professor,now,failures,ip){
 const state=failures?.type==='attempts'?failures:{type:'attempts'};
 const prior=state[professor]&&state[professor].until>now?state[professor]:{count:0,until:now+WINDOW_MS};
 const memoryKey=mac(`${ip}:${professor}`),local=attempts.get(memoryKey);
 const count=Math.max(prior.count,local?.until>now?local.count:0)+1;
 const next={count,until:prior.until};state[professor]=next;attempts.set(memoryKey,next);
 if(attempts.size>2000)for(const [key,value]of attempts)if(value.until<now)attempts.delete(key);
 const blocked=count>=5;
 return json({status:blocked?'rate_limited':'invalid_pin',message:blocked?'비밀번호를 5회 잘못 입력했습니다. 10분 뒤 다시 시도해 주세요.':'비밀번호가 올바르지 않습니다.',...(blocked?{retryAfterSeconds:Math.ceil((next.until-now)/1000)}:{})},blocked?429:401,{'Set-Cookie':cookie(attemptsName,signed(state),request,600),...(blocked?{'Retry-After':String(Math.ceil((next.until-now)/1000))}:{})});
}
export async function handleAccess(request){
 try{
  secret();
  const url=new URL(request.url),now=Date.now(),jar=cookies(request),session=verified(jar[sessionName]);
  if(!['GET','POST','DELETE'].includes(request.method))return json({status:'invalid_request'},405,{'Allow':'GET, POST, DELETE'});
  if(request.method!=='GET'&&request.headers.get('origin')!==url.origin)return json({status:'forbidden',message:'같은 앱에서 요청해 주세요.'},403);
  if(request.method==='DELETE')return json({status:'success'},200,{'Set-Cookie':cookie(sessionName,'',request,0)});
  const requested=Number(url.searchParams.get('professor'));
  if(request.method==='GET'){
   if(!/^[01]$/.test(url.searchParams.get('professor')||'')||!session||session.type!=='session'||session.professor!==requested||session.expires<=now)return json({status:'locked'},401);
   return json({status:'success',professor:requested,key:vaultKey(requested).toString('base64url'),expires:session.expires});
  }
  const text=await request.text();if(text.length>1500000)return json({status:'invalid_request',message:'기록 파일이 너무 큽니다.'},413);
  let body;try{body=JSON.parse(text);}catch{return json({status:'invalid_request'},400);}
  const professor=body.professor;if(professor!==0&&professor!==1)return json({status:'invalid_request'},400);
  if(body.action==='migrate'){
   if(!session||session.type!=='session'||session.professor!==professor||session.expires<=now)return json({status:'locked'},401);
   if(!validLegacy(body.records))return json({status:'invalid_request',message:'기존 기록 형식을 확인해 주세요.'},400);
   const vaults={};for(const p of [0,1]){const records=Object.fromEntries(Object.entries(body.records).filter(([key])=>key.startsWith(`${p}-`)));if(Object.keys(records).length)vaults[p]=encrypt(records,p);}
   return json({status:'success',vaults});
  }
  if(typeof body.pin!=='string'||!/^\d{4}$/.test(body.pin))return json({status:'invalid_request',message:'숫자 4자리를 입력해 주세요.'},400);
  const expected=process.env[`PROFESSOR_PIN_${professor}`];if(!expected||!/^\d{4}$/.test(expected))return json({status:'unavailable',message:'비밀번호 설정을 준비하고 있습니다.'},503);
  const ip=request.headers.get('x-real-ip')||request.headers.get('x-forwarded-for')?.split(',')[0]||'unknown';
  const failures=verified(jar[attemptsName]),stored=failures?.type==='attempts'?failures[professor]:null,local=attempts.get(mac(`${ip}:${professor}`));
  const lock=[stored,local].find(v=>v?.until>now&&v.count>=5);if(lock)return json({status:'rate_limited',message:'잠시 잠겨 있습니다. 안내된 시간 뒤 다시 시도해 주세요.',retryAfterSeconds:Math.ceil((lock.until-now)/1000)},429,{'Retry-After':String(Math.ceil((lock.until-now)/1000))});
  if(!timingSafeEqual(Buffer.from(body.pin),Buffer.from(expected)))return retry(request,professor,now,failures,ip);
  attempts.delete(mac(`${ip}:${professor}`));
  const token=signed({type:'session',professor,expires:now+SESSION_SECONDS*1000,nonce:randomBytes(16).toString('base64url')});
  const headers=new Headers();headers.append('Set-Cookie',cookie(sessionName,token,request,SESSION_SECONDS));headers.append('Set-Cookie',cookie(attemptsName,'',request,0));
  return json({status:'success',professor,key:vaultKey(professor).toString('base64url'),expires:now+SESSION_SECONDS*1000},200,headers);
 }catch{return json({status:'unavailable',message:'잠금 서비스를 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.'},503);}
}
export default {fetch:handleAccess};
