import {seekFrame} from './media.js';
export async function runAutomatic(video,fps,signal,progress){
 const worker=new Worker(new URL('./worker.js',import.meta.url),{type:'module'});let id=0;
 const call=(data,transfer=[])=>new Promise((resolve,reject)=>{const n=++id;let timer;const clean=()=>{clearTimeout(timer);worker.removeEventListener('message',receive);worker.removeEventListener('error',fail);signal.removeEventListener('abort',cancel);};const cancel=()=>{clean();reject(new DOMException('Cancelled','AbortError'));};const fail=()=>{clean();reject(new Error('Automatic tracking could not run. You can still measure manually.'));};const receive=e=>{if(e.data.id!==n)return;clean();e.data.error?reject(new Error(e.data.error)):resolve(e.data);};if(signal.aborted){cancel();return;}worker.addEventListener('message',receive);worker.addEventListener('error',fail);signal.addEventListener('abort',cancel,{once:true});timer=setTimeout(fail,45000);worker.postMessage({...data,id:n},transfer);});
 try{
  const scale=Math.min(1,720/video.videoWidth,1280/video.videoHeight),w=Math.round(video.videoWidth*scale),h=Math.round(video.videoHeight*scale),canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;const ctx=canvas.getContext('2d',{willReadFrequently:true});
  const ref=document.createElement('canvas'),ratio=Math.min(1,480/w);ref.width=Math.round(w*ratio);ref.height=Math.round(h*ratio);const rctx=ref.getContext('2d',{willReadFrequently:true});let court=null,rgba;
  progress('Finding court lines','Automatic tracking requires a clear, fixed view. Manual measurement supports cropped courts.',4);
  for(const t of [.05,video.duration*.25,video.duration*.5,video.duration*.75]){await seekFrame(video,t,signal);ctx.drawImage(video,0,0,w,h);rctx.drawImage(canvas,0,0,ref.width,ref.height);const small=rctx.getImageData(0,0,ref.width,ref.height).data;const result=await call({type:'init',width:ref.width,height:ref.height,rgba:small.buffer},[small.buffer]);if(result.court){court=result.court;rgba=ctx.getImageData(0,0,w,h).data;break;}}
  if(!court)return {serves:[],reason:'court'};
  const s=w/court.w;court={...court,w,h,H:court.H.map((v,i)=>i<6?v*s:v),camera:{...court.camera,w,h,f:court.camera.f*s,H:court.camera.H.map((v,i)=>i<6?v*s:v),z:court.camera.z.map((v,i)=>i<2?v*s:v)}};
  await call({type:'configure',court,width:w,height:h,rgba:rgba.buffer},[rgba.buffer]);const n=Math.floor(video.duration*fps);
  for(let i=0;i<n;i++){const t=Math.min(video.duration-.02,(i+.25)/fps);await seekFrame(video,t,signal);ctx.drawImage(video,0,0,w,h);const pixels=ctx.getImageData(0,0,w,h).data;await call({type:'frame',time:t,fps,rgba:pixels.buffer},[pixels.buffer]);if(i%5===0)progress('Tracking ball flights',`${Math.round(t)} of ${Math.round(video.duration)} seconds`,8+88*i/n);}
  return await call({type:'finish',fps});
 }finally{worker.terminate();}
}
