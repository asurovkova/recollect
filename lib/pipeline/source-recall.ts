import {type Extraction,type Profile,type Plan,type LearningItem,type Exercise,textOf,normalized} from './schema.ts';
import {safeRegions} from './extraction.ts';
import {validatePlan} from './validation.ts';

// A deliberately limited fallback: no invented meanings, distractors or examples.
// The learner selects the forms; unknown contextual senses remain separate.
export function sourceRecallPlan(extraction:Extraction,profile:Profile,captureId:string,forms:string[]):Plan{
 const items:LearningItem[]=[],exercises:Exercise[]=[];
 for(const form of [...new Set(forms.map(f=>f.trim()).filter(Boolean))].slice(0,4)){
  const r=safeRegions(extraction,profile).find(r=>textOf(r).includes(form));if(!r)continue;
  const quote=textOf(r),source={captureId,regionId:r.id,quote};
  if(quote===form||quote.split(form).length!==2)continue;
  const id=`local-${items.length+1}`;
  items.push({id,language:profile.targetLanguage,form,kind:form.includes(' ')?'phrase':'vocabulary',sense:`Unverified context ${captureId}/${r.id}/${normalized(form)}`,explanation:'Source recall: practise the wording in your screenshot. Its contextual meaning has not been checked.',example:null,topic:'Source recall',source,matchItemId:null,selectionReason:'Selected by you.'});
  exercises.push({id:`${id}-recall`,itemId:id,type:'cloze',phase:'recall',prompt:'Complete the captured text with its original word or phrase.',context:quote.replace(form,'____'),contextKind:r.correction!==null?'corrected':'captured',choices:[],answer:form,alternatives:[],explanation:`The captured wording is “${form}”.`,source});
  // Meaning/use are explicitly learner reviewed without a model; never exact-match this answer.
  exercises.push({id:`${id}-apply`,itemId:id,type:'open',phase:'application',prompt:`Write your own sentence using “${form}”.`,context:'',contextKind:'new',choices:[],answer:quote,alternatives:[],explanation:'Compare your use with the captured sentence.',source});
 }
 return validatePlan({items,exercises,reviewItems:items.length?[]:[{regionId:extraction.regions[0]?.id??'',reason:'Select up to four words or phrases in reviewed text. Contextual selection needs a model connection.'}],collectionMatches:items.length?[{topic:'Source recall',itemIds:items.map(i=>i.id)}]:[]},extraction,profile,captureId).plan;
}
