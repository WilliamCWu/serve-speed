import assert from 'node:assert/strict';
import fs from 'node:fs';
import {LANDMARKS,fitManualCourt,estimateManual,audioCues} from '../dist/manual.js';
import {project} from '../dist/engine.js';

// A deliberately cropped portrait court: visible service-box points are sufficient.
const H=[45,20,360,0,-24,980,0,.05,1],w=720,h=1280;
const anchors=['nscl','nsc','fsc','fscr'].map(id=>{const mark=LANDMARKS.find(p=>p[0]===id),p=project(H,mark[2],mark[3]);return {id,x:p[0],y:p[1]};});
assert.ok(anchors.every(p=>p.x>=0&&p.x<=w&&p.y>=0&&p.y<=h));
const fit=fitManualCourt(anchors,w,h);assert.ok(fit.H,fit.error);assert.ok(fit.coverage<.25,'only a partial court was provided');
for(const p of [[0,0],[-1,17],[1.5,16]]){const mapped=project(fit.inv,...project(H,...p));assert.ok(Math.hypot(mapped[0]-p[0],mapped[1]-p[1])<1e-7);}
const collinear=['nscl','nsc','nscr','nsc'].map(id=>{const p=LANDMARKS.find(p=>p[0]===id),q=project(H,p[2],p[3]);return {id,x:q[0],y:q[1]};});assert.ok(fitManualCourt(collinear,w,h).error);
assert.ok(fitManualCourt(anchors.slice(0,3),w,h).error);
const flight={contact:4,bounceTime:4.7,start:[-1,0],end:[1.5,17],height:2.7,fps:30,tolerance:1};
const estimate=estimateManual(flight);assert.ok(!estimate.error);assert.ok(Math.abs(estimate.speed-Math.hypot(2.5,17,2.7)/.7)<1e-9);
assert.ok(estimate.lo<estimate.speed&&estimate.hi>estimate.speed);
const precise=estimateManual({...flight,fps:60,tolerance:.3});assert.ok(precise.hi-precise.lo<estimate.hi-estimate.lo);
assert.ok(estimateManual({...flight,contact:null}).error,'audio suggestions must not become confirmed contact times');
assert.ok(estimateManual({...flight,bounceTime:3}).error);assert.ok(estimateManual({...flight,end:null}).error);
assert.equal(audioCues(new Float32Array(22050),22050).contacts.length,0,'silent video should use manual shots');

if(process.env.TEST_AUDIO){const buf=fs.readFileSync(process.env.TEST_AUDIO),data=new Float32Array(buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength)),sampleRate=Number(process.env.TEST_AUDIO_RATE??22050),cues=audioCues(data,sampleRate);assert.equal(cues.contacts.length,3,'uploaded clip should produce three contact candidates');[3.97,11.36,18.06].forEach((t,i)=>assert.ok(Math.abs(cues.contacts[i].time-t)<.03));console.log('Uploaded clip: three contact candidates at',cues.contacts.map(c=>c.time.toFixed(3)).join(', '),'seconds; manual confirmation required.');}
console.log('PASS: partial-court calibration, metric projection, incomplete/invalid input rejection, position/timing sensitivity, and audio suggestions.');
