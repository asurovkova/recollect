import {db,bucket,user,json,failure,HttpError,validImage} from '@/lib/server';
import {extractionSchema} from '@/lib/pipeline/schema';
import {interpretLayout} from '@/lib/pipeline/generation';
import {captureFor,profileFor} from '@/lib/pipeline/storage';
async function existingUpload(owner:string,id:string){try{return await captureFor(owner,id);}catch(e){if(e instanceof HttpError&&e.status===404)return null;throw e;}}
export async function POST(request:Request){try{
 const owner=await user(request);if(!await profileFor(owner))throw new HttpError(400,'Save your learning settings first.');
 if(Number(request.headers.get('Content-Length')||0)>9*1024*1024)throw new HttpError(413,'Choose an image under 8 MB.');
 const form=await request.formData(),image=form.get('image'),data=form.get('extraction');
 const uploadId=form.get('uploadId');
 if(uploadId!==null&&(typeof uploadId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uploadId)))throw new HttpError(400,'Invalid upload. Choose the screenshot again.');
 const id=typeof uploadId==='string'?uploadId:crypto.randomUUID();
 // A lost response can be retried without saving the same upload twice.
 const existing=await existingUpload(owner,id);if(existing)return json({capture:existing});
 if(typeof data!=='string'||data.length>150000)throw new HttpError(400,'Too much extracted text. Try a smaller crop.');
 if(!image||typeof image==='string'||!image.size||image.size>8*1024*1024)throw new HttpError(400,'Choose a PNG, JPG, or WebP under 8 MB.');
 const bytes=new Uint8Array(await image.arrayBuffer());if(!validImage(bytes,image.type))throw new HttpError(400,'Unsupported image.');
 let decoded;try{decoded=JSON.parse(data);}catch{throw new HttpError(400,'Invalid extracted text.');}const parsed=extractionSchema.safeParse(decoded);if(!parsed.success)throw new HttpError(400,'Text extraction was incomplete. Try another screenshot.');
 let extraction=parsed.data;let notice:string|null=null;
 // Reset review claims made by a new upload. Review is a separate, explicit step.
 extraction.regions=extraction.regions.map(r=>({...r,confirmed:false,correction:null}));
 try{let binary='';for(let n=0;n<bytes.length;n+=8192)binary+=String.fromCharCode(...bytes.subarray(n,n+8192));extraction=await interpretLayout(extraction,`data:${image.type};base64,${btoa(binary)}`);}catch{notice='Layout interpretation was unavailable. Review the extracted text.';}
 const key=`screenshots/${owner}/${crypto.randomUUID()}`,createdAt=new Date().toISOString();
 const title=extraction.regions.find(r=>r.selected)?.rawText.slice(0,100)||'Screenshot';
 const rawText=extraction.regions.map(r=>r.rawText).join('\n');
 await bucket().put(key,bytes,{httpMetadata:{contentType:image.type}});
 try{await db().batch([db().prepare('INSERT INTO captures (id,user_id,title,text,terms,collection,source,image_key,created_at) VALUES (?,?,?,?,?,?,?,?,?)').bind(id,owner,title,rawText,'[]','Unsorted','',key,createdAt),db().prepare('INSERT INTO capture_content (capture_id,extraction,notice) VALUES (?,?,?)').bind(id,JSON.stringify(extraction),notice)]);}catch(e){const saved=await existingUpload(owner,id);if(saved?.imageKey!==key)await bucket().delete(key);if(saved)return json({capture:saved});throw e;}
 return json({capture:{id,title,text:rawText,imageKey:key,createdAt,extraction,plan:null,notice,collection:'Unsorted'}},201);
}catch(e){return failure(e)}}
