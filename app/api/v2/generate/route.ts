import {user,json,failure,boundedJson,HttpError} from '@/lib/server';
import {captureFor,profileFor,existingItems,persistPlan} from '@/lib/pipeline/storage';
import {needsReview} from '@/lib/pipeline/extraction';
import {generate} from '@/lib/pipeline/generation';
export async function POST(request:Request){try{
 const owner=await user(request),body=await boundedJson(request,3000),c=await captureFor(owner,String(body.id)),p=await profileFor(owner);
 if(!p||!c.extraction||needsReview(c.extraction,p))throw new HttpError(400,'Review the selected text and its language first.');
 if(body.forms!==undefined&&(!Array.isArray(body.forms)||body.forms.length>4||body.forms.some((x:unknown)=>typeof x!=='string'||!x.trim()||x.length>100)))throw new HttpError(400,'Choose up to four words or phrases, one per line, with no more than 100 characters each.');
 const forms:string[]=Array.isArray(body.forms)?body.forms:[];
 let result;try{result=await generate(c.extraction,p,c.id,await existingItems(owner),forms);}catch{throw new HttpError(503,'The lesson could not be checked. Your screenshot is saved; try Practise again.');}
 const plan=await persistPlan(owner,c,result.plan,p,result.notice);return json({plan,notice:result.notice});
}catch(e){return failure(e)}}
