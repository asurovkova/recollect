import type {Extraction,SavedCapture} from './pipeline/schema.ts';

export const maxBatchScreenshots=10;
export type UploadEntry={id:string;file:File;status:'waiting'|'reading'|'saving'|'preparing'|'review'|'ready'|'failed';message:string;retryable:boolean;extraction?:Extraction;capture?:SavedCapture};
export type UploadServices={
 read:(file:File,status:(message:string)=>void)=>Promise<Extraction>;
 save:(file:File,extraction:Extraction,id:string)=>Promise<SavedCapture>;
 needsReview:(capture:SavedCapture)=>boolean;
 prepare:(capture:SavedCapture)=>Promise<SavedCapture>;
};
export function uploadFileError(file:Pick<File,'type'|'size'>){
 if(!['image/png','image/jpeg','image/webp'].includes(file.type))return 'Choose a PNG, JPG, or WebP image.';
 if(!file.size)return 'This file is empty. Choose another screenshot.';
 if(file.size>8*1024*1024)return 'This image is over 8 MB. Crop or resize it, then add it again.';
 return '';
}
// A failed file never interrupts later files. Saved captures and extracted text
// stay attached to the entry, so a retry resumes at the unfinished step.
export async function runUploadQueue(entries:UploadEntry[],services:UploadServices,onUpdate:(entry:UploadEntry)=>void){
 const results:UploadEntry[]=[];
 for(const initial of entries){
  let entry={...initial};
  const update=(patch:Partial<UploadEntry>)=>{entry={...entry,...patch};onUpdate(entry);};
  const validation=uploadFileError(entry.file);
  if(validation){update({status:'failed',message:validation,retryable:false});results.push(entry);continue;}
  try{
   if(!entry.capture){
    if(!entry.extraction){update({status:'reading',message:'Reading text…',retryable:true});const extraction=await services.read(entry.file,message=>update({message}));update({extraction});}
    update({status:'saving',message:'Saving screenshot…'});
    const capture=await services.save(entry.file,entry.extraction!,entry.id);update({capture});
   }
   if(services.needsReview(entry.capture!)){update({status:'review',message:'Saved · review the text to create practice.'});}
   else{
    update({status:'preparing',message:'Saved · preparing practice…'});
    const capture=entry.capture!.plan?.exercises.length?entry.capture!:await services.prepare(entry.capture!);
    update({capture,status:capture.plan?.exercises.length?'ready':'review',message:capture.plan?.exercises.length?'Ready to practise.':'Saved · check the text or choose words to practise.'});
   }
  }catch(error){update({status:'failed',retryable:true,message:`${entry.capture?'Screenshot saved. Practice is not ready yet. ':''}${error instanceof Error?error.message:'Please try again.'}`});}
  results.push(entry);
 }
 return results;
}
