import assert from 'node:assert/strict';
import fs from 'node:fs';
import {homography,project,project3,inverse,cameraFromCourt,atHeight,detectCourt,courtSegments,findBalls,estimateFlight,findServes,cameraShift} from '../dist/engine.js';
import {parseMovieMetadata} from '../dist/media.js';

const w=640,h=480,f=470,cy=h/2,cx=w/2,back=14,height=5;
const angle=Math.atan2(height,back+12),s=Math.sin(angle),c=Math.cos(angle);
const tY=height*c-back*s,tZ=back*c+height*s;
const H=[f/tZ,cx*c/tZ,cx,0,(-f*s+cy*c)/tZ,(f*tY+cy*tZ)/tZ,0,c/tZ,1];
const camera=cameraFromCourt(H,w,h);
assert.ok(camera,'valid camera should calibrate');
assert.ok(Math.abs(camera.f-f)<1e-7);
const p=project3(camera,1,0,2.7),origin=atHeight(camera,...p,2.7);
assert.ok(Math.hypot(origin[0]-1,origin[1])<1e-7);
const recovered=homography([[-5.485,0],[5.485,0],[-5.485,23.77],[5.485,23.77]],[[-5.485,0],[5.485,0],[-5.485,23.77],[5.485,23.77]].map(v=>project(H,...v)));
assert.ok(Math.hypot(...project(recovered,0,5.485).map((v,i)=>v-project(H,0,5.485)[i]))<1e-7);

const rgba=new Uint8ClampedArray(w*h*4);
for(let i=0;i<w*h;i++)rgba.set([38,80,125,255],i*4);
function line(a,b,color=[235,235,235,255],radius=1){const n=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])*2);for(let i=0;i<=n;i++){const x=Math.round(a[0]+(b[0]-a[0])*i/n),y=Math.round(a[1]+(b[1]-a[1])*i/n);for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++)if(x+dx>=0&&x+dx<w&&y+dy>=0&&y+dy<h)rgba.set(color,((y+dy)*w+x+dx)*4);}}
courtSegments.forEach(seg=>line(project(H,seg[0],seg[1]),project(H,seg[2],seg[3])));
const detected=detectCourt(rgba,w,h);
assert.ok(detected,'automatic line calibration should find a clearly visible court');
const actual=project(H,0,18.285),found=project(detected.H,0,18.285);
assert.ok(Math.hypot(actual[0]-found[0],actual[1]-found[1])<12,'service box projection should match');
const blank=new Uint8ClampedArray(w*h*4);assert.equal(detectCourt(blank,w,h),null);
assert.equal(cameraShift(rgba,rgba,w,h).pixels,0,'a fixed camera should have no shift');

const dt=.65,begin=project3(camera,1,0,2.7),end=project3(camera,-1.5,17,0);
const estimate=estimateFlight(camera,{x:begin[0],y:begin[1]},{x:end[0],y:end[1]},dt,30);
assert.ok(estimate);const expected=Math.hypot(2.5,17,2.7)/dt;assert.ok(Math.abs(estimate.speed-expected)<1e-6);assert.ok(estimate.lo<estimate.speed&&estimate.hi>estimate.speed);
const est60=estimateFlight(camera,{x:begin[0],y:begin[1]},{x:end[0],y:end[1]},dt,60);assert.ok(est60.hi-est60.lo<estimate.hi-estimate.lo);
assert.equal(estimateFlight(camera,{x:begin[0],y:begin[1]},{x:end[0],y:end[1]},.02,30),null);

const frames=[];const fps=60;
// Toss, contact, flight and a physically distinct upward rebound.
const vz=(.5*9.81*dt*dt-2.7)/dt;
for(let i=-12;i<=Math.round(dt*fps)+8;i++){
 const t=i/fps;let x=1,y=0,z;
 if(t<0)z=2.7+1.5*t;
 else if(t<=dt){x=1-2.5*t/dt;y=17*t/dt;z=2.7+vz*t-4.905*t*t;}
 else{x=-1.5-2*(t-dt);y=17+6*(t-dt);z=3*(t-dt)-4.905*(t-dt)**2;}
 const p=project3(camera,x,y,z);frames.push({t:t+1,balls:[{x:p[0],y:p[1],area:8,motion:150}]});
}
const serves=findServes(frames,{camera,H,w,h},fps);assert.equal(serves.length,1,'one complete flight should be detected');
assert.ok(Math.abs(serves[0].speed-expected)<2);
assert.equal(findServes(frames.slice(0,30),{camera,H,w,h},fps).length,0,'incomplete flight must not report speed');

line([300,150],[301,151],[180,230,40,255],2);const balls=findBalls(rgba,blank,w,h);assert.ok(balls.some(b=>Math.hypot(b.x-300,b.y-150)<5));
const sample=process.env.TEST_VIDEO;
if(sample){const buf=fs.readFileSync(sample);const meta=parseMovieMetadata(buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength));assert.equal(meta.fps,30);assert.equal(meta.variable,false);console.log('User clip metadata:',meta);}
if(process.env.TEST_REFERENCE){const image=new Uint8ClampedArray(fs.readFileSync(process.env.TEST_REFERENCE));assert.equal(detectCourt(image,480,853),null,'uncalibrated user footage must not report a speed');console.log('User clip calibration: withheld; cropped court is not measurable.');}
console.log('PASS: camera calibration, court detection, timing sensitivity, serve tracking, ball detection, and rejection of incomplete flights.');
