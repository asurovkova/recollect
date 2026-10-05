import type {Exercise,LearningItem,Profile} from './schema.ts';

export function varyApplications(exercises:Exercise[],items:LearningItem[],profile:Profile,round:number){
 let position=0;
 return exercises.map(e=>{
  const item=items.find(i=>i.id===e.itemId);
  if(e.type!=='open'||!item?.sense.startsWith('Unverified context'))return {...e};
  const prompts=[
   `Write a short message using “${item.form}” for a situation connected to your goal: ${profile.goal}`,
   `Ask a question using “${item.form}” that you could use in everyday life.`,
   `Write a two-line conversation. Use “${item.form}” in one of the lines.`
  ];
  return {...e,prompt:prompts[(round+position++)%prompts.length]};
 });
}
