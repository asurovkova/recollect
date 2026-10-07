import {user,json,failure} from '@/lib/server';
import {progressSnapshot} from '@/lib/pipeline/progress-storage';
export async function GET(request:Request){try{
 const owner=await user(request);return json((await progressSnapshot(owner)).progress);
}catch(e){return failure(e);}}
