const type=(v,o)=>String.fromCharCode(v.getUint8(o),v.getUint8(o+1),v.getUint8(o+2),v.getUint8(o+3));
function atoms(v,start,end){const out=[];let o=start;while(o+8<=end){let size=v.getUint32(o),head=8;if(size===1){if(o+16>end)break;size=Number(v.getBigUint64(o+8));head=16;}if(size===0)size=end-o;if(size<head||o+size>end)break;out.push({type:type(v,o+4),start:o+head,end:o+size});o+=size;}return out;}
function child(v,a,t){return atoms(v,a.start,a.end).find(x=>x.type===t);}
export function parseMovieMetadata(buffer){
  const v=new DataView(buffer),root={start:0,end:v.byteLength},moov=child(v,root,'moov')??root;
  for(const track of atoms(v,moov.start,moov.end).filter(x=>x.type==='trak')){
    const mdia=child(v,track,'mdia');if(!mdia)continue;const handler=child(v,mdia,'hdlr');if(!handler||type(v,handler.start+8)!=='vide')continue;
    const mdhd=child(v,mdia,'mdhd'),minf=child(v,mdia,'minf'),stbl=minf&&child(v,minf,'stbl'),stts=stbl&&child(v,stbl,'stts');if(!mdhd||!stts)continue;
    const version=v.getUint8(mdhd.start),scale=v.getUint32(mdhd.start+(version===1?20:12));const n=v.getUint32(stts.start+4);let samples=0,ticks=0,min=Infinity,max=0;
    for(let i=0;i<n&&stts.start+16+i*8<=stts.end;i++){const count=v.getUint32(stts.start+8+i*8),duration=v.getUint32(stts.start+12+i*8);samples+=count;ticks+=count*duration;min=Math.min(min,duration);max=Math.max(max,duration);}
    if(!samples||!ticks||!scale)continue;
    return {fps:samples*scale/ticks,samples,variable:max/min>1.2,duration:ticks/scale};
  }return null;
}
export async function readVideoMetadata(file){
  let offset=0;
  while(offset+8<=file.size){const buf=await file.slice(offset,offset+16).arrayBuffer(),v=new DataView(buf);let size=v.getUint32(0),head=8;if(size===1){size=Number(v.getBigUint64(8));head=16;}if(size===0)size=file.size-offset;if(size<head||!Number.isSafeInteger(size)||offset+size>file.size)break;if(type(v,4)==='moov'){if(size>32*1024*1024)return null;return parseMovieMetadata(await file.slice(offset,offset+size).arrayBuffer());}offset+=size;}
  return null;
}
export function waitVideo(video,event,signal,timeout=10000){return new Promise((resolve,reject)=>{let timer;const clean=()=>{clearTimeout(timer);video.removeEventListener(event,done);video.removeEventListener('error',fail);signal?.removeEventListener('abort',cancel);};const done=()=>{clean();resolve();};const fail=()=>{clean();reject(new Error('This browser cannot decode the video. Try an H.264 MP4 export.'));};const cancel=()=>{clean();reject(new DOMException('Cancelled','AbortError'));};if(signal?.aborted){cancel();return;}video.addEventListener(event,done,{once:true});video.addEventListener('error',fail,{once:true});signal?.addEventListener('abort',cancel,{once:true});timer=setTimeout(()=>{clean();reject(new Error('The video took too long to decode. Try a shorter H.264 MP4 clip.'));},timeout);});}
export async function seekFrame(video,time,signal){
  if(signal?.aborted)throw new DOMException('Cancelled','AbortError');
  if(Math.abs(video.currentTime-time)<.00005&&video.readyState>=2)return time;
  const ready=waitVideo(video,'seeked',signal);video.currentTime=time;await ready;
  // seeked implies that the requested video frame is ready to draw.
  return time;
}
export async function measureVideoFPS(video,signal){
 if(!video.requestVideoFrameCallback)throw new Error('Frame-rate metadata is unavailable. Use an original MP4 or MOV clip.');
 const times=[];video.muted=true;video.playbackRate=1;
 try{await seekFrame(video,0,signal);await new Promise((resolve,reject)=>{let handle,timer;const clean=()=>{clearTimeout(timer);video.cancelVideoFrameCallback(handle);video.pause();signal?.removeEventListener('abort',cancel);};const cancel=()=>{clean();reject(new DOMException('Cancelled','AbortError'));};const callback=(now,meta)=>{times.push(meta.mediaTime);if(times.length>=20){clean();resolve();}else handle=video.requestVideoFrameCallback(callback);};signal?.addEventListener('abort',cancel,{once:true});handle=video.requestVideoFrameCallback(callback);timer=setTimeout(()=>{clean();reject(new Error('Could not determine video timing. Use an original MP4 or MOV clip.'));},6000);video.play().catch(e=>{clean();reject(e);});});
 const deltas=times.slice(1).map((t,i)=>t-times[i]).filter(x=>x>0).sort((a,b)=>a-b),median=deltas[Math.floor(deltas.length/2)];if(!median)throw new Error('No video frame timing was found.');return {fps:1/median,variable:deltas.some(d=>Math.abs(d-median)>median*.25)};
 }finally{video.muted=false;video.pause();}
}
