import {db,user,json,failure,boundedJson,HttpError} from '@/lib/server';
import {extractionSchema} from '@/lib/pipeline/schema';
import {captureFor,profileFor,legacyExtraction} from '@/lib/pipeline/storage';
export async function POST(request:Request){try{
 const owner=await user(request),body=await boundedJson(request,150000);const c=await captureFor(owner,String(body.id));
 const title=body.title===undefined?c.title:typeof body.title==='string'?body.title.trim():'';
 if(!title||title.length>120)throw new HttpError(400,'Use a screenshot title of 1–120 characters.');
 const p=await profileFor(owner);if(!p)throw new HttpError(400,'Save your learning settings first.');
 const parsed=extractionSchema.safeParse(body.extraction);if(!parsed.success)throw new HttpError(400,'Check the selected text.');
 const old=c.extraction??legacyExtraction(c,p),next=parsed.data;
 if(next.regions.length!==old.regions.length||next.width!==old.width||next.height!==old.height)throw new HttpError(400,'Source regions cannot be removed. Deselect them instead.');
 next.regions=old.regions.map((r,i)=>{const n=next.regions[i];if(n.id!==r.id||n.rawText!==r.rawText)throw new HttpError(400,'Original text is preserved. Enter changes in the correction field.');return {...r,correction:n.correction,language:n.language,kind:n.kind,selected:n.selected,highlighted:n.highlighted,confirmed:n.selected&&n.confirmed};});
 const oldForms=c.selectedForms??c.plan?.items.map(i=>i.form)??[];
 const selectedForms=body.selectedForms===undefined?oldForms:body.selectedForms;
 if(!Array.isArray(selectedForms)||selectedForms.length>4||selectedForms.some((f:unknown)=>typeof f!=='string'||!f.trim()||f.length>100))throw new HttpError(400,'Choose up to four words or phrases, one per line, with no more than 100 characters each.');
 const chosen=selectedForms.map((f:string)=>f.trim());
 const savedForms=body.selectedForms===undefined?c.selectedForms:chosen;
 const changed=JSON.stringify(old)!==JSON.stringify(next)||JSON.stringify(oldForms)!==JSON.stringify(chosen);
 await db().batch([
  db().prepare('UPDATE captures SET title=? WHERE id=? AND user_id=?').bind(title,c.id,owner),
  db().prepare(`INSERT INTO capture_content (capture_id,extraction,selected_forms) VALUES (?,?,?) ON CONFLICT(capture_id) DO UPDATE SET extraction=excluded.extraction,selected_forms=excluded.selected_forms${changed?',plan=NULL,profile=NULL,notice=NULL':''}`).bind(c.id,JSON.stringify(next),savedForms===undefined?null:JSON.stringify(savedForms))
 ]);
 return json({capture:{...c,title,selectedForms:savedForms,extraction:next,plan:changed?null:c.plan,notice:changed?null:c.notice}});
}catch(e){return failure(e)}}
