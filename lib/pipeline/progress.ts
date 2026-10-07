import type {LearningItem,Session,Feedback} from './schema.ts';
import {feedbackFor} from './feedback.ts';

export type ProgressStatus='new'|'due'|'needs-practice'|'building'|'remembering';
export const progressLabels:Record<ProgressStatus,string>={new:'Not practised yet',due:'Review due','needs-practice':'Needs practice',building:'Building familiarity',remembering:'Remembering well'};
export type ProgressAttempt={id:string;item_id:string;session_id:string;exercise_id:string;outcome:string;assisted:number;revision:number;created_at:string};
export type ProgressItemRow={data:string;streak:number|null;due_at:string|null};
export type WordProgress={id:string;form:string;language:string;sense:string;status:ProgressStatus;reason:string;dueAt:string|null;lastPractised:string|null;practiceCount:number;answerCount:number;independentRecall:{correct:number;total:number};assistedAnswers:number;writing:{correct:number;total:number};cardReviews:number;selfReviews:number;skipped:number;olderResults:number;reviewStreak:number;captureId:string|null;sourceCaptureId:string;hasRecall:boolean};
export type ProgressData={items:WordProgress[];asOf:string};
type Lesson={id:string;itemIds:string[];recallIds:string[]};

// Each completed question/card counts once. Revisions, reveal and self-review
// remain separate evidence and never inflate the number of practice tasks.
export function buildProgress(rows:ProgressItemRow[],attempts:ProgressAttempt[],sessions:Session[],lessons:Lesson[],now=new Date()):ProgressData{
 const sessionMap=new Map(sessions.map(s=>[s.id,s]));
 const byItem=new Map<string,ProgressAttempt[]>();
 const seen=new Set<string>();
 for(const a of attempts){if(seen.has(a.id))continue;seen.add(a.id);const list=byItem.get(a.item_id)??[];list.push(a);byItem.set(a.item_id,list);}
 return {asOf:now.toISOString(),items:rows.map(row=>{
  const item=JSON.parse(row.data) as LearningItem;
  const lesson=lessons.find(l=>l.itemIds.includes(item.id));
  const result:WordProgress={id:item.id,form:item.form,language:item.language,sense:item.sense.startsWith('Unverified')?'Meaning still to check':item.sense,status:'new',reason:'Try this word or phrase to start your history.',dueAt:row.due_at,lastPractised:null,practiceCount:0,answerCount:0,independentRecall:{correct:0,total:0},assistedAnswers:0,writing:{correct:0,total:0},cardReviews:0,selfReviews:0,skipped:0,olderResults:0,reviewStreak:row.streak??0,captureId:lesson?.id??null,sourceCaptureId:item.source.captureId,hasRecall:!!lesson?.recallIds.includes(item.id)};
  const tasks=new Set<string>(),cards=new Set<string>(),reviews=new Set<string>(),skips=new Set<string>();
  const latest=new Map<string,Feedback>();
  let lastDecision:Feedback['reviewDecision'];
  for(const a of (byItem.get(item.id)??[]).sort((a,b)=>a.created_at.localeCompare(b.created_at)||a.revision-b.revision||a.id.localeCompare(b.id))){
   const s=sessionMap.get(a.session_id),e=s?.queue.find(e=>e.id===a.exercise_id&&e.itemId===item.id),key=`${a.session_id}/${a.exercise_id}`;
   const final=e&&s?.feedback[e.id];
   if(final?.skipped){skips.add(key);continue;}
   tasks.add(key);result.lastPractised=a.created_at;
   if(!s||!e){result.olderResults++;continue;}
   const review=a.id.endsWith(':review');
   const reveal=a.id.endsWith(':reveal');
   const tutorAttempt=!review&&!reveal?s.tutor?.steps[e.id]?.attempts[a.revision]:undefined;
   const f=tutorAttempt?feedbackFor(e,tutorAttempt.feedback):final?feedbackFor(e,final):null;
   if(e.type==='flashcard')cards.add(key);
   if((review||!tutorAttempt)&&f?.reviewDecision){reviews.add(key);lastDecision=f.reviewDecision;}
   if(review||reveal||e.type==='flashcard')continue;
   // Old entries without assessment provenance stay visible, but do not imply recall.
   if(!f||(!tutorAttempt&&f.method==='learner')){if(f?.method!=='learner')result.olderResults++;continue;}
   result.answerCount++;
   if(a.outcome==='correct')lastDecision=undefined;
   const helped=!!a.assisted||!!f.assisted;
   if(helped)result.assistedAnswers++;
   latest.set(e.phase,{...f,outcome:a.outcome as Feedback['outcome']});
   if(e.phase==='recall'&&f.method==='objective'&&!helped&&a.outcome!=='uncertain'){
    result.independentRecall.total++;if(a.outcome==='correct')result.independentRecall.correct++;
   }
   if(e.phase==='application'&&f.method==='model'&&a.outcome!=='uncertain'){
    result.writing.total++;if(a.outcome==='correct')result.writing.correct++;
   }
  }
  result.practiceCount=tasks.size;result.cardReviews=cards.size;result.selfReviews=reviews.size;result.skipped=skips.size;
  const difficulty=[...latest.entries()].find(([,f])=>f.outcome==='incorrect');
  const uncertain=[...latest.values()].some(f=>f.outcome==='uncertain');
  if(difficulty||lastDecision==='practise'||lastDecision==='unsure'||uncertain){
   result.status='needs-practice';result.reason=difficulty?(difficulty[0]==='application'?'Your latest writing check suggested a revision. AI feedback can be mistaken.':difficulty[0]==='recall'?'Your latest recall attempt needed another try.':'Your latest meaning check needed another try.'):lastDecision==='practise'?'You marked this for more practice.':lastDecision==='unsure'?'You said you were still unsure.':'Your latest answer could not be checked.';
  }else if(result.practiceCount&&row.due_at&&row.due_at<=now.toISOString()){
   result.status='due';result.reason='It is time to check what you remember again.';
  }else if(result.practiceCount&&result.reviewStreak>=2&&result.independentRecall.correct>=2){
   result.status='remembering';result.reason='You recalled this independently in at least two scheduled reviews. Keep following the review dates.';
  }else if(result.practiceCount){
   result.status='building';result.reason=result.independentRecall.correct?'You have recalled this independently. More spaced reviews will show what sticks.':result.writing.correct?'Your writing has been accepted by the AI. Independent recall still needs checking.':result.cardReviews?'You have studied this on flashcards. Independent recall still needs checking.':'Practice saved. There is not enough independent recall evidence yet.';
  }
  return result;
 })};
}
