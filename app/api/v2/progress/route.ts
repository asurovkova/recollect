import {db,user,json,failure} from '@/lib/server';
import {buildProgress,type ProgressAttempt,type ProgressItemRow} from '@/lib/pipeline/progress';
import type {Plan,Session} from '@/lib/pipeline/schema';

export async function GET(request:Request){try{
 const owner=await user(request);
 const [items,attempts,sessions,captures]=await Promise.all([
  db().prepare('SELECT i.data,s.streak,s.due_at FROM learning_items i LEFT JOIN item_schedule s ON s.item_id=i.id AND s.user_id=i.user_id WHERE i.user_id=?').bind(owner).all<ProgressItemRow>(),
  db().prepare('SELECT id,item_id,session_id,exercise_id,outcome,assisted,revision,created_at FROM item_attempts WHERE user_id=?').bind(owner).all<ProgressAttempt>(),
  db().prepare('SELECT data FROM practice_sessions WHERE user_id=?').bind(owner).all<{data:string}>(),
  db().prepare('SELECT c.id,x.plan FROM captures c JOIN capture_content x ON x.capture_id=c.id WHERE c.user_id=? AND x.plan IS NOT NULL ORDER BY c.created_at DESC').bind(owner).all<{id:string;plan:string}>()
 ]);
 const lessons=captures.results.map(c=>{const p=JSON.parse(c.plan) as Plan;return {id:c.id,itemIds:p.items.map(i=>i.id),recallIds:p.exercises.filter(e=>e.phase==='recall').map(e=>e.itemId)};});
 return json(buildProgress(items.results,attempts.results,sessions.results.map(s=>JSON.parse(s.data) as Session),lessons));
}catch(e){return failure(e);}}
