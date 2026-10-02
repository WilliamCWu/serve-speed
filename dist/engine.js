// Metric court geometry and conservative, model-free ball tracking.
// This is an experimental estimator; its sensitivity band is not a confidence interval.
export const COURT = { width: 10.97, singles: 8.23, length: 23.77, service: 5.485 };
export const courtSegments = [
  [-5.485,0,5.485,0],[-5.485,23.77,5.485,23.77],
  [-5.485,0,-5.485,23.77],[5.485,0,5.485,23.77],
  [-4.115,0,-4.115,23.77],[4.115,0,4.115,23.77],
  [-4.115,5.485,4.115,5.485],[-4.115,18.285,4.115,18.285],
  [0,5.485,0,18.285]
];
export function solve(A,b) {
  const n=b.length, m=A.map((r,i)=>[...r,b[i]]);
  for(let c=0;c<n;c++) {
    let p=c; for(let r=c+1;r<n;r++) if(Math.abs(m[r][c])>Math.abs(m[p][c])) p=r;
    if(Math.abs(m[p][c])<1e-10) return null;
    [m[c],m[p]]=[m[p],m[c]]; const q=m[c][c]; for(let k=c;k<=n;k++) m[c][k]/=q;
    for(let r=0;r<n;r++) if(r!==c){const v=m[r][c];for(let k=c;k<=n;k++)m[r][k]-=v*m[c][k];}
  } return m.map(r=>r[n]);
}
export function homography(world,image) {
  const A=[],b=[];world.forEach(([x,y],i)=>{const [u,v]=image[i];A.push([x,y,1,0,0,0,-u*x,-u*y]);b.push(u);A.push([0,0,0,x,y,1,-v*x,-v*y]);b.push(v);});
  const h=solve(A,b);return h?[...h,1]:null;
}
export function project(H,x,y){const d=H[6]*x+H[7]*y+H[8];return [(H[0]*x+H[1]*y+H[2])/d,(H[3]*x+H[4]*y+H[5])/d];}
export function inverse(H) {
  const [a,b,c,d,e,f,g,h,i]=H;const v=[e*i-f*h,c*h-b*i,b*f-c*e,f*g-d*i,a*i-c*g,c*d-a*f,d*h-e*g,b*g-a*h,a*e-b*d];const det=a*v[0]+b*v[3]+c*v[6];return Math.abs(det)<1e-10?null:v.map(x=>x/det);
}
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const norm=a=>Math.hypot(...a);
export function cameraFromCourt(H,w,h) {
  const cx=w/2,cy=h/2;
  const a=[H[0]-cx*H[6],H[3]-cy*H[6],H[6]], b=[H[1]-cx*H[7],H[4]-cy*H[7],H[7]];
  const candidates=[];
  if(Math.abs(a[2]*b[2])>1e-10)candidates.push(-(a[0]*b[0]+a[1]*b[1])/(a[2]*b[2]));
  if(Math.abs(a[2]*a[2]-b[2]*b[2])>1e-10)candidates.push(-(a[0]*a[0]+a[1]*a[1]-b[0]*b[0]-b[1]*b[1])/(a[2]*a[2]-b[2]*b[2]));
  for(const f2 of candidates) {
    if(!(f2>0))continue;const f=Math.sqrt(f2);if(f<w*.35||f>w*4)continue;
    const r1=[a[0]/f,a[1]/f,a[2]],r2=[b[0]/f,b[1]/f,b[2]],n1=norm(r1),n2=norm(r2);
    if(Math.abs(n1-n2)/(n1+n2)>.13||Math.abs(r1.reduce((s,v,i)=>s+v*r2[i],0))/(n1*n2)>.12)continue;
    const r3=cross(r1,r2).map(v=>v/((n1+n2)/2));
    // Court x points right and y away from the viewer: r1 x r2 is the upward normal.
    const z=[f*r3[0]+cx*r3[2],f*r3[1]+cy*r3[2],r3[2]];
    const camera={H,z,f,w,h};const p=project3(camera,0,0,2.7),base=project(H,0,0);
    if(p[1]>=base[1]||base[1]-p[1]>h*.65)continue;
    return camera;
  }return null;
}
export function project3(c,x,y,z){const H=c.H,d=H[6]*x+H[7]*y+1+c.z[2]*z;return [(H[0]*x+H[1]*y+H[2]+c.z[0]*z)/d,(H[3]*x+H[4]*y+H[5]+c.z[1]*z)/d];}
export function atHeight(c,u,v,z){const H=c.H;return solve([[H[0]-u*H[6],H[1]-u*H[7]],[H[3]-v*H[6],H[4]-v*H[7]]],[u-H[2]-(c.z[0]-u*c.z[2])*z,v-H[5]-(c.z[1]-v*c.z[2])*z]);}

