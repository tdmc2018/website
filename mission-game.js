/* The Devoted MC — The Mission, game preview
   Source: exact statement printed on the club's homepage, November 2026.
   No external dependencies, remote calls, accounts, or score uploads. */
(() => {
  'use strict';

  const LINES = Object.freeze([
    {text:'The Devoted is a non territorial, non discriminating, family and community oriented motorcycle club.', parts:['The Devoted is','a non territorial,','non discriminating,','family and community oriented','motorcycle club.']},
    {text:'We are devoted first to each other as brothers, and secondly, we are devoted to the motorcycle lifestyle.', parts:['We are devoted first','to each other as brothers,','and secondly,','we are devoted','to the motorcycle lifestyle.']},
    {text:'Family is of the utmost importance to us.', parts:['Family is','of the utmost importance','to us.']},
    {text:'We will keep our club family oriented at all costs.', parts:['We will keep','our club family oriented','at all costs.']},
    {text:'Supporting our local communities is only a small part of what we are as a club.', parts:['Supporting our local communities','is only a small part','of what we are','as a club.']},
    {text:'We are about social gathering, as well as putting our wheels to the pavement.', parts:['We are about social gathering,','as well as putting','our wheels to the pavement.']},
    {text:'Another major aspect of our club will be protecting, and defending the rights that our forefathers laid down their lives to give us.', parts:['Another major aspect of our club','will be protecting,','and defending the rights','that our forefathers','laid down their lives','to give us.']},
    {text:'We vow to conduct ourselves with honor, integrity, commitment, and loyalty to this lifestyle and to follow the ethics expected of a club within the motorcycle community.', parts:['We vow to conduct ourselves','with honor, integrity,','commitment, and loyalty','to this lifestyle','and to follow the ethics','expected of a club','within the motorcycle community.']},
    {text:"We are proud of who we are and wouldn't change it for anyone.....", parts:['We are proud of who we are',"and wouldn't change it",'for anyone.....']},
    {text:'We are THE DEVOTED.', parts:['We are','THE DEVOTED.']}
  ]);

  /* In these rounds the surrounding text stays verbatim: only specified words are concealed. */
  const RECALL = Object.freeze([
    {line:0, blanks:['non territorial','non discriminating'], decoys:['non political','non competitive']},
    {line:3, blanks:['family oriented','at all costs'], decoys:['nationally focused','when possible']},
    {line:5, blanks:['social gathering','wheels to the pavement'], decoys:['regular meetings','boots to the ground']},
    {line:6, blanks:['protecting','defending the rights'], decoys:['preserving','keeping the rules']},
    {line:7, blanks:['honor','integrity','commitment','loyalty'], decoys:['respect','discipline']}
  ]);
  const TOTAL = LINES.length + RECALL.length;
  const DURATION = 8 * 60;
  const STORAGE_KEY = 'tdmc_statement_pending_beta1';
  const $ = id => document.getElementById(id);
  const dom = {
    score:$('mp-score'), best:$('mp-best'), streak:$('mp-streak'), clock:$('mp-clock'),
    line:$('mp-line'), phase:$('mp-phase'), progress:$('mp-progress'),
    panel:$('mp-panel'), notice:$('mp-notice'), scene:$('mp-scene'),
    status:$('mp-scene-status'), sound:$('mp-sound'), reset:$('mp-reset'),
    stageMeter:$('mp-stage-meter'), rider:$('mp-rider')
  };
  if (Object.values(dom).some(v => !v)) return;

  const validStorage = () => {
    try {
      const obj = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      const best = Number.isFinite(obj.best) ? Math.max(0,Math.floor(obj.best)) : 0;
      const stage = Number.isInteger(obj.stage) && obj.stage >= 1 && obj.stage < TOTAL ? obj.stage : 0;
      const score = Number.isFinite(obj.score) ? Math.max(0, Math.floor(obj.score)) : 0;
      return {best,stage,score};
    } catch { return {best:0,stage:0,score:0}; }
  };
  let stored = validStorage();
  const persist = () => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({best:stored.best,stage:stored.stage,score:stored.score})); }
    catch { /* Private mode can disable storage: the game still works. */ }
  };

  let state = null;
  let stageTimeout = null;
  let tickId = null;
  let audioCtx = null;
  let soundEnabled = true;
  let scheduledNotice = null;
  let visualClear = null;

  const el = (tag, className='', content) => {
    const item = document.createElement(tag);
    if (className) item.className = className;
    if (content !== undefined) item.textContent = content;
    return item;
  };
  const btn = (text, cls, action) => {
    const b = el('button',cls,text); b.type='button';b.addEventListener('click',action); return b;
  };
  const shuffle = data => {
    const a = data.slice();
    for (let i=a.length-1;i>0;i--) { const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]; }
    if (a.length > 1 && a.every((v,i)=>v.id===data[i].id)) [a[0],a[1]]=[a[1],a[0]];
    return a;
  };
  const readTime = t => `${Math.floor(Math.max(0,t)/60)}:${String(Math.floor(Math.max(0,t)%60)).padStart(2,'0')}`;
  function sound(kind) {
    if (!soundEnabled) return;
    try {
      const A = window.AudioContext || window.webkitAudioContext;
      if (!A) return;
      if (!audioCtx) audioCtx = new A();
      if (audioCtx.state === 'suspended') audioCtx.resume().catch(()=>{});
      const now=audioCtx.currentTime;
      const notes=kind==='success'?[392,523,659]:kind==='finish'?[392,494,587,784]:kind==='wrong'?[165,144]:[330];
      notes.forEach((freq,i)=>{
        const osc=audioCtx.createOscillator(),gain=audioCtx.createGain();
        osc.type=kind==='wrong'?'sawtooth':'triangle';
        osc.frequency.setValueAtTime(freq,now+i*.085);
        gain.gain.setValueAtTime(.0001,now+i*.085);
        gain.gain.exponentialRampToValueAtTime(kind==='wrong'?.016:.024,now+i*.085+.008);
        gain.gain.exponentialRampToValueAtTime(.0001,now+i*.085+.11);
        osc.connect(gain);gain.connect(audioCtx.destination);
        osc.start(now+i*.085);osc.stop(now+i*.085+.12);
      });
    } catch { /* Audio is optional. */ }
  }
  function clearTimers() {
    if (stageTimeout !== null) clearTimeout(stageTimeout);
    if (tickId !== null) clearInterval(tickId);
    if (scheduledNotice !== null) clearTimeout(scheduledNotice);
    if (visualClear !== null) clearTimeout(visualClear);
    stageTimeout=tickId=scheduledNotice=visualClear=null;
  }
  function setNotice(text, tone='neutral') {
    dom.notice.textContent=text;
    dom.notice.dataset.tone=tone;
  }
  function sceneMoment(kind) {
    const missTypes=['mp-miss-sputter','mp-miss-skid','mp-miss-deer'];
    dom.scene.classList.remove('mp-scene-correct','mp-scene-wrong',...missTypes);
    void dom.scene.offsetWidth;
    if (kind==='correct') dom.scene.classList.add('mp-scene-correct');
    else {
      dom.scene.classList.add('mp-scene-wrong');
      dom.scene.classList.add(missTypes[((state?.wrong??1)-1)%missTypes.length]);
    }
    if (visualClear !== null) clearTimeout(visualClear);
    visualClear=setTimeout(()=>{dom.scene.classList.remove('mp-scene-correct','mp-scene-wrong',...missTypes);visualClear=null;},820);
  }
  function showStatus(text) {
    dom.status.textContent=text;
    dom.status.classList.remove('mp-status-flash'); void dom.status.offsetWidth;
    dom.status.classList.add('mp-status-flash');
  }
  // A completed section advances the motorcycle permanently toward the star.
  // Pixel placement is computed only when progress or layout changes, not on timer ticks.
  let journeyPercent = -1;
  function setJourney(percent, force=false) {
    percent=Math.max(0,Math.min(100,percent));
    if (!force && percent===journeyPercent && dom.scene.style.getPropertyValue('--mp-bike-left')) return;
    journeyPercent=percent;
    const width=dom.scene.clientWidth;
    const riderWidth=dom.rider.getBoundingClientRect().width || dom.scene.clientHeight*0.70*(177/130);
    const padding=Math.max(8,Math.min(18,width*.035));
    const span=Math.max(0,width-riderWidth-2*padding);
    dom.scene.style.setProperty('--mp-bike-left',(padding+span*percent/100).toFixed(2)+'px');
    dom.scene.dataset.journey=String(Math.round(percent));
  }
  dom.rider.addEventListener('load',()=>setJourney(journeyPercent<0?0:journeyPercent,true));
  window.addEventListener('resize',()=>setJourney(journeyPercent<0?0:journeyPercent,true));
  function renderHud() {
    dom.score.textContent=String(state?.score??0).padStart(4,'0');
    dom.best.textContent=String(stored.best).padStart(4,'0');
    dom.streak.textContent=String(state?.streak??0);
    dom.clock.textContent=state?.mode==='challenge'?readTime(state.timeLeft):'NO TIMER';
    dom.clock.classList.toggle('mp-clock-warning',Boolean(state?.mode==='challenge'&&state.timeLeft<45));
    const i=state?.stage??0;
    dom.line.textContent=state ? `${String(Math.min(i+1,TOTAL)).padStart(2,'0')} / ${TOTAL}` : `00 / ${TOTAL}`;
    const completed=state ? i+(state.phase==='interlude'||state.phase==='done'?1:0) : 0;
    const percent=Math.max(0,Math.min(100,completed/TOTAL*100));
    dom.progress.style.width=percent+'%';
    dom.stageMeter.setAttribute('aria-valuenow',String(Math.round(percent)));
    setJourney(percent);
    dom.phase.textContent=!state?'READY':state.phase==='done'?'COMPLETE':i<LINES.length?'REBUILD':'RECALL';
  }
  function savePractice() {
    if (!state || state.mode!=='practice') return;
    stored.stage=Math.min(state.stage,TOTAL-1);
    stored.score=state.score;
    persist();
  }
  function startGame(mode, resume=false) {
    clearTimers();
    state={mode,stage:resume?stored.stage:0,score:resume?stored.score:0,streak:0,
      timeLeft:DURATION,phase:'intro',cursor:0,bank:[],taken:new Set(),wrong:0,
      studyEnd:0,lastTick:performance.now(),stageSerial:0};
    if (!resume && mode==='practice') {stored.stage=0;stored.score=0;persist();}
    dom.scene.classList.remove('mp-goal-reached','mp-scene-correct','mp-scene-wrong','mp-miss-sputter','mp-miss-skid','mp-miss-deer');
    dom.scene.classList.add('mp-scene-riding');
    showStatus('MISSION IN PROGRESS');
    setNotice(mode==='practice'?'Take your time. Every word is from the real statement.':'The clock is running. Put every phrase in its place.');
    renderHud();
    showStage();
    if(mode==='challenge') tickId=setInterval(updateClock,100);
    sound('tap');
  }
  function updateClock() {
    if(!state||state.mode!=='challenge'||state.phase==='done'||state.phase==='failed') return;
    const now=performance.now();
    const dt=Math.max(0,(now-state.lastTick)/1000);
    state.lastTick=now;
    if(document.hidden) return;
    state.timeLeft=Math.max(0,state.timeLeft-dt);
    if(state.timeLeft<=0) { endGame(false);return; }
    if(state.phase==='study'&&now>=state.studyEnd) beginBuild();
    renderHud();
    const span=$('mp-study-countdown');
    if(span && state.phase==='study') span.textContent=(Math.max(0,(state.studyEnd-now)/1000)).toFixed(1)+'s';
  }
  document.addEventListener('visibilitychange',()=>{ if(state) state.lastTick=performance.now(); });
  function showStage() {
    if(!state || state.stage>=TOTAL) {endGame(true);return;}
    state.stageSerial++;
    state.cursor=0;state.bank=[];state.taken=new Set();
    dom.panel.replaceChildren();
    if(state.stage<LINES.length) {
      setNotice('Study the next line, then put its phrases in order.');
      showStudy();
    } else {
      setNotice('Some words are missing. Choose the exact words in order.');
      beginRecall();
    }
    renderHud();
  }
  function stageHeadline(eyebrow,title) {
    const header=el('div','mp-stage-head');
    header.append(el('p','mp-stage-eyebrow',eyebrow),el('h2','mp-stage-heading',title));
    return header;
  }
  function showStudy() {
    if(!state) return;
    const row=LINES[state.stage];
    state.phase='study';state.lastTick=performance.now();
    if(state.mode==='challenge') state.studyEnd=performance.now()+Math.min(11500,Math.max(5200,2200+row.text.length*45));
    dom.panel.replaceChildren();
    const wrap=el('section','mp-puzzle mp-study');
    wrap.append(stageHeadline(`LINE ${state.stage+1} / ${LINES.length} • ${state.mode==='challenge'?'STUDY IT FAST':'STUDY FIRST'}`,'Read it. Remember it.'));
    const quote=el('blockquote','mp-study-quote',row.text);
    wrap.append(quote);
    const controls=el('div','mp-puzzle-actions');
    controls.append(btn('Hide it & rebuild','mp-button mp-button-primary',beginBuild));
    if(state.mode==='challenge') {
      controls.append(el('span','mp-study-count-note','Auto-hides in '));
      const timer=el('strong','',Math.max(0,(state.studyEnd-performance.now())/1000).toFixed(1)+'s');
      timer.id='mp-study-countdown';controls.append(timer);
    } else controls.append(el('p','mp-hint','No timer. Read it as many times as you need.'));
    wrap.append(controls);dom.panel.append(wrap);renderHud();
  }
  function beginBuild() {
    if(!state||state.stage>=LINES.length||(!['study','build'].includes(state.phase))) return;
    state.phase='build';state.cursor=0;state.taken=new Set();
    state.bank=shuffle(LINES[state.stage].parts.map((text,id)=>({id,text})));
    renderBuild();renderHud();
  }
  function renderBuild() {
    if(!state||state.phase!=='build') return;
    const line=LINES[state.stage];
    dom.panel.replaceChildren();
    const panel=el('section','mp-puzzle');
    panel.append(stageHeadline(`LINE ${state.stage+1} / ${LINES.length} • REBUILD`,'Put the phrases back in order.'));
    const target=el('div','mp-target-zone'); target.setAttribute('aria-label','Completed portion of sentence');
    const ordered=el('div','mp-chip-row mp-target-chips');
    for(let i=0;i<line.parts.length;i++) {
      if(i<state.cursor) ordered.append(el('span','mp-chip mp-placed',line.parts[i]));
      else if(i===state.cursor) ordered.append(el('span','mp-chip mp-slot','NEXT PHRASE'));
      else ordered.append(el('span','mp-chip mp-empty','· · ·'));
    }
    target.append(ordered);panel.append(target);
    const label=el('p','mp-bank-label',`SELECT THE NEXT PHRASE · ${state.cursor} OF ${line.parts.length} PLACED`);
    panel.append(label);
    const bank=el('div','mp-bank');
    state.bank.forEach(item=>{
      const b=btn(item.text,'mp-tile',()=>chooseBuild(item.id,b));
      b.dataset.choiceId=String(item.id);
      if(state.taken.has(item.id)) {b.classList.add('mp-tile-used');b.disabled=true;}
      bank.append(b);
    });
    panel.append(bank);
    const acts=el('div','mp-puzzle-actions');
    acts.append(btn('Undo last','mp-button mp-button-quiet',()=>{
      if(state.phase!=='build'||state.cursor===0)return;
      state.cursor--;state.taken.delete(state.cursor);renderBuild();setNotice('Last phrase removed.','neutral');
    }));
    if(state.mode==='practice') acts.append(btn('See the line again','mp-button mp-button-quiet',()=>{state.cursor=0;state.taken.clear();showStudy();}));
    else acts.append(btn('Peek (−8 seconds)','mp-button mp-button-quiet',()=>{state.timeLeft=Math.max(0,state.timeLeft-8);if(!state.timeLeft){endGame(false);return;}showStatus('THE LINE, ONCE MORE');state.cursor=0;state.taken.clear();showStudy();}));
    panel.append(acts);
    dom.panel.append(panel);
  }
  function chooseBuild(id,button) {
    if(!state||state.phase!=='build'||state.taken.has(id))return;
    if(id===state.cursor) {
      state.taken.add(id);state.cursor++;state.streak++;
      state.score+=12+Math.min(state.streak,8)*3;
      setNotice(state.cursor===LINES[state.stage].parts.length?'Sentence restored.':'That fits. Keep going.','good');
      sound('tap');renderHud();sceneMoment('correct');
      if(state.cursor===LINES[state.stage].parts.length) completeStage(); else renderBuild();
    } else wrongChoice(button);
  }
  function splitRecallText(text,blanks) {
    let cursor=0;const parts=[];
    blanks.forEach((word,i)=>{
      const pos=text.indexOf(word,cursor);
      if(pos<0) throw new Error('Source text and recall round are out of sync');
      parts.push({type:'text',value:text.slice(cursor,pos)});
      parts.push({type:'blank',index:i});cursor=pos+word.length;
    });
    parts.push({type:'text',value:text.slice(cursor)});
    return parts;
  }
  function beginRecall() {
    if(!state)return;
    state.phase='recall';state.cursor=0;state.taken=new Set();
    const review=RECALL[state.stage-LINES.length];
    state.bank=shuffle([...review.blanks,...review.decoys].map((text,id)=>({id,text})));
    renderRecall();renderHud();
  }
  function renderRecall() {
    if(!state||state.phase!=='recall')return;
    const task=RECALL[state.stage-LINES.length],line=LINES[task.line].text;
    dom.panel.replaceChildren();
    const panel=el('section','mp-puzzle mp-recall');
    panel.append(stageHeadline(`MEMORY CHECK ${state.stage-LINES.length+1} / ${RECALL.length}`,'Fill the missing words.'));
    const sentence=el('p','mp-recall-line');
    splitRecallText(line,task.blanks).forEach(part=>{
      if(part.type==='text')sentence.append(document.createTextNode(part.value));
      else if(part.index<state.cursor)sentence.append(el('span','mp-recall-filled',task.blanks[part.index]));
      else sentence.append(el('span',part.index===state.cursor?'mp-recall-empty mp-recall-current':'mp-recall-empty','?'));
    });
    panel.append(sentence);
    panel.append(el('p','mp-bank-label',`FILL THE GAPS, IN ORDER · ${state.cursor} OF ${task.blanks.length}`));
    const bank=el('div','mp-bank');
    state.bank.forEach(item=>{
      const b=btn(item.text,'mp-tile',()=>chooseRecall(item.id,b));
      b.dataset.choiceId=String(item.id);
      if(state.taken.has(item.id)){b.disabled=true;b.classList.add('mp-tile-used');}
      bank.append(b);
    });
    panel.append(bank);
    const acts=el('div','mp-puzzle-actions');
    acts.append(btn('Undo last','mp-button mp-button-quiet',()=>{
      if(state.phase!=='recall'||state.cursor===0)return;
      state.cursor--;state.taken.delete(state.cursor);renderRecall();setNotice('Last answer removed.','neutral');
    }));
    if(state.mode==='practice') acts.append(btn('Show full sentence','mp-button mp-button-quiet',()=>{
      const existing=$('mp-recall-reference');
      if(existing){existing.remove();return;}
      const p=el('p','mp-recall-reference',line);p.id='mp-recall-reference';
      acts.after(p);
    }));
    panel.append(acts);dom.panel.append(panel);
  }
  function chooseRecall(id,button) {
    if(!state||state.phase!=='recall'||state.taken.has(id))return;
    const task=RECALL[state.stage-LINES.length];
    if(id===state.cursor){
      state.taken.add(id);state.cursor++;state.streak++;
      state.score+=20+Math.min(state.streak,8)*3;
      setNotice(state.cursor===task.blanks.length?'Every word in place.':'Correct. Next gap.','good');
      sound('tap');sceneMoment('correct');renderHud();
      if(state.cursor===task.blanks.length)completeStage();else renderRecall();
    } else wrongChoice(button);
  }
  function wrongChoice(button) {
    if(!state)return;
    state.wrong++;state.streak=0;
    if(state.mode==='challenge')state.timeLeft=Math.max(0,state.timeLeft-2);
    setNotice('Not that one. Look again.','bad');sound('wrong');sceneMoment('wrong');renderHud();
    if(button){button.classList.remove('mp-tile-wrong');void button.offsetWidth;button.classList.add('mp-tile-wrong');}
    if(state.timeLeft<=0 && state.mode==='challenge')endGame(false);
  }
  function completeStage() {
    if(!state)return;
    state.phase='interlude';if(state.stage===TOTAL-1)dom.scene.classList.add('mp-goal-reached');state.score+=120+Math.min(120,state.streak*3);
    const lastSentence=state.stage<LINES.length?LINES[state.stage].text:LINES[RECALL[state.stage-LINES.length].line].text;
    sound('success');sceneMoment('correct');showStatus('SENTENCE RESTORED');
    const panel=el('section','mp-puzzle mp-stage-clear');
    const small=el('p','mp-stage-eyebrow',`SECTION ${state.stage+1} / ${TOTAL} COMPLETE`);
    panel.append(small,el('h2','mp-stage-heading','That one is back where it belongs.'),el('p','mp-restored-line',lastSentence));
    const points=el('p','mp-clear-points','+120 • NEXT SECTION AHEAD');panel.append(points);
    const next=btn('Next section','mp-button mp-button-primary',()=>advanceStage());
    panel.append(next);dom.panel.replaceChildren(panel);renderHud();
    stageTimeout=setTimeout(advanceStage,1500);
  }
  function advanceStage() {
    if(!state||state.phase!=='interlude')return;
    if(stageTimeout!==null){clearTimeout(stageTimeout);stageTimeout=null;}
    state.stage++;savePractice();
    showStage();
  }
  function endGame(won) {
    if(!state)return;
    if(stageTimeout!==null){clearTimeout(stageTimeout);stageTimeout=null;}
    if(tickId!==null){clearInterval(tickId);tickId=null;}
    state.phase=won?'done':'failed';
    if(won && state.mode==='challenge')state.score+=Math.round(state.timeLeft)*4;
    if(won && state.mode==='challenge' && state.score>stored.best){stored.best=state.score;persist();}
    if(won&&state.mode==='practice'){stored.stage=0;stored.score=0;persist();}
    dom.scene.classList.remove('mp-scene-riding');
    dom.scene.classList.toggle('mp-goal-reached',won);
    showStatus(won?'STATEMENT COMPLETE':'TIME EXPIRED');
    if(won)sound('finish');else sound('wrong');
    dom.panel.replaceChildren();
    const end=el('section','mp-puzzle mp-end');
    end.append(el('p','mp-stage-eyebrow',won?'THE DEVOTED MC • MISSION COMPLETE':'THE DEVOTED MC • RUN ENDED'));
    end.append(el('h2','mp-end-title',won?'THE MISSION: COMPLETE.':'Time ran out.'));
    end.append(el('p','mp-end-line',won?'You rebuilt every line of the actual mission statement. Now see how much you can say without the screen.':'You made it through '+state.stage+' of '+TOTAL+' sections. Try again, or practice without a timer.'));
    const stats=el('div','mp-end-stats');
    stats.append(el('div','',`SCORE  ${state.score.toLocaleString()}`),el('div','',`MISSES  ${state.wrong}`));
    if(won&&state.mode==='challenge')stats.append(el('div','',`TIME LEFT  ${readTime(state.timeLeft)}`));
    end.append(stats);
    const acts=el('div','mp-puzzle-actions');
    acts.append(btn('Try again','mp-button mp-button-primary',()=>startGame(state.mode,false)));
    acts.append(btn('Choose a mode','mp-button mp-button-quiet',()=>showIntro()));
    end.append(acts);dom.panel.append(end);renderHud();
  }
  function showIntro() {
    clearTimers();state=null;
    dom.scene.classList.remove('mp-scene-riding','mp-scene-correct','mp-scene-wrong','mp-goal-reached','mp-miss-sputter','mp-miss-skid','mp-miss-deer');
    showStatus('READY WHEN YOU ARE');
    setNotice('The actual mission statement. Nothing rewritten.');
    dom.panel.replaceChildren();
    const block=el('section','mp-puzzle mp-intro');
    block.append(el('p','mp-stage-eyebrow','TWO WAYS TO PLAY'));
    block.append(el('h2','mp-stage-heading','Read it. Rebuild it. Remember it.'));
    block.append(el('p','mp-intro-copy','Every line comes directly from The Devoted MC mission statement. Put phrases in order, then fill the missing words. Every section moves the eagle closer to the gold finish star.'));
    const cards=el('div','mp-mode-grid');
    const practice=el('div','mp-mode-card');
    practice.append(el('span','mp-mode-icon','01'),el('h3','', 'Practice run'),el('p','', 'Learn at your pace. Study each sentence, rebuild it, and revisit any line.'));
    practice.append(btn('Practice','mp-button mp-button-primary',()=>startGame('practice')));
    if(stored.stage>0)practice.append(btn(`Continue from ${stored.stage+1}/${TOTAL}`,'mp-button mp-button-quiet',()=>startGame('practice',true)));
    const challenge=el('div','mp-mode-card');
    challenge.append(el('span','mp-mode-icon','02'),el('h3','', 'Pressure run'),el('p','', 'Eight-minute clock. Brief study windows. Wrong picks cost two seconds. Personal best saves on this device.'));
    challenge.append(btn('Start timed run','mp-button mp-button-primary',()=>startGame('challenge')));
    cards.append(practice,challenge);block.append(cards);
    block.append(el('p','mp-intro-foot','Use a mouse, touchscreen, or keyboard. Tap word tiles in order. No login, internet, or outside services needed.'));
    dom.panel.append(block);renderHud();
  }
  dom.sound.addEventListener('click',()=>{soundEnabled=!soundEnabled;dom.sound.textContent=soundEnabled?'SOUND: ON':'SOUND: OFF';dom.sound.setAttribute('aria-pressed',String(soundEnabled));if(soundEnabled)sound('tap');});
  dom.reset.addEventListener('click',()=>{ if(state&&state.phase!=='done'&&state.phase!=='failed'&&!window.confirm('Leave this run and return to game selection?'))return;showIntro(); });
  document.addEventListener('keydown',event=>{
    if(event.altKey||event.ctrlKey||event.metaKey)return;
    const t=event.target;
    if(t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))return;
    if(!state||!['build','recall'].includes(state.phase))return;
    if(event.key>='1'&&event.key<='9') {
      const buttons=[...dom.panel.querySelectorAll('.mp-tile:not(:disabled)')];
      const target=buttons[Number(event.key)-1];
      if(target){target.click();event.preventDefault();}
    }
    if(event.key==='Backspace') {
      const undo=[...dom.panel.querySelectorAll('button')].find(b=>b.textContent==='Undo last');
      if(undo){undo.click();event.preventDefault();}
    }
  });
  /* Public read-only self-check aid; no access to user data or live state. */
  window.TheMissionFacts=Object.freeze({sentences:LINES.map(l=>l.text),rounds:TOTAL,source:'The Devoted MC official mission statement'});
  showIntro();
})();
