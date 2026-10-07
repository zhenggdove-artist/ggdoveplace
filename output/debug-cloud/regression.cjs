const fs = require('fs');
const cp = require('child_process');
const assert = require('assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/ACER/.codex/skills/develop-web-game/node_modules/playwright');
const original = cp.execFileSync('git', ['show', (process.env.CLOUD_BASELINE_REF || '6010545bc04e30368484b1882505aea20438b8e3') + ':index.html'], {encoding:'utf8', maxBuffer:2**22});
const current = fs.readFileSync('index.html','utf8');
const renderer = fs.readFileSync('js/creature-renderer.js','utf8');
function creature(html) {
 return html.slice(html.indexOf('    (function() {', html.indexOf('//  CREATURE'))).split('</script>')[0]
 .replace('      animate();', '      window.cloudTest = { animate, handleCreatureClick, bodyRings, tentacles, getAllPoints };');
}
(async()=>{
 const browser = await chromium.launch({headless:true});
 try {
  for (const mobile of process.env.LIVE_ONLY ? [] : [false,true]) {
   const snapshots=[];
   for (const [label,html] of [['original',original],['optimized',current],['fallback',current]]) {
    const page=await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1280,height:900}});
    await page.route('**/*',r=>r.abort());
    await page.setContent(html.replace(/<script[\s\S]*?<\/script>/g,''));
    await page.addScriptTag({content:renderer});
    const result=await page.evaluate(({source,label})=>{
     if(label==='fallback')window.createCreatureRenderer=()=>null;
     let seed=12345;Math.random=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);
     let now=100000;Date.now=()=>now;window.requestAnimationFrame=()=>0;
     window.orbitCtx=null;window.orbitPts=null;eval(source);
     const test=window.cloudTest, states=[], timings=[];
     function state(){
      // Hash every particle's original animation fields, including all positions.
      let hash=2166136261;const bytes=new DataView(new ArrayBuffer(8));
      const pts=test.getAllPoints();
      for(const p of pts)for(const key of ['x','y','baseX','baseY','alpha','size','phase','speed','amp']){
       bytes.setFloat64(0,p[key]);for(let i=0;i<8;i++){hash^=bytes.getUint8(i);hash=Math.imul(hash,16777619);}
      }
      return {points:pts.length,hash:hash>>>0,counter:document.getElementById('click-counter').textContent};
     }
     for(let clicks=0;clicks<=10;clicks++){
      test.animate();
      if(clicks){const c=document.getElementById('creature-canvas'),rect=c.getBoundingClientRect(),p=test.bodyRings[0][0];
       c.dispatchEvent(new MouseEvent('click',{clientX:rect.left+p.x*rect.width/600,clientY:rect.top+p.y*rect.height/600}));}
      for(const delta of [16,80,160,320,640]){now+=delta;test.animate();states.push(state());}
      if(clicks<10){now+=3000;test.animate();const start=performance.now();
       for(let i=0;i<20;i++){now+=16;test.animate();}
       timings.push({clicks,points:test.getAllPoints().length,cpuMs:(performance.now()-start)/20});states.push(state());}
     }
     const c=document.getElementById('creature-canvas');test.animate();
     const gl=c.getContext('webgl');let glError=null,visible=true;
     if(gl){glError=gl.getError();const pixels=new Uint8Array(600*600*4);gl.readPixels(0,0,600,600,gl.RGBA,gl.UNSIGNED_BYTE,pixels);visible=pixels.some(x=>x!==0);}
     return {states,timings,glError,visible};
    },{source:creature(html),label});
    assert.equal(result.visible,true);if(result.glError!==null)assert.equal(result.glError,0);
    snapshots.push(result.states);
    console.log(mobile?'mobile':'desktop',label,result.timings.filter(t=>[0,3,6,9].includes(t.clicks)));
    await page.close();
   }
   assert.deepEqual(snapshots[1],snapshots[0]);assert.deepEqual(snapshots[2],snapshots[0]);
   console.log('PASS: all particle positions, growth, recoil, alpha, sizes, counts and click states match exactly.');
  }
  if (!process.env.LIVE_ONLY) { console.log('Run LIVE_ONLY=1 separately for frame-rate measurements to avoid queued stress-test GPU work.'); return; }
  const page=await browser.newPage({viewport:process.env.LIVE_MOBILE?{width:390,height:844}:{width:1280,height:900}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async r=>{
   const url=new URL(r.request().url());
   if(url.hostname!=='localhost')return r.abort();
   const path=require('path');const file=path.resolve('.','.'+decodeURIComponent(url.pathname));
   if(!file.startsWith(process.cwd()+path.sep))return r.abort();
   if(url.pathname==='/index.html')return r.fulfill({body:(process.env.LIVE_BASELINE?original:current).replace('      animate();','      window.cloudTest = {bodyRings};\n      animate();'),contentType:'text/html'});
   if(!fs.existsSync(file))return r.fulfill({status:404,body:''});
   const type={'.js':'text/javascript','.css':'text/css','.html':'text/html','.json':'application/json'}[path.extname(file)];
   return r.fulfill({path:file,contentType:type});
  });
  await page.goto('http://localhost:8000/index.html');await page.waitForTimeout(500);assert.deepEqual(errors,[]);await page.waitForFunction(()=>!!window.cloudTest);
  for(let i=0;i<9;i++){
   await page.evaluate(()=>{const c=document.getElementById('creature-canvas'),r=c.getBoundingClientRect(),p=cloudTest.bodyRings[0][0],x=r.left+p.x*r.width/600,y=r.top+p.y*r.height/600;if(innerWidth<768){const t=new Touch({identifier:1,target:c,clientX:x,clientY:y});c.dispatchEvent(new TouchEvent('touchend',{changedTouches:[t],cancelable:true}));}else c.dispatchEvent(new MouseEvent('click',{clientX:x,clientY:y}));});
   await page.waitForTimeout(100);
  }
  await page.waitForTimeout(2300);
  const intervals=await page.evaluate(()=>new Promise(resolve=>{const times=[];let previous=performance.now();function frame(t){times.push(t-previous);previous=t;if(times.length<90)requestAnimationFrame(frame);else resolve(times.slice(1));}requestAnimationFrame(frame);}));
  console.log('Live page 9 clicks frame interval mean ms:',intervals.reduce((a,b)=>a+b)/intervals.length);
  await page.screenshot({path:'output/debug-cloud/live-'+(process.env.LIVE_BASELINE?'baseline':process.env.LIVE_MOBILE?'mobile':'desktop')+'.png'});
  await page.evaluate(()=>{const c=document.getElementById('creature-canvas'),r=c.getBoundingClientRect(),p=cloudTest.bodyRings[0][0],x=r.left+p.x*r.width/600,y=r.top+p.y*r.height/600;if(innerWidth<768){const t=new Touch({identifier:1,target:c,clientX:x,clientY:y});c.dispatchEvent(new TouchEvent('touchend',{changedTouches:[t],cancelable:true}));}else c.dispatchEvent(new MouseEvent('click',{clientX:x,clientY:y}));});
  await page.waitForURL('**/play.html',{timeout:15000});assert.deepEqual(errors,[]);console.log('PASS: live click interaction, full page animation, no JS errors, tenth-click navigation.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
