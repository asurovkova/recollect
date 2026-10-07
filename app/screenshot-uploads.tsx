'use client';
import type {UploadEntry} from '@/lib/upload-queue';
import type {SavedCapture} from '@/lib/pipeline/schema';

export function ScreenshotUploads({entries,running,disabled,onRetry,onReview,onPractise,onDismiss}:{entries:UploadEntry[];running:boolean;disabled:boolean;onRetry:(id:string)=>void;onReview:(capture:SavedCapture)=>void;onPractise:(capture:SavedCapture)=>void;onDismiss:()=>void}){
 if(!entries.length)return null;
 const saved=entries.filter(e=>e.capture).length,failed=entries.filter(e=>e.status==='failed').length;
 return <section className="upload-queue" aria-labelledby="upload-queue-title">
  <div className="upload-heading"><div><h2 id="upload-queue-title">{running?'Adding screenshots':'Your uploads'}</h2><p role="status">{saved} of {entries.length} saved{failed?` · ${failed} ${failed===1?'needs':'need'} attention`:''}{running?' · Keep this tab open until finished.':''}</p></div>{!running&&<button className="text-button" disabled={disabled} onClick={onDismiss}>Dismiss list</button>}</div>
  <ul>{entries.map(entry=><li key={entry.id} className={`upload-item ${entry.status}`}>
   <div className="upload-file"><strong>{entry.file.name}</strong><p aria-live={['reading','saving','preparing'].includes(entry.status)?'polite':undefined}>{entry.message}</p></div>
   <div className="upload-actions">{['reading','saving','preparing'].includes(entry.status)&&<span className="spinner" aria-label="Processing screenshot"/>}{entry.status==='failed'&&entry.retryable&&<button disabled={disabled} onClick={()=>onRetry(entry.id)}>Retry</button>}{entry.capture&&['failed','review'].includes(entry.status)&&<button disabled={disabled} onClick={()=>onReview(entry.capture!)}>Review text</button>}{entry.capture&&entry.status==='ready'&&<button disabled={disabled} onClick={()=>onPractise(entry.capture!)}>Practise</button>}</div>
  </li>)}</ul>
 </section>;
}