export function whiteMask(rgba,w,h) {
  const mask=new Uint8Array(w*h);
  for(let i=0;i<w*h;i++){const r=rgba[i*4],g=rgba[i*4+1],b=rgba[i*4+2],max=Math.max(r,g,b),min=Math.min(r,g,b);if(min>85&&max-min<max*.42)mask[i]=1;}
  return mask;
}
function dilate(mask,w,h,r=2){const out=new Uint8Array(mask.length);for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++)if(mask[y*w+x])for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++)if(y+dy>=0&&y+dy<h&&x+dx>=0&&x+dx<w)out[(y+dy)*w+x+dx]=1;return out;}
function hough(mask,w,h) {
  const diag=Math.ceil(Math.hypot(w,h)),stride=diag*2+1,acc=new Uint16Array(180*stride),cos=[],sin=[];
  for(let t=0;t<180;t++){cos[t]=Math.cos(t*Math.PI/180);sin[t]=Math.sin(t*Math.PI/180);}
  const pixels=[];for(let y=Math.floor(h*.25);y<h;y++)for(let x=0;x<w;x++)if(mask[y*w+x])pixels.push([x,y]);
  const step=Math.max(1,Math.floor(pixels.length/12000));
  for(let p=0;p<pixels.length;p+=step){const [x,y]=pixels[p];for(let t=0;t<180;t++)acc[t*stride+Math.round(x*cos[t]+y*sin[t])+diag]++;}
  const peaks=[];const threshold=Math.max(10,w*.045/step);
  for(let t=0;t<180;t++)for(let r=1;r<stride-1;r++){const v=acc[t*stride+r];if(v<threshold)continue;let isMax=true;for(let dt=-2;dt<=2&&isMax;dt++)for(let dr=-3;dr<=3;dr++){if(!dt&&!dr)continue;const tt=t+dt,rr=r+dr;if(tt>=0&&tt<180&&rr>=0&&rr<stride&&acc[tt*stride+rr]>v){isMax=false;break;}}if(isMax)peaks.push({a:cos[t],b:sin[t],c:r-diag,t,v});}
  peaks.sort((a,b)=>b.v-a.v);const result=[];
  for(const p of peaks){if(result.some(q=>Math.abs(p.t-q.t)<8&&(Math.abs(p.c-q.c)<7||(p.b>.8&&q.b>.8&&Math.abs((p.c-p.a*w/2)/p.b-(q.c-q.a*w/2)/q.b)<12))))continue;result.push(p);if(result.length>=75)break;}return result;
}
function intersection(l,m){const d=l.a*m.b-m.a*l.b;if(Math.abs(d)<.005)return null;return [(l.c*m.b-m.c*l.b)/d,(l.a*m.c-m.a*l.c)/d];}
function lineSupport(H,seg,mask,w,h){const p=project(H,seg[0],seg[1]),q=project(H,seg[2],seg[3]);const len=Math.hypot(q[0]-p[0],q[1]-p[1]),n=Math.min(100,Math.ceil(len/2));let hit=0,count=0;for(let i=0;i<=n;i++){const t=i/n,x=Math.round(p[0]+(q[0]-p[0])*t),y=Math.round(p[1]+(q[1]-p[1])*t);if(x<0||x>=w||y<0||y>=h)continue;count++;hit+=mask[y*w+x];}return count>8?hit/count:0;}
export function detectCourt(rgba,w,h,diagnostics=null) {
  const mask=whiteMask(rgba,w,h),expanded=dilate(mask,w,h,2),lines=hough(mask,w,h);
  const transverse=lines.filter(l=>l.t>=72&&l.t<=108).slice(0,13),sides=lines.filter(l=>l.t<72||l.t>108).slice(0,22);
  const lowest=Math.max(...transverse.map(l=>(l.c-l.a*w/2)/l.b).filter(y=>y<h*1.05));
  if(diagnostics){diagnostics.lines=lines;diagnostics.transverse=transverse;diagnostics.sides=sides;diagnostics.whitePixels=mask.reduce((s,v)=>s+v,0);diagnostics.bestScore=0;diagnostics.cameras=0;}
  let best=null;
  for(let ia=0;ia<transverse.length;ia++)for(let ib=ia+1;ib<transverse.length;ib++){
    let near=transverse[ia],far=transverse[ib];if((near.c-near.a*w/2)/near.b<(far.c-far.a*w/2)/far.b)[near,far]=[far,near];
    const yn=(near.c-near.a*w/2)/near.b,yf=(far.c-far.a*w/2)/far.b;
    if(yn<h*.55||yn<lowest*.9||yn>h*1.05||yf<h*.25||yn-yf<h*.07)continue;
    for(let il=0;il<sides.length;il++)for(let ir=il+1;ir<sides.length;ir++){
      let ln=intersection(sides[il],near),rn=intersection(sides[ir],near),lf=intersection(sides[il],far),rf=intersection(sides[ir],far);if(!ln||!rn||!lf||!rf)continue;
      if(ln[0]>rn[0]){[ln,rn]=[rn,ln];[lf,rf]=[rf,lf];}
      const nw=rn[0]-ln[0],fw=rf[0]-lf[0];if(nw<w*.35||nw>w*5||fw<w*.15||fw>nw*.93||lf[0]<-w*1.5||rf[0]>w*2.5)continue;
      for(const width of [5.485,4.115])for(const depth of [23.77,5.485]) {
        const H=homography([[-width,0],[width,0],[-width,depth],[width,depth]],[ln,rn,lf,rf]);if(!H)continue;
        const farLeft=project(H,-5.485,23.77),farRight=project(H,5.485,23.77);
        if(farLeft[1]<h*.2||farRight[1]<h*.2||farLeft[1]>yn||farRight[1]>yn)continue;
        const supports=courtSegments.map(s=>lineSupport(H,s,expanded,w,h));
        const visible=courtSegments.map(s=>{const p=project(H,(s[0]+s[2])/2,(s[1]+s[3])/2);return p[0]>=0&&p[0]<w&&p[1]>=0&&p[1]<h;});
        const scores=supports.filter((v,i)=>visible[i]);const score=scores.reduce((s,x)=>s+x,0)/scores.length;
        if(diagnostics&&score>diagnostics.bestScore){diagnostics.bestScore=score;diagnostics.supports=supports;diagnostics.H=H;diagnostics.camera=cameraFromCourt(H,w,h);}
        // The service lines and center line discriminate court markings from fences/net tape.
        if(scores.length<6||supports[6]<.48||supports[7]<.4||supports[8]<.5)continue;
        if(score>.7&&(!best||score>best.score)){const camera=cameraFromCourt(H,w,h);if(camera)best={H,camera,score,supports,w,h};}
      }
    }
  }
  return best;
}

