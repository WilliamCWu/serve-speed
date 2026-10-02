import {solve,inverse,project} from './engine.js';
export const LANDMARKS=[
 ['nbc','Near baseline center',0,0],['nbl','Near baseline / left singles sideline',-4.115,0],['nbr','Near baseline / right singles sideline',4.115,0],
 ['nscl','Near service line / left singles sideline',-4.115,5.485],['nsc','Near service line center T',0,5.485],['nscr','Near service line / right singles sideline',4.115,5.485],
 ['fscl','Far service line / left singles sideline',-4.115,18.285],['fsc','Far service line center T',0,18.285],['fscr','Far service line / right singles sideline',4.115,18.285],
 ['fbl','Far baseline / left singles sideline',-4.115,23.77],['fbc','Far baseline center',0,23.77],['fbr','Far baseline / right singles sideline',4.115,23.77],
 ['nbdl','Near baseline / left doubles sideline',-5.485,0],['nbdr','Near baseline / right doubles sideline',5.485,0],['fbdl','Far baseline / left doubles sideline',-5.485,23.77],['fbdr','Far baseline / right doubles sideline',5.485,23.77]
];
const hullArea=points=>{const p=[...points].sort((a,b)=>a[0]-b[0]||a[1]-b[1]);const cross=(o,a,b)=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]);const lower=[],upper=[];for(const v of p){while(lower.length>=2&&cross(lower.at(-2),lower.at(-1),v)<=0)lower.pop();lower.push(v);}for(const v of p.reverse()){while(upper.length>=2&&cross(upper.at(-2),upper.at(-1),v)<=0)upper.pop();upper.push(v);}const hull=[...lower.slice(0,-1),...upper.slice(0,-1)];return Math.abs(hull.reduce((s,v,i)=>{const q=hull[(i+1)%hull.length];return s+v[0]*q[1]-q[0]*v[1];},0))/2;};
export function fitManualCourt(anchors,w,h){
 if(anchors.length<4)return {error:'Mark at least four visible court points.'};
 const world=anchors.map(a=>LANDMARKS.find(p=>p[0]===a.id)).filter(Boolean);
 if(world.length!==anchors.length||new Set(anchors.map(a=>a.id)).size!==anchors.length)return {error:'Choose distinct, known court points.'};
 const image=anchors.map(a=>[a.x/w,a.y/h]);
 if(hullArea(world.map(p=>p.slice(2)))<2||hullArea(image)<.001)return {error:'Spread the points across two or more lines. Points on one line cannot calibrate perspective.'};
 const A=[],b=[];world.forEach((p,i)=>{const x=p[2]/24,y=p[3]/24,[u,v]=image[i];A.push([x,y,1,0,0,0,-u*x,-u*y]);b.push(u);A.push([0,0,0,x,y,1,-v*x,-v*y]);b.push(v);});
 const normal=Array.from({length:8},()=>Array(8).fill(0)),rhs=Array(8).fill(0);
 A.forEach((row,i)=>row.forEach((v,j)=>{rhs[j]+=v*b[i];row.forEach((q,k)=>normal[j][k]+=v*q);}));
 const fit=solve(normal,rhs);if(!fit)return {error:'These points do not define a usable court. Choose points farther apart.'};
 const H=[fit[0]*w/24,fit[1]*w/24,fit[2]*w,fit[3]*h/24,fit[4]*h/24,fit[5]*h,fit[6]/24,fit[7]/24,1],inv=inverse(H);
 if(!inv)return {error:'The calibration is degenerate. Check the point labels.'};
 const error=Math.sqrt(world.reduce((s,p,i)=>{const q=project(H,p[2],p[3]);return s+(q[0]-anchors[i].x)**2+(q[1]-anchors[i].y)**2;},0)/anchors.length);
 if(!Number.isFinite(error)||error>Math.max(w,h)*.012)return {error:'The points disagree. Check the labels and mark the centers of the painted lines.'};
 // Perspective must not fold or cross its vanishing line within the playing area.
 const ds=[[-5.485,0],[5.485,0],[-5.485,23.77],[5.485,23.77]].map(([x,y])=>H[6]*x+H[7]*y+1);
 if(ds.some(d=>d<=.015))return {error:'The court projection crosses the playing area. Check the landmark labels.'};
 return {H,inv,w,h,reprojection:error,coverage:hullArea(world.map(p=>p.slice(2)))/(10.97*23.77)};
}
export function estimateManual({contact,bounceTime,start,end,height=2.7,fps=30,tolerance=1,timingError=1/fps}){
 if(!Number.isFinite(contact)||!Number.isFinite(bounceTime))return {error:'Confirm the contact frame and first-bounce frame.'};
 const dt=bounceTime-contact;if(dt<=.12||dt>2.5)return {error:'Bounce must be after contact, with a flight between 0.12 and 2.5 seconds.'};
 if(!start||!end)return {error:'Mark the server’s ground position and the first bounce position.'};
 if(![...start,...end,height,fps,tolerance,timingError].every(Number.isFinite)||height<1||height>4||fps<10||tolerance<0||timingError<=0)return {error:'Check contact height, positions, and video frame rate.'};
 if(Math.abs(start[0])>8||start[1]<-4||start[1]>27||Math.abs(end[0])>8||end[1]<-4||end[1]>27)return {error:'A mapped position falls far outside the court. Check the calibration or use the court diagram.'};
 const horizontal=Math.hypot(end[0]-start[0],end[1]-start[1]);if(horizontal<3)return {error:'The marked flight is too short for a serve. Check the position markers.'};
 if(dt<=timingError)return {error:'The selected frames are too widely spaced for this flight. Choose a clearer recording with more frames.'};
 const distance=Math.hypot(horizontal,height),speed=distance/dt,timing=timingError;
 const lo=Math.hypot(Math.max(0,horizontal-2*tolerance),Math.max(1,height-.4))/(dt+timing);
 const hi=Math.hypot(horizontal+2*tolerance,height+.4)/(dt-timing);
 return {speed,lo,hi,distance,flightTime:dt,contact,bounceTime,origin:start,bounce:end,manual:true,points:Math.round(dt*fps),tolerance,timingError};
}

