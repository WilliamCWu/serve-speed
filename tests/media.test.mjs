import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseMovieMetadata,readVideoMetadata,frameIndex,frameTimestamp,frameSeekTime,timingUncertainty,validateVideoTiming,summarizePresentedFrames} from '../dist/media.js';
import {estimateManual} from '../dist/manual.js';
const u32=n=>{const b=Buffer.alloc(4);b.writeUInt32BE(n);return b;},i32=n=>{const b=Buffer.alloc(4);b.writeInt32BE(n);return b;};
const box=(t,...data)=>{const b=Buffer.concat(data);return Buffer.concat([u32(b.length+8),Buffer.from(t),b]);};
function movie({runs=[[120,10]],codec='hvc1',offsets=null,signed=false,edit=null}={}){
 const full=Buffer.alloc(4),header=box('mdhd',full,Buffer.alloc(8),u32(600),u32(runs.reduce((n,[c,d])=>n+c*d,0)),Buffer.alloc(4));
 const stts=box('stts',full,u32(runs.length),...runs.flatMap(([c,d])=>[u32(c),u32(d)]));
 const ctts=offsets?box('ctts',Buffer.from([signed?1:0,0,0,0]),u32(offsets.length),...offsets.flatMap(d=>[u32(1),signed?i32(d):u32(d)])):Buffer.alloc(0);
 const stbl=box('stbl',stts,ctts,box('stsd',full,u32(1),box(codec)));
 const handler=box('hdlr',full,u32(0),Buffer.from('vide'),Buffer.alloc(12));
 const edits=edit?box('edts',box('elst',full,u32(edit.length),...edit.flatMap(([duration,media,rate=1])=>[u32(duration),i32(media),i32(rate*65536)]))):Buffer.alloc(0);
 return box('moov',box('mvhd',full,Buffer.alloc(8),u32(600),u32(1200)),box('trak',edits,box('mdia',header,handler,box('minf',stbl))));
}
function parse(b){return parseMovieMetadata(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));}
const cfr=parse(movie());assert.equal(cfr.fps,60);assert.equal(cfr.variable,false);assert.equal(cfr.codec,'hvc1');assert.equal(cfr.frameTimes[119],119/60);validateVideoTiming(cfr);
const vfr=parse(movie({runs:[[60,10],[30,20]]}));assert.equal(vfr.fps,45);assert.equal(vfr.variable,true);assert.equal(vfr.duration,2);validateVideoTiming(vfr);
// A mixed 60/30 fps clip must use each actual timestamp, not frame / mean FPS.
assert.equal(frameTimestamp(vfr,1.051),1+1/30);assert.equal(frameIndex(vfr,1.051),61);assert.ok(frameSeekTime(vfr,1.051)>1+1/30);assert.ok(frameSeekTime(vfr,1.051)<1+2/30);
assert.ok(Math.abs(timingUncertainty(vfr,.5,1.5)-.025)<1e-9);
const flight=estimateManual({contact:frameTimestamp(vfr,.4),bounceTime:frameTimestamp(vfr,1.051),start:[0,0],end:[0,17],fps:vfr.fps,timingError:timingUncertainty(vfr,.4,1.051)});assert.equal(flight.flightTime,(1+1/30)-.4);assert.ok(Math.abs(flight.speed-Math.hypot(17,2.7)/flight.flightTime)<1e-9);assert.equal(flight.timingError,timingUncertainty(vfr,.4,1.051));
assert.ok(estimateManual({contact:0,bounceTime:.5,start:[0,0],end:[0,17],fps:60,timingError:.6}).error);
// Decode-order B-frames are sorted by composition time and shifted by edits.
const reordered=parse(movie({runs:[[4,20]],codec:'avc1',offsets:[40,80,20,20],edit:[[80,40]]}));assert.deepEqual(reordered.frameTimes,[0,20/600,40/600,60/600]);assert.equal(reordered.fps,30);
const signed=parse(movie({runs:[[4,20]],offsets:[0,20,-20,0],signed:true}));assert.deepEqual(signed.frameTimes,[0,20/600,40/600,60/600]);
const trimmed=parse(movie({runs:[[120,10]],edit:[[600,300]]}));assert.equal(trimmed.samples,60);assert.equal(trimmed.frameTimes[0],0);assert.equal(trimmed.duration,1);
const emptyEdit=parse(movie({runs:[[120,10]],edit:[[60,-1],[1200,0]]}));assert.equal(emptyEdit.frameTimes[0],.1);assert.equal(emptyEdit.duration,2.1);
assert.throws(()=>validateVideoTiming(parse(movie({edit:[[1200,0,.5]]}))),/speed-changing/);
assert.equal(parse(Buffer.from([0,0,0,99,109,111,111,118])),null);
assert.throws(()=>validateVideoTiming({fps:0}),/detected frame rate/);
assert.throws(()=>validateVideoTiming({fps:45,variable:true,source:'playback'}),/could not read all frame timestamps/);
// A callback skipped by the display must not halve the inferred source rate.
const callbacks=[0,1,2,4,5,8,9,10].map(n=>({mediaTime:n/60,presentedFrames:n+1}));const summary=summarizePresentedFrames(callbacks);assert.ok(Math.abs(summary.fps-60)<1e-8);assert.equal(summary.variable,false);
assert.throws(()=>summarizePresentedFrames([0,1,2,3,4,5,7,9].map(n=>({mediaTime:n/60,presentedFrames:undefined}))),/Not enough/);
// Reading only moov also works when a large mdat precedes it.
const file=new File([box('ftyp',Buffer.from('qt  ')),box('mdat',Buffer.alloc(1000)),movie({runs:[[60,10],[30,20]]})],'original.mov',{type:'video/quicktime'});assert.equal((await readVideoMetadata(file)).variable,true);
if(process.env.TEST_VIDEO){const raw=fs.readFileSync(process.env.TEST_VIDEO),m=await readVideoMetadata(new File([raw],'fixture.mp4'));validateVideoTiming(m);assert.ok(m.frameTimes.length>=2);console.log('PASS: uploaded clip metadata',m.codec,m.fps.toFixed(2)+' fps',m.samples+' frames');}
console.log('PASS: original HEVC and variable timestamps, B-frames, signed offsets, edit-list trims, local timing sensitivity, malformed metadata and skipped playback callbacks.');