export function findBalls(rgba,previous,w,h) {
  const mask=new Uint8Array(w*h),visited=new Uint8Array(w*h),out=[];
  for(let i=0;i<mask.length;i++){const r=rgba[i*4],g=rgba[i*4+1],b=rgba[i*4+2];if(r>75&&g>85&&g>r*.8&&g>b*1.3&&r>b*1.15&&Math.max(r,g)-b>35)mask[i]=1;}
  for(let i=0;i<mask.length;i++){
    if(!mask[i]||visited[i])continue;const stack=[i];visited[i]=1;let n=0,sx=0,sy=0,minx=w,maxx=0,miny=h,maxy=0,motion=0;
    while(stack.length){const k=stack.pop(),x=k%w,y=Math.floor(k/w);n++;sx+=x;sy+=y;minx=Math.min(minx,x);maxx=Math.max(maxx,x);miny=Math.min(miny,y);maxy=Math.max(maxy,y);if(previous)motion+=Math.abs(rgba[k*4]-previous[k*4])+Math.abs(rgba[k*4+1]-previous[k*4+1])+Math.abs(rgba[k*4+2]-previous[k*4+2]);for(const q of [k-1,k+1,k-w,k+w])if(q>=0&&q<mask.length&&!visited[q]&&mask[q]&&Math.abs((q%w)-x)<=1){visited[q]=1;stack.push(q);}}
    const bw=maxx-minx+1,bh=maxy-miny+1;
    if(n>=2&&n<=180&&bw<=26&&bh<=26&&Math.max(bw,bh)/Math.max(1,Math.min(bw,bh))<5&&(!previous||motion/n>32))out.push({x:sx/n,y:sy/n,area:n,motion:motion/n});
  }return out.sort((a,b)=>b.motion-a.motion).slice(0,40);
}

