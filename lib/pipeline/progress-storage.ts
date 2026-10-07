import {db} from '@/lib/server';
import {buildProgress,type ProgressAttempt,type ProgressItemRow} from './progress';
import {planSchema,profileSchema,type Session} from './schema';
import type {ReviewLesson} from './review-batch';

export async function progressSnapshot(owner:string){
 const [items,attempts,sessions,captures]=await Promise.all([
  db().prepare('SELECT i.data,s.streak,s.due_at FROM learning_items i LEFT JOIN item_schedule s ON s.item_id=i.id AND s.user_id=i.user_id WHERE i.user_id=?').bind(owner).all<ProgressItemRow>(),
  db().prepare('SELECT id,item_id,session_id,exercise_id,outcome,assisted,revision,created_at FROM item_attempts WHERE user_id=?').bind(owner).all<ProgressAttempt>(),
  db().prepare('SELECT data FROM practice_sessions WHERE user_id=?').bind(owner).all<{data:string}>(),
  db().prepare('SELECT c.id,x.plan,x.profile FROM captures c JOIN capture_content x ON x.capture_id=c.id WHERE c.user_id=? AND x.plan IS NOT NULL ORDER BY c.created_at DESC').bind(owner).all<{id:string;plan:string;profile:string|null}>()
 ]);
 const lessons:ReviewLesson[]=captures.results.flatMap(c=>{
  const plan=planSchema.safeParse(JSON.parse(c.plan)),profile=profileSchema.safeParse(c.profile?JSON.parse(c.profile):null);
  return plan.success&&profile.success?[{id:c.id,plan:plan.data,profile:profile.data}]:[];
 });
 const history=sessions.results.map(s=>JSON.parse(s.data) as Session);
 const progress=buildProgress(items.results,attempts.results,history,lessons.map(l=>({id:l.id,itemIds:l.plan.items.map(i=>i.id),recallIds:l.plan.exercises.filter(e=>e.phase==='recall').map(e=>e.itemId)})));
 return {progress,lessons,history};
}
