import {type Extraction,type Profile,type Plan,type LearningItem,type Exercise,textOf,normalized,languages,recallPrompt} from './schema.ts';
import {safeRegions} from './extraction.ts';
import {validatePlan} from './validation.ts';
import {findForms,recallExcerpt} from './text-matching.ts';

// A deliberately limited fallback: no invented meanings, distractors or examples.
// The learner selects the forms; unknown contextual senses remain separate.
export function sourceRecallPlan(extraction:Extraction,profile:Profile,captureId:string,forms:string[]):Plan{
 const items:LearningItem[]=[],exercises:Exercise[]=[],reviewItems:Plan['reviewItems']=[],seen=new Set<string>();
 const regions=safeRegions(extraction,profile);
 for(const requested of [...new Set(forms.map(f=>f.trim()).filter(Boolean))].slice(0,4)){
  const candidates=regions.filter(r=>findForms(textOf(r),requested,profile.targetLanguage).length);
  if(!candidates.length){reviewItems.push({regionId:regions[0]?.id??'',reason:`“${requested}” was not found in the selected ${languages[profile.targetLanguage]} text. Check the selected regions or correct the OCR text.`});continue;}
  const found=candidates.map(r=>({r,excerpt:recallExcerpt(textOf(r),requested,profile.targetLanguage)})).find(x=>x.excerpt);
  if(!found?.excerpt){reviewItems.push({regionId:candidates[0].id,reason:`“${requested}” needs more context. Add a screenshot with a sentence or definition, or correct missing text visible in this screenshot.`});continue;}
  const {r,excerpt:{quote,match}}=found,form=match.text,source={captureId,regionId:r.id,quote};
  if(seen.has(normalized(form)))continue;seen.add(normalized(form));
  const id=`local-${items.length+1}`;
  items.push({id,language:profile.targetLanguage,form,kind:form.includes(' ')?'phrase':'vocabulary',sense:`Unverified context ${captureId}/${r.id}/${normalized(form)}`,explanation:'Source recall: practise the wording in your screenshot. Its contextual meaning has not been checked.',example:null,topic:'Source recall',source,matchItemId:null,selectionReason:'Selected by you.'});
  exercises.push({id:`${id}-recall`,itemId:id,type:'cloze',phase:'recall',prompt:recallPrompt,context:quote.slice(0,match.start)+'____'+quote.slice(match.end),contextKind:r.correction!==null?'corrected':'captured',choices:[],answer:form,alternatives:[],explanation:`The captured wording is “${form}”.`,source});
  // Meaning/use are explicitly learner reviewed without a model; never exact-match this answer.
  exercises.push({id:`${id}-apply`,itemId:id,type:'open',phase:'application',prompt:`Write your own sentence using “${form}”.`,context:'',contextKind:'new',choices:[],answer:quote,alternatives:[],explanation:'Compare your use with the captured sentence.',source});
 }
 if(!forms.length)reviewItems.push({regionId:regions[0]?.id??'',reason:'Enter up to four words or phrases from the selected text, one per line.'});
 const checked=validatePlan({items,exercises,reviewItems,collectionMatches:items.length?[{topic:'Source recall',itemIds:items.map(i=>i.id)}]:[]},extraction,profile,captureId);
 for(const rejection of checked.rejected){const exercise=exercises.find(e=>e.id===rejection.id);checked.plan.reviewItems.push({regionId:exercise?.source.regionId??regions[0]?.id??'',reason:`A question could not be created: ${rejection.reason} Try a shorter selection or a screenshot with more context.`});}
 return checked.plan;
}

// Supply exact-source recall for accepted AI items when their generated recall
// was omitted. This question is derived from text, not generated or re-approved.
export function ensureSourceRecall(plan:Plan,extraction:Extraction,profile:Profile,captureId:string):Plan{
 const exercises=[...plan.exercises],reviewItems=[...plan.reviewItems];
 for(const item of plan.items){
  if(exercises.some(e=>e.itemId===item.id&&e.phase==='recall'))continue;
  const excerpt=recallExcerpt(item.source.quote,item.form,item.language);
  if(!excerpt){reviewItems.push({regionId:item.source.regionId,reason:`“${item.form}” needs a longer source sentence for recall practice.`});continue;}
  const {quote,match}=excerpt,region=extraction.regions.find(r=>r.id===item.source.regionId);
  let n=1,id=`source-recall-${n}`;while(exercises.some(e=>e.id===id))id=`source-recall-${++n}`;
  exercises.push({id,itemId:item.id,type:'cloze',phase:'recall',prompt:recallPrompt,context:quote.slice(0,match.start)+'____'+quote.slice(match.end),contextKind:region?.correction!==null?'corrected':'captured',choices:[],answer:match.text,alternatives:[],explanation:`The captured wording is “${match.text}”. ${item.explanation}`.slice(0,400),source:{...item.source,quote}});
 }
 const checked=validatePlan({...plan,exercises,reviewItems},extraction,profile,captureId).plan;
 if(checked.exercises.length<=12)return checked;
 // Preserve each item's phase coverage before keeping optional extra variants.
 const phases=new Set<string>(),required=new Set<string>();
 for(const e of checked.exercises){const phase=`${e.itemId}:${e.phase}`;if(!phases.has(phase)){phases.add(phase);required.add(e.id);}}
 const kept=new Set([...required,...checked.exercises.filter(e=>!required.has(e.id)).map(e=>e.id)].slice(0,12));
 return {...checked,exercises:checked.exercises.filter(e=>kept.has(e.id))};
}
