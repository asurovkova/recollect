'use client';
import {useEffect,useState,useRef} from 'react';
import type {PublicSession,Feedback} from '@/lib/pipeline/schema';
import type {Teaching} from '@/lib/pipeline/feedback';

export function Flashcard({exercise,feedback,teaching,busy,onReveal,onReview,onNext,onSkip}:{exercise:NonNullable<PublicSession['exercise']>;feedback:Feedback|null;teaching:Teaching|null;busy:boolean;onReveal:()=>void;onReview:(decision:'confident'|'practise')=>void;onNext:()=>void;onSkip:()=>void}){
 const back=useRef<HTMLDivElement>(null);
 useEffect(()=>{if(feedback)back.current?.focus();},[exercise.id,!!feedback]);
 return <section className="flashcard-study" aria-label="Flashcard">
  <p className="muted">Think of the meaning before turning the card over.</p>
  <h2 className="flashcard-word">{exercise.prompt}</h2>
  {!feedback?<div className="row-actions"><button className="primary" disabled={busy} onClick={onReveal}>Turn card over</button><button className="text-button" disabled={busy} onClick={onSkip}>Skip for now</button></div>:<div ref={back} tabIndex={-1} className="flashcard-back" aria-live="polite">
   {teaching&&<TeachingPanel teaching={teaching}/>}
   <p className="muted">Self-review · this does not count as checked recall.</p>
   {!feedback.reviewDecision?<div className="row-actions"><button disabled={busy} onClick={()=>onReview('practise')}>Still learning</button><button disabled={busy} onClick={()=>onReview('confident')}>I remembered</button></div>:<p role="status">{feedback.reviewDecision==='confident'?'Remembered · self-reviewed':feedback.reviewDecision==='practise'?'Marked for more practice':'Reviewed'}</p>}
   <button className="primary" disabled={busy} onClick={onNext}>Next</button>
  </div>}
 </section>;
}

export function TeachingPanel({teaching}:{teaching:Teaching}){
 return <section className="teaching" aria-label="Meaning and use">
  <h3>{teaching.basis==='reference'?'Meaning & use · reference guide':teaching.basis==='lesson'?'Meaning & use · lesson notes':teaching.basis==='source-note'?'Meaning · your captured note':'Learn from the source'}</h3>
  {teaching.meaning?<p>{teaching.meaning}</p>:<p className="muted">A contextual meaning is not available for this item yet.</p>}
  <p>{teaching.usage}</p>
  <p className="source-example"><span className="eyebrow">Your source wording</span>{teaching.quote}</p>
  {teaching.example&&<p><span className="eyebrow">Lesson example</span>{teaching.example}</p>}
  {teaching.reference&&<a href={teaching.reference.url} target="_blank" rel="noreferrer">{teaching.reference.title} ↗</a>}
 </section>;
}
function SavedResponse({text}:{text:string}){return text.length>240?<details className="saved-response"><summary>View full response ({text.length} characters)</summary><p>{text}</p></details>:<p>{text}</p>;}
export function SessionRecap({session,schedule,busy,onPractise,onLibrary,onReflect}:{session:PublicSession;schedule:Array<{item_id:string;due_at:string}>;busy:boolean;onPractise:(ids:string[])=>void;onLibrary:()=>void;onReflect:(note:string)=>Promise<void>}){
 const summary=session.summary;
 const [reflection,setReflection]=useState(session.reflection??''),[reflectionStatus,setReflectionStatus]=useState('');
 useEffect(()=>{setReflection(session.reflection??'');},[session.id,session.reflection]);
 const focus=summary?.items.filter(i=>i.cardReview==='practise'||i.mistakes.length||i.unverified.length).map(i=>i.id)??[];
 return <div className="practice-card recap" tabIndex={-1}>
  <span className="eyebrow">Session complete</span><h2>Your practice recap</h2>
  <p className="muted">{summary?.answered??session.total} tasks completed. First attempts, revisions and practice with help are kept separate.</p>
  {session.reflection!==undefined&&<section className="reflection-panel" aria-label="Reflect on your practice"><h3>What will you take into your next conversation?</h3><p>Write one thing you noticed, a mistake you corrected, or something you still want to understand.</p><label>Your reflection (optional)<textarea rows={3} maxLength={600} value={reflection} onChange={event=>{setReflection(event.target.value);setReflectionStatus('');}} placeholder="I noticed… Next time I’ll…"/></label><div className="row-actions"><button disabled={busy||reflection===(session.reflection??'')} onClick={async()=>{await onReflect(reflection);setReflectionStatus('');}}>Save reflection</button><small role="status">{reflectionStatus||((session.reflection??'')===reflection&&reflection?'Reflection saved for your next practice.':'Your note will be available next time you practise these items.')}</small></div></section>}
  <div className="row-actions">{focus.length>0&&<button className="primary" disabled={busy} onClick={()=>onPractise(focus)}>Practise these items again</button>}<button disabled={busy} onClick={onLibrary}>{session.reviewBatch?'Back to progress':'Back to library'}</button></div>
  {summary&&<>
   {session.mode==='flashcards'?<p className="recap-key">Your card reviews are saved as self-reflections. Try Recall another day to check what you remember without help.</p>:<><div className="recap-counts"><div><strong>{summary.independentRecall}</strong><span>{summary.independentRecall===1?'item':'items'} recalled independently</span></div><div><strong>{summary.needsPractice}</strong><span>{summary.needsPractice===1?'item':'items'} to practise again</span></div><div><strong>{summary.unverified}</strong><span>{summary.unverified===1?'item':'items'} with unverified use</span></div></div>
   <p className="recap-key">One item can appear in more than one group: recalling its wording and using it correctly are different skills.</p></>}
   <div className="recap-items">{summary.items.map(item=>{
    const due=schedule.find(s=>s.item_id===item.id)?.due_at;
    return <section key={item.id} className="recap-item"><h3>{item.form}</h3>
     {item.cardReview&&<p>{item.cardReview==='confident'?'You remembered this card · self-reviewed':item.cardReview==='practise'?'You marked this card for more practice':'Card reviewed · still unsure'}</p>}
     {item.independentRecall&&<p className="recall-success">Recalled on the first attempt without in-session help</p>}
     {item.assistedRecall&&<p>Recalled with help · try again independently at your next review</p>}
     {item.revised&&<p className="recall-success">Revised successfully after feedback</p>}
     {item.checkedApplication&&<p>Sentence use accepted by the AI check</p>}
     {item.mistakes.map((m,n)=><div className="recap-mistake" key={n}><strong>{item.revised?'An earlier attempt to learn from':'Review this answer'}</strong><span className="muted">You wrote:</span><SavedResponse text={m.answer}/><p><span className="muted">{m.isExample?'One possible answer: ':'Expected answer: '}</span>{m.expected}</p><p>{m.explanation}</p></div>)}
     {item.unverified.map((a,n)=><div className="recap-unverified" key={n}><strong>{a.skipped?'Skipped for now':a.answer?'Response still unverified':'Studied the explanation without answering'}</strong><SavedResponse text={a.answer}/><small>{a.decision==='confident'?'You felt confident.':a.decision==='practise'?'You marked this for more practice.':'You were still unsure.'} A teacher or a meaning check can help resolve this.</small></div>)}
     <details><summary>Review meaning, use & source</summary><TeachingPanel teaching={item.teaching}/></details>
     <p className="review-date">{due?new Date(due).getTime()<=Date.now()?'Recall review due. After practice with help, leave a day before trying again independently.':`Next recall review: ${new Date(due).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}`:'No recall review scheduled yet.'}</p>
    </section>;
   })}</div>
  </>}
 </div>;
}
