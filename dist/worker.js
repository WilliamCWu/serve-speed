import {detectCourt,findBalls,findServes,cameraShift} from './engine.js';
let previous=null,reference=null,frames=[],court=null,width=0,height=0,maxShift=0,movementError=0;
self.onmessage=({data})=>{
  try {
    if(data.type==='init'){
      width=data.width;height=data.height;previous=null;reference=new Uint8ClampedArray(data.rgba);frames=[];maxShift=0;movementError=0;
      court=detectCourt(reference,width,height);
      self.postMessage({id:data.id,type:'calibrated',court});
    }else if(data.type==='configure'){
      court=data.court;width=data.width;height=data.height;reference=new Uint8ClampedArray(data.rgba);previous=null;frames=[];
      self.postMessage({id:data.id,type:'configured'});
    }else if(data.type==='frame'){
      const rgba=new Uint8ClampedArray(data.rgba);
      const balls=findBalls(rgba,previous,width,height);frames.push({t:data.time,balls});
      if(frames.length%Math.max(1,Math.round(data.fps))===0){const shift=cameraShift(reference,rgba,width,height);maxShift=Math.max(maxShift,shift.pixels);movementError=Math.max(movementError,shift.error);}
      previous=rgba;
      self.postMessage({id:data.id,type:'frame',count:frames.length});
    }else if(data.type==='finish'){
      if(maxShift>=4||movementError>80){self.postMessage({id:data.id,type:'result',serves:[],reason:'motion',court,maxShift});return;}
      const serves=findServes(frames,court,data.fps);
      self.postMessage({id:data.id,type:'result',serves,court,reason:serves.length?null:'tracking',maxShift});
    }
  }catch(error){self.postMessage({id:data.id,error:error.message});}
};
