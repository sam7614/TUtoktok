'use client';
import { useEffect, useRef, useState } from 'react';
import { BookOpen, Check, ChevronRight, FileText, Download, Upload, MessageCircle, Lightbulb, ArrowRight, CheckCircle2, Circle, ClipboardList, ExternalLink, ShieldCheck, Save } from 'lucide-react';
import { stages, sections, summaryLabels, probes, emptyRecord, questionKey, documentText, type RecordData } from '@/lib/questions';

const professors = ['곽은주','오소정'];
const courses = ['행복한인간관계심리','학령기의사소통장애'];
type Store = Record<string,RecordData>;
type ApiData = {status:string;records?:Store;message?:string;documentUrl?:string;chatGPTSignInPath?:string;reused?:boolean;retryAfterMs?:number};
async function responseData(response:Response):Promise<ApiData>{const data=await response.json();if(!data||typeof data!=='object'||!('status' in data))throw new Error('Invalid response');return data as ApiData;}
export default function Coach({storageScope}:{storageScope:string}) {
 const [records,setRecords]=useState<Store>({});
 const [ready,setReady]=useState(false),[prof,setProf]=useState(0),[stage,setStage]=useState(0),[section,setSection]=useState(0);
 const [saveState,setSaveState]=useState('자동 저장 준비 중'),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[review,setReview]=useState(false),[cooldown,setCooldown]=useState(false);
 const [error,setError]=useState<{message:string;href?:string;url?:string}|null>(null);
 const [cloudReady,setCloudReady]=useState(false),[cloudState,setCloudState]=useState('계정 저장 연결 중');
 const syncVersion=useRef(0);
 const fileRef=useRef<HTMLInputElement>(null), busyRef=useRef(false);
 const storageKey=`tu-teaching-notes-v1:${storageScope}`;
 useEffect(()=>{try {const raw=localStorage.getItem(storageKey); if(raw){const parsed=JSON.parse(raw);if(!validStore(parsed))throw new Error();setRecords(parsed);}setSaveState('이 브라우저에 자동 저장');}catch{setSaveState('저장된 기록을 읽을 수 없습니다. 백업 파일을 확인해 주세요.');}setReady(true);},[storageKey]);
 useEffect(()=>{if(!ready)return;try{localStorage.setItem(storageKey,JSON.stringify(records));setSaveState('이 브라우저에 저장됨');}catch{setSaveState('자동 저장 실패 · 백업 파일을 내려받아 주세요');}},[records,ready,storageKey]);
 useEffect(()=>{if(!ready)return;let active=true;fetch('/api/records').then(responseData).then(data=>{if(!active)return;if(data.status==='success'&&validStore(data.records)){setRecords(local=>{const merged={...local};for(const [key,record] of Object.entries(data.records as Store)){if(!merged[key]||(record.updatedAt??0)>(merged[key].updatedAt??0))merged[key]=record;}return merged;});setCloudState('계정 기록 불러옴');setCloudReady(true);}else setCloudState('계정 저장 연결 전');}).catch(()=>{if(active)setCloudState('계정 저장 연결 실패');});return()=>{active=false;};},[ready]);
 useEffect(()=>{if(!cloudReady)return;const version=++syncVersion.current;setCloudState('계정에 저장 중…');const timer=setTimeout(()=>{fetch('/api/records',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(records)}).then(responseData).then(data=>{if(syncVersion.current===version)setCloudState(data.status==='success'?'계정에도 저장됨':'계정 저장 실패 · 브라우저에 보관');}).catch(()=>{if(syncVersion.current===version)setCloudState('계정 저장 실패 · 브라우저에 보관');});},750);return()=>clearTimeout(timer);},[records,cloudReady]);
 const id=`${prof}-${stage}`, r=records[id]??emptyRecord(courses[prof]);
 const list=sections[stage], current=list[section];
 const total=list.reduce((n,s)=>n+s.questions.length,0);
 const filled=list.reduce((n,s,i)=>n+s.questions.filter((_,j)=>r.answers[questionKey(i,j)]?.trim()).length,0);
 function update(patch:Partial<RecordData>){setRecords(prev=>({...prev,[id]:{...(prev[id]??emptyRecord(courses[prof])),...patch,updatedAt:Date.now()}}));}
 function answer(key:string,value:string,kind:'answers'|'summary'|'extra'='answers'){update({[kind]:{...r[kind],[key]:value},complete:false});}
 function navigate(next:number){setSection(next);window.scrollTo({top:0,behavior:'smooth'});}
 function switchTo(p:number,s:number){setProf(p);setStage(s);setSection(0);setReview(false);setError(null);setNotice('');}
 function download(content:string,name:string,type='application/json'){const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 function backup(){download(JSON.stringify({version:1,records},null,2),'똑똑_상담기록_백업.json');}
 async function restore(file?:File){if(!file)return;try{const data=JSON.parse(await file.text());if(data.version!==1||!validStore(data.records))throw new Error();if(!window.confirm('현재 브라우저 기록을 백업 파일의 기록으로 바꿀까요?'))return;setRecords(Object.fromEntries(Object.entries(data.records as Store).map(([k,v])=>[k,{...v,updatedAt:Date.now()}])));setNotice('백업 기록을 복원했습니다.');}catch{setNotice('올바른 똑똑 백업 파일을 선택해 주세요.');}if(fileRef.current)fileRef.current.value='';}
 async function exportDoc(){
  if(busyRef.current||cooldown)return;busyRef.current=true;setBusy(true);setError(null);setNotice('');
  const recordId=id, snapshot={...r};
  try{
   const res=await fetch('/api/export',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({professor:prof,stage,record:snapshot})});
   const data=await responseData(res);
   if(data.status!=='success'){if(data.retryAfterMs&&data.retryAfterMs>0){setCooldown(true);setTimeout(()=>setCooldown(false),Math.min(data.retryAfterMs,2147483647));}setError({message:data.message||'저장 결과를 확인할 수 없습니다. Google Drive에서 확인한 후 다시 시도해 주세요.',href:data.chatGPTSignInPath,url:data.documentUrl});return;}
   if(!data.documentUrl||!/^https:\/\/docs\.google\.com\/document\/d\/[A-Za-z0-9_-]+\/edit$/.test(data.documentUrl))throw new Error('Invalid document URL');
   const url=data.documentUrl;
   setRecords(prev=>({...prev,[recordId]:{...(prev[recordId]??snapshot),updatedAt:Date.now(),exported:{url,at:new Date().toISOString(),fingerprint:documentText(professors[prof],stage,snapshot)}}}));
   setNotice(data.reused?'같은 내용으로 저장한 문서가 있어 기존 문서를 연결했습니다.':'Google Docs에 전체 질문과 답변을 저장했습니다.');
  }catch{setError({message:'연결이 끊겨 저장 결과를 확인하지 못했습니다. Google Drive에서 문서를 먼저 확인해 주세요. 다시 저장하면 서버의 저장 기록을 확인합니다.'});}
  finally{setBusy(false);busyRef.current=false;}
 }
 if(!ready)return <div className="loading">상담 노트를 준비하고 있습니다…</div>;
 const reviewIndex=list.length+1;
 const title=section<list.length?current.title:section===list.length&&stage===0?'상황별 후속 질문':'상담 요약과 저장';
 return <div className="app-shell">
  <aside className="sidebar">
   <a className="brand" href="/"><span className="brand-icon"><BookOpen size={23}/></span><span>똑똑<span className="brand-sub">수업 컨설팅 노트</span></span></a>
   <div className="side-label">함께하는 교수님</div>
   <div className="professors">{professors.map((p,i)=><button key={p} className={`professor ${prof===i?'active':''}`} onClick={()=>switchTo(i,stage)} disabled={busy}><span className={`avatar avatar-${i}`}>{p.slice(0,1)}</span><span><strong>{p} 교수님</strong><small>{courses[i]}</small></span>{prof===i&&<ChevronRight size={16}/>}</button>)}</div>
   <div className="side-divider"/><div className="side-label">컨설팅 여정</div>
   <nav className="journey">{stages.map((s,i)=>{const rr=records[`${prof}-${i}`];return <button key={s} className={stage===i?'selected':''} onClick={()=>switchTo(prof,i)} disabled={busy}><span className="stage-no">{rr?.complete?<Check size={13}/>:String(i+1).padStart(2,'0')}</span><span>{s}<small>{rr?.complete?'작성 완료':rr&&Object.values(rr.answers).some(v=>v.trim())?'작성 중':'기록 시작하기'}</small></span></button>;})}</nav>
   <div className="side-bottom"><ShieldCheck size={18}/><p>나만의 상담 공간<small>{cloudState}<br/>브라우저 보관 · 계정 자동 저장</small></p></div>
   <div className="backup-actions"><button onClick={backup}><Download size={14}/>백업</button><button onClick={()=>fileRef.current?.click()} disabled={busy}><Upload size={14}/>불러오기</button><input hidden ref={fileRef} type="file" accept=".json" onChange={e=>restore(e.target.files?.[0])}/></div>
  </aside>
  <div className="workspace">
   <header className="topbar"><span>찾아가는 교수법 똑-똑 <ChevronRight size={13}/> {professors[prof]} 교수님</span><span className="saved"><span className="status-dot"/>{saveState} · {cloudState}</span></header>
   <main>
    <div className="page-heading"><div><div className="eyebrow">TEACHING CONSULTATION · {String(stage+1).padStart(2,'0')}</div><h1>{stages[stage]}<span className="badge">{r.complete?'작성 완료':'상담 기록'}</span></h1><p>{stage===0?'교수님의 고민을 듣고, 함께 바꿔갈 수업의 첫 단서를 찾습니다.':stage===1?'지난 상담의 고민을 실행 가능한 수업 개선안으로 연결합니다.':'수업의 변화를 돌아보고, 다음 실천을 함께 정리합니다.'}</p></div><button className="button secondary" onClick={()=>{setReview(true);navigate(reviewIndex);}}><FileText size={16}/>전체 기록 보기</button></div>
    <div className="metadata"><label>교수님<input value={`${professors[prof]} 교수님`} readOnly/></label><label>상담일<input type="date" value={r.date} onChange={e=>update({date:e.target.value})} disabled={busy}/></label><label className="course-input">교과목<input value={r.course} onChange={e=>update({course:e.target.value})} disabled={busy}/></label><label>멘토<input placeholder="멘토 성함" value={r.mentor} onChange={e=>update({mentor:e.target.value})} disabled={busy}/></label></div>
    {stage>0&&<details className="previous"><summary>이전 상담 요약 살펴보기</summary>{Array.from({length:stage},(_,s)=><div key={s}><h3>{stages[s]}</h3>{summaryLabels.map((label,i)=><p key={label}><strong>{label}</strong> {records[`${prof}-${s}`]?.summary[String(i)]||'아직 기록이 없습니다.'}</p>)}</div>)}</details>}
    <div className="progress-line"><span><strong>{filled}</strong> / {total}개 질문 기록<span className="optional"> · 필요한 질문을 골라 기록하세요</span></span><span>{Math.round(filled/total*100)}%</span></div><div className="progress-track"><span style={{width:`${filled/total*100}%`}}/></div>
    <nav className="section-tabs" aria-label="질문 영역">{list.map((s,i)=><button key={s.title} className={section===i?'active':''} onClick={()=>navigate(i)}><span>{i+1}</span>{s.title}</button>)}{stage===0&&<button className={section===list.length?'active':''} onClick={()=>navigate(list.length)}>후속 질문</button>}<button className={section===reviewIndex?'active':''} onClick={()=>navigate(reviewIndex)}><ClipboardList size={15}/>요약·저장</button></nav>
    <div className="content-grid"><div className="editor">
     <div className="section-title"><div><span className="section-kicker">{section<list.length?`대화 ${String(section+1).padStart(2,'0')}`:'상담 마무리'}</span><h2>{title}</h2></div>{section<list.length&&<span className="time">약 {current.minutes}</span>}</div>
     {section<list.length?<><p className="section-description">{current.purpose}</p>{section===0&&stage===0&&<div className="opening"><MessageCircle size={18}/><p>“오늘은 교수님께서 수업을 하시면서 어떤 고민을 겪고 계신지 충분히 듣고 싶습니다. 지금까지 해오신 노력과 수업 여건도 함께 살펴보면서, 앞으로 무엇을 도와드리면 좋을지 정해 보겠습니다.”</p></div>}{current.questions.map((q,j)=><div className="question" key={q}><label htmlFor={`q-${section}-${j}`}><span className="question-no">Q{j+1}</span>{q}{j===0&&<span className="core">핵심 질문</span>}</label><textarea maxLength={12000} id={`q-${section}-${j}`} placeholder="교수님의 말씀을 편하게 기록해 주세요…" value={r.answers[questionKey(section,j)]??''} onChange={e=>answer(questionKey(section,j),e.target.value)} disabled={busy}/><div className="char-count">{(r.answers[questionKey(section,j)]??'').length.toLocaleString()}자</div></div>)}</>:
     section===list.length&&stage===0?<><p className="section-description">상황을 선택해 질문을 펼쳐 보세요. 작성한 답변은 문서에 함께 저장됩니다.</p>{probes.map((p,i)=><details className="probe" key={p[0]}><summary>{p[0]}</summary>{p.slice(1).map((q,j)=><div className="question" key={q}><label htmlFor={`probe-${i}-${j}`}>{q}</label><textarea maxLength={12000} id={`probe-${i}-${j}`} value={r.extra[`${i}-${j}`]??''} placeholder="선택한 후속 질문의 답변" onChange={e=>answer(`${i}-${j}`,e.target.value,'extra')} disabled={busy}/></div>)}</details>)}</>:
     <><p className="section-description">대화에서 확인한 내용과 다음 만남의 약속을 정리합니다.</p>{review&&<details className="full-review" open><summary>전체 질문과 답변 미리보기</summary><pre>{documentText(professors[prof],stage,r)}</pre></details>}{summaryLabels.map((label,i)=><div className="question compact" key={label}><label htmlFor={`sum-${i}`}>{label}</label><textarea maxLength={12000} id={`sum-${i}`} value={r.summary[String(i)]??''} onChange={e=>answer(String(i),e.target.value,'summary')} disabled={busy} placeholder="함께 확인한 내용을 정리해 주세요"/></div>)}<div className="question"><label htmlFor="mentor-note">멘토 메모</label><textarea maxLength={12000} id="mentor-note" value={r.notes} onChange={e=>update({notes:e.target.value,complete:false})} disabled={busy} placeholder="추가 관찰, 확인이 필요한 가설, 참고할 자료 등"/></div><label className="completion"><input type="checkbox" checked={r.complete} onChange={e=>update({complete:e.target.checked})} disabled={busy}/>이번 단계의 기록을 완료했습니다.</label><div className="export-panel"><div className="export-icon"><FileText size={25}/></div><div><h3>Google Docs에 상담 기록 저장</h3><p>전체 질문·답변, 후속 질문, 요약, 멘토 메모가 포함됩니다.<br/>수정 후 다시 저장하면 새 문서로 보관됩니다.</p></div><button className="button primary" onClick={exportDoc} disabled={busy||cooldown||!Object.values(r.answers).some(v=>v.trim())&&!Object.values(r.summary).some(v=>v.trim())&&!r.notes.trim()&&!Object.values(r.extra).some(v=>v.trim())}><Save size={16}/>{busy?'저장 확인 중…':cooldown?'잠시 기다려 주세요':'Google Docs로 저장'}</button></div></>}
     <div className="section-footer"><button className="button ghost" disabled={section===0} onClick={()=>navigate(section===reviewIndex?(stage===0?list.length:list.length-1):section-1)}>이전</button><span>답변은 입력할 때마다 자동 저장됩니다.</span>{section<reviewIndex&&<button className="button primary" onClick={()=>navigate(section+1===list.length&&stage!==0?reviewIndex:section+1)}>다음 {section===list.length-1?'단계':'질문'}<ArrowRight size={16}/></button>}</div>
    </div><aside className="guide"><div className="guide-card"><span className="guide-label"><Lightbulb size={17}/>멘토를 위한 대화 가이드</span><h3>{section<list.length?'답보다, 충분히 듣는 시간':'다음 실천을 함께 정하기'}</h3><p>{section<list.length?current.tip:'오늘의 이해가 맞는지 교수님께 확인하고, 다음에 함께 살펴볼 과제 한 가지를 정합니다.'}</p><div className="guide-rule"/><strong>대화의 중심 질문</strong><ol><li>어떤 장면이었나요?</li><li>어떻게 달라지기를 바라시나요?</li><li>무엇을 먼저 함께 살펴볼까요?</li></ol></div><div className="check-card"><h3>오늘의 기록</h3>{list.map((s,i)=>{const count=s.questions.filter((_,j)=>r.answers[questionKey(i,j)]?.trim()).length;return <button key={s.title} onClick={()=>navigate(i)}>{count===s.questions.length?<CheckCircle2 size={16}/>:<Circle size={16}/>}<span>{s.title}</span><small>{count}/{s.questions.length}</small></button>;})}</div><div className="document-card"><h3><FileText size={16}/>저장한 Google 문서</h3>{r.exported?<><a href={r.exported.url} target="_blank" rel="noreferrer">문서 열기 <ExternalLink size={14}/></a><small>{new Date(r.exported.at).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})}</small>{r.exported.fingerprint!==documentText(professors[prof],stage,r)&&<p>문서 저장 이후 변경한 내용이 있습니다.</p>}</>:<p>요약·저장에서 Google 문서를 만들 수 있습니다.</p>}</div><button className="text-download" onClick={()=>download(documentText(professors[prof],stage,r),`${professors[prof]}_${stages[stage]}.txt`,'text/plain;charset=utf-8')}><Download size={14}/>질문·답변 텍스트 내려받기</button></aside></div>
    {notice&&<div className="notification" role="status"><Check size={17}/>{notice}<button onClick={()=>setNotice('')}>닫기</button></div>}
    {error&&<div className="error-panel" role="alert"><strong>Google Docs 저장을 확인해 주세요</strong><p>{error.message}</p>{error.href&&<a href={error.href} target="_top">Google Drive 연결하기</a>}{error.url&&<a href={error.url} target="_blank" rel="noreferrer">생성된 문서 확인</a>}<button onClick={()=>setError(null)}>닫기</button></div>}
    <footer className="page-footer">동명대학교 · 찾아가는 교수법 똑-똑 <span>질문은 멘토링 제안안이며, 공식 운영 양식은 아닙니다.</span></footer>
   </main>
  </div>
 </div>;
}
function validStore(value:unknown):value is Store{
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 return Object.entries(value).every(([key,r])=>/^[01]-[012]$/.test(key)&&r&&typeof r==='object'&&['date','course','mentor','notes'].every(k=>typeof (r as Record<string,unknown>)[k]==='string')&&['answers','summary','extra'].every(k=>{const v=(r as Record<string,unknown>)[k];return v&&typeof v==='object'&&!Array.isArray(v)&&Object.values(v).every(x=>typeof x==='string');})&&typeof (r as RecordData).complete==='boolean'&&((r as RecordData).updatedAt===undefined||typeof (r as RecordData).updatedAt==='number')&&(!(r as RecordData).exported||(/^https:\/\/docs\.google\.com\/document\/d\/[A-Za-z0-9_-]+\/edit$/.test((r as RecordData).exported!.url)&&typeof (r as RecordData).exported!.at==='string'&&typeof (r as RecordData).exported!.fingerprint==='string')));
}

