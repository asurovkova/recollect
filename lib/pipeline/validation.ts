import {type Plan,type Extraction,type Profile,type Exercise,normalized,answerKey,textOf} from './schema.ts';
import {safeRegions} from './extraction.ts';

export type Rejection={id:string;reason:string};
export function validatePlan(plan:Plan,extraction:Extraction,profile:Profile,captureId:string){
 const rejected:Rejection[]=[];
 const regions=safeRegions(extraction,profile);
 const validSource=(s:Exercise['source'])=>s.captureId===captureId&&regions.some(r=>r.id===s.regionId&&textOf(r).includes(s.quote));
 const seenItems=new Set<string>();
 const items=plan.items.filter(i=>{
  const key=`${i.language}|${normalized(i.form)}|${normalized(i.sense)}`;
  const ok=validSource(i.source)&&i.language===profile.targetLanguage&&i.source.quote.includes(i.form)&&!seenItems.has(key)&&!seenItems.has(i.id);
  if(!ok)rejected.push({id:i.id,reason:'Item lacks a certain, exact source or duplicates another item.'});
  seenItems.add(key);seenItems.add(i.id);return ok;
 }).slice(0,4);
 const seen=new Set<string>();
 const exercises=plan.exercises.filter(e=>{
  let reason='';const item=items.find(i=>i.id===e.itemId);
  const region=regions.find(r=>r.id===e.source.regionId);
  if(!item||!validSource(e.source)||item.source.regionId!==e.source.regionId)reason='Invalid or uncertain source reference.';
  else if(e.contextKind==='captured'&&region?.correction!==null)reason='Corrected text must be labelled as corrected.';
  else if(e.contextKind==='new'&&e.phase!=='application')reason='New examples belong to application.';
  else if(e.contextKind!=='new'&&e.type!=='cloze'&&e.context!==e.source.quote)reason='Captured wording was changed.';
  else if(e.type==='cloze'&&e.contextKind!=='new'&&(e.context.split('____').length!==2||e.context.replace('____',e.answer)!==e.source.quote))reason='The cloze does not reconstruct the exact source.';
  else if(e.type==='cloze'&&e.context.split('____').length!==2)reason='A cloze needs exactly one blank.';
  else if(['meaning','collocation'].includes(e.type)&&(e.choices.length<3||e.choices.filter(a=>answerKey(a)===answerKey(e.answer)).length!==1||new Set(e.choices.map(answerKey)).size!==e.choices.length))reason='Choices must contain one answer and distinct distractors.';
  else if(['meaning','collocation'].includes(e.type)&&e.alternatives.length)reason='Multiple-choice answers must be unique.';
  else if(e.type==='reorder'&&normalized([...e.choices].sort().join(' '))!==normalized(e.answer.split(/\s+/).sort().join(' ')))reason='Reordering must use exactly the supplied words.';
  else if(['cloze','meaning','collocation'].includes(e.type)&&answerKey(`${e.prompt} ${e.context}`).includes(answerKey(e.answer)))reason='The answer is revealed in the question.';
  else if(e.type==='open'&&e.phase!=='application')reason='Open responses need an application objective.';
  const duplicate=`${e.itemId}|${e.type}|${normalized(e.prompt)}|${normalized(e.context)}`;
  if(seen.has(duplicate)||seen.has(e.id))reason='Duplicate question.';
  if(reason){rejected.push({id:e.id,reason});return false;}
  seen.add(duplicate);seen.add(e.id);return true;
 });
 const order={recognition:0,recall:1,application:2};
 exercises.sort((a,b)=>order[a.phase]-order[b.phase]);
 return {plan:{...plan,items,exercises,collectionMatches:plan.collectionMatches.map(c=>({...c,itemIds:c.itemIds.filter(id=>items.some(i=>i.id===id))})).filter(c=>c.itemIds.length)} as Plan,rejected};
}
