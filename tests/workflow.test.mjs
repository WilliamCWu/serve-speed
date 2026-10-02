// DOM/media doubles exercise the actual UI event handlers with the uploaded
// video's real container metadata and decoded audio. This is not browser QA.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const videoPath=process.env.TEST_VIDEO,audioPath=process.env.TEST_AUDIO;
if(!videoPath||!audioPath){console.log('SKIP: set TEST_VIDEO and TEST_AUDIO for uploaded-clip workflow testing.');process.exit(0);}
const html=fs.readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
class Element extends EventTarget{
 constructor(id=''){super();this.id=id;this.tagName='DIV';this.children=[];this.textContent='';this.value='';this.hidden=!!html.match(new RegExp('id="'+id+'"[^>]*hidden'));this.disabled=false;this.style={};this.classList={toggle(){},add(){},remove(){}};this.attrs={};}
 set innerHTML(v){this.html=v;this.children=[];this.textContent='';}get innerHTML(){return this.html??'';}
 setAttribute(k,v){this.attrs[k]=v;}
 replaceChildren(...v){this.children=v;this.textContent='';}
 append(...v){this.children.push(...v);}
 getBoundingClientRect(){return {width:720,height:1280,left:0,top:0};}
 scrollIntoView(){}
 getContext(){return {fillRect(){},clearRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},arc(){},fill(){},fillText(){},drawImage(){}};}
}
class Video extends Element{
 constructor(){super('video');this.videoWidth=720;this.videoHeight=1280;this.duration=21.133333;this.readyState=4;this.paused=true;this.time=0;this.controls=true;}
 get currentTime(){return this.time;}set currentTime(t){this.time=t;queueMicrotask(()=>{this.dispatchEvent(new Event('seeked'));this.dispatchEvent(new Event('timeupdate'));});}
 pause(){this.paused=true;}play(){this.paused=false;this.dispatchEvent(new Event('play'));return Promise.resolve();}
 load(){queueMicrotask(()=>this.dispatchEvent(new Event('loadeddata')));}
}
const nodes=new Map([...html.matchAll(/id="([^"]+)"/g)].map(m=>[m[1],new Element(m[1])]));nodes.set('video',new Video());
const choices=[new Element(),new Element()];const doc=new EventTarget();Object.assign(doc,{getElementById:id=>nodes.get(id)??null,querySelectorAll:selector=>selector==='.choose-file'?choices:selector==='.speed-unit'?[new Element()]:[],createElement:tag=>new Element(),createTextNode:s=>s});globalThis.document=doc;globalThis.window=new EventTarget();
const raw=fs.readFileSync(audioPath),samples=new Float32Array(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength));
globalThis.AudioContext=class{async decodeAudioData(){return {length:samples.length,numberOfChannels:1,sampleRate:22050,getChannelData:()=>samples};}async close(){}};
await import('../dist/app.js');
const $=id=>nodes.get(id),video=$('video');
$('file').files=[new File([fs.readFileSync(videoPath)],'1.mp4',{type:'video/mp4'})];$('file').onchange();
for(let i=0;i<100&&$('editor').hidden;i++)await new Promise(r=>setTimeout(r,10));
assert.equal($('editor').hidden,false,'portrait upload must reach the editor without automatic court detection');
assert.match($('audio-note').textContent,/3 possible shots/);assert.equal($('shot-tabs').children.length,3);assert.equal($('contact-time').textContent,'Not confirmed');
video.currentTime=3.975;await new Promise(r=>setTimeout(r,0));$('quick-contact').onclick();assert.match($('contact-time').textContent,/3\.967/);
video.currentTime=4.642;await new Promise(r=>setTimeout(r,0));$('quick-bounce').onclick();
// Verify keyboard coordinate entry preserves the first value until the second
// is entered, and generates a measurement only once both positions exist.
$('start-x').value='-1';$('start-x').onchange();assert.equal(Number($('start-x').value),-1);assert.equal($('start-y').value,'');
$('start-y').value='0';$('start-y').onchange();$('end-x').value='1';$('end-x').onchange();$('end-y').value='17';$('end-y').onchange();assert.notEqual($('top-speed').textContent,'—');assert.match($('result-status').textContent,/1 MEASURED \/ 3 SHOTS/);
const mph=Number($('top-speed').textContent);$('kmh').onclick();assert.ok(Number($('top-speed').textContent)>mph);
// Per-shot data must not leak into a different candidate.
$('video-shot').value='2';$('video-shot').onchange();await new Promise(r=>setTimeout(r,0));assert.equal($('contact-time').textContent,'Not confirmed');assert.equal($('start-x').value,'');
// Exercise the manual calibration controls using four partial-court anchors.
video.currentTime=18.05;await new Promise(r=>setTimeout(r,0));$('quick-contact').onclick();video.currentTime=18.75;await new Promise(r=>setTimeout(r,0));$('quick-bounce').onclick();$('measure-mode').value='calibrated';$('measure-mode').onchange();
const {LANDMARKS}=await import('../dist/manual.js');const {project}=await import('../dist/engine.js');const H=[45,20,360,0,-24,980,0,.05,1];
function clickVideo(p){const e=new Event('click');e.clientX=p[0];e.clientY=p[1];$('overlay').dispatchEvent(e);}
for(const id of ['nscl','nsc','fsc','fscr']){$('landmark').value=id;await $('add-landmark').onclick();const p=LANDMARKS.find(p=>p[0]===id);clickVideo(project(H,p[2],p[3]));}
assert.match($('calibration-note').textContent,/4 points mapped/);await $('mark-origin').onclick();clickVideo(project(H,-1,0));await $('mark-landing').onclick();clickVideo(project(H,1,17));assert.match($('result-status').textContent,/2 MEASURED \/ 3 SHOTS/);assert.equal($('start-x').disabled,true);assert.match($('measurement-check').textContent,/court overlay/);
await $('replay-shot').onclick();assert.equal(video.paused,false);video.currentTime=20;await new Promise(r=>setTimeout(r,0));assert.equal(video.paused,true,'shot replay should stop at its segment boundary');
console.log('PASS: uploaded portrait clip reaches manual editor, three shots are suggested, contact/bounce confirmation works, coordinate entry generates a result, units convert, and shot data stays independent.');
