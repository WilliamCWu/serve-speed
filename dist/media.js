const type=(v,o)=>String.fromCharCode(v.getUint8(o),v.getUint8(o+1),v.getUint8(o+2),v.getUint8(o+3));
const median=x=>{const a=[...x].sort((a,b)=>a-b);return a[Math.floor(a.length/2)];};
function atoms(v,start,end){const out=[];let o=start;while(o+8<=end){let size=v.getUint32(o),head=8;if(size===1){if(o+16>end)break;size=Number(v.getBigUint64(o+8));head=16;}if(size===0)size=end-o;if(size<head||!Number.isSafeInteger(size)||o+size>end)break;out.push({type:type(v,o+4),start:o+head,end:o+size});o+=size;}return out;}
function child(v,a,t){return a&&atoms(v,a.start,a.end).find(x=>x.type===t);}
function scale(v,a){if(!a)return 0;const o=a.start+(v.getUint8(a.start)===1?20:12);return o+4<=a.end?v.getUint32(o):0;}
function entries(v,a,signed=false){if(!a||a.start+8>a.end)return null;const n=v.getUint32(a.start+4);if(n>100000||a.start+8+n*8>a.end)return null;return Array.from({length:n},(_,i)=>[v.getUint32(a.start+8+i*8),signed?v.getInt32(a.start+12+i*8):v.getUint32(a.start+12+i*8)]);}

