import {db,HttpError} from '@/lib/server';
import {defaultProfile,profileSchema,extractionSchema,type Profile,type Extraction,type SavedCapture,type LearningItem,type Plan,identity,normalized} from './schema';

export async function profileFor(owner:string):Promise<Profile|null>{const r=await db().prepare('SELECT data FROM learner_profiles WHERE user_id=?').bind(owner).first<{data:string}>();return r?profileSchema.parse(JSON.parse(r.data)):null;}
export async function captureFor(owner:string,id:string):Promise<SavedCapture>{
 const r=await db().prepare('SELECT c.*,x.extraction,x.plan,x.notice,x.selected_forms FROM captures c LEFT JOIN capture_content x ON x.capture_id=c.id WHERE c.user_id=? AND c.id=?').bind(owner,id).first<Record<string,unknown>>();
 if(!r)throw new HttpError(404,'Screenshot not found.');return fromRow(r);
}
export function fromRow(r:Record<string,unknown>):SavedCapture{return {id:String(r.id),title:String(r.title),text:String(r.text),imageKey:r.image_key?String(r.image_key):null,createdAt:String(r.created_at),collection:String(r.collection),selectedForms:r.selected_forms!=null?JSON.parse(String(r.selected_forms)):undefined,extraction:r.extraction?extractionSchema.parse(JSON.parse(String(r.extraction))):null,plan:r.plan?JSON.parse(String(r.plan)):null,notice:r.notice?String(r.notice):null};}
export function legacyExtraction(c:SavedCapture,p:Profile):Extraction{return {width:1,height:1,method:'legacy',issues:['This older capture has no saved text positions.'],regions:[{id:'legacy',rawText:c.text,correction:null,bbox:{x:0,y:0,width:1,height:1},confidence:0,language:p.targetLanguage,kind:'unknown',selected:true,highlighted:false,confirmed:false,issues:['Review the original text before using it in new exercises.']}]};}
export async function existingItems(owner:string){
 const rows=await db().prepare('SELECT i.data, COALESCE(SUM(a.outcome=\'incorrect\'),0) AS missed, COUNT(a.id) AS attempts FROM learning_items i LEFT JOIN item_attempts a ON a.item_id=i.id AND a.user_id=i.user_id WHERE i.user_id=? GROUP BY i.id ORDER BY missed DESC LIMIT 120').bind(owner).all<{data:string;missed:number;attempts:number}>();
 return rows.results.map(r=>({...JSON.parse(r.data) as LearningItem,missed:r.missed,attempts:r.attempts}));
}
export async function persistPlan(owner:string,capture:SavedCapture,plan:Plan,profile:Profile,notice:string|null){
 const existing=await existingItems(owner), remap=new Map<string,string>(), statements=[];
 for(const item of plan.items){
  const matched=existing.find(e=>(e.id===item.matchItemId||identity(e)===identity(item))&&e.language===item.language&&normalized(e.form)===normalized(item.form)&&normalized(e.sense)===normalized(item.sense));
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`${owner}|${identity(item)}`));
  const id=matched?.id??`item-${Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('')}`;remap.set(item.id,id);
  const saved={...item,id,matchItemId:matched?.id??null};
  statements.push(db().prepare('INSERT INTO learning_items (id,user_id,identity,data) VALUES (?,?,?,?) ON CONFLICT(id) DO NOTHING').bind(id,owner,identity(saved),JSON.stringify(saved)));
  statements.push(db().prepare('INSERT INTO item_sources (id,item_id,capture_id,region_id,quote) VALUES (?,?,?,?,?) ON CONFLICT(id) DO NOTHING').bind(`${id}:${capture.id}:${item.source.regionId}`,id,capture.id,item.source.regionId,item.source.quote));
  // Existing review events remain untouched; copy their IDs once to attach old history.
  statements.push(db().prepare("INSERT OR IGNORE INTO item_attempts (id,user_id,item_id,session_id,exercise_id,outcome,answer,assisted,created_at) SELECT id,user_id,?,'legacy',card_id,CASE correct WHEN 1 THEN 'correct' ELSE 'incorrect' END,'',0,created_at FROM review_events WHERE user_id=? AND card_id=?").bind(id,owner,`${capture.id}:${item.form.toLowerCase()}`));
  statements.push(db().prepare('INSERT INTO item_schedule (item_id,user_id,streak,due_at) VALUES (?,?,0,?) ON CONFLICT(item_id) DO NOTHING').bind(id,owner,new Date().toISOString()));
 }
 const saved:Plan={...plan,items:plan.items.map(i=>({...i,id:remap.get(i.id)!})),exercises:plan.exercises.map(e=>({...e,id:crypto.randomUUID(),itemId:remap.get(e.itemId)!})),collectionMatches:plan.collectionMatches.map(c=>({...c,itemIds:c.itemIds.map(id=>remap.get(id)!).filter(Boolean)}))};
 statements.push(db().prepare('UPDATE capture_content SET plan=?,profile=?,notice=? WHERE capture_id=?').bind(JSON.stringify(saved),JSON.stringify(profile),notice,capture.id));
 if(saved.collectionMatches[0])statements.push(db().prepare('UPDATE captures SET collection=? WHERE id=? AND user_id=?').bind(saved.collectionMatches[0].topic,capture.id,owner));
 await db().batch(statements);return saved;
}
