import {useEffect,useRef,useState} from 'react';
import {ArrowLeft,ArrowRight,BookOpen,Delete,LockKeyhole,ShieldCheck} from 'lucide-react';
import Coach from './shared/Coach';
import {professorVault,type SecureStore} from './lib/professor-vault';
import type {ApplicationGuidance} from './lib/application-guidance';
const names=['곽은주','오소정'];
type Unlocked={professor:number;store:SecureStore;expires:number;guidance?:ApplicationGuidance|null};
export default function ProfessorAccess(){
 const [selected,setSelected]=useState<number|null>(null),[pin,setPin]=useState(''),[unlocked,setUnlocked]=useState<Unlocked|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[retryUntil,setRetryUntil]=useState(0),[clock,setClock]=useState(Date.now());
 const input=useRef<HTMLInputElement>(null),inFlight=useRef(false);
 const locking=useRef<Promise<void>>(Promise.resolve());
 const wait=Math.max(0,Math.ceil((retryUntil-clock)/1000));
 useEffect(()=>{if(!retryUntil)return;const timer=setInterval(()=>setClock(Date.now()),1000);return()=>clearInterval(timer);},[retryUntil]);
 async function lock(next:number|null=null){setUnlocked(null);setSelected(next);setPin('');setError('');locking.current=fetch('/api/professor-access',{method:'DELETE'}).then(()=>{}).catch(()=>{});await locking.current;window.scrollTo(0,0);}
 useEffect(()=>{
  if(!unlocked)return;let idle:ReturnType<typeof setTimeout>;
  const expire=setTimeout(()=>void lock(),Math.max(0,unlocked.expires-Date.now()));
  const touch=()=>{clearTimeout(idle);idle=setTimeout(()=>void lock(),15*60*1000);};
  const visible=()=>{if(document.visibilityState==='visible'&&Date.now()>=unlocked.expires)void lock();};
  touch();window.addEventListener('pointerdown',touch,{passive:true});window.addEventListener('keydown',touch);document.addEventListener('visibilitychange',visible);
  return()=>{clearTimeout(idle);clearTimeout(expire);window.removeEventListener('pointerdown',touch);window.removeEventListener('keydown',touch);document.removeEventListener('visibilitychange',visible);};
 },[unlocked]);
 async function enter(){
  if(selected===null||pin.length!==4||inFlight.current||wait)return;inFlight.current=true;setBusy(true);setError('');
  try{
   await locking.current;
   const response=await fetch('/api/professor-access',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({professor:selected,pin})});
   const result=await response.json() as {status:string;key?:string;expires?:number;message?:string;retryAfterSeconds?:number;guidance?:ApplicationGuidance|null};
   if(result.status!=='success'||!result.key||!result.expires){setError(result.message||'입장할 수 없습니다. 잠시 후 다시 시도해 주세요.');setPin('');if(result.retryAfterSeconds){setRetryUntil(Date.now()+result.retryAfterSeconds*1000);setClock(Date.now());}return;}
   const store=await professorVault(selected,result.key);setPin('');setUnlocked({professor:selected,store,expires:result.expires,guidance:result.guidance});
  }catch(e){setError(e instanceof Error&&e.message.includes('기존 기록')?e.message:'잠금 서비스를 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.');}
  finally{setBusy(false);inFlight.current=false;}
 }
 if(unlocked)return <Coach key={unlocked.professor} storageScope={`vercel-professor-${unlocked.professor}`} runtime="vercel" lockedProfessor={unlocked.professor} secureStore={unlocked.store} applicationGuidance={unlocked.guidance} onProfessorChange={p=>void lock(p)} onLock={()=>void lock()}/>;
 return <div className="access-shell"><a className="access-brand" href="/"><BookOpen size={22}/><strong>똑똑</strong><span>수업 컨설팅 노트</span></a><main className="access-card"><span className="access-eyebrow">찾아가는 교수법 똑-똑</span>{selected===null?<><h1>교수님을 선택해 주세요.</h1><p>각 교수님의 상담 공간은<br/>4자리 비밀번호로 보호됩니다.</p><div className="access-professors">{names.map((name,p)=><button key={name} onClick={()=>{setSelected(p);setError('');setPin('');}}><span className="access-avatar">{name[0]}</span><strong>{name} 교수님</strong><LockKeyhole size={17}/><ArrowRight size={17}/></button>)}</div></>:<><button className="access-back" onClick={()=>{setSelected(null);setPin('');setError('');}} disabled={busy}><ArrowLeft size={15}/>교수님 선택</button><div className="access-lock"><LockKeyhole size={25}/></div><h1>{names[selected]} 교수님</h1><p>상담 공간에 입장하려면<br/>숫자 4자리 비밀번호를 입력해 주세요.</p><form onSubmit={e=>{e.preventDefault();void enter();}}><label className="pin-label" htmlFor="professor-pin">4자리 비밀번호</label><input ref={input} autoFocus id="professor-pin" className="pin-input" type="password" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} autoComplete="off" value={pin} onChange={e=>setPin(e.target.value.replace(/\D/g,'').slice(0,4))} disabled={busy||wait>0} aria-describedby="pin-feedback"/><div className="pin-keypad">{['1','2','3','4','5','6','7','8','9','clear','0','delete'].map(key=><button type="button" key={key} disabled={busy||wait>0} aria-label={key==='delete'?'한 자리 지우기':key==='clear'?'전체 지우기':key} onClick={()=>{setPin(prev=>key==='delete'?prev.slice(0,-1):key==='clear'?'':(prev+key).slice(0,4));input.current?.focus();}}>{key==='delete'?<Delete size={19}/>:key==='clear'?<span>지우기</span>:key}</button>)}</div><p id="pin-feedback" className="pin-feedback" role="status">{wait>0?`${Math.floor(wait/60)}분 ${wait%60}초 후 다시 시도해 주세요.`:error}</p><button className="access-enter" type="submit" disabled={busy||pin.length!==4||wait>0}>{busy?'확인 중…':'상담 공간 입장'}<ArrowRight size={17}/></button></form></>}<div className="access-footnote"><ShieldCheck size={15}/><span>교수님별 기록 보호 · 15분 미사용 시 자동 잠금</span></div></main><footer>동명대학교 교수학습지원센터</footer></div>;
}