export function trackFrames(frames,w,h) {
  const tracks=[],active=[];
  for(const frame of frames){
    const used=new Set();
    for(const track of active){const p=track.at(-1),dt=frame.t-p.t;if(dt>.12)continue;let best=null,bestScore=Infinity;
      const prev=track.at(-2),vx=prev?(p.x-prev.x)/(p.t-prev.t):0,vy=prev?(p.y-prev.y)/(p.t-prev.t):0;
      for(let i=0;i<frame.balls.length;i++){if(used.has(i))continue;const q=frame.balls[i],dist=Math.hypot(q.x-p.x,q.y-p.y),prediction=Math.hypot(q.x-p.x-vx*dt,q.y-p.y-vy*dt);if(dist>w*.17||dist<.4)continue;const score=prediction+dist*.15+Math.abs(Math.log((q.area+1)/(p.area+1)))*8;if(score<bestScore){bestScore=score;best=i;}}
      if(best!==null&&bestScore<w*.17){const q=frame.balls[best];used.add(best);track.push({...q,t:frame.t});}
    }
    for(let i=active.length-1;i>=0;i--)if(frame.t-active[i].at(-1).t>.12){const tr=active.splice(i,1)[0];if(tr.length>=6)tracks.push(tr);}
    frame.balls.forEach((q,i)=>{if(!used.has(i))active.push([{...q,t:frame.t}]);});
  }return [...tracks,...active.filter(t=>t.length>=6)];
}
export function estimateFlight(camera,start,bounce,dt,fps) {
  if(dt<.25||dt>1.8)return null;const inv=inverse(camera.H);if(!inv)return null;
  const end=project(inv,bounce.x,bounce.y);if(Math.abs(end[0])>5.7||end[1]<11.885||end[1]>20) return null;
  const heights=[2.3,2.7,3.1],origins=heights.map(z=>atHeight(camera,start.x,start.y,z));
  if(origins.some(p=>!p||Math.abs(p[0])>5.5||Math.abs(p[1])>2.5))return null;
  const distances=origins.map((p,i)=>Math.hypot(end[0]-p[0],end[1]-p[1],heights[i]));
  const speed=distances[1]/dt;
  if(speed<8||speed>65)return null;
  const uncertainty=1.5/fps,lo=Math.min(...distances)/(dt+uncertainty),hi=Math.max(...distances)/(dt-uncertainty);
  if(!Number.isFinite(hi)||(hi-lo)/speed>.65)return null;
  return {speed,lo,hi,distance:distances[1],flightTime:dt,bounce:end,origin:origins[1]};
}
export function findServes(frames,court,fps) {
  if(!court)return [];const tracks=trackFrames(frames,court.w,court.h),serves=[];
  for(const tr of tracks){
    for(let i=1;i<tr.length-6;i++){
      const start=tr[i],before=tr[i-1],after=tr[i+1];
      // Contact is the transition from a tossed ball into a fast flight away from the baseline.
      const contactGround=atHeight(court.camera,start.x,start.y,2.7);
      if(!contactGround||Math.abs(contactGround[0])>5.5||Math.abs(contactGround[1])>1.8)continue;
      const vBefore=Math.hypot(start.x-before.x,start.y-before.y)/(start.t-before.t),vAfter=Math.hypot(after.x-start.x,after.y-start.y)/(after.t-start.t);
      if(vAfter<court.w*.035)continue;
      if(vAfter<vBefore*1.4&&i>2)continue;
      for(let j=i+6;j<tr.length-2;j++){
        const bounce=tr[j],prior=tr[j-1],next=tr[j+1],next2=tr[j+2],dt=bounce.t-start.t;if(dt>1.8)break;
        if(bounce.y<=prior.y||next.y>=bounce.y||next2.y>bounce.y)continue;
        const est=estimateFlight(court.camera,start,bounce,dt,fps);if(!est)continue;
        const flight=tr.slice(i,j+1),steps=flight.slice(1).map((p,k)=>p.t-flight[k].t);
        if(steps.some(d=>d>2.5/fps)||flight.length<Math.max(7,dt*fps*.7))continue;
        if(serves.some(s=>Math.abs(s.contact-start.t)<1.8))continue;
        serves.push({...est,contact:start.t,bounceTime:bounce.t,track:flight,points:flight.length});break;
      }
    }
  }return serves.sort((a,b)=>a.contact-b.contact);
}

export function cameraShift(reference,current,w,h) {
  // Compare only stable scene/court patches. A moving player is excluded by using edge regions.
  let best=Infinity,bestShift=[0,0];
  const max=5;
  for(let dy=-max;dy<=max;dy++)for(let dx=-max;dx<=max;dx++){
    let sum=0,n=0;for(let y=Math.floor(h*.25);y<Math.floor(h*.9);y+=9)for(let x=10;x<w-10;x+=9){if(x>w*.22&&x<w*.78)continue;const xx=x+dx,yy=y+dy;if(xx<0||xx>=w||yy<0||yy>=h)continue;const a=(y*w+x)*4,b=(yy*w+xx)*4;sum+=Math.abs(reference[a]-current[b])+Math.abs(reference[a+1]-current[b+1])+Math.abs(reference[a+2]-current[b+2]);n++;}
    const error=sum/n;
    if(error<best-.001||(Math.abs(error-best)<=.001&&Math.hypot(dx,dy)<Math.hypot(...bestShift))){best=error;bestShift=[dx,dy];}
  }return {pixels:Math.hypot(...bestShift),error:best};
}
