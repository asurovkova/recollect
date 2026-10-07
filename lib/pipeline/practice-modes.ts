import type {Exercise,Plan,Profile,Feedback} from './schema.ts';
import {applicationPrompt,varyApplications} from './variation.ts';

export const practiceModes=['mixed','flashcards','recall','writing','dialogue'] as const;
export type PracticeMode=typeof practiceModes[number];
export const modeDetails:Record<PracticeMode,{label:string;description:string}>={
 mixed:{label:'Mixed practice',description:'Explore meaning, recall the wording, then use it yourself.'},
 flashcards:{label:'Flashcards',description:'Think of the meaning, turn the card over, and reflect on what you remembered.'},
 recall:{label:'Recall',description:'Type the missing word or phrase from your screenshot.'},
 writing:{label:'Guided writing',description:'Write a short message or sentence, get feedback, and revise.'},
 dialogue:{label:'Mini-dialogue',description:'Write both sides of a short conversation using your captured language.'}
};

// Use accepted learning items; these prompts introduce no new meanings or answers.
// This also fills missing application coverage in lessons saved by older versions.
export function practiceExercises(plan:Plan,profile:Profile,mode:PracticeMode,round=0):Exercise[]{
 if(mode==='flashcards')return plan.items.map(item=>({
  id:`card-${item.id}`,itemId:item.id,type:'flashcard',phase:'recognition',
  prompt:item.form,context:'',contextKind:'captured',choices:[],
  answer:item.sense.startsWith('Unverified context')?item.source.quote:item.sense,
  alternatives:[],explanation:item.explanation,source:item.source
 }));
 const exercises=varyApplications(plan.exercises,plan.items,profile,round);
 if(mode==='recall')return exercises.filter(e=>e.phase==='recall');
 for(const item of plan.items){
  if(!exercises.some(e=>e.itemId===item.id&&e.type==='open'))exercises.push({
   id:`use-${item.id}`,itemId:item.id,type:'open',phase:'application',
   prompt:applicationPrompt(item,profile,'message'),context:'',contextKind:'new',choices:[],
   // A comparison quote only: open answers are assessed by meaning, never exact match.
   answer:item.source.quote,alternatives:[],explanation:'Compare your use with the original sentence.',source:item.source
  });
 }
 if(mode==='mixed')return exercises;
 return plan.items.flatMap(item=>{
  const e=exercises.find(e=>e.itemId===item.id&&e.type==='open');
  return e?[mode==='dialogue'?{...e,prompt:applicationPrompt(item,profile,'dialogue')}:e]:[];
 });
}

export function flashcardFeedback(e:Exercise):Feedback{
 return {outcome:'uncertain',method:'learner',expected:e.answer,explanation:'Card revealed. Reflect on what you remembered; this is a self-review, not a checked answer.',assisted:true};
}