const median=x=>{const p=[...x].sort((a,b)=>a-b);return p[Math.floor(p.length/2)]??0;};
export function audioCues(samples,sampleRate){
 const window=Math.max(1,Math.round(sampleRate*.005)),n=Math.floor(samples.length/window),energy=new Float32Array(n);
 for(let i=0;i<n;i++){let sum=0;for(let j=i*window;j<(i+1)*window;j++){const d=samples[j]-(samples[j-1]??0);sum+=d*d;}energy[i]=Math.sqrt(sum/window);}
 const noise=median(energy),events=[];
 for(let i=2;i<n-3;i++){const p=energy[i];if(p<Math.max(.001,noise*5)||p<energy[i-1]||p<energy[i+1])continue;
  let a=i,b=i;while(a>0&&energy[a-1]>p*.3)a--;while(b<n-1&&energy[b+1]>p*.3)b++;
  const width=(b-a+1)*window/sampleRate;if(width>.06)continue;
  const pre=median(energy.subarray(Math.max(0,i-30),Math.max(0,i-3)));if(p<pre*4)continue;
  events.push({time:i*window/sampleRate,strength:p,width});
 }
 const isolated=[];
 for(const e of [...events].sort((a,b)=>b.strength-a.strength))if(isolated.every(p=>Math.abs(p.time-e.time)>=.12))isolated.push(e);
 const max=Math.max(0,...isolated.map(e=>e.strength));const contacts=[];
 for(const e of isolated.filter(e=>e.strength>=max*.70)){
  if(contacts.every(c=>Math.abs(c.time-e.time)>2.2))contacts.push(e);
 }
 return {contacts:contacts.sort((a,b)=>a.time-b.time).slice(0,30),events:isolated.sort((a,b)=>a.time-b.time),energy:Array.from(energy),windowSeconds:window/sampleRate};
}
export async function decodeAudio(file,signal){
 const Audio=globalThis.AudioContext||globalThis.webkitAudioContext;if(!Audio)throw new Error('Audio analysis is unavailable in this browser. Add shots manually.');
 const context=new Audio();try{const raw=await file.arrayBuffer();if(signal?.aborted)throw new DOMException('Cancelled','AbortError');const buffer=await context.decodeAudioData(raw);const mono=new Float32Array(buffer.length);for(let c=0;c<buffer.numberOfChannels;c++){const channel=buffer.getChannelData(c);for(let i=0;i<mono.length;i++)mono[i]+=channel[i]/buffer.numberOfChannels;}return audioCues(mono,buffer.sampleRate);}finally{await context.close();}
}
