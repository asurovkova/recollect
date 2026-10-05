import {planSchema,type Plan,type Extraction,type Profile} from './schema.ts';
import {validatePlan,type Rejection} from './validation.ts';
export type Audit={rejectedItems:Rejection[];rejectedExercises:Rejection[];rejectedMatches:string[]};
export async function checkedGeneration(input:{extraction:Extraction;profile:Profile;captureId:string;produce:(previous:unknown,issues:unknown,revision:boolean)=>Promise<unknown>;audit:(plan:Plan)=>Promise<Audit>}){
 let previous:unknown=null,issues:unknown=null;
 for(let attempt=0;attempt<2;attempt++){
  const raw=await input.produce(previous,issues,attempt===1);
  const parsed=planSchema.safeParse(raw);
  if(!parsed.success){if(attempt===1)throw new Error('Revised output did not match the lesson schema');previous=raw;issues='Output did not match the structured lesson schema.';continue;}
  const candidate=parsed.data,local=validatePlan(candidate,input.extraction,input.profile,input.captureId),check=await input.audit(local.plan);
  const badItems=new Set(check.rejectedItems.map(x=>x.id)),badExercises=new Set(check.rejectedExercises.map(x=>x.id));
  const plan:Plan={...local.plan,items:local.plan.items.filter(i=>!badItems.has(i.id)).map(i=>({...i,matchItemId:check.rejectedMatches.includes(i.matchItemId||'')?null:i.matchItemId})),exercises:local.plan.exercises.filter(e=>!badExercises.has(e.id)&&!badItems.has(e.itemId))};
  const failures=[...local.rejected,...check.rejectedItems,...check.rejectedExercises];
  if(!failures.length||attempt===1){
   const retained=new Set(plan.items.map(i=>i.id));plan.collectionMatches=plan.collectionMatches.map(c=>({...c,itemIds:c.itemIds.filter(id=>retained.has(id))})).filter(c=>c.itemIds.length);
   return {plan,notice:failures.length?`${failures.length} unsuitable question or item${failures.length===1?' was':'s were'} omitted after review.`:null};
  }
  previous=candidate;issues=failures;
 }
 throw new Error('No validated lesson was produced');
}
