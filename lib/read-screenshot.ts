import {type Extraction,type Profile} from './pipeline/schema';
import {regionsFromOCR,ocrLanguages} from './pipeline/extraction';

export async function readScreenshot(file:File,profile:Profile,width:number,height:number,status:(message:string)=>void):Promise<Extraction>{
 let best:Extraction={width,height,method:'ocr',regions:[],issues:[]};
 try{
  const {createWorker,PSM}=await import('tesseract.js');
  const worker=await createWorker(profile.targetLanguage==='en'?'eng':`${ocrLanguages[profile.targetLanguage]}+eng`,1,{logger:m=>{if(m.status==='recognizing text')status(`Reading screenshot… ${Math.round(m.progress*100)}%`);}});
  const target=profile.targetLanguage==='ko'?/[가-힣]/u:profile.targetLanguage==='ja'?/[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u:null;
  const score=(e:Extraction)=>e.regions.reduce((sum,r)=>sum+(r.kind==='interface'?0:r.rawText.length*Math.max(1,r.confidence)),0);
  const useful=(e:Extraction)=>{const selected=e.regions.filter(r=>r.selected);return selected.length>0&&selected.every(r=>r.confidence>=82)&&(!target||selected.some(r=>target.test(r.rawText)));};
  try{
   for(const [attempt,mode] of [PSM.AUTO,PSM.SINGLE_BLOCK,PSM.SPARSE_TEXT].entries()){
    if(attempt){status('Trying another text layout…');if(target)await worker.reinitialize(ocrLanguages[profile.targetLanguage]);}
    await worker.setParameters({tessedit_pageseg_mode:mode});
    const {data}=await worker.recognize(file,{}, {blocks:true});
    const paragraphs=data.blocks?.flatMap(b=>b.paragraphs)||[];
    const lines=paragraphs.length?paragraphs:data.text.trim()?[{text:data.text,confidence:data.confidence,bbox:{x0:0,y0:0,x1:width,y1:height}}]:[];
    const candidate=regionsFromOCR(lines,width,height);
    if(score(candidate)>score(best)||(!useful(best)&&useful(candidate)))best=candidate;
    if(useful(best))break;
   }
  }finally{await worker.terminate();}
 }catch{
  best.issues.push('Automatic reading could not finish. Check the text against the screenshot.');
 }
 if(best.regions.length)return best;
 return {...best,method:'manual',regions:[{id:'r1',rawText:'',correction:null,bbox:{x:0,y:0,width:1,height:1},confidence:0,language:profile.targetLanguage,kind:'unknown',selected:true,highlighted:false,confirmed:false,issues:['No readable text was found after trying different layouts. Enter the text visible in the screenshot below, or try a closer crop.']}]};
}
