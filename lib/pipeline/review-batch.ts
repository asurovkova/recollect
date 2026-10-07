import type {Plan,Profile,Session} from './schema.ts';
import type {WordProgress} from './progress.ts';
import {practiceExercises} from './practice-modes.ts';

export type ReviewScope='revisit'|'still-learning';
export type ReviewLesson={id:string;plan:Plan;profile:Profile};
export function needsRecap(word:WordProgress,asOf:string,includeBuilding=false){
 return word.status==='needs-practice'||(word.practiceCount>0&&!!word.dueAt&&word.dueAt<=asOf)||(includeBuilding&&word.status==='building');
}
export function reviewBatchPlan(words:WordProgress[],lessons:ReviewLesson[],asOf:string,options:{language?:string;scope:ReviewScope;focusItemIds?:string[]},round=0){
 const selected=words.filter(w=>(!options.language||w.language===options.language)&&(options.focusItemIds?options.focusItemIds.includes(w.id):needsRecap(w,asOf,options.scope==='still-learning')));
 const items:Session['items']=[],queue:Session['queue']=[],itemProfiles:Record<string,Profile>={};
 const seen=new Set<string>();let omitted=0;
 for(const word of selected){
  if(seen.has(word.id))continue;seen.add(word.id);
  // Use only current, owned lessons. The original source for each task stays intact.
  const lesson=lessons.find(l=>l.profile.targetLanguage===word.language&&l.plan.items.some(i=>i.id===word.id)&&l.plan.exercises.length>0);
  if(!lesson){omitted++;continue;}
  const candidates=practiceExercises(lesson.plan,lesson.profile,'mixed',round).filter(e=>e.itemId===word.id);
  const e=candidates.find(e=>e.phase===word.practiceFocus)||candidates.find(e=>e.phase==='recall')||candidates[0];
  if(!e){omitted++;continue;}
  items.push(lesson.plan.items.find(i=>i.id===word.id)!);itemProfiles[word.id]=lesson.profile;
  queue.push({...e,id:`recap-${queue.length}-${e.id}`});
 }
 return {items,queue,itemProfiles,omitted};
}
