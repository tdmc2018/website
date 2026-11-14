/* The Devoted MC · Eagle Rider V20
   Single-player arcade runner: no libraries, no network calls.
   Game space is fixed-height and scales with the canvas. */
(() => {
  'use strict';
  const canvas = document.getElementById('road-run');
  if (!canvas || !canvas.getContext) return;
  let ctx = canvas.getContext('2d');
  if (!ctx) return; // Unsupported or disabled canvas: leave the accessible fallback visible.
  canvas.tabIndex=0; // restore keyboard focus after clicking Start
  const cover = document.getElementById('game-cover');
  const title = document.getElementById('game-cover-title');
  const description = document.getElementById('game-cover-text');
  const startBtn = document.getElementById('game-start');
  const pauseBtn = document.getElementById('game-pause');
  const hudScore = document.getElementById('game-score');
  const hudBest = document.getElementById('game-best');
  const hudSpeed = document.getElementById('game-speed');
  const soundBtn = document.getElementById('game-sound');
  const impactPanel = document.getElementById('game-cover-impact');
  const impactImg = document.getElementById('game-cover-impact-img');
  const carVariants=['sedan','pickup','minivan','suv'];
  // Dedicated transparent PNGs for the formerly abstract road objects.
  const obstacleArt={};
  for(const kind of ['banana','cone','duck','pizza','gnome','tire','toolbox','cooler','couch','mower','deer','ramp']){
    const img=new Image();img.src=`assets/obstacle-${kind}.webp`;obstacleArt[kind]=img;
  }
  const carSprites=Object.fromEntries(carVariants.map(kind=>{
    const img=new Image();img.src=`assets/${kind}.webp`;return [kind,img];
  }));
  const riderSprite=new Image();
  riderSprite.src='assets/eagle-rider.webp';
  // Sound starts after a player gesture. Short offline MP3 voice exclamations.
  // Voices are synthesized and EQ'd: replace MP3 files with real recordings if desired.
  let soundEnabled=true;
  let audioCtx=null,audioMaster=null,engineGain=null,engineOscA=null,engineOscB=null;
  let noiseBuffer=null,audioTick=0;
  const audioAvailable=!!(window.AudioContext||window.webkitAudioContext);
  const clips={};
  const fileAudioAvailable=typeof window.Audio==='function';
  if(fileAudioAvailable){
    for(const [kind,path,volume] of [
      ['carClear','assets/audio/car-clear.mp3',.85],
      ['carHit','assets/audio/car-hit.mp3',.9],
      ['deerSpot','assets/audio/deer-spot.mp3',.86],
      ['ramp','assets/audio/ramp-vroom.mp3',.85]
    ]){
      const clip=new Audio(path);
      clip.preload='auto';clip.volume=volume;
      clips[kind]=clip;
    }
  }
  const soundAvailable=audioAvailable||fileAudioAvailable;
  function stopClips(){
    Object.values(clips).forEach(c=>{try{c.pause();c.currentTime=0;}catch(_){}});
  }
  function playClip(kind){
    if(!soundEnabled||mode!=='playing'||!clips[kind])return;
    const c=clips[kind];
    try{c.pause();c.currentTime=0; const result=c.play();if(result?.catch)result.catch(()=>{});}catch(_){}
  }
  function shoutAtDriver(kind){
    // Never let two shouted lines talk over one another.
    for(const name of ['carClear','carHit','deerSpot']){
      const clip=clips[name];if(clip){try{clip.pause();clip.currentTime=0;}catch(_){}}
    }
    playClip(kind);
  }
  function syncSoundButton(){
    if(!soundBtn)return;
    soundBtn.textContent=soundAvailable?(soundEnabled?'Sound: On':'Sound: Off'):'Sound unavailable';
    soundBtn.setAttribute('aria-pressed',soundEnabled&&soundAvailable?'true':'false');
    soundBtn.disabled=!soundAvailable;
  }
  function ensureAudio(){
    if(!soundEnabled||!audioAvailable)return;
    if(audioCtx){if(audioCtx.state==='suspended')audioCtx.resume().catch(()=>{});return;}
    try{
      audioCtx=new (window.AudioContext||window.webkitAudioContext)();
      audioMaster=audioCtx.createGain();audioMaster.gain.value=.46;audioMaster.connect(audioCtx.destination);
      const filter=audioCtx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=380;
      filter.Q.value=.42;
      engineGain=audioCtx.createGain();engineGain.gain.value=.0001;
      filter.connect(engineGain);engineGain.connect(audioMaster);
      engineOscA=audioCtx.createOscillator();engineOscA.type='sawtooth';engineOscA.frequency.value=120;
      engineOscB=audioCtx.createOscillator();engineOscB.type='triangle';engineOscB.frequency.value=182;
      const a=audioCtx.createGain();a.gain.value=.40;
      const b=audioCtx.createGain();b.gain.value=.42;
      engineOscA.connect(a);engineOscB.connect(b);a.connect(filter);b.connect(filter);
      engineOscA.start();engineOscB.start();
      // Reused short noise sample for tire squeals, deer huffs and impacts.
      noiseBuffer=audioCtx.createBuffer(1,Math.floor(audioCtx.sampleRate*.8),audioCtx.sampleRate);
      const samples=noiseBuffer.getChannelData(0);
      for(let i=0;i<samples.length;i++)samples[i]=(Math.random()*2-1);
      setEngineAudio();
    }catch(err){audioCtx=null;audioMaster=null;engineGain=null;}
  }
  function setEngineAudio(){
    if(!audioCtx||!engineGain)return;
    const t=audioCtx.currentTime;
    const playing=mode==='playing'&&soundEnabled;
    audioMaster.gain.setTargetAtTime(soundEnabled?.46:.0001,t,.035);
    engineGain.gain.setTargetAtTime(playing?.125:.0001,t,.085);
  }
  function engineAudioTick(dt){
    if(!audioCtx||audioCtx.state!=='running')return;
    audioTick+=dt;if(audioTick<.11)return;audioTick=0;
    const t=audioCtx.currentTime;
    const pitch=clamp(94+speed*.075,120,315)+Math.sin(clock*21)*2.3;
    engineOscA.frequency.setTargetAtTime(pitch,t,.1);
    engineOscB.frequency.setTargetAtTime(pitch*1.58,t,.1);
  }
  function beep(f0,f1,duration,volume=.10,wave='sine',delay=0){
    if(!soundEnabled||!audioCtx||audioCtx.state!=='running')return;
    const t=audioCtx.currentTime+delay;
    const osc=audioCtx.createOscillator(),gain=audioCtx.createGain();
    osc.type=wave;
    osc.frequency.setValueAtTime(Math.max(35,f0),t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(35,f1),t+duration);
    gain.gain.setValueAtTime(.0001,t);
    gain.gain.exponentialRampToValueAtTime(Math.max(.001,volume),t+.017);
    gain.gain.exponentialRampToValueAtTime(.0001,t+duration);
    osc.connect(gain);gain.connect(audioMaster);osc.start(t);osc.stop(t+duration+.015);
  }
  function hiss(duration,volume=.12,freq=1100,kind='bandpass',delay=0){
    if(!soundEnabled||!audioCtx||audioCtx.state!=='running'||!noiseBuffer)return;
    const t=audioCtx.currentTime+delay;
    const source=audioCtx.createBufferSource();source.buffer=noiseBuffer;
    const filter=audioCtx.createBiquadFilter();filter.type=kind;filter.frequency.value=freq;filter.Q.value=.75;
    const gain=audioCtx.createGain();gain.gain.setValueAtTime(.0001,t);
    gain.gain.exponentialRampToValueAtTime(Math.max(.001,volume),t+.025);
    gain.gain.exponentialRampToValueAtTime(.0001,t+duration);
    source.connect(filter);filter.connect(gain);gain.connect(audioMaster);
    source.start(t);source.stop(t+duration+.01);
  }
  function soundEffect(name){
    if(!soundEnabled)return;
    if(name==='ramp')playClip('ramp'); // MP3 must work even without Web Audio support.
    if(!audioCtx||audioCtx.state!=='running')return;
    switch(name){
      case 'jump':beep(145,285,.18,.09,'sawtooth');break;
      case 'ramp':hiss(.16,.065,750,'bandpass');break;
      case 'land':beep(104,58,.14,.115,'triangle');break;
      case 'horn':
        beep(320,302,.13,.085,'square');beep(255,246,.13,.065,'sawtooth');
        beep(320,296,.16,.075,'square',.18);break;
      case 'squeal':hiss(.36,.20,1180,'bandpass');beep(900,540,.30,.026,'sine');break;
      case 'deer':hiss(.19,.16,500,'lowpass');beep(175,115,.22,.045,'triangle');break;
      case 'crash':hiss(.53,.26,920,'lowpass');beep(130,43,.46,.21,'sawtooth');break;
    }
  }
  if(soundBtn){soundBtn.addEventListener('click',()=>{
    soundEnabled=!soundEnabled;syncSoundButton();
    if(soundEnabled){ensureAudio();}
    else stopClips();
    setEngineAudio();
  });}
  syncSoundButton();
  const H=370, TAU=Math.PI*2;
  let W=880, groundY=H*.815;
  let mode='ready', last=0, clock=0, distance=0, bonusPoints=0, score=0, best=0;
  let crash=null; // timed impact scene, instead of immediately covering the crash with a dialog
  let speed=600, spawnTimer=1.4, rampCooldown=0;
  let wheel=0, jumpY=0, jumpV=0, nextMilestone=500;
  let hazards=[], dust=[];
  let signTimer=6.5, activeSign=null, exhaustTimer=0, rampFlight=false, wheelieTime=0;
  // Roadside wildlife and idiot drivers are pre-announced, never instant spawns.
  let surpriseTimer=10, roadsideEvent=null, sceneryTimer=9, scenery=[];
  let eventCount=0, lastSurpriseKind=null;
  // One short spoken line per observed deer/car, no repeated warning chants.
  const signMessages=[
    'DEER CROSSING', 'LOOSE GRAVEL', 'IDIOT DRIVERS AHEAD',
    'BAD DECISIONS AHEAD', 'WATCH FOR CROTCH ROCKETS', 'YOU MISSED THE TURN',
    'KEEP THE RUBBER DOWN', 'SUPPORT YOUR LOCAL MC', 'WATCH FOR DEER',
    'BEWARE OF GNOMES', 'ROAD WORK? LOL', 'SEND IT RESPONSIBLY',
    'SHINY SIDE UP', 'WATCH FOR DUCKS', 'YOUR GPS LIED'
  ];
  let signIndex=0;
  let toast='', toastLife=0, toastColor='#f0d6ac';
  const gravity=1680, normalJump=675, rampJump=790;
  const types=[
    {name:'cone',w:36,h:51,bonus:10},
    {name:'duck',w:44,h:42,bonus:15},
    {name:'pizza',w:54,h:24,bonus:12},
    {name:'gnome',w:43,h:64,bonus:21},
    {name:'tire',w:44,h:49,bonus:15},
    {name:'banana',w:44,h:20,bonus:15},
    {name:'toolbox',w:54,h:34,bonus:19},
    {name:'deer',w:69,h:77,bonus:45},
    {name:'ramp',w:90,h:29,bonus:35,safe:true},
    {name:'cooler',w:58,h:41,bonus:26},
    {name:'couch',w:92,h:59,bonus:35},
    {name:'mower',w:66,h:47,bonus:31},
    {name:'car',w:125,h:57,bonus:60}
  ];
  const rnd=(a,b)=>a+Math.random()*(b-a);
  const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
  let highScoreStorage=true;
  try {
    const saved=Number(localStorage.getItem('tdmc-eagle-rider-best-v15')||0);
    best=Number.isFinite(saved)?Math.max(0,Math.floor(saved)):0;
  } catch (_) {highScoreStorage=false;}

  function riderBox(){
    const width=clamp(W*.265,183,215);
    return {x:Math.min(82,W*.145),w:width,h:width*(riderSprite.naturalHeight||762)/(riderSprite.naturalWidth||1034)};
  }
  function resize(){
    const rect=canvas.getBoundingClientRect();
    if(!rect.width||!rect.height)return;
    W=Math.round(H*(rect.width/rect.height));
    const dpr=Math.min(window.devicePixelRatio||1,2);
    canvas.width=Math.round(W*dpr);
    canvas.height=Math.round(H*dpr);
    ctx.setTransform(dpr,0,0,dpr,0,0);
    groundY=H*.815;
  }
  resize();
  if(typeof ResizeObserver!=='undefined')new ResizeObserver(resize).observe(canvas);
  else window.addEventListener('resize',resize);

  function rounded(x,y,w,h,r,fill,stroke){
    ctx.beginPath();ctx.roundRect(x,y,w,h,r);
    if(fill){ctx.fillStyle=fill;ctx.fill();}
    if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=1.4;ctx.stroke();}
  }
  function ellipse(x,y,rx,ry,fill,alpha=1){
    ctx.save();ctx.globalAlpha=alpha;ctx.fillStyle=fill;
    ctx.beginPath();ctx.ellipse(x,y,Math.max(.1,rx),Math.max(.1,ry),0,0,TAU);ctx.fill();ctx.restore();
  }
  function line(pts,color,width=2){
    ctx.beginPath();ctx.moveTo(pts[0][0],pts[0][1]);
    for(let i=1;i<pts.length;i++)ctx.lineTo(pts[i][0],pts[i][1]);
    ctx.lineJoin='round';ctx.lineCap='round';ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();
  }
  function write(str,x,y,size,color,align='left',weight='700'){
    ctx.save();ctx.font=`${weight} ${size}px system-ui,Arial,sans-serif`;
    ctx.textAlign=align;ctx.fillStyle=color;ctx.fillText(str,x,y);ctx.restore();
  }
  function showToast(message,life=1.4,color='#f2d5aa'){
    toast=message;toastLife=life;toastColor=color;
  }
  function refreshHud(){
    hudScore.textContent=String(score).padStart(4,'0');
    hudBest.textContent=String(Math.max(score,best)).padStart(4,'0');
    hudSpeed.textContent=(speed/(300*mobileFactor())).toFixed(1)+'×';
  }
  // Narrow displays need more time to react to obstacles approaching from the right.
  function mobileFactor(){return clamp(W/850,.71,1);}
  function overlay(show,newTitle,newText,buttonText){
    if(newTitle)title.textContent=newTitle;
    if(newText)description.textContent=newText;
    if(buttonText)startBtn.textContent=buttonText;
    cover.hidden=!show;
    if(impactPanel)impactPanel.hidden=!(show&&mode==='over'&&crash);
    pauseBtn.disabled=!(mode==='playing'||mode==='paused');
  }
  function reset(){
    stopClips();crash=null;title.classList.remove('quote-title');
    mode='playing';clock=0;distance=0;bonusPoints=0;score=0;speed=600*mobileFactor();
    spawnTimer=1.65;rampCooldown=7.5;wheel=0;
    jumpY=0;jumpV=0;nextMilestone=500;toastLife=0;
    hazards=[];dust=[];
    signIndex=0;signTimer=6.5;activeSign=null;exhaustTimer=.18;rampFlight=false;wheelieTime=0;
    surpriseTimer=10;roadsideEvent=null;sceneryTimer=9;scenery=[];eventCount=0;lastSurpriseKind=null;toast='';
    pauseBtn.textContent='Pause';overlay(false);
    setEngineAudio();
    refreshHud();
    canvas.focus?.({preventScroll:true});
  }
  function impactArtwork(cause,obj){
    // Existing transparent PNG sprites are shown unchanged in the popup.
    const sprite=obstacleArt[cause] || (cause==='car'&&carSprites[obj?.carVariant||'sedan']);
    if(sprite?.complete && sprite.naturalWidth>0)return sprite.src;
    // All other obstacles use the actual vector drawing from the road,
    // rendered once into a small offscreen image so it matches the game.
    const off=document.createElement('canvas');off.width=300;off.height=220;
    const originalContext=ctx,originalGround=groundY;
    try{
      const scale=1.65;
      ctx=off.getContext('2d');ctx.scale(scale,scale);
      groundY=124;
      const source=types.find(item=>item.name===cause)||{name:cause,w:60,h:52};
      const drawing={...source,x:(300/scale-source.w)/2,anim:0,used:true,carVariant:obj?.carVariant||'sedan'};
      obstacle(drawing,0);
      return off.toDataURL('image/png');
    }catch(_){return '';}finally{ctx=originalContext;groundY=originalGround;}
  }

  function finishCrash(){
    if(!crash||mode!=='crashing')return;
    const cause=crash.cause;
    mode='over';
    if(score>best){
      best=score;
      if(highScoreStorage){try{localStorage.setItem('tdmc-eagle-rider-best-v15',String(best))}catch(_){}}
    }
    refreshHud();
    const messages={
      car:["FUCKING ASSHOLE!",'That driver never even looked.'],
      deer:['OH DEER!','You flew right over the buck.'],
      cone:['"I\'d hit that" - Bubba','That cone went for a ride along your bike.'],
      duck:['WHAT THE DUCK?!','The duck wins this round.'],
      banana:['BANANA SPINOUT!','Peel control malfunction.'],
      pizza:['PIZZA DELIVERY FAILED!','Not a single slice survived.'],
      couch:['FREE COUCH. BAD IDEA.','Probably should have taken the shoulder.'],
      mower:['LAWN & DISORDER!','That mower took you down.'],
      gnome:['GNOMED!','Little guy had right of way.'],
      tire:['ROAD RASH!','Tires on tires. Bad combination.'],
      toolbox:['LOOSE TOOLS!','Somebody forgot to latch it.']
    };
    const lines=messages[cause]||['ROAD RASH!','Even bald eagles have bad days.'];
    title.classList.toggle('quote-title',cause==='cone');
    if(impactImg){
      impactImg.src=impactArtwork(cause,crash.obstacle);
      impactImg.alt=`${cause==='car'?(crash.obstacle?.carVariant||'Car'):cause} obstacle you hit`;
    }
    overlay(true,lines[0],`You scored ${score.toLocaleString()} points. ${lines[1]}`, 'Ride Again');
  }
  function gameOver(cause='road', object=null){
    if(mode!=='playing')return;
    if(cause==='car')shoutAtDriver('carHit');
    soundEffect('crash');
    crash={cause,obstacle:object?{...object}:null,objectX:object?.x??riderBox().x+riderBox().w*.79,
      objectW:object?.w??50, elapsed:0,
      duration:cause==='deer'?1.65:cause==='banana'?1.55:cause==='cone'?1.4:cause==='car'?1.15:1.05,
      sparks:[]};
    if(cause==='cone' && object)object.hit=true; // cone is drawn tumbling beside the bike, not duplicated on the road
    mode='crashing';
    setEngineAudio();pauseBtn.disabled=true;
    showToast(cause==='banana'?'SPINNING OUT!':cause==='cone'?'CONE DRAG!':cause==='deer'?'OH DEER!':cause==='car'?'FULL STOP!':'WIPEOUT!',1.1,'#ffe0af');
  }
  function updateCrash(dt){
    if(!crash||mode!=='crashing')return;
    crash.elapsed+=dt;
    if(crash.cause==='cone'){
      // Keep the road moving beneath a bike that slides forward with the cone.
      distance+=speed*.42*dt; wheel+=speed/19*dt;
    }
    // Impact particles are decorative and fade during the sequence.
    for(let i=0;i<3;i++){
      const {x:bx,w:bw}=riderBox();
      const progress=clamp(crash.elapsed/crash.duration,0,1);
      const sparkX=crash.cause==='cone'?bx+bw*.83+progress*86:bx+bw*.85;
      crash.sparks.push({x:sparkX+rnd(-12,13),y:groundY-rnd(4,crash.cause==='cone'?12:27),
        vx:rnd(-140,120),vy:rnd(-120,40),life:rnd(.16,.39),r:rnd(1,3)});
    }
    for(const p of crash.sparks){p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=270*dt;p.life-=dt;}
    crash.sparks=crash.sparks.filter(p=>p.life>0);
    if(crash.elapsed>=crash.duration)finishCrash();
  }
  function togglePause(){
    if(mode==='playing'){
      mode='paused';stopClips();pauseBtn.textContent='Resume';
      setEngineAudio();
      overlay(true,'PIT STOP','Rest those wings. Hit Resume, P, or Space to keep riding.','Resume Ride');
    }else if(mode==='paused'){
      ensureAudio();
      mode='playing';pauseBtn.textContent='Pause';overlay(false);setEngineAudio();
    }
  }
  function leap(power=normalJump){
    soundEffect(power===rampJump?'ramp':'jump');
    jumpY=Math.max(0,jumpY);jumpV=power;
    for(let i=0;i<6;i++)dust.push({x:100+rnd(-5,20),y:groundY-rnd(0,8),r:rnd(3,7),life:rnd(.27,.50)});
  }
  function jump(){
    if(mode==='ready'||mode==='over'){reset();return;}
    if(mode==='paused'){togglePause();return;}
    if(mode!=='playing')return;
    if(jumpY<1.5&&Math.abs(jumpV)<1)leap();
  }
  startBtn.addEventListener('click',()=>{ensureAudio();mode==='paused'?togglePause():reset();});
  pauseBtn.addEventListener('click',togglePause);
  canvas.addEventListener('pointerdown',e=>{if(e.pointerType==='touch')e.preventDefault();ensureAudio();jump();});
  document.addEventListener('keydown',e=>{
    if(['Space','ArrowUp','KeyW'].includes(e.code)){
      if(e.repeat)return;
      if(e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(e.target.tagName))return;
      e.preventDefault();ensureAudio();jump();
    }else if(e.code==='KeyP'&&!e.repeat){e.preventDefault();if(mode==='playing'||mode==='paused')togglePause();}
  });
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&mode==='playing')togglePause();});
  window.addEventListener('pagehide',()=>{stopClips();try{audioCtx?.suspend();}catch(_){}});

  function pickHazard(){
    // Occasional generous ramps with a cool-down, but never immediately at the start.
    if(score>=180 && rampCooldown<=0 && Math.random()<.19){
      rampCooldown=rnd(11,17);
      return types.find(t=>t.name==='ramp');
    }
    const pool=score<250?types.slice(0,4):types.slice(0,7);
    // Rare, oversized roadside nonsense. One at a time; no surprise clusters.
    if(score>=350 && Math.random()<.075){
      return types[9+Math.floor(Math.random()*3)];
    }
    // Deer appear later and are uncommon; they are taller, but can be jumped.
    if(score>=550 && Math.random()<.14)return types[7];
    return pool[Math.floor(Math.random()*pool.length)];
  }
  function spawn(){
    const type=pickHazard();
    hazards.push({...type,x:W+80,passed:false,used:false,nearMiss:false,voiceDone:false,anim:rnd(0,TAU),carVariant:type.name==='car'?carVariants[Math.floor(rnd(0,carVariants.length))]:undefined});
    // Give a readable reaction time and enough separation for a full jump.
    // Spawn interval is in *seconds*, not pixels: increasing speed doesn't cause impossible clusters.
    spawnTimer=Math.max(1.23,rnd(1.42,2.12)-Math.min(.20,score/7500));
    if(type.safe)spawnTimer+=.24;
  }
  // Short roadside jokes, spaced far apart and always behind the action.
  function progressSigns(dt){
    signTimer-=dt;
    if(!activeSign && signTimer<=0 && !roadsideEvent){
      const message=signMessages[signIndex%signMessages.length];
      signIndex++;
      activeSign={message,x:W+16,w:Math.min(237,Math.max(150,W*.45))};
      signTimer=rnd(15,20);
    }
    if(activeSign){
      activeSign.x-=Math.min(188,speed*.23)*dt;
      if(activeSign.x+activeSign.w< -16)activeSign=null;
    }
  }
  // Harmless scenic deer: grazing, standing, turning their heads, and occasional groups.
  // Unlike deer crossing the road, these animals never become collision hazards.
  function updateScenery(dt){
    sceneryTimer-=dt;
    if(sceneryTimer<=0){
      const count=Math.random()<.45?1:(Math.random()<.63?2:3);
      const members=Array.from({length:count},(_,i)=>({
        offset:i*(47+rnd(0,13)), phase:rnd(0,TAU),
        scale:rnd(.39,.52),buck:Math.random()<.17,
        fawn:count>1&&i===count-1&&Math.random()<.34
      }));
      scenery.push({kind:'deerGroup',x:W+95,phase:rnd(0,TAU),members});
      sceneryTimer=rnd(7,11);
    }
    for(const item of scenery)item.x-=speed*.18*dt;
    scenery=scenery.filter(item=>item.x> -275);
  }
  // Every 20-30 seconds, one deer or bad driver *may* enter the lane.
  // Stay harmless and visible first, then warn, then move into a jumpable lane hazard.
  function startSurprise(){
    // Don't overlap an ordinary obstacle or another scripted event.
    if(roadsideEvent||hazards.length)return false;
    const kind=lastSurpriseKind===null?(Math.random()<.5?'deer':'car'):(lastSurpriseKind==='deer'?'car':'deer');
    eventCount++;lastSurpriseKind=kind;
    // Deer exclamation happens when the *crossing* deer first comes into view.
    // Grazing deer in the distant scenery do not constantly yell.
    roadsideEvent={kind,x:W-Math.min(96,W*.17),stage:'watch',timer:rnd(1.8,2.5),phase:0,willCross:Math.random()<.79,swerve:rnd(0,TAU),carVariant:carVariants[Math.floor(rnd(0,carVariants.length))]};
    surpriseTimer=rnd(20,28);
    activeSign=null;signTimer=Math.max(signTimer,4);
    // No normal hazards while the event is being foreshadowed.
    spawnTimer=Math.max(spawnTimer,3.5);
    return true;
  }
  function updateSurprise(dt){
    if(!roadsideEvent){
      surpriseTimer-=dt;
      if(surpriseTimer<=0)startSurprise();
      return;
    }
    const e=roadsideEvent;
    e.timer-=dt;
    e.phase+=dt;
    if(e.stage==='watch'){
      e.x-=speed*.015*dt; // deer waits / car idles on shoulder
      if(e.timer<=0){
        if(e.willCross){e.stage='alert';e.timer=.64;showToast(e.kind==='deer'?'DEER ON THE SHOULDER!':'IDIOT DRIVER AHEAD!',1.3,'#ffdfab');if(e.kind==='car'){soundEffect('horn');}}
        else{e.stage='leave';e.timer=1.0;}
      }
    }else if(e.stage==='alert'){
      e.x-=speed*.018*dt;
      if(e.timer<=0){
        e.stage='dash';e.timer=.72;
        if(e.kind==='deer')shoutAtDriver('deerSpot'); // only a deer charging into the road
        showToast(e.kind==='deer'?'DEER RUNNING!':'CAR CUTTING IN!',1.25,'#ffd28e');
        soundEffect(e.kind==='deer'?'deer':'squeal');
      }
    }else if(e.stage==='dash'){
      // Animate a diagonal dive toward the lane. Small horizontal advance
      // makes the final obstacle consistently jumpable on narrow phones.
      e.x-=speed*.10*dt;
      // Distinctive action cue only when the hazard is about .6 seconds away.
      const {x:bx,w:bw}=riderBox();
      const targetX=bx+bw*.73-(e.kind==='car'?125:69)*.18;
      const eta=e.timer+(e.x-speed*.10*Math.max(0,e.timer)-targetX)/speed;
      if(!e.jumpCue && eta<=.52){
        e.jumpCue=true;
        showToast(e.kind==='deer'?'JUMP!  DEER!':'JUMP!  SWERVING CAR!',.84,'#fff0bc');
      }
      if(e.timer<=0){
        const type=types.find(t=>t.name===e.kind);
        hazards.push({...type,x:e.x,passed:false,used:false,nearMiss:false,voiceDone:false,surprise:true,jumpCue:!!e.jumpCue,anim:rnd(0,TAU),carVariant:e.carVariant});
        roadsideEvent=null;
        // A full jump and landing window before the next ordinary object.
        spawnTimer=Math.max(spawnTimer,Math.max(1.9,W/speed+.9));
      }
    }else if(e.stage==='leave'){
      e.x+=speed*.18*dt;
      if(e.timer<=0){roadsideEvent=null;spawnTimer=Math.max(spawnTimer,1.45);}
    }
  }

  function update(dt){
    clock+=dt;
    // Start at 2x (600 pixels/sec desktop). Growth stays uncapped.
    // Jump physics match V13; the original airtime was already good at 2x.
    score=Math.floor(distance/24)+bonusPoints;
    speed=(600+3.4*Math.sqrt(score)+.030*score)*mobileFactor();
    distance+=speed*dt;
    wheel+=(speed/19)*dt;
    engineAudioTick(dt);
    rampCooldown-=dt;
    wheelieTime=Math.max(0,wheelieTime-dt);
    if(toastLife>0)toastLife=Math.max(0,toastLife-dt);
    if(score>=nextMilestone){
      showToast(`${nextMilestone.toLocaleString()} POINTS  ·  KEEP RIDING!`,2.1);
      nextMilestone+=500;
    }
    const wasAirborne=jumpY>0;
    jumpV-=gravity*dt;
    jumpY+=jumpV*dt;
    if(jumpY<0){
      jumpY=0;jumpV=0;
      if(wasAirborne)soundEffect('land');
      if(wasAirborne&&rampFlight){
        rampFlight=false;wheelieTime=.43;showToast('STUCK THE LANDING!',1.1);
      }
    }
    spawnTimer-=dt;
    // The regular spawner pauses during telegraphed deer/car crossings.
    if(spawnTimer<=0 && !roadsideEvent && surpriseTimer>0)spawn();
    updateSurprise(dt);
    updateScenery(dt);
    progressSigns(dt);
    for(const o of hazards){
      o.x-=speed*dt;
      if(o.name==='car'&&!o.voiceDone&&o.x+o.w< -10){
        o.voiceDone=true;shoutAtDriver('carClear');
      }
      if(o.safe){
        const {x:bx,w:bw}=riderBox();
        const frontX=bx+bw*.85;
        const previousRampRight=o.x+o.w+speed*dt;
        if(!o.used && o.x<=frontX && previousRampRight>=frontX && jumpY<12){
          o.used=true;leap(rampJump);rampFlight=true;bonusPoints+=o.bonus;
          showToast('SEND IT!  +35',1.5,'#f2d59f');
        }
        if(!o.passed&&o.x+o.w<92)o.passed=true;
      }else{
        // Wheels/frame hitbox; decorative antlers don't collide.
        const collisionTop=o.name==='deer'?54:o.h*.77;
        const {x:bx,w:bw}=riderBox();
        if(o.surprise && !o.jumpCue && (o.x-(bx+bw*.73-o.w*.18))/speed<=.52){
          o.jumpCue=true;
          showToast(o.name==='deer'?'JUMP!  DEER!':'JUMP!  SWERVING CAR!',.84,'#fff0bc');
        }
        // Smaller, more forgiving hitboxes on moving surprise events.
        // Swept interval catches objects crossing between updates as speed grows.
        const overlap=o.surprise
          ? (o.x+o.w*.18<bx+bw*.73 && o.x+o.w*.82+speed*dt>bx+bw*.42)
          : (o.x<bx+bw*.80 && o.x+o.w+speed*dt>bx+bw*.27);
        if(overlap){
          if(jumpY<collisionTop){
            score=Math.floor(distance/24)+bonusPoints;
            gameOver(o.name,o);break;
          }
          // A *close* clean jump earns a bonus only once the object has passed.
          if(jumpY-collisionTop<=24)o.nearMiss=true;
        }
        if(!o.passed&&o.x+o.w<bx+bw*.27){
          o.passed=true;bonusPoints+=o.bonus;
          if(o.nearMiss){const extra=o.surprise?100:25;bonusPoints+=extra;showToast(o.surprise?'HOLY SHIT!  +100':'NEAR MISS!  +25',1.35,'#f3d09d');}
        }
      }
    }
    hazards=hazards.filter(o=>o.x+o.w>-90);
    exhaustTimer-=dt;
    if(jumpY<1&&exhaustTimer<=0){
      const {x:bx,w:bw}=riderBox();
      dust.push({kind:'exhaust',x:bx+bw*.13,y:groundY-12+rnd(-3,3),r:rnd(2.2,4.2),life:rnd(.28,.46)});
      exhaustTimer=rnd(.085,.15);
    }
    for(const p of dust){p.x-=speed*(p.kind==='exhaust'?.22:.36)*dt;p.y-=(p.kind==='exhaust'?28:17)*dt;p.r+=(p.kind==='exhaust'?13:9)*dt;p.life-=dt;}
    dust=dust.filter(p=>p.life>0);
    score=Math.floor(distance/24)+bonusPoints;
    refreshHud();
  }

  function background(t){
    const sky=ctx.createLinearGradient(0,0,0,H);
    sky.addColorStop(0,'#0b0c11');sky.addColorStop(.52,'#292529');sky.addColorStop(.86,'#654f3e');sky.addColorStop(1,'#101013');
    ctx.fillStyle=sky;ctx.fillRect(0,0,W,H);
    ellipse(W*.84,H*.19,29,29,'#e5d1ac',.67);
    ellipse(W*.84,H*.19,45,45,'#dcb891',.055);
    for(let i=0;i<21;i++){
      const x=(i*97.3+83)%Math.max(W,1),y=15+((i*43.6)%90);
      ellipse(x,y,.85,.85,'#e7d5c1',.23+Math.sin(t*.7+i)*.09);
    }
    for(let i=0;i<7;i++){
      const offset=((t*(i%2?18:12)+i*190)%(W+480));
      const x=offset-180,y=65+(i%3)*43;
      ellipse(x,y,135,22,'#c7ab8c',.042);
      ellipse(x+71,y-12,125,17,'#c2b1a0',.052);
    }
    ctx.fillStyle='#242425';ctx.beginPath();ctx.moveTo(0,groundY-22);
    for(let x=0;x<=W+25;x+=25){const h=22+Math.sin((x+distance*.034)*.012)*13+Math.sin((x+distance*.034)*.039)*6;ctx.lineTo(x,groundY-38-h);}
    ctx.lineTo(W,groundY);ctx.lineTo(0,groundY);ctx.fill();
    ctx.fillStyle='#141719';ctx.beginPath();ctx.moveTo(0,groundY);
    for(let x=0;x<=W+20;x+=20){const h=14+Math.abs(Math.sin((x+distance*.07)*.025))*19;ctx.lineTo(x,groundY-13-h);}
    ctx.lineTo(W,groundY);ctx.lineTo(0,groundY);ctx.fill();
    // All scenery and wildlife sit behind the motorcycle and roadway.
    drawScenery(t);
    drawRoadsideEvent(t);
    drawRoadSign();
    const road=ctx.createLinearGradient(0,groundY-4,0,H);
    road.addColorStop(0,'#282523');road.addColorStop(.3,'#1c1b1c');road.addColorStop(1,'#0c0d0e');
    ctx.fillStyle='#161717';ctx.fillRect(0,groundY-5,W,H-groundY+8);
    ctx.fillStyle=road;ctx.fillRect(0,groundY+4,W,H-groundY);
    ctx.fillStyle='#a48a6b';ctx.fillRect(0,groundY-6,W,2);
    const shift=(distance*.85)%110;
    for(let x=-110-shift;x<W+110;x+=110)rounded(x,groundY+38,54,3,1,'rgba(211,176,126,.31)');
    for(let i=0;i<30;i++){
      const sx=((i*131-distance*.31)%W+W)%W;
      ellipse(sx,groundY+8+(i%5)*10,.6,.6,'#9c866c',.17);
    }
    ellipse(W*.25+Math.sin(t*.3)*54,groundY-32,W*.33,25,'#b99b7d',.064);
    ellipse(W*.87+Math.cos(t*.23)*48,groundY-42,W*.26,22,'#e1c5a1',.055);
  }

  function wheelDraw(x,y,phase){
    ellipse(x,y+1,22.5,22.5,'#0a0a0b');
    ctx.strokeStyle='#cdbca6';ctx.lineWidth=3.3;ctx.beginPath();ctx.arc(x,y,19.6,0,TAU);ctx.stroke();
    ctx.strokeStyle='#736d65';ctx.lineWidth=1.3;ctx.beginPath();ctx.arc(x,y,16.3,0,TAU);ctx.stroke();
    for(let i=0;i<9;i++){
      const a=i*TAU/9+phase;
      line([[x,y],[x+15.2*Math.cos(a),y+15.2*Math.sin(a)]],'#9d9b93',1.2);
    }
    ellipse(x,y,4.4,4.4,'#d4ad78');ellipse(x,y,1.8,1.8,'#242323');
  }
  function motorcycle(t){
    const {x,w,h}=riderBox();
    ellipse(x+w*.54,groundY+4,Math.max(18,w*.48),7,'#000000',Math.max(.12,.52-jumpY/380));
    const visualJump=jumpY-Math.max(0,jumpY-104)*.76;
    const shake=jumpY<1?Math.sin(wheel*.74)*.5:0;
    ctx.save();
    ctx.translate(x+w*.5,groundY+5-visualJump+shake-h*.49);
    if(jumpY>2)ctx.rotate(-.035-Math.min(jumpY/2700,.085));
    else if(wheelieTime>0)ctx.rotate(-.12*(wheelieTime/.43));
    if(riderSprite.complete&&riderSprite.naturalWidth>0){
      ctx.drawImage(riderSprite,-w*.5,-h*.51,w,h);
    }else{
      rounded(-w*.47,-h*.34,w*.9,h*.66,20,'#30241b','#d9b58e');
      write('EAGLE RIDER',0,0,12,'#edd1ac','center');
    }
    ctx.restore();
  }
  function wrappedWords(text,maxWidth,font){
    ctx.font=font;
    const words=text.split(/\s+/), lines=[];
    let line='';
    for(const word of words){
      const test=line?line+' '+word:word;
      if(line&&ctx.measureText(test).width>maxWidth){lines.push(line);line=word;}
      else line=test;
    }
    if(line)lines.push(line);
    return lines;
  }
  function drawRoadSign(){
    if(!activeSign)return;
    const s=activeSign,x=s.x,w=s.w;
    const fs=W<540?12.4:14.2;
    const bodyFont=`900 ${fs}px system-ui,Arial,sans-serif`;
    const lines=wrappedWords(s.message,w-28,bodyFont).slice(0,2);
    const h=lines.length>1?74:58, y=W<540?37:50;
    ctx.save();
    // Readable at speed, but visually behind the motorcycle and road.
    ctx.strokeStyle='rgba(130,112,90,.70)';ctx.lineWidth=4;
    ctx.beginPath();ctx.moveTo(x+w*.22,y+h);ctx.lineTo(x+w*.22,groundY-10);
    ctx.moveTo(x+w*.78,y+h);ctx.lineTo(x+w*.78,groundY-10);ctx.stroke();
    rounded(x,y,w,h,8,'rgba(20,19,17,.91)','#c9a779');
    rounded(x+5,y+5,w-10,h-10,5,null,'rgba(204,167,121,.43)');
    write('ROAD AHEAD',x+w/2,y+17,9,'#ba9571','center','900');
    lines.forEach((l,i)=>write(l,x+w/2,y+(lines.length===1?41:38)+i*19,fs,'#f0d2aa','center','900'));
    ctx.restore();
  }

  // Side-profile white-tail deer. Head lowers gradually to graze, then lifts to watch traffic.
  function roadsideDeer(x,y,scale,t,pose='alert',buck=false,fawn=false){
    ctx.save();ctx.translate(x,y);ctx.scale(scale,scale);
    const nod=pose==='graze'?.5+.5*Math.cos(t*.9):pose==='alert'?0:.22;
    const bob=Math.sin(t*1.9)*.65;
    const body=fawn?'#987b5e':'#8e6749';
    // Legs and hooves anchor the deer to the ground.
    line([[19,-35],[16,-17],[12,-2]],'#78553b',5.3);
    line([[28,-35],[29,-18],[27,-2]],'#966e4e',5.2);
    line([[48,-33],[52,-16],[50,-2]],'#926b4c',5.5);
    line([[58,-34],[62,-17],[61,-2]],'#78543a',5.4);
    ellipse(35,-43+bob,28,15,body);
    ellipse(18,-44,7,6,'#e1c6a5',.83);
    if(fawn){for(let n=0;n<6;n++)ellipse(24+n*5,-48+Math.sin(n)*3,1.9,1.3,'#dec5a0',.7);}
    // A single animated neck-head chain, bent down only while grazing.
    const headX=66+nod*9,headY=-70+nod*55;
    line([[51,-43],[58+nod*4,-57+nod*25],[headX-4,headY+3]],'#9e7854',9.2);
    ellipse(headX,headY,10.8,8.2,'#a6815b');
    ellipse(headX+7,headY+3,5,3.5,'#c5a481');
    line([[headX-4,headY-4],[headX-8,headY-13]],'#a9825b',4.2);
    line([[headX+2,headY-5],[headX+5,headY-13]],'#a9825b',4.1);
    if(buck){
      line([[headX-3,headY-10],[headX-7,headY-25],[headX-15,headY-30]],'#d1af84',2.5);
      line([[headX-7,headY-24],[headX+1,headY-32]],'#d1af84',2);
      line([[headX+3,headY-10],[headX+12,headY-24]],'#d1af84',2.5);
      line([[headX+9,headY-20],[headX+5,headY-29]],'#d1af84',2);
    }
    ellipse(headX+3.2,headY-.5,1.35,1.4,'#171513');
    ellipse(headX+10,headY+4,1.7,1.3,'#27201a');
    // A soft tail twitch only, not an exaggerated animation.
    const twitch=Math.sin(t*1.13)> .95?3:0;
    ellipse(8,-47-twitch,5,4,'#dbc6a8');
    ctx.restore();
  }
  function roadCar(x,y,w,t,warning=false,kind='sedan'){
    const sprite=carSprites[kind]||carSprites.sedan;
    const h=(sprite.naturalWidth>0?w*sprite.naturalHeight/sprite.naturalWidth:w*.47);
    ctx.save();
    ctx.translate(x+w*.5,y-3);
    if(warning)ctx.rotate(Math.sin(t*13)*.025);
    ctx.translate(-w*.5,-h);
    if(sprite.complete && sprite.naturalWidth>0){
      ctx.drawImage(sprite,0,0,w,h);
    }else{
      // Lightweight fallback while the vehicle artwork loads.
      rounded(5,h*.39,w-10,h*.44,7,'#ac8c67','#e8d0af');
      ctx.fillStyle='#2d3334';ctx.beginPath();ctx.moveTo(w*.27,h*.39);
      ctx.lineTo(w*.39,h*.13);ctx.lineTo(w*.71,h*.13);ctx.lineTo(w*.84,h*.39);ctx.fill();
      ellipse(w*.24,h*.82,10,10,'#111111');ellipse(w*.79,h*.82,10,10,'#111111');
    }
    if(warning && Math.sin(t*18)>0){
      ellipse(w*.10,h*.60,3.5,4,'#fff1b8',.90);
      ellipse(w*.91,h*.63,3.4,4,'#ff6e48',.85);
    }
    ctx.restore();
  }
  function drawScenery(t){
    for(const s of scenery){
      const y=groundY-46;
      if(s.kind==='deerGroup'){
        ctx.save();ctx.globalAlpha=.73;
        for(const [i,d] of s.members.entries()){
          const scale=d.scale*(d.fawn?.75:1);
          roadsideDeer(s.x+d.offset,y-rndStatic(i)*5,scale,t+s.phase+d.phase,'graze',d.buck,d.fawn);
        }
        ctx.restore();

      
      }
    }
  }
  // Stable variation for scenery positions (never call random() in the render loop).
  function rndStatic(i){return (i*17%7)/7;}
  function drawRoadsideEvent(t){
    if(!roadsideEvent)return;
    const e=roadsideEvent;
    // The animal or car is visible on the shoulder before a sudden crossing.
    const phase=e.stage==='dash'?clamp(1-e.timer/.72,0,1):0;
    const fade=e.stage==='leave'?clamp(e.timer,0,1):1;
    const base=e.kind==='car'?groundY-12+phase*12:groundY-49+phase*49;
    ctx.save();ctx.globalAlpha=fade;
    if(e.kind==='deer')roadsideDeer(e.x,base,.72+phase*.28,t,e.stage==='watch'?'graze':'alert',true);
    else roadCar(e.x,base,125,t,e.stage==='alert'||e.stage==='dash',e.carVariant);
    if(e.stage==='alert'||e.stage==='dash'){
      const flash=Math.sin(t*13)>0;
      ellipse(e.x+35,base-112,23,19,flash?'#c58439':'#6e472c',.88);
      write('!',e.x+35,base-103,26,'#ffe0aa','center','900');
      if(e.stage==='dash'){
        // Soft roadside dust replaces the distracting straight speed streaks.
        const pulse=(Math.sin(t*8)+1)*.5;
        for(let i=0;i<4;i++){
          const dx=e.x-10-i*11, dy=base-7-i*1.4;
          const r=4.8+i*1.8+pulse*1.1;
          ellipse(dx,dy,r,r*.49,i%2?'#bba18b':'#8f8074',.20-(i*.025));
        }
      }
    }
    ctx.restore();
  }

  function obstacle(o,t){
    const x=o.x,y=groundY,bob=Math.sin(t*6+o.anim)*1.5;
    ellipse(x+o.w/2,y+2,o.w*.58,5,'#030404',.50);
    ctx.save();
    const sprite=obstacleArt[o.name];
    if(sprite?.complete&&sprite.naturalWidth>0){
      // Retain the original gameplay hitboxes, replace only the artwork.
      const aspect=sprite.naturalWidth/sprite.naturalHeight;
      const targetHeight=o.h*(o.name==='banana'?1.45:o.name==='pizza'?1.55:o.name==='ramp'?1.65:1);
      const targetWidth=o.name==='ramp'?o.w:Math.min(o.w*1.35,targetHeight*aspect);
      ctx.drawImage(sprite,x+(o.w-targetWidth)/2,y-targetHeight,targetWidth,targetHeight);
      if(o.name==='ramp'&&!o.used)write('RAMP!',x+o.w/2,y-targetHeight-6,11,'#f5d8a3','center','900');
      ctx.restore();return;
    }
    if(o.name==='deer'){
      roadsideDeer(x-3,y,0.84,t,'alert',true,false);
      ctx.restore();return;
    }
    if(o.name==='cone'){
      ctx.fillStyle='#d98932';ctx.beginPath();ctx.moveTo(x+o.w/2,y-o.h);
      ctx.lineTo(x+o.w-4,y-8);ctx.lineTo(x+4,y-8);ctx.closePath();ctx.fill();
      ctx.strokeStyle='#714927';ctx.lineWidth=1.5;ctx.stroke();
      line([[x+14,y-28],[x+24,y-28]],'#efe9da',5);
      rounded(x,y-8,o.w,8,2,'#3a3028','#d7af7d');
    }else if(o.name==='duck'){
      ellipse(x+19,y-16+bob,18,15,'#e5c36a');ellipse(x+31,y-29+bob,11,11,'#f2d073');
      ctx.fillStyle='#d88a43';ctx.beginPath();ctx.moveTo(x+37,y-27+bob);
      ctx.lineTo(x+48,y-24+bob);ctx.lineTo(x+37,y-21+bob);ctx.fill();
      ellipse(x+31,y-32+bob,2.5,2.5,'#181614');
      ellipse(x+14,y-16+bob,9,6,'#b8954f',.7);
    }else if(o.name==='pizza'){
      rounded(x+3,y-24,49,17,3,'#ba8c57','#e6c99a');
      ctx.fillStyle='#7a402c';ctx.beginPath();ctx.moveTo(x+10,y-21);
      ctx.lineTo(x+40,y-21);ctx.lineTo(x+30,y-12);ctx.closePath();ctx.fill();
      ellipse(x+24,y-18,3,3,'#dbb87a');ellipse(x+33,y-19,2.5,2.5,'#dbb87a');
      write('PIZZA',x+28,y-3,8,'#deb88b','center');
    }else if(o.name==='gnome'){
      rounded(x+10,y-28,22,27,8,'#4c5c56','#cfb88e');
      ellipse(x+21,y-37,15,15,'#b89d83');
      ctx.fillStyle='#bd6048';ctx.beginPath();ctx.moveTo(x+4,y-39);
      ctx.lineTo(x+21,y-67);ctx.lineTo(x+39,y-39);ctx.closePath();ctx.fill();
      ellipse(x+21,y-36,5,5,'#ebcfb2');
      ctx.fillStyle='#ece4d6';ctx.beginPath();ctx.moveTo(x+14,y-29);
      ctx.lineTo(x+27,y-29);ctx.lineTo(x+21,y-17);ctx.closePath();ctx.fill();
      ellipse(x+17,y-39,1.4,1.4,'#211e1c');ellipse(x+26,y-39,1.4,1.4,'#211e1c');
    }else if(o.name==='tire'){
      ellipse(x+o.w/2,y-24,21,23,'#07090a');
      ctx.strokeStyle='#383a3c';ctx.lineWidth=7;ctx.beginPath();ctx.arc(x+o.w/2,y-24,17,0,TAU);ctx.stroke();
      ellipse(x+o.w/2,y-24,9,9,'#aaa29a');ellipse(x+o.w/2,y-24,4,4,'#414041');
      for(let a=0;a<4;a++){const q=a*TAU/4+.2;line([[x+22,y-24],[x+22+12*Math.cos(q),y-24+12*Math.sin(q)]],'#303236',2);}
    }else if(o.name==='banana'){
      ctx.strokeStyle='#f4d27e';ctx.lineWidth=10;ctx.lineCap='round';ctx.beginPath();
      ctx.moveTo(x+7,y-12);ctx.quadraticCurveTo(x+23,y+3,x+40,y-16);ctx.stroke();
      ctx.strokeStyle='#ac8145';ctx.lineWidth=1.5;ctx.stroke();
      ellipse(x+8,y-12,2,2,'#60472e');ellipse(x+40,y-16,2,2,'#60472e');
    }else if(o.name==='toolbox'){
      rounded(x+5,y-34,46,31,4,'#a9463b','#e1a084');
      rounded(x+17,y-42,22,10,3,null,'#c1b39e');
      line([[x+8,y-22],[x+48,y-22]],'#542a24',3);
      rounded(x+22,y-27,11,9,2,'#e2b77b');
      write('TOOLS',x+28,y-9,8,'#ffdcaf','center','900');
    }else if(o.name==='deer'){
      // Real deer silhouette: four legs, body, neck, ears and branching antlers.
      const dx=x+8,dy=y+bob;
      ctx.fillStyle='#9f7653';ctx.beginPath();
      ctx.ellipse(dx+37,dy-43,28,17,-.07,0,TAU);ctx.fill();
      line([[dx+21,dy-35],[dx+16,dy-9],[dx+12,dy-1]],'#9b7351',7);
      line([[dx+31,dy-33],[dx+34,dy-13],[dx+30,dy-1]],'#9b7351',6);
      line([[dx+50,dy-35],[dx+56,dy-9],[dx+54,dy-1]],'#a87f58',7);
      line([[dx+58,dy-34],[dx+64,dy-17],[dx+65,dy-2]],'#956e4e',5.5);
      ctx.fillStyle='#b48a63';ctx.beginPath();ctx.moveTo(dx+48,dy-50);
      ctx.lineTo(dx+51,dy-69);ctx.lineTo(dx+68,dy-73);ctx.lineTo(dx+65,dy-45);ctx.closePath();ctx.fill();
      ellipse(dx+62,dy-68,12,9,'#a77f5a');
      // Deer faces left, antlers branch upward and stay behind the head.
      line([[dx+57,dy-75],[dx+53,dy-99]],'#bb9a70',3);
      line([[dx+53,dy-95],[dx+43,dy-105]],'#bb9a70',2.3);
      line([[dx+53,dy-91],[dx+64,dy-104]],'#bb9a70',2.2);
      line([[dx+61,dy-76],[dx+72,dy-100]],'#bb9a70',3);
      line([[dx+67,dy-90],[dx+78,dy-100]],'#bb9a70',2.2);
      line([[dx+67,dy-90],[dx+64,dy-105]],'#bb9a70',2);
      ellipse(dx+68,dy-70,2.3,2.3,'#1b1714');
      ctx.fillStyle='#f1e0c9';ctx.beginPath();ctx.moveTo(dx+12,dy-49);
      ctx.lineTo(dx+3,dy-61);ctx.lineTo(dx+13,dy-53);ctx.fill();
      ellipse(dx+64,dy-66,4,1.5,'#e7ccb0',.7);
      write('DEER!',x+o.w/2,y-113,9,'#f2d2a5','center','900');
    }else if(o.name==='cooler'){
      rounded(x+4,y-37,o.w-8,32,5,'#d4c6aa','#554a3e');
      rounded(x+3,y-42,o.w-6,10,3,'#a54b3b','#f2d7b0');
      line([[x+12,y-37],[x+12,y-8]],'#857769',2);
      write('ICE',x+o.w/2,y-18,12,'#352d28','center','900');
    }else if(o.name==='couch'){
      rounded(x+3,y-48,o.w-6,37,10,'#9c6d55','#e0b98d');
      rounded(x+9,y-30,o.w-18,24,6,'#c39b72','#a87855');
      rounded(x+4,y-40,16,30,4,'#b38868');
      rounded(x+o.w-20,y-40,16,30,4,'#b38868');
      line([[x+20,y-9],[x+20,y]],'#362b26',5);
      line([[x+o.w-20,y-9],[x+o.w-20,y]],'#362b26',5);
    }else if(o.name==='mower'){
      rounded(x+10,y-28,47,23,6,'#a44d35','#e9b18c');
      rounded(x+14,y-43,34,19,5,'#b1a78e','#e7caaa');
      line([[x+52,y-28],[x+60,y-58],[x+68,y-61]],'#b9b1a1',3);
      ellipse(x+17,y-6,8,8,'#17191c');ellipse(x+51,y-6,8,8,'#17191c');
      ellipse(x+17,y-6,3,3,'#ad967d');ellipse(x+51,y-6,3,3,'#ad967d');
    }else if(o.name==='car'){
      roadCar(x,y,o.w,t,!!o.surprise,o.carVariant);
    }else if(o.name==='ramp'){
      // Drive ONTO this ramp to launch automatically. This object is not a hazard.
      ctx.fillStyle='#896d4c';ctx.beginPath();ctx.moveTo(x,y-5);
      ctx.lineTo(x+o.w-6,y-o.h);ctx.lineTo(x+o.w,y-5);ctx.closePath();ctx.fill();
      line([[x,y-6],[x+o.w-6,y-o.h]],'#f0c88e',5);
      for(let i=1;i<4;i++)line([[x+i*20,y-6-i*5],[x+i*20+5,y-8-i*5]],'#514130',2);
      rounded(x+o.w-10,y-o.h-4,8,o.h+2,1,'#3c3329');
      if(!o.used){
        write('RAMP!',x+o.w/2,y-43,11,'#f5d8a3','center','900');
        for(let i=0;i<3;i++)ellipse(x+o.w*.27+i*16,y-39-(i%2)*8,1.7,1.7,'#f6cd83',.45);
      }
    }
    ctx.restore();
  }

  function crashBike(t){
    if(!crash)return;
    const c=crash,p=clamp(c.elapsed/c.duration,0,1),{x:bx,w:bw}=riderBox();
    const cx=bx+bw*.53,cy=groundY-bw*.34;
    ctx.save();
    ctx.translate(cx,cy);
    if(c.cause==='banana'){
      ctx.translate(-p*35,Math.sin(p*Math.PI)*(-10));
      ctx.rotate(p*TAU*1.28); // full comic banana spinout
    }else if(c.cause==='deer'){
      ctx.translate(-p*50,-Math.sin(p*Math.PI)*105);
      ctx.rotate(-p*TAU*.93); // flip over the deer and land
    }else if(c.cause==='cone'){
      // Forward slide, no backwards rebound. The cone skips alongside the front wheel.
      ctx.translate(p*105,Math.sin(p*36)*(1-p)*1.6);
      ctx.rotate(-.012*p+Math.sin(p*32)*.013*(1-p));
    }else if(c.cause==='car'){
      ctx.translate(-Math.min(p*85,45),Math.sin(p*35)*(1-p)*4);
      ctx.rotate(-Math.min(p*.3,.16));
    }else{
      ctx.translate(-p*26,Math.sin(p*Math.PI)*(-18));
      ctx.rotate(p*1.2);
    }
    ctx.translate(-cx,-cy);
    motorcycle(t);
    ctx.restore();
    if(c.cause==='cone'){
      const cone=obstacleArt.cone;
      const x=bx+bw*.82+p*92;
      ctx.save();ctx.translate(x,groundY-23+Math.sin(p*38)*2.2);
      ctx.rotate(-.72+Math.sin(p*28)*.20);
      if(cone?.complete&&cone.naturalWidth)ctx.drawImage(cone,-22,-21,44,44);
      else rounded(-13,-15,28,27,4,'#e18d31');
      ctx.restore();
      for(let i=0;i<5;i++)ellipse(x-10-i*11,groundY-3-(i%2)*3,3.0-i*.35,1.8,'#f6cd8d',Math.max(.1,.85-i*.15));
    }
    if(c.cause==='banana'){
      for(let i=0;i<4;i++){
        const a=p*TAU+i*TAU/4;
        ellipse(cx+Math.cos(a)*30,cy+Math.sin(a)*33,4,2.2,'#f7c97a',.46);
      }
    }
    if(c.cause==='car'){
      ellipse(cx+bw*.35,groundY-25,25*(1+p),15*(1+p),'#c7ab8e',.13*(1-p));
    }
    for(const sp of c.sparks){
      ctx.save();ctx.globalAlpha=Math.min(1,sp.life*3);ellipse(sp.x,sp.y,sp.r,sp.r*.6,'#f3ca7a');ctx.restore();
    }
  }
  function render(t){
    ctx.clearRect(0,0,W,H);
    background(t);
    for(const o of hazards)if(!o.hit)obstacle(o,t);
    for(const p of dust)ellipse(p.x,p.y,p.r,p.r*(p.kind==='exhaust'?.78:.46),p.kind==='exhaust'?'#bbb2a4':'#e1c5a0',Math.max(0,p.life*(p.kind==='exhaust'?.48:1.1)));
    if(mode==='crashing')crashBike(t);
    else motorcycle(t);
    if(toastLife>0){
      const alpha=clamp(toastLife*1.5,0,1);
      ctx.save();ctx.globalAlpha=alpha;
      rounded(W/2-164,18,328,33,13,'rgba(15,13,11,.63)','rgba(206,170,120,.27)');
      write(toast,W/2,40,13,toastColor,'center','900');
      ctx.restore();
    }else if(mode==='playing'&&jumpY>25){
      write('FLY, EAGLE!',W-18,24,10,'rgba(235,205,167,.68)','right','900');
    }
  }
  // Fixed-step simulation prevents high-refresh-rate gameplay differences.
  // Low-frame-rate machines may run the game slightly slower instead of skipping
  // hazards: a preferable tradeoff for a timing-based arcade game.
  const STEP=1/120;
  let accumulated=0,lastIdleRender=0;
  function frame(timestamp){
    const elapsed=last?Math.min(.080,Math.max(0,(timestamp-last)/1000)):0;
    last=timestamp;
    if(mode==='playing'||mode==='crashing'){
      accumulated+=elapsed;
      let steps=0;
      while(accumulated>=STEP&&steps<10){
        if(mode==='playing')update(STEP);
        else if(mode==='crashing')updateCrash(STEP);
        accumulated-=STEP;
        steps++;
      }
      if(steps===10)accumulated=0;
    }else accumulated=0;
    if(mode==='playing'||mode==='crashing'||timestamp-lastIdleRender>=1000/24){
      render(timestamp/1000);
      lastIdleRender=timestamp;
    }
    requestAnimationFrame(frame);
  }
  overlay(true);
  refreshHud();
  requestAnimationFrame(frame);
})();
