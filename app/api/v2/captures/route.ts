import {db,user,json,failure,boundedJson,HttpError} from '@/lib/server';
import {extractionSchema} from '@/lib/pipeline/schema';
import {captureFor,profileFor,legacyExtraction} from '@/lib/pipeline/storage';
export async function POST(request:Request){try{
 const owner=await user(request),body=await boundedJson(request,150000);const c=await captureFor(owner,String(body.id));
 const p=await profileFor(owner);if(!p)throw new HttpError(400,'Save your learning settings first.');
 const parsed=extractionSchema.safeParse(body.extraction);if(!parsed.success)throw new HttpError(400,'Check the selected text.');
 const old=c.extraction??legacyExtraction(c,p),next=parsed.data;
 if(next.regions.length!==old.regions.length||next.width!==old.width||next.height!==old.height)throw new HttpError(400,'Source regions cannot be removed. Deselect them instead.');
 next.regions=old.regions.map((r,i)=>{const n=next.regions[i];if(n.id!==r.id||n.rawText!==r.rawText)throw new HttpError(400,'Original text is preserved. Enter changes in the correction field.');return {...r,correction:n.correction,language:n.language,kind:n.kind,selected:n.selected,highlighted:n.highlighted,confirmed:n.selected&&n.confirmed};});
 await db().prepare('INSERT INTO capture_content (capture_id,extraction) VALUES (?,?) ON CONFLICT(capture_id) DO UPDATE SET extraction=excluded.extraction,plan=NULL,profile=NULL,notice=NULL').bind(c.id,JSON.stringify(next)).run();
 return json({capture:{...c,extraction:next,plan:null,notice:null}});
}catch(e){return failure(e)}}