// MP4/MOV frame timing is independent of its H.264 or HEVC encoding. Decode
// times (stts) need composition offsets (ctts) and edit lists (elst) to match
// the browser's presentation timeline, particularly for reordered B-frames.
export function parseMovieMetadata(buffer){
 try{
  const v=new DataView(buffer),root={start:0,end:v.byteLength},moov=child(v,root,'moov')??root,movieScale=scale(v,child(v,moov,'mvhd'));
  for(const track of atoms(v,moov.start,moov.end).filter(x=>x.type==='trak')){
   const mdia=child(v,track,'mdia'),handler=child(v,mdia,'hdlr');if(!handler||handler.start+12>handler.end||type(v,handler.start+8)!=='vide')continue;
   const mediaScale=scale(v,child(v,mdia,'mdhd')),stbl=child(v,child(v,mdia,'minf'),'stbl'),stts=entries(v,child(v,stbl,'stts'));if(!mediaScale||!stts?.length)continue;
   const samples=stts.reduce((n,[count])=>n+count,0);if(samples<2||samples>100000||stts.some(([n,d])=>!n||!d))continue;
   const frames=[];let ticks=0;for(const [count,delta] of stts)for(let i=0;i<count;i++){frames.push({pts:ticks,delta});ticks+=delta;}
   const ctts=child(v,stbl,'ctts');if(ctts){const offsets=entries(v,ctts,v.getUint8(ctts.start)===1);if(!offsets||offsets.reduce((n,[count])=>n+count,0)!==samples)continue;let j=0;for(const [count,offset] of offsets)for(let i=0;i<count;i++)frames[j++].pts+=offset;}
   frames.sort((a,b)=>a.pts-b.pts);
   const stsd=child(v,stbl,'stsd'),codec=stsd&&stsd.start+16<=stsd.end?type(v,stsd.start+12):'unknown';
   const elst=child(v,child(v,track,'edts'),'elst');let mapped=[],duration=0;
   if(elst){
    if(!movieScale||elst.start+8>elst.end)continue;
    const version=v.getUint8(elst.start),n=v.getUint32(elst.start+4),width=version===1?20:12;if(n>1000||elst.start+8+n*width>elst.end)continue;
    for(let i=0;i<n;i++){
     const o=elst.start+8+i*width,segment=(version===1?Number(v.getBigUint64(o)):v.getUint32(o))/movieScale,media=version===1?Number(v.getBigInt64(o+8)):v.getInt32(o+4),rateOffset=o+(version===1?16:8),rate=v.getInt16(rateOffset)+v.getUint16(rateOffset+2)/65536;
     if(media===-1){duration+=segment;continue;}
     if(rate!==1)return {unsupported:'This clip contains speed-changing or slow-motion edits. Choose a recording played at its real-life speed.',codec};
     const end=segment||Math.max(0,(frames.at(-1).pts+frames.at(-1).delta-media)/mediaScale);
     for(const f of frames){const t=(f.pts-media)/mediaScale;if(t>=-1e-7&&t<end-1e-7)mapped.push(duration+Math.max(0,t));}
     duration+=end;
    }
   }else{mapped=frames.filter(f=>f.pts>=0).map(f=>f.pts/mediaScale);duration=(frames.at(-1).pts+frames.at(-1).delta)/mediaScale;}
   if(mapped.length<2||!Number.isFinite(duration)||duration<=0||mapped.some((t,i)=>!Number.isFinite(t)||(i&&t<=mapped[i-1])))continue;
   const deltas=mapped.slice(1).map((t,i)=>t-mapped[i]),typical=median(deltas),variable=deltas.some(d=>Math.abs(d-typical)>Math.max(1/mediaScale,typical*.2));
   return {fps:Math.round(mapped.length/(duration-mapped[0])*1e9)/1e9,samples:mapped.length,variable,duration,frameTimes:mapped,codec,source:'container'};
  }
 }catch{/* Truncated or unsupported metadata falls back to decoded timing. */}
 return null;
}
export async function readVideoMetadata(file){
 let offset=0;
 while(offset+8<=file.size){const buf=await file.slice(offset,offset+16).arrayBuffer(),v=new DataView(buf);if(v.byteLength<8)return null;let size=v.getUint32(0),head=8;if(size===1){if(v.byteLength<16)return null;size=Number(v.getBigUint64(8));head=16;}if(size===0)size=file.size-offset;if(size<head||!Number.isSafeInteger(size)||offset+size>file.size)break;if(type(v,4)==='moov'){if(size>32*1024*1024)return null;return parseMovieMetadata(await file.slice(offset,offset+size).arrayBuffer());}offset+=size;}
 return null;
}
export function frameIndex(meta,time){
 const times=meta?.frameTimes;if(!times?.length)return Math.max(0,Math.floor((time+1e-7)*(meta?.fps??30)));
 let lo=0,hi=times.length;while(lo<hi){const mid=(lo+hi)>>1;if(times[mid]<=time+1e-7)lo=mid+1;else hi=mid;}return Math.max(0,lo-1);
}
export function frameTimestamp(meta,time){return meta?.frameTimes?.[frameIndex(meta,time)]??frameIndex(meta,time)/(meta?.fps??30);}
export function frameInterval(meta,time){const times=meta?.frameTimes;if(!times?.length)return 1/meta.fps;const i=frameIndex(meta,time);return Math.max(i?times[i]-times[i-1]:0,(times[i+1]??meta.duration)-times[i]);}
export function frameSeekTime(meta,time){const t=frameTimestamp(meta,time),times=meta?.frameTimes,i=frameIndex(meta,time),end=times?(times[i+1]??meta.duration):t+1/meta.fps;return t+(end-t)*.25;}
export function timingUncertainty(meta,contact,bounce){return (frameInterval(meta,contact)+frameInterval(meta,bounce))/2;}
export function validateVideoTiming(meta){
 if(meta?.unsupported)throw new Error(meta.unsupported);
 if(!Number.isFinite(meta?.fps)||meta.fps<10||meta.fps>245)throw new Error(`The detected frame rate is ${Number.isFinite(meta?.fps)?meta.fps.toFixed(2)+' fps':'unavailable'}. Choose a real-time recording between 10 and 240 fps.`);
 if(meta.variable&&!meta.frameTimes?.length)throw new Error(`Playback timing varies (about ${meta.fps.toFixed(2)} fps), but this browser could not read all frame timestamps. Choose the original MP4/MOV from Files, or an H.264 MP4 export at 30 or 60 fps.`);
 return meta;
}
export function waitVideo(video,event,signal,timeout=20000){return new Promise((resolve,reject)=>{let timer;const clean=()=>{clearTimeout(timer);video.removeEventListener(event,done);video.removeEventListener('error',fail);signal?.removeEventListener('abort',cancel);};const done=()=>{clean();resolve();};const fail=()=>{clean();reject(new Error('This browser cannot decode the selected video format. For an iPhone HEVC/HDR original, try Safari on the iPhone or export a compatible H.264 MP4.'))};const cancel=()=>{clean();reject(new DOMException('Cancelled','AbortError'));};if(signal?.aborted){cancel();return;}video.addEventListener(event,done,{once:true});video.addEventListener('error',fail,{once:true});signal?.addEventListener('abort',cancel,{once:true});timer=setTimeout(()=>{clean();reject(new Error('The video took too long to decode. Try a shorter clip or a compatible H.264 MP4 export.'));},timeout);});}
export async function seekFrame(video,time,signal){
 if(signal?.aborted)throw new DOMException('Cancelled','AbortError');
 if(Math.abs(video.currentTime-time)<.00005&&video.readyState>=2)return time;
 const ready=waitVideo(video,'seeked',signal);video.currentTime=time;await ready;return time;
}
// Callback gaps can be caused by a busy display, not the recording. Count
// presented frames to avoid treating those skipped callbacks as variable FPS.
export function summarizePresentedFrames(frames){
 const intervals=[];for(let i=1;i<frames.length;i++){const dt=frames[i].mediaTime-frames[i-1].mediaTime,n=frames[i].presentedFrames-frames[i-1].presentedFrames;if(dt>0&&Number.isInteger(n)&&n>0)intervals.push(dt/n);}
 const typical=median(intervals);if(!typical||intervals.length<5)throw new Error('Not enough video frame timing was found. Choose an original MP4 or MOV.');
 return {fps:1/typical,variable:intervals.some(d=>Math.abs(d-typical)>typical*.25),source:'playback',codec:'browser-decoded'};
}
export async function measureVideoFPS(video,signal){
 if(!video.requestVideoFrameCallback)throw new Error('Frame-rate metadata is unavailable. Choose an original MP4 or MOV clip from Files.');
 const frames=[],muted=video.muted,rate=video.playbackRate;video.muted=true;video.playbackRate=1;
 try{await seekFrame(video,0,signal);await new Promise((resolve,reject)=>{let handle,timer;const clean=()=>{clearTimeout(timer);if(handle!=null)video.cancelVideoFrameCallback(handle);video.pause();signal?.removeEventListener('abort',cancel);};const cancel=()=>{clean();reject(new DOMException('Cancelled','AbortError'));};const callback=(now,meta)=>{frames.push({mediaTime:meta.mediaTime,presentedFrames:meta.presentedFrames});if(frames.length>=20){clean();resolve();}else handle=video.requestVideoFrameCallback(callback);};signal?.addEventListener('abort',cancel,{once:true});handle=video.requestVideoFrameCallback(callback);timer=setTimeout(()=>{clean();reject(new Error('Could not determine video timing. Choose an original MP4 or MOV clip from Files.'));},6000);video.play().catch(e=>{clean();reject(e);});});return summarizePresentedFrames(frames);
 }finally{video.muted=muted;video.playbackRate=rate;video.pause();}
}
