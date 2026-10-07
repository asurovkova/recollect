import type {Exercise,Feedback,LearningItem,Session} from './schema.ts';

export type Teaching={basis:'lesson'|'reference'|'source-note'|'source';meaning:string|null;usage:string;quote:string;example:string|null;reference?:{title:string;url:string}};
export function teachingFor(item:LearningItem):Teaching{
 const base={quote:item.source.quote,example:item.example};
 if(!item.sense.startsWith('Unverified context'))return {...base,basis:'lesson',meaning:item.sense,usage:item.explanation};
 const escaped=item.form.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 const sourceNote=item.source.quote.match(new RegExp(`^\\s*${escaped}\\s+(?:—|–|=)\\s+([^\\n]+)`,'iu'))?.[1];
 if(sourceNote)return {...base,basis:'source-note',meaning:sourceNote,usage:'This explanation comes directly from your captured note. Compare it with the situation where you want to use the word; it has not been independently checked.'};
 // A general reference tip, not a semantic assessment of this screenshot or answer.
 if(item.language==='en'&&item.form.normalize('NFKC').toLowerCase().trim()==='look forward to')return {...base,basis:'reference',meaning:'Common meaning: to feel pleased about something that will happen.',usage:'Use a noun or an -ing verb after “look forward to”. Compare the words that follow it in your source. This general guide does not check your whole sentence.',reference:{title:'Cambridge: look forward to',url:'https://dictionary.cambridge.org/grammar/british-grammar/word-patterns-look-forward-to'}};
 return {...base,basis:'source',meaning:null,usage:'Read the whole source sentence. Notice the words immediately before and after the target, who is speaking, and the situation. Check its meaning with a dictionary or teacher before using it in a new situation.'};
}

// Read old sessions honestly, including self-reviews saved before provenance existed.
export function feedbackFor(e:Exercise,f:Feedback):Feedback{
 if(!f.method&&f.explanation.startsWith('Reviewed by you.'))return {...f,outcome:'uncertain',method:'learner',reviewDecision:f.outcome==='correct'?'confident':'practise'};
 return {...f,method:f.method??(e.type==='open'?(f.outcome==='uncertain'?'unavailable':'model'):'objective')};
}
export function feedbackHeading(f:Feedback){
 if(f.method==='learner')return f.reviewDecision==='confident'?'Self-reviewed · not checked':f.reviewDecision==='practise'?'Marked for more practice':'Still unsure · saved for review';
 if(f.outcome==='uncertain')return 'Sentence use not checked';
 if(f.method==='objective')return f.outcome==='correct'?(f.assisted?'Correct · with help':'Correct'):'Incorrect';
 return f.outcome==='correct'?'AI assessment: looks correct':'AI assessment: needs revision';
}
export function reviewResolved(f:Feedback){return f.outcome!=='uncertain'||!!f.reviewDecision;}
export function resolveReview(f:Feedback,decision:Feedback['reviewDecision']):Feedback{
 return {...f,outcome:'uncertain',method:'learner',reviewDecision:decision,assisted:true,explanation:'Your self-review is saved. This is not a checked answer. Your recall review date is unchanged.'};
}
export function summaryFor(s:Session){
 const items=s.items.flatMap(item=>{
  const attempts=s.queue.flatMap(e=>{if(e.itemId!==item.id||!s.feedback[e.id])return [];const history=s.tutor?.steps[e.id]?.attempts;return history?.length?history.map(a=>({e,f:feedbackFor(e,a.feedback),answer:a.answer})):[{e,f:feedbackFor(e,s.feedback[e.id]),answer:s.answers[e.id]??''}];});
  if(!attempts.length)return [];
  return [{id:item.id,form:item.form,teaching:teachingFor(item),
   cardReview:attempts.some(({e,f})=>e.type==='flashcard'&&!f.skipped)?s.feedback[attempts.find(({e,f})=>e.type==='flashcard'&&!f.skipped)!.e.id].reviewDecision??'unsure':null,
   revised:s.queue.some(e=>e.itemId===item.id&&(s.tutor?.steps[e.id]?.attempts.length??0)>1&&s.feedback[e.id]?.outcome==='correct'),
   independentRecall:attempts.some(({e,f})=>e.phase==='recall'&&f.method==='objective'&&f.outcome==='correct'&&!f.assisted),
   assistedRecall:attempts.some(({e,f})=>e.phase==='recall'&&f.method==='objective'&&f.outcome==='correct'&&f.assisted),
   checkedApplication:attempts.some(({e,f})=>e.phase==='application'&&f.method==='model'&&f.outcome==='correct'),
   mistakes:attempts.filter(({f})=>f.outcome==='incorrect').map(({e,f,answer})=>({prompt:e.prompt,answer,expected:f.expected,explanation:f.explanation,isExample:e.type==='open'})),
   unverified:attempts.filter(({e,f})=>f.outcome==='uncertain'&&(e.type!=='flashcard'||f.skipped)).map(({e,f,answer})=>({prompt:e.prompt,answer,skipped:!!f.skipped,decision:s.feedback[e.id]?.reviewDecision??f.reviewDecision??'unsure'}))}];
 });
 return {answered:Object.keys(s.feedback).length,independentRecall:items.filter(i=>i.independentRecall).length,needsPractice:items.filter(i=>i.cardReview==='practise'||i.mistakes.length||i.unverified.some(a=>a.decision==='practise')).length,unverified:items.filter(i=>i.unverified.length).length,items};
}
export type SessionSummary=ReturnType<typeof summaryFor>;
