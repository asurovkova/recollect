import type {Exercise,LearningItem,Profile} from './schema.ts';

export const applicationStyles=['message','question','dialogue','personal','rewrite','plan'] as const;
export type ApplicationStyle=typeof applicationStyles[number];
export const applicationLabels:Record<ApplicationStyle,string>={message:'Send a message',question:'Ask a question',dialogue:'Make a dialogue',personal:'Connect to your life',rewrite:'Adapt the source',plan:'Make a plan'};
export function applicationPrompt(item:LearningItem,profile:Profile,style:ApplicationStyle){
 const form=`“${item.form}”`;
 const task:Record<ApplicationStyle,string>={
  message:`Write a message using ${form} for your goal: ${profile.goal}`,
  question:`Ask a question using ${form} that you could use in everyday life.`,
  dialogue:`Write a two-line conversation. Use ${form} in one of the lines.`,
  personal:`Use ${form} to describe something from your own life.`,
  rewrite:`Adapt the source to a different person, place or time. Keep ${form} and make the other words fit.`,
  plan:`Use ${form} in a plan or invitation for something you would like to do.`
 };
 const guidance=profile.level.startsWith('A')?' Keep it simple: a short sentence or two brief lines is enough.':profile.level.startsWith('C')?' Add detail and choose a tone that fits your reader.':' Make the situation clear to your reader.';
 return task[style]+guidance;
}
export function varyApplications(exercises:Exercise[],items:LearningItem[],profile:Profile,round:number){
 let position=0;
 return exercises.map(e=>{
  const item=items.find(i=>i.id===e.itemId);
  if(e.type!=='open'||!item)return {...e};
  return {...e,prompt:applicationPrompt(item,profile,applicationStyles[(round+position++)%applicationStyles.length]),context:'',contextKind:'new' as const};
 });
}
// Keep every validated task. Alternate recall and use for each item so the
// fourth selected word receives the same coverage as the first.
export function balancedQueue(exercises:Exercise[],dueIds:Set<string>){
 const ids=[...new Set(exercises.map(e=>e.itemId))].sort((a,b)=>Number(dueIds.has(b))-Number(dueIds.has(a)));
 const order={recognition:0,recall:1,application:2};
 return ids.flatMap(id=>exercises.filter(e=>e.itemId===id).sort((a,b)=>order[a.phase]-order[b.phase]));
}

// Due recall comes before any teaching task. Exposure tracking still accounts for
// overlapping source sentences or hints that reveal another target.
export function tutoringQueue(exercises:Exercise[],dueIds:Set<string>){
 const ordered=balancedQueue(exercises,dueIds);
 const cold=ordered.filter(e=>dueIds.has(e.itemId)&&e.phase==='recall');
 return [...cold,...ordered.filter(e=>!cold.includes(e))];
}
