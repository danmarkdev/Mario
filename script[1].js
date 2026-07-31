(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  const W = canvas.width, H = canvas.height;
  const TILE = 32;
  const GRAVITY = 0.62;        // used for enemies
  const GRAVITY_UP = 0.5;      // lighter gravity while rising = better hang time
  const GRAVITY_DOWN = 0.95;   // heavier gravity while falling = snappy, less floaty
  const JUMP_VELOCITY = -11.8;
  const ACCEL_GROUND = 0.55;
  const ACCEL_AIR = 0.42;
  const DECEL_GROUND = 0.5;
  const MAX_WALK = 3.2;
  const MAX_RUN = 5.4;
  const COYOTE_FRAMES = 8;
  const JUMP_BUFFER_FRAMES = 8;

  const scoreEl = document.getElementById('scoreVal');
  const coinEl = document.getElementById('coinVal');
  const worldEl = document.getElementById('worldVal');
  const livesEl = document.getElementById('livesVal');
  const timeEl = document.getElementById('timeVal');
  const overlay = document.getElementById('msgOverlay');
  const msgTitle = document.getElementById('msgTitle');
  const msgText = document.getElementById('msgText');
  const msgBtn = document.getElementById('msgBtn');

  // ---------- Level data ----------
  // Legend: G ground, B brick, ? coin-block, P pipe(2 tall visual from base row),
  // C coin (floating), E enemy spawn, S player start, . empty
  // (the flagpole + staircase + castle finale are built procedurally after each hand-authored layout)
  const rows = 14; // 14 * 32 = 448 ~ H

  const LEVELS = [
    {
      name: "1-1",
      str: [
"..........................................................................................",
"..........................................................................................",
"..........................................................................................",
"..........................................................................................",
"..........................................................................................",
"...............................................BB.........................................",
"..................C.......................................................................",
"....S..........BB.BB..........GGG.............BBB.........................................",
"............?....?..E................E.................E.............E..........E.....E...",
"........................?........................?.......C........PP.....C.C..............",
"...GGGGGGGG......................GGGGGGGG..PP.....GGGGGGGGGGGG....PP.......PP.............",
"...GGGGGGGG......................GGGGGGGG..PP.....GGGGGGGGGGGG....PP.......PP.............",
"GGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG..GGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG",
"GGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG..GGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG",
      ]
    },
    {
      name: "1-2",
      str: [
"..........................................................................................",
"..........................................................................................",
"..........................................................................................",
"..........................................................................................",
"..........................................................................................",
"..........................................................................................",
"..........................................................................................",
"....?.............?............................................?..........................",
".....E..............E...................E.............E.................E.................",
"....S...C...............BB?BB.C...........................GGG.......C.........C.C.........",
"..GGGG..........GGGG......................PP....PP............GGGG........................",
"..GGGG..........GGGG......................PP....PP............GGGG........................",
"GGGGGGGGGG....GGGGGGGGGGGGGGGGGG....GGGGGGGGGG....GGGGGGGGGG....GGGGGGGGGGGGGGGGGGGGGGGGGG",
"GGGGGGGGGG....GGGGGGGGGGGGGGGGGG....GGGGGGGGGG....GGGGGGGGGG....GGGGGGGGGGGGGGGGGGGGGGGGGG",
      ]
    },
    {
      name: "1-3",
      str: [
"..........................................................................................",
"..........................................................................................",
"..........................................................................................",
"..........................................................................................",
"..........................................................................................",
"..........................................................................................",
"..........................................................................................",
".........?.............................GGG........................................C.......",
"..........E...............E.................E.............E...........E.............E.....",
"....S.........?.........C.....BBB?BBB.........?.........BB?BB........C.C..C...............",
"........GGG...............PP..........GGGG................PP............PP......GGGG......",
"........GGG...............PP..........GGGG................PP............PP......GGGG......",
"GGGGGGGGGGGGGGGGGG....GGGGGGGGGGGGGG....GGGGGGGGGG....GGGGGGGGGG....GGGGGGGGGG....GGGGGGGG",
"GGGGGGGGGGGGGGGGGG....GGGGGGGGGGGGGG....GGGGGGGGGG....GGGGGGGGGG....GGGGGGGGGG....GGGGGGGG",
      ]
    }
  ];

  let levelIndex = 0;
  const STAIR_STEPS = 7;
  const FINALE_COLS = STAIR_STEPS + 10; // stairs + gap + flagpole + castle courtyard
  let BASE_COLS = LEVELS[0].str[0].length;
  let cols = BASE_COLS + FINALE_COLS;
  let levelWidth = cols * TILE;

  let solids = [];      // {x,y,w,h,type}
  let coinBlocks = [];  // {x,y,hit:false}
  let floatCoins = [];  // {x,y,taken:false}
  let enemies = [];     // live enemies
  let flagX = null, flagTopY = null, flagBaseY = null;
  let castle = null;    // {x, groundY}
  let playerStart = {x: 64, y: 64};

  function buildLevel(){
    solids = []; coinBlocks = []; floatCoins = []; enemies = [];
    flagX = null; flagTopY = null; flagBaseY = null; castle = null;

    const levelStr = LEVELS[levelIndex].str;
    BASE_COLS = levelStr[0].length;
    cols = BASE_COLS + FINALE_COLS;
    levelWidth = cols * TILE;

    for(let r=0;r<levelStr.length;r++){
      const row = levelStr[r];
      for(let c=0;c<row.length;c++){
        const ch = row[c];
        const x = c*TILE, y = r*TILE;
        if(ch==='G') solids.push({x,y,w:TILE,h:TILE,type:'ground'});
        else if(ch==='B') solids.push({x,y,w:TILE,h:TILE,type:'brick'});
        else if(ch==='?') coinBlocks.push({x,y,hit:false});
        else if(ch==='P') solids.push({x,y,w:TILE,h:TILE,type:'pipe'});
        else if(ch==='C') floatCoins.push({x:x+8,y:y+8,taken:false,bob:Math.random()*Math.PI*2});
        else if(ch==='E') enemies.push(makeEnemy(x,y));
        else if(ch==='S'){ playerStart = {x, y}; }
      }
    }

    buildFinale();
    worldEl.textContent = LEVELS[levelIndex].name;
  }

  // Builds the classic ascending staircase -> flagpole -> castle ending
  function buildFinale(){
    const groundRowTop = 12; // first ground row (surface)
    const groundRowBot = 13;

    // flat ground under the whole finale section
    for(let c=BASE_COLS; c<cols; c++){
      solids.push({x:c*TILE, y:groundRowTop*TILE, w:TILE, h:TILE, type:'ground'});
      solids.push({x:c*TILE, y:groundRowBot*TILE, w:TILE, h:TILE, type:'ground'});
    }

    // ascending staircase of bricks
    const stairStartCol = BASE_COLS + 1;
    for(let i=0; i<STAIR_STEPS; i++){
      const c = stairStartCol + i;
      const height = i + 1;
      for(let h=0; h<height; h++){
        const r = (groundRowTop - 1) - h;
        solids.push({x:c*TILE, y:r*TILE, w:TILE, h:TILE, type:'stair'});
      }
    }

    // flagpole, planted just past the staircase peak
    const flagCol = stairStartCol + STAIR_STEPS + 2;
    flagX = flagCol*TILE + 8;
    flagBaseY = groundRowTop*TILE;
    flagTopY = flagBaseY - (STAIR_STEPS + 3)*TILE;

    // castle courtyard beyond the flag
    const castleCol = flagCol + 3;
    castle = { x: castleCol*TILE, groundY: groundRowTop*TILE };
  }

  function makeEnemy(x,y){
    return {x,y,w:28,h:28,vx:-1.2,vy:0,alive:true,squish:0,type:'snurple'};
  }

  // ---------- Player ----------
  const player = {
    x:64,y:64,w:26,h:30,vx:0,vy:0,
    onGround:false, facing:1, running:false,
    invuln:0, dead:false, winTimer:0, anim:0,
    coyote:0, jumpBuffer:0
  };

  let keys = {};
  window.addEventListener('keydown', e=>{
    if(['ArrowLeft','ArrowRight','ArrowUp',' ','Shift','a','d','w','A','D','W'].includes(e.key)) e.preventDefault();
    keys[e.key]=true;
    startAudioIfNeeded();
  });
  window.addEventListener('keyup', e=>{ keys[e.key]=false; });

  // ---------- Touch controls ----------
  const touchControls = document.getElementById('touchControls');
  const isTouchDevice = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
  if(isTouchDevice) touchControls.classList.add('enabled');

  function bindHold(el, onDown, onUp){
    const down = ev => { ev.preventDefault(); el.classList.add('active'); onDown(); startAudioIfNeeded(); };
    const up = ev => { if(ev) ev.preventDefault(); el.classList.remove('active'); onUp(); };
    el.addEventListener('touchstart', down, {passive:false});
    el.addEventListener('touchend', up, {passive:false});
    el.addEventListener('touchcancel', up, {passive:false});
    el.addEventListener('mousedown', down);
    window.addEventListener('mouseup', up);
    el.addEventListener('mouseleave', up);
  }

  bindHold(document.getElementById('tcLeft'),  ()=>keys['ArrowLeft']=true,  ()=>keys['ArrowLeft']=false);
  bindHold(document.getElementById('tcRight'), ()=>keys['ArrowRight']=true, ()=>keys['ArrowRight']=false);
  bindHold(document.getElementById('tcJump'),  ()=>keys[' ']=true,          ()=>keys[' ']=false);
  bindHold(document.getElementById('tcRun'),   ()=>keys['Shift']=true,      ()=>keys['Shift']=false);

  // ---------- Audio: original procedural 8-bit chiptune + SFX ----------
  let audioCtx = null;
  let musicOn = true;
  let musicStarted = false;
  let noteIndex = 0;
  const BEAT = 0.16;

  // Original short looping melody (lead + bass), written for this game
  const melody =    [523,0,523,0,659,0,523,0, 0,494,0,494,0,440,0,392, 523,0,523,0,659,0,784,0, 880,0,784,0,659,0];
  const melodyLen = [1,.5,.5,1, 1,1, 1,1,  1,1,.5,.5, 1,1,1,2,  1,.5,.5,1, 1,1, 1,1,  2,1,1,1, 2,2];
  const bassline =  [196,0,196,0,247,0,196,0, 0,220,0,220,0,196,0,175, 196,0,196,0,247,0,262,0, 294,0,262,0,220,0];

  function initAudio(){
    if(audioCtx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if(!AC) return;
    audioCtx = new AC();
  }

  function startAudioIfNeeded(){
    initAudio();
    if(audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    if(!musicStarted && audioCtx){
      musicStarted = true;
      scheduleMusic();
    }
  }

  function beep(freq, duration, type, vol, delay){
    if(!audioCtx || !musicOn || !freq) return;
    const t = audioCtx.currentTime + (delay||0);
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type || 'square';
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(vol||0.07, t+0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t+duration);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t+duration+0.02);
  }

  function scheduleMusic(){
    if(!audioCtx) return;
    const i = noteIndex % melody.length;
    beep(melody[i], BEAT*(melodyLen[i]||1)*0.85, 'square', 0.045);
    beep(bassline[i], BEAT*0.85, 'triangle', 0.04);
    noteIndex++;
    setTimeout(scheduleMusic, BEAT*1000);
  }

  function sfxJump(){ beep(660,0.1,'square',0.07); beep(880,0.09,'square',0.06,0.05); }
  function sfxCoin(){ beep(988,0.07,'square',0.08); beep(1568,0.1,'square',0.08,0.05); }
  function sfxStomp(){ beep(150,0.1,'square',0.09); }
  function sfxHurt(){ beep(220,0.22,'sawtooth',0.08); beep(140,0.25,'sawtooth',0.07,0.07); }
  function sfxBlock(){ beep(784,0.08,'square',0.07); }
  function sfxWin(){ [523,659,784,1047].forEach((f,idx)=>beep(f,0.16,'square',0.08,idx*0.13)); }
  function sfxGameOver(){ [392,330,262,196].forEach((f,idx)=>beep(f,0.22,'triangle',0.08,idx*0.18)); }

  const muteBtn = document.getElementById('muteBtn');
  muteBtn.addEventListener('click', ()=>{
    musicOn = !musicOn;
    muteBtn.textContent = musicOn ? '🔊' : '🔇';
    startAudioIfNeeded();
  });

  let camX = 0;
  let score = 0, coins = 0, lives = 3, timeLeft = 400;
  let gameState = 'ready'; // ready | playing | dead | win | gameover | transition | sliding
  let timeAccum = 0;
  let frame = 0;

  function resetPlayer(){
    player.x = playerStart.x; player.y = playerStart.y;
    player.vx=0; player.vy=0; player.dead=false; player.invuln=90;
    camX = 0;
  }

  function resetGame(full){
    if(full){ score=0; coins=0; lives=3; levelIndex=0; }
    buildLevel();
    resetPlayer();
    timeLeft = 400; timeAccum = 0;
    gameState='playing';
    overlay.classList.add('hidden');
  }

  function rectsOverlap(a,b){
    return a.x < b.x+b.w && a.x+a.w > b.x && a.y < b.y+b.h && a.y+a.h > b.y;
  }

  function updatePlayer(){
    player.running = keys['Shift'];
    const maxSpeed = player.running ? MAX_RUN : MAX_WALK;
    const accel = player.onGround ? ACCEL_GROUND : ACCEL_AIR;

    let moveDir = 0;
    if(keys['ArrowLeft']||keys['a']||keys['A']){ moveDir = -1; player.facing=-1; }
    if(keys['ArrowRight']||keys['d']||keys['D']){ moveDir = 1; player.facing=1; }

    if(moveDir !== 0){
      player.vx += moveDir*accel;
      player.vx = Math.max(-maxSpeed, Math.min(maxSpeed, player.vx));
    } else if(player.onGround){
      if(player.vx > 0) player.vx = Math.max(0, player.vx-DECEL_GROUND);
      else if(player.vx < 0) player.vx = Math.min(0, player.vx+DECEL_GROUND);
    } else {
      player.vx *= 0.985; // gentle air drag, keeps momentum through jumps
    }
    if(Math.abs(player.vx) < 0.04) player.vx = 0;

    // Coyote time: stay "jumpable" briefly after walking off a ledge
    if(player.onGround) player.coyote = COYOTE_FRAMES;
    else if(player.coyote > 0) player.coyote--;

    // Jump buffering: a jump press just before landing still fires
    const jumpPressed = keys[' ']||keys['ArrowUp']||keys['w']||keys['W'];
    if(jumpPressed) player.jumpBuffer = JUMP_BUFFER_FRAMES;
    else if(player.jumpBuffer > 0) player.jumpBuffer--;

    if(player.jumpBuffer > 0 && player.coyote > 0){
      player.vy = JUMP_VELOCITY;
      player.onGround = false;
      player.coyote = 0;
      player.jumpBuffer = 0;
      sfxJump();
    }
    if(!jumpPressed && player.vy < -4){
      player.vy = -4; // release early = shorter hop
    }

    const grav = player.vy < 0 ? GRAVITY_UP : GRAVITY_DOWN;
    player.vy += grav;
    if(player.vy > 15) player.vy = 15;

    // horizontal move + collide
    player.x += player.vx;
    if(player.x < 0) player.x = 0;
    if(player.x + player.w > levelWidth) player.x = levelWidth - player.w;
    collideAxis(player, 'x');

    // vertical move + collide
    player.y += player.vy;
    player.onGround = false;
    collideAxis(player, 'y');

    if(player.y > H + 100){
      loseLife();
    }

    if(player.invuln>0) player.invuln--;
    player.anim++;
  }

  function collideAxis(entity, axis){
    const solidsAll = solids.concat(coinBlocks.filter(()=>true).map(b=>({x:b.x,y:b.y,w:TILE,h:TILE,type:'qblock',ref:b})));
    for(const s of solidsAll){
      if(!rectsOverlap(entity, {x:s.x,y:s.y,w:s.w,h:s.h})) continue;
      if(axis==='x'){
        if(entity.vx > 0) entity.x = s.x - entity.w;
        else if(entity.vx < 0) entity.x = s.x + s.w;
        entity.vx = 0;
      } else {
        if(entity.vy > 0){
          entity.y = s.y - entity.h;
          entity.vy = 0;
          entity.onGround = true;
        } else if(entity.vy < 0){
          entity.y = s.y + s.h;
          entity.vy = 0;
          if(s.type==='qblock' && !s.ref.hit && entity===player){
            hitQBlock(s.ref);
          }
        }
      }
    }
  }

  function hitQBlock(block){
    block.hit = true;
    addScore(100);
    coins++; updateHud();
    block.bump = 8;
    sfxBlock();
  }

  function updateEnemies(){
    for(const en of enemies){
      if(!en.alive) continue;
      en.vy += GRAVITY;
      if(en.vy>14) en.vy=14;

      en.x += en.vx;
      let hitWall=false;
      for(const s of solids){
        if(rectsOverlap(en,s)){
          if(en.vx>0) en.x = s.x-en.w; else en.x = s.x+s.w;
          hitWall=true;
        }
      }
      if(hitWall) en.vx *= -1;

      en.y += en.vy;
      en.grounded=false;
      for(const s of solids){
        if(rectsOverlap(en,s)){
          if(en.vy>0){ en.y = s.y-en.h; en.vy=0; en.grounded=true; }
          else if(en.vy<0){ en.y = s.y+s.h; en.vy=0; }
        }
      }

      // ledge turn-around
      if(en.grounded){
        const aheadX = en.vx>0 ? en.x+en.w+2 : en.x-2;
        const feetY = en.y+en.h+4;
        let ground=false;
        for(const s of solids){
          if(aheadX>=s.x && aheadX<=s.x+s.w && feetY>=s.y && feetY<=s.y+s.h+6){ ground=true; break; }
        }
        if(!ground) en.vx *= -1;
      }

      if(en.squish>0){
        en.squish--;
        if(en.squish===0) en.alive=false;
      }

      // player collision
      if(en.alive && player.invuln<=0 && rectsOverlap(player,en)){
        const stomping = player.vy>0 && (player.y+player.h) - en.y < 16;
        if(stomping){
          en.squish = 14;
          en.alive = true;
          en.vx = 0;
          player.vy = -7.5;
          addScore(200);
          sfxStomp();
        } else {
          hurtPlayer();
        }
      }
    }
    enemies = enemies.filter(e => e.y < H+200);
  }

  function hurtPlayer(){
    if(player.invuln>0 || player.dead) return;
    lives--;
    updateHud();
    sfxHurt();
    if(lives<=0){
      killPlayer(true);
    } else {
      player.invuln = 120;
      player.vx = -3*player.facing;
      player.vy = -6;
    }
  }

  // Used for falling into a pit or running out of time: always costs a life,
  // then either respawns on the current world (lives remain) or ends the game (no lives left).
  function loseLife(){
    if(player.dead) return;
    lives--;
    updateHud();
    if(lives<=0){
      killPlayer(true);
    } else {
      killPlayer(false);
    }
  }

  function killPlayer(instantGameOver){
    if(player.dead) return;
    player.dead = true;
    gameState = instantGameOver ? 'gameover' : 'dead';
    if(instantGameOver) sfxGameOver(); else sfxHurt();
    setTimeout(()=>{
      if(gameState==='gameover'){
        showOverlay('GAME OVER', "Rico's out of lives. Give the hills another shot?", 'TRY AGAIN', true);
      } else {
        resetPlayer();
        gameState='playing';
      }
    }, 900);
  }

  function updateCoins(){
    for(const c of floatCoins){
      if(c.taken) continue;
      c.bob += 0.15;
      const box = {x:c.x-10,y:c.y-10+Math.sin(c.bob)*3,w:20,h:20};
      if(rectsOverlap(player, box)){
        c.taken = true;
        coins++; addScore(50);
        updateHud();
        sfxCoin();
      }
    }
  }

  function checkFlag(){
    if(flagX===null || gameState!=='playing') return;
    const nearPole = player.x+player.w > flagX-6 && player.x < flagX+10 && player.y+player.h > flagTopY;
    if(nearPole){
      gameState = 'sliding';
      player.x = flagX - player.w/2 - 2;
      player.vx = 0;
      player.vy = 2.4;
      player.facing = 1;
      sfxBlock();
    }
  }

  function updateSlide(){
    player.y += player.vy;
    if(player.vy < 6) player.vy += 0.25;
    if(player.y + player.h >= flagBaseY){
      player.y = flagBaseY - player.h;
      finishLevel();
    }
  }

  function finishLevel(){
    addScore(500 + Math.round(timeLeft)*10);
    sfxWin();
    if(levelIndex < LEVELS.length-1){
      gameState = 'transition';
      const clearedName = LEVELS[levelIndex].name;
      setTimeout(()=>{
        levelIndex++;
        buildLevel();
        resetPlayer();
        timeLeft = 400; timeAccum = 0;
        gameState = 'playing';
      }, 1200);
    } else {
      gameState = 'win';
      setTimeout(()=>{
        showOverlay('GAME CLEARED!', 'Rico storms the final castle and rescues the day. All worlds cleared — nice run!', 'PLAY AGAIN', true);
      }, 900);
    }
  }

  function addScore(n){ score += n; updateHud(); }

  function updateHud(){
    scoreEl.textContent = String(score).padStart(6,'0');
    coinEl.textContent = String(coins).padStart(2,'0');
    livesEl.textContent = lives;
    timeEl.textContent = Math.ceil(timeLeft);
  }

  function showOverlay(title, text, btnLabel, isRestart){
    msgTitle.textContent = title;
    msgText.textContent = text;
    msgBtn.textContent = btnLabel;
    overlay.classList.remove('hidden');
    msgBtn.onclick = () => {
      startAudioIfNeeded();
      resetGame(isRestart);
    };
  }

  msgBtn.onclick = () => { startAudioIfNeeded(); resetGame(true); };

  // ---------- Drawing (all original pixel-art via shapes) ----------
  function draw(){
    ctx.clearRect(0,0,W,H);

    // sky gradient
    const grad = ctx.createLinearGradient(0,0,0,H);
    grad.addColorStop(0, '#3A6FD8');
    grad.addColorStop(1, '#8FC0FF');
    ctx.fillStyle = grad;
    ctx.fillRect(0,0,W,H);

    // parallax clouds/hills
    drawBackground();

    ctx.save();
    ctx.translate(-camX, 0);

    drawSolids();
    drawQBlocks();
    drawBushes();
    drawCastle();
    drawFloatCoins();
    drawFlag();
    drawEnemies();
    drawPlayer();

    ctx.restore();

    if(gameState==='transition'){
      ctx.fillStyle = 'rgba(5,5,15,0.55)';
      ctx.fillRect(0,0,W,H);
      ctx.fillStyle = '#FFD64B';
      ctx.font = '20px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('WORLD ' + LEVELS[levelIndex].name + ' CLEAR!', W/2, H/2);
    }
  }

  function drawBackground(){
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    for(let i=0;i<6;i++){
      const bx = (i*260 - camX*0.3) % (W+260) - 130;
      const by = 40 + (i%3)*30;
      drawCloud(bx,by);
    }
    ctx.fillStyle = '#3FA34D';
    for(let i=0;i<8;i++){
      const hx = (i*220 - camX*0.5) % (W+220) - 110;
      drawHill(hx, H-60);
    }
  }
  function drawCloud(x,y){
    ctx.beginPath();
    ctx.arc(x,y,16,0,Math.PI*2);
    ctx.arc(x+18,y-6,14,0,Math.PI*2);
    ctx.arc(x+34,y,16,0,Math.PI*2);
    ctx.fill();
  }
  function drawHill(x,y){
    ctx.beginPath();
    ctx.moveTo(x-70,y);
    ctx.quadraticCurveTo(x, y-70, x+70, y);
    ctx.closePath();
    ctx.fill();
  }

  function drawSolids(){
    for(const s of solids){
      if(s.x+TILE < camX-40 || s.x > camX+W+40) continue;
      if(s.type==='ground'){
        ctx.fillStyle = '#B5651D';
        ctx.fillRect(s.x,s.y,s.w,s.h);
        ctx.fillStyle = 'rgba(0,0,0,0.12)';
        for(let i=0;i<3;i++) ctx.fillRect(s.x+4, s.y+8+i*9, s.w-8, 2);
        ctx.fillStyle = '#4CAF3D';
        ctx.fillRect(s.x,s.y,s.w,10);
        ctx.fillStyle = '#66C853';
        ctx.fillRect(s.x,s.y,s.w,4);
        ctx.strokeStyle='rgba(0,0,0,0.22)';
        ctx.lineWidth=1;
        ctx.strokeRect(s.x+0.5,s.y+0.5,s.w-1,s.h-1);
      } else if(s.type==='brick'){
        ctx.fillStyle = '#D46A1E';
        ctx.fillRect(s.x,s.y,s.w,s.h);
        ctx.strokeStyle = '#8B3300';
        ctx.lineWidth=2;
        ctx.strokeRect(s.x+2,s.y+2,s.w-4,s.h-4);
        ctx.beginPath();
        ctx.moveTo(s.x+s.w/2,s.y+2); ctx.lineTo(s.x+s.w/2,s.y+s.h-2);
        ctx.stroke();
      } else if(s.type==='stair'){
        ctx.fillStyle = '#C8A25C';
        ctx.fillRect(s.x,s.y,s.w,s.h);
        ctx.strokeStyle = '#8A6A32';
        ctx.lineWidth=2;
        ctx.strokeRect(s.x+2,s.y+2,s.w-4,s.h-4);
      } else if(s.type==='pipe'){
        ctx.fillStyle = '#2FAE4E';
        ctx.fillRect(s.x,s.y,s.w,s.h);
        ctx.fillStyle = '#1C7A2B';
        ctx.fillRect(s.x,s.y,6,s.h);
        ctx.fillRect(s.x+s.w-6,s.y,6,s.h);
      }
    }
  }

  function drawBushes(){
    ctx.fillStyle = '#3FA34D';
    for(let x=140; x<levelWidth-200; x+=340){
      if(x < camX-80 || x > camX+W+80) continue;
      const gy = 12*TILE;
      drawBushCluster(x, gy);
    }
  }
  function drawBushCluster(x,y){
    ctx.beginPath();
    ctx.arc(x,y,14,Math.PI,0);
    ctx.arc(x+16,y-4,18,Math.PI,0);
    ctx.arc(x+34,y,14,Math.PI,0);
    ctx.closePath();
    ctx.fill();
  }

  function drawCastle(){
    if(!castle) return;
    if(castle.x < camX-260 || castle.x > camX+W+40) return;
    const x = castle.x, gy = castle.groundY;
    const bodyW = 168, bodyH = 128;
    const by = gy - bodyH;

    ctx.fillStyle = '#8B8B9A';
    ctx.fillRect(x, by, bodyW, bodyH);
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    for(let i=0;i<bodyH;i+=16) ctx.fillRect(x, by+i, bodyW, 2);

    // crenellations along the top
    ctx.fillStyle = '#8B8B9A';
    for(let cx=x; cx<x+bodyW; cx+=24){
      ctx.fillRect(cx, by-14, 16, 14);
    }

    // two side towers
    [x-6, x+bodyW-42].forEach(tx=>{
      ctx.fillStyle = '#7A7A88';
      ctx.fillRect(tx, by-40, 48, bodyH+40);
      ctx.fillStyle = '#7A7A88';
      for(let cx=tx; cx<tx+48; cx+=16){
        ctx.fillRect(cx, by-54, 10, 14);
      }
    });

    // doorway
    ctx.fillStyle = '#2A2A38';
    ctx.beginPath();
    ctx.moveTo(x+bodyW/2-18, by+bodyH);
    ctx.lineTo(x+bodyW/2-18, by+bodyH-46);
    ctx.quadraticCurveTo(x+bodyW/2, by+bodyH-64, x+bodyW/2+18, by+bodyH-46);
    ctx.lineTo(x+bodyW/2+18, by+bodyH);
    ctx.closePath();
    ctx.fill();

    // windows
    ctx.fillStyle = '#2A2A38';
    ctx.fillRect(x+22, by+34, 14, 18);
    ctx.fillRect(x+bodyW-36, by+34, 14, 18);

    // pole + banner on center tower
    ctx.strokeStyle = '#DDD';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x+bodyW/2, by-54);
    ctx.lineTo(x+bodyW/2, by-90);
    ctx.stroke();
    ctx.fillStyle = '#43D65A';
    ctx.beginPath();
    ctx.moveTo(x+bodyW/2, by-88);
    ctx.lineTo(x+bodyW/2+22, by-82);
    ctx.lineTo(x+bodyW/2, by-76);
    ctx.closePath();
    ctx.fill();
  }

  function drawQBlocks(){
    for(const b of coinBlocks){
      if(b.x+TILE < camX-40 || b.x > camX+W+40) continue;
      const bump = b.bump || 0;
      if(bump>0) b.bump--;
      const yOff = bump>0 ? -Math.min(bump,4) : 0;
      if(b.hit){
        ctx.fillStyle = '#8B5A2B';
        ctx.fillRect(b.x,b.y+yOff,TILE,TILE);
        ctx.strokeStyle='#5C3A1A';
        ctx.strokeRect(b.x+2,b.y+2+yOff,TILE-4,TILE-4);
      } else {
        ctx.fillStyle = '#FFD64B';
        ctx.fillRect(b.x,b.y+yOff,TILE,TILE);
        ctx.strokeStyle = '#C89000';
        ctx.lineWidth=2;
        ctx.strokeRect(b.x+2,b.y+2+yOff,TILE-4,TILE-4);
        ctx.fillStyle = '#7A4A00';
        ctx.font = '14px monospace';
        ctx.textAlign='center';
        ctx.fillText('?', b.x+TILE/2, b.y+22+yOff);
      }
    }
  }

  function drawFloatCoins(){
    for(const c of floatCoins){
      if(c.taken) continue;
      if(c.x < camX-40 || c.x > camX+W+40) continue;
      const y = c.y + Math.sin(c.bob)*3;
      ctx.fillStyle = '#FFD64B';
      ctx.beginPath();
      ctx.ellipse(c.x,y,8,10,0,0,Math.PI*2);
      ctx.fill();
      ctx.fillStyle = '#C89000';
      ctx.beginPath();
      ctx.ellipse(c.x,y,3,10,0,0,Math.PI*2);
      ctx.fill();
    }
  }

  function drawFlag(){
    if(flagX===null) return;
    ctx.fillStyle = '#DDD';
    ctx.fillRect(flagX-2, flagTopY, 4, flagBaseY-flagTopY);
    ctx.fillStyle = (gameState==='win'||gameState==='sliding'||gameState==='transition') ? '#43D65A' : '#FF6B6B';
    const flagY = gameState==='sliding' ? Math.max(flagTopY+6, player.y) : flagTopY+6;
    ctx.beginPath();
    ctx.moveTo(flagX+2, flagY);
    ctx.lineTo(flagX+26, flagY+8);
    ctx.lineTo(flagX+2, flagY+16);
    ctx.closePath();
    ctx.fill();
  }

  function drawEnemies(){
    for(const en of enemies){
      if(en.x+en.w < camX-40 || en.x > camX+W+40) continue;
      ctx.save();
      ctx.translate(en.x, en.y);
      const squished = en.squish>0;
      const h = squished ? en.h*0.4 : en.h;
      const yOff = squished ? en.h*0.6 : 0;
      // body
      ctx.fillStyle = '#8A4FD6';
      roundRect(ctx, 0, yOff, en.w, h, 6);
      ctx.fill();
      if(!squished){
        // eyes
        ctx.fillStyle = '#FFF';
        ctx.fillRect(5,8,7,7);
        ctx.fillRect(en.w-12,8,7,7);
        ctx.fillStyle = '#000';
        ctx.fillRect(7,10,3,3);
        ctx.fillRect(en.w-10,10,3,3);
        // feet
        ctx.fillStyle = '#5A2FA0';
        ctx.fillRect(2,en.h-6,8,6);
        ctx.fillRect(en.w-10,en.h-6,8,6);
      }
      ctx.restore();
    }
  }

  function roundRect(c,x,y,w,h,r){
    c.beginPath();
    c.moveTo(x+r,y);
    c.arcTo(x+w,y,x+w,y+h,r);
    c.arcTo(x+w,y+h,x,y+h,r);
    c.arcTo(x,y+h,x,y,r);
    c.arcTo(x,y,x+w,y,r);
    c.closePath();
  }

  function drawPlayer(){
    if(player.invuln>0 && player.invuln%8<4 && !player.dead) return; // blink
    ctx.save();
    ctx.translate(player.x, player.y);
    if(player.facing<0){ ctx.translate(player.w,0); ctx.scale(-1,1); }

    const bob = player.onGround && Math.abs(player.vx)>0.5 ? Math.sin(player.anim*0.5)*2 : 0;

    // legs
    ctx.fillStyle = '#2255CC';
    ctx.fillRect(4, 22+bob, 8, 8);
    ctx.fillRect(14, 22-bob, 8, 8);

    // overalls body
    ctx.fillStyle = '#2255CC';
    ctx.fillRect(2, 14, 22, 12);
    // shirt sleeves
    ctx.fillStyle = '#E03A3A';
    ctx.fillRect(0, 12, 26, 8);
    // head
    ctx.fillStyle = '#F5C08A';
    ctx.fillRect(4, 4, 18, 10);
    // cap
    ctx.fillStyle = '#E03A3A';
    ctx.fillRect(2, 0, 22, 6);
    ctx.fillRect(14, 4, 12, 4);
    // mustache
    ctx.fillStyle = '#5A3A20';
    ctx.fillRect(6, 10, 12, 3);
    // eye
    ctx.fillStyle = '#000';
    ctx.fillRect(15, 7, 3, 3);
    // buttons
    ctx.fillStyle = '#FFD64B';
    ctx.fillRect(9, 17, 3, 3);
    ctx.fillRect(16, 17, 3, 3);

    ctx.restore();
  }

  // ---------- Camera ----------
  function updateCamera(){
    const target = player.x - W/2 + player.w/2;
    camX = Math.max(0, Math.min(levelWidth - W, target));
  }

  // ---------- Main loop ----------
  function loop(){
    frame++;
    if(gameState==='playing'){
      updatePlayer();
      updateEnemies();
      updateCoins();
      updateCamera();
      checkFlag();

      timeAccum++;
      if(timeAccum>=15){
        timeAccum=0;
        timeLeft--;
        if(timeLeft<=0){ timeLeft=0; loseLife(); }
      }
      updateHud();
    } else if(gameState==='sliding'){
      updateSlide();
      updateCamera();
    }
    draw();
    requestAnimationFrame(loop);
  }

  buildLevel();
  updateHud();
  requestAnimationFrame(loop);
})();