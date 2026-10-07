'use client';
import {useEffect,useMemo,useState} from 'react';
import {BookOpen,RefreshCw} from 'lucide-react';
import {languages} from '@/lib/pipeline/schema';
import {progressLabels,type ProgressData,type ProgressStatus,type WordProgress} from '@/lib/pipeline/progress';

const dates=(value:string)=>new Date(value).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'});
export function Progress({onPractise,onSource,onLibrary,busy}:{onPractise:(word:WordProgress)=>void;onSource:(word:WordProgress)=>void;onLibrary:()=>void;busy:boolean}){
 const [data,setData]=useState<ProgressData|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true);
 const [query,setQuery]=useState(''),[language,setLanguage]=useState(''),[filter,setFilter]=useState('all');
 async function load(){setLoading(true);setError('');try{const response=await fetch('/api/v2/progress');const result=await response.json() as ProgressData&{error?:string};if(!response.ok)throw new Error(result.error||'Your progress could not load. Please try again.');setData(result);}catch(e){setError(e instanceof Error?e.message:'Your progress could not load.');}finally{setLoading(false);}}
 useEffect(()=>{void load();},[]);
 const items=useMemo(()=>data?.items.filter(i=>!language||i.language===language)??[],[data,language]);
 const due=(w:WordProgress)=>w.practiceCount>0&&!!w.dueAt&&w.dueAt<=(data?.asOf??'');
 const review=(w:WordProgress)=>due(w)||w.status==='needs-practice';
 const counts={words:items.length,tasks:items.reduce((n,w)=>n+w.practiceCount,0),remembering:items.filter(w=>w.status==='remembering').length,review:items.filter(review).length};
 const order:Record<ProgressStatus,number>={'needs-practice':0,due:1,new:2,building:3,remembering:4};
 const shown=items.filter(w=>(filter==='all'||filter==='review'&&review(w)||w.status===filter)&&`${w.form} ${w.sense}`.normalize('NFKC').toLocaleLowerCase().includes(query.normalize('NFKC').toLocaleLowerCase().trim())).sort((a,b)=>order[a.status]-order[b.status]||a.form.localeCompare(b.form));
 return <section className="progress-page" aria-labelledby="progress-title">
  <div className="view-heading"><div><h1 id="progress-title">Your progress</h1><p className="muted">See what is sticking and what to revisit.</p></div><button aria-label="Refresh progress" disabled={loading||busy} onClick={()=>void load()}><RefreshCw size={17}/>Refresh</button></div>
  {error&&<p className="error" role="alert">{error}</p>}
  {loading&&!data?<p role="status">Loading your practice history…</p>:data&&!data.items.length?<div className="empty-state"><BookOpen size={30}/><h2>Your vocabulary grows here</h2><p>Create a lesson from a screenshot. Your words, practice results and review dates will appear here.</p><button className="primary" onClick={onLibrary}>Open library</button></div>:data&&<>
   <label className="progress-language">Learning language<select value={language} onChange={e=>setLanguage(e.target.value)}><option value="">All languages</option>{Object.entries(languages).map(([code,name])=><option key={code} value={code}>{name}</option>)}</select></label>
   <div className="progress-metrics" aria-label="Practice overview">
    <div><strong>{counts.words}</strong><span>Words & phrases</span></div><div><strong>{counts.tasks}</strong><span>Practice tasks</span></div><div><strong>{counts.remembering}</strong><span>Remembering well</span></div><button className={filter==='review'?'selected':''} aria-pressed={filter==='review'} onClick={()=>setFilter(filter==='review'?'all':'review')}><strong>{counts.review}</strong><span>To revisit</span></button>
   </div>
   <details className="progress-key"><summary>What do these numbers mean?</summary><p>Each answered question or studied card counts once. Retrying or rating the same task does not add another task; skips are excluded. “Remembering well” means at least two successful scheduled recall reviews, with no latest difficulty recorded. It is not a claim of permanent mastery.</p><p>Independent recall, answers with help, AI writing checks and your own confidence are recorded separately. AI checks can make mistakes. Review dates come from your recall schedule.</p></details>
   <div className="progress-filters"><label>Find a word or phrase<input type="search" placeholder="Search vocabulary or meaning" value={query} onChange={e=>setQuery(e.target.value)}/></label><label>Show<select value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">All words</option><option value="review">To revisit</option>{Object.entries(progressLabels).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label></div>
   <p className="progress-result-count" role="status">{shown.length} {shown.length===1?'word or phrase':'words and phrases'}{filter!=='all'||query?(shown.length===1?' matches your filters':' match your filters'):''}</p>
   {!shown.length?<div className="empty-state"><h2>{filter==='review'?'Nothing to revisit in this view':'No matching words'}</h2><p>{filter==='review'?'You can still choose a word for extra practice.':'Try a different language, word or filter.'}</p><button onClick={()=>{setFilter('all');setQuery('');setLanguage('');}}>Show all words</button></div>:<div className="progress-words">{shown.map(w=><article className="progress-word" key={w.id}>
    <div className="progress-word-heading"><div><div className="progress-word-language">{languages[w.language as keyof typeof languages]??w.language}</div><h2 lang={w.language}>{w.form}</h2><p>{w.sense}</p></div><span className={`progress-status ${w.status}`}>{progressLabels[w.status]}</span></div>
    <p className="progress-reason">{w.reason}</p>
    <dl className="word-statistics"><div><dt>Practice tasks</dt><dd>{w.practiceCount}</dd></div><div><dt>Independent recall</dt><dd>{w.independentRecall.total?`${w.independentRecall.correct} / ${w.independentRecall.total} correct`:'Not checked yet'}</dd></div><div><dt>AI writing checks</dt><dd>{w.writing.total?`${w.writing.correct} / ${w.writing.total} accepted`:'Not checked yet'}</dd></div></dl>
    <div className="progress-review-row"><p><strong>{w.practiceCount?(due(w)?'Review due':'Next recall review'):'First practice'}</strong><span>{w.practiceCount?(w.dueAt?dates(w.dueAt):'Not scheduled yet'):'Whenever you are ready'}</span></p><button className={review(w)?'primary':''} disabled={busy||!w.captureId} onClick={()=>onPractise(w)} aria-label={`Practise ${w.form}`}>Practise again</button></div>
    <details className="word-history"><summary>Practice details</summary><dl><div><dt>Last practised</dt><dd>{w.lastPractised?dates(w.lastPractised):'Not yet'}</dd></div><div><dt>Submitted answers, including retries</dt><dd>{w.answerCount}</dd></div><div><dt>Answers with hints, source or prior exposure</dt><dd>{w.assistedAnswers}</dd></div><div><dt>Flashcards studied</dt><dd>{w.cardReviews}</dd></div><div><dt>Self-reviewed tasks (not graded)</dt><dd>{w.selfReviews}</dd></div><div><dt>Skipped tasks</dt><dd>{w.skipped}</dd></div>{w.olderResults>0&&<div><dt>Older results without assessment details</dt><dd>{w.olderResults}</dd></div>}</dl><p className="muted">Practice opened from this word list counts as practice with help, because the word is already visible.</p><button className="text-button" onClick={()=>onSource(w)}>View source</button></details>
    {!w.captureId&&<p className="progress-reason">This word’s source lesson needs reviewing before it can be practised again.</p>}
   </article>)}</div>}
  </>}
 </section>;
}
