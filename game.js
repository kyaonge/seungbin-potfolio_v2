const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");
const ui = {
  time: document.querySelector("#time"),
  bombs: document.querySelector("#bombs"),
  range: document.querySelector("#range"),
  speed: document.querySelector("#speed"),
  overlay: document.querySelector("#overlay"),
  selectPanel: document.querySelector("#selectPanel"),
  resultPanel: document.querySelector("#resultPanel"),
  resultTitle: document.querySelector("#resultTitle"),
  resultText: document.querySelector("#resultText"),
  itemHud: document.querySelector("#itemHud"),
  itemHelp: document.querySelector("#itemHelp"),
  itemGuide: document.querySelector("#itemGuide"),
  itemGuideClose: document.querySelector("#itemGuideClose"),
  start: document.querySelector("#start"),
  resume: document.querySelector("#resume"),
  restart: document.querySelector("#restart"),
  cards: [...document.querySelectorAll(".character-card")],
  modes: [...document.querySelectorAll(".mode-card")],
};

const COLS = 15;
const ROWS = 13;
const TILE = 48;
const ACTOR_RADIUS = 13;
const BASE_SPEED = 168;
const SPEED_STEP = 18;
const keys = new Set();
let state;
let lastFrame = 0;
let aiThink = 0;
let loopToken = 0;
let selectedSkin = "dao";
let selectedMode = "team";
const spriteCache = new Map();
let audioContext = null;
let bgmAudio = null;
const DIRS = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

const colors = {
  wall: "#b7a3e7",
  wallDark: "#8872c9",
  wallTop: "#f0e9ff",
  crate: "#f7c7df",
  crateDark: "#c995d2",
  crateTrim: "#fff3fb",
  water: "#57d5ff",
  waterLight: "#c8f8ff",
  player: "#ff616f",
  enemy: "#7058e8",
};

const assets = {
  background: loadImage("image/background1.png"),
  dao: loadImage("image/dao1.png"),
  bazzi: loadImage("image/bazzi1.png"),
};

for (const image of Object.values(assets)) {
  image.addEventListener("load", () => {
    if (state) draw();
  }, { once: true });
}

function loadImage(src) {
  const image = new Image();
  image.src = src;
  return image;
}

function ensureAudio() {
  const AudioCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtor) return null;
  audioContext ||= new AudioCtor();
  if (audioContext.state === "suspended") audioContext.resume();
  return audioContext;
}

function playSound(type) {
  const audio = ensureAudio();
  if (!audio) return;
  const patterns = {
    bomb: [180, 0.05, "square", 0.05],
    explode: [90, 0.16, "sawtooth", 0.08],
    item: [660, 0.08, "triangle", 0.05],
    trap: [360, 0.12, "sine", 0.06],
    win: [760, 0.2, "triangle", 0.06],
  };
  const [frequency, duration, wave, gainValue] = patterns[type] || patterns.item;
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  oscillator.type = wave;
  oscillator.frequency.setValueAtTime(frequency, audio.currentTime);
  gain.gain.setValueAtTime(gainValue, audio.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + duration);
  oscillator.connect(gain);
  gain.connect(audio.destination);
  oscillator.start();
  oscillator.stop(audio.currentTime + duration);
}

function startBgm() {
  if (!bgmAudio) {
    bgmAudio = new Audio("image/ost2.wav");
    bgmAudio.loop = true;
    bgmAudio.volume = 0.32;
  }
  bgmAudio.currentTime = 0;
  bgmAudio.play().catch(() => {});
}

function stopBgm() {
  if (!bgmAudio) return;
  bgmAudio.pause();
}

function freshState() {
  const map = Array.from({ length: ROWS }, () => Array(COLS).fill("floor"));
  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 0; x < COLS; x += 1) {
      const border = x === 0 || y === 0 || x === COLS - 1 || y === ROWS - 1;
      const pillar = x % 2 === 0 && y % 2 === 0;
      if (border || pillar) map[y][x] = "wall";
    }
  }

  const safe = new Set(["1,1", "2,1", "1,2", "13,11", "12,11", "13,10"]);
  for (let x = 1; x <= 5; x += 1) safe.add(`${x},1`);
  for (let y = 1; y <= 5; y += 1) safe.add(`1,${y}`);
  for (let x = 9; x <= 13; x += 1) safe.add(`${x},11`);
  for (let y = 7; y <= 11; y += 1) safe.add(`13,${y}`);
  for (let y = 1; y < ROWS - 1; y += 1) {
    for (let x = 1; x < COLS - 1; x += 1) {
      if (map[y][x] === "floor" && !safe.has(`${x},${y}`) && Math.random() < 0.58) {
        map[y][x] = "crate";
      }
    }
  }

  return {
    map,
    running: false,
    ended: false,
    timer: 120,
    clock: 0,
    bombs: [],
    splashes: [],
    powerups: [],
    player: makeActor("player", 1, 1, colors.player, selectedSkin),
    enemy: makeActor("enemy", 13, 11, colors.enemy, selectedSkin === "dao" ? "bazzi" : "dao"),
  };
}

function makeActor(id, x, y, color, skin) {
  return {
    id,
    x: x * TILE + TILE / 2,
    y: y * TILE + TILE / 2,
    dirX: 0,
    dirY: 1,
    facingX: skin === "bazzi" ? 1 : -1,
    speed: id === "enemy" ? BASE_SPEED + 10 : BASE_SPEED,
    speedLevel: 1,
    color,
    bombs: 1,
    range: 2,
    shield: 0,
    kick: false,
    bombCooldown: 0,
    aiTimer: 0,
    stuckTime: 0,
    targetTile: null,
    lastDir: null,
    lastX: x * TILE + TILE / 2,
    lastY: y * TILE + TILE / 2,
    trapped: 0,
    alive: true,
    skin,
  };
}

function startGame() {
  ensureAudio();
  startBgm();
  playSound("item");
  loopToken += 1;
  const token = loopToken;
  state = freshState();
  state.running = true;
  lastFrame = performance.now();
  ui.selectPanel.classList.add("hidden");
  ui.resultPanel.classList.add("hidden");
  ui.overlay.classList.add("hidden");
  requestAnimationFrame((time) => loop(time, token));
}

function loop(now, token) {
  if (token !== loopToken) return;
  const dt = Math.min(0.034, (now - lastFrame) / 1000 || 0);
  lastFrame = now;
  if (state.running) update(dt);
  draw();
  if (!state.ended) requestAnimationFrame((time) => loop(time, token));
}

function update(dt) {
  state.clock += dt;
  state.timer = Math.max(0, 120 - Math.floor(state.clock));
  if (state.timer <= 0) finish("시간 종료", "무승부입니다. 다시 도전해보세요.");
  state.player.bombCooldown = Math.max(0, state.player.bombCooldown - dt);
  state.enemy.bombCooldown = Math.max(0, state.enemy.bombCooldown - dt);

  movePlayer(dt);
  updateEnemy(dt);
  updateBombs(dt);
  updateSplashes(dt);
  updateTraps(dt);
  collectPowerups();
  collectPowerups(state.enemy);
  updateUi();
}

function movePlayer(dt) {
  const p = state.player;
  if (!p.alive || p.trapped > 0) return;
  let dx = 0;
  let dy = 0;
  if (keys.has("arrowleft") || keys.has("a")) dx -= 1;
  if (keys.has("arrowright") || keys.has("d")) dx += 1;
  if (keys.has("arrowup") || keys.has("w")) dy -= 1;
  if (keys.has("arrowdown") || keys.has("s")) dy += 1;
  if (dx && dy) dx = 0;
  if (dx || dy) {
    p.dirX = dx;
    p.dirY = dy;
    if (dx !== 0) p.facingX = dx;
    moveActor(p, dx, dy, dt);
  }
}

function updateEnemy(dt) {
  const e = state.enemy;
  if (!e.alive || e.trapped > 0) return;
  aiThink -= dt;
  const enemyTile = tileOf(e);
  const playerTile = tileOf(state.player);
  const nearPlayer = distance(enemyTile, playerTile) <= 5;
  const canAttack = shouldEnemyBomb(enemyTile, playerTile) && hasEscapeAfterBomb(e);
  const inDanger = dangerCells().has(tileKey(enemyTile));

  if (nearPlayer && canAttack && canDropBomb(e)) {
    dropBomb(e);
    aiThink = 0.15;
  }

  if (inDanger || isBlockedAhead(e) || (aiThink <= 0 && isNearTileCenter(e))) {
    aiThink = 0.22 + Math.random() * 0.28;
    const choice = chooseEnemyDirection(e, nearPlayer);
    if (choice) {
      e.dirX = choice.x;
      e.dirY = choice.y;
      if (choice.x !== 0) e.facingX = choice.x;
    } else {
      e.dirX = 0;
      e.dirY = 0;
    }
  }
  moveActor(e, e.dirX, e.dirY, dt * 0.74);
}

function chooseEnemyDirection(enemy, nearPlayer) {
  const from = tileOf(enemy);
  const playerTile = tileOf(state.player);
  const danger = dangerCells();

  if (danger.has(tileKey(from))) {
    const escape = DIRS
      .filter((dir) => canEnter(from.x + dir.x, from.y + dir.y, enemy))
      .map((dir) => ({ dir, tile: { x: from.x + dir.x, y: from.y + dir.y } }))
      .filter((step) => !danger.has(tileKey(step.tile)))
      .sort((a, b) => distance(b.tile, playerTile) - distance(a.tile, playerTile));
    return escape[0]?.dir || null;
  }

  const nearbyPowerup = nearestPowerup(from);
  if (nearbyPowerup) {
    const step = findNextStep(enemy, nearbyPowerup, danger);
    if (step) return step;
  }

  const crateDir = adjacentCrateDirection(from);
  if (crateDir && canDropBomb(enemy) && hasEscapeAfterBomb(enemy)) {
    dropBomb(enemy);
    return bestEscapeDirection(enemy, dangerCells());
  }

  if (nearPlayer) {
    const step = findNextStep(enemy, playerTile, danger);
    if (step) return step;
  }

  const candidates = DIRS
    .filter((dir) => canEnter(from.x + dir.x, from.y + dir.y, enemy))
    .filter((dir) => !danger.has(tileKey({ x: from.x + dir.x, y: from.y + dir.y })))
    .sort(() => Math.random() - 0.5);
  return candidates[0] || null;
}

function nearestPowerup(from) {
  if (!state.powerups.length) return null;
  const sorted = [...state.powerups]
    .map((item) => ({ x: item.x, y: item.y, dist: distance(from, item) }))
    .filter((item) => item.dist <= 8)
    .sort((a, b) => a.dist - b.dist);
  return sorted[0] || null;
}

function adjacentCrateDirection(tile) {
  return DIRS.find((dir) => state.map[tile.y + dir.y]?.[tile.x + dir.x] === "crate") || null;
}

function bestEscapeDirection(actor, danger) {
  const from = tileOf(actor);
  const playerTile = tileOf(state.player);
  const candidates = DIRS
    .filter((dir) => canEnter(from.x + dir.x, from.y + dir.y, actor))
    .map((dir) => ({ dir, tile: { x: from.x + dir.x, y: from.y + dir.y } }))
    .filter((step) => !danger.has(tileKey(step.tile)))
    .sort((a, b) => distance(b.tile, playerTile) - distance(a.tile, playerTile));
  return candidates[0]?.dir || null;
}

function findNextStep(actor, target, danger) {
  const start = tileOf(actor);
  const queue = [{ tile: start, first: null }];
  const seen = new Set([tileKey(start)]);

  while (queue.length) {
    const current = queue.shift();
    if (current.tile.x === target.x && current.tile.y === target.y) return current.first;

    for (const dir of DIRS) {
      const next = { x: current.tile.x + dir.x, y: current.tile.y + dir.y };
      const key = tileKey(next);
      if (seen.has(key) || danger.has(key) || !canEnter(next.x, next.y, actor)) continue;
      seen.add(key);
      queue.push({ tile: next, first: current.first || dir });
    }
  }

  return null;
}

function shouldEnemyBomb(enemyTile, playerTile) {
  if (state.enemy.bombCooldown > 0) return false;
  const sameLine = enemyTile.x === playerTile.x || enemyTile.y === playerTile.y;
  if (!sameLine || distance(enemyTile, playerTile) > state.enemy.range) return false;
  return clearLine(enemyTile, playerTile);
}

function clearLine(from, to) {
  const dx = Math.sign(to.x - from.x);
  const dy = Math.sign(to.y - from.y);
  let x = from.x + dx;
  let y = from.y + dy;
  while (x !== to.x || y !== to.y) {
    if (state.map[y]?.[x] !== "floor") return false;
    x += dx;
    y += dy;
  }
  return true;
}

function hasEscapeAfterBomb(actor) {
  const origin = tileOf(actor);
  const danger = dangerCells([{ tx: origin.x, ty: origin.y, range: actor.range }]);
  const queue = [{ tile: origin, depth: 0 }];
  const seen = new Set([tileKey(origin)]);

  while (queue.length) {
    const current = queue.shift();
    if (current.depth > 0 && !danger.has(tileKey(current.tile))) return true;
    if (current.depth >= actor.range + 3) continue;

    for (const dir of DIRS) {
      const next = { x: current.tile.x + dir.x, y: current.tile.y + dir.y };
      const key = tileKey(next);
      if (seen.has(key) || !canEnter(next.x, next.y, actor)) continue;
      seen.add(key);
      queue.push({ tile: next, depth: current.depth + 1 });
    }
  }

  return false;
}

function moveActor(actor, dx, dy, dt) {
  const step = actor.speed * dt;
  tryMove(actor, dx * step, 0);
  tryMove(actor, 0, dy * step);
}

function tryMove(actor, dx, dy) {
  if (dx === 0 && dy === 0) return;
  const next = { x: actor.x + dx, y: actor.y + dy };
  if (canActorStandAt(next.x, next.y, actor)) {
    actor.x = next.x;
    actor.y = next.y;
    return;
  }

  if (actor.kick && tryKickBomb(actor, dx, dy)) return;

  const centered = assistIntoLane(actor, dx, dy);
  if (centered && canActorStandAt(centered.x + dx, centered.y + dy, actor)) {
    actor.x = centered.x + dx;
    actor.y = centered.y + dy;
  }
}

function tryKickBomb(actor, dx, dy) {
  const dir = Math.abs(dx) > Math.abs(dy)
    ? { x: Math.sign(dx), y: 0 }
    : { x: 0, y: Math.sign(dy) };
  if (!dir.x && !dir.y) return false;

  const front = {
    x: Math.floor((actor.x + dir.x * (ACTOR_RADIUS + 4)) / TILE),
    y: Math.floor((actor.y + dir.y * (ACTOR_RADIUS + 4)) / TILE),
  };
  const bomb = state.bombs.find((item) => item.tx === front.x && item.ty === front.y);
  if (!bomb) return false;

  const next = { x: bomb.tx + dir.x, y: bomb.ty + dir.y };
  if (!canEnter(next.x, next.y, null)) return false;
  bomb.tx = next.x;
  bomb.ty = next.y;
  bomb.passers.clear();
  return true;
}

function canActorStandAt(x, y, actor) {
  const points = [
    [x - ACTOR_RADIUS, y - ACTOR_RADIUS],
    [x + ACTOR_RADIUS, y - ACTOR_RADIUS],
    [x - ACTOR_RADIUS, y + ACTOR_RADIUS],
    [x + ACTOR_RADIUS, y + ACTOR_RADIUS],
  ];
  return points.every(([px, py]) => canEnter(Math.floor(px / TILE), Math.floor(py / TILE), actor));
}

function assistIntoLane(actor, dx, dy) {
  const tile = tileOf(actor);
  const centerX = tile.x * TILE + TILE / 2;
  const centerY = tile.y * TILE + TILE / 2;
  const assist = 5.5;
  if (dx !== 0) {
    const offset = centerY - actor.y;
    if (Math.abs(offset) <= 16) return { x: actor.x, y: actor.y + clamp(offset, -assist, assist) };
  }
  if (dy !== 0) {
    const offset = centerX - actor.x;
    if (Math.abs(offset) <= 16) return { x: actor.x + clamp(offset, -assist, assist), y: actor.y };
  }
  return null;
}

function isNearTileCenter(actor) {
  const tile = tileOf(actor);
  const centerX = tile.x * TILE + TILE / 2;
  const centerY = tile.y * TILE + TILE / 2;
  return Math.abs(actor.x - centerX) < 4 && Math.abs(actor.y - centerY) < 4;
}

function canEnter(x, y, actor) {
  if (!state.map[y] || state.map[y][x] !== "floor") return false;
  return !state.bombs.some((bomb) => {
    const canPassOwnBomb = actor && bomb.passers.has(actor.id);
    return bomb.tx === x && bomb.ty === y && !canPassOwnBomb;
  });
}

function isBlockedAhead(actor) {
  const tile = tileOf(actor);
  return !canEnter(tile.x + actor.dirX, tile.y + actor.dirY, actor);
}

function canDropBomb(actor) {
  const tile = tileOf(actor);
  const active = state.bombs.filter((bomb) => bomb.owner === actor).length;
  return actor.bombCooldown <= 0 && active < actor.bombs && !state.bombs.some((bomb) => bomb.tx === tile.x && bomb.ty === tile.y);
}

function dropBomb(actor) {
  if (!canDropBomb(actor)) return;
  const tile = tileOf(actor);
  state.bombs.push({
    tx: tile.x,
    ty: tile.y,
    timer: 2.3,
    range: actor.range,
    owner: actor,
    passers: new Set([actor.id]),
    pulse: Math.random() * 10,
  });
  actor.bombCooldown = actor === state.enemy ? 1.15 : 0.18;
  playSound("bomb");
}

function updateBombs(dt) {
  for (const bomb of state.bombs) {
    bomb.timer -= dt;
    for (const actor of [state.player, state.enemy]) {
      if (bomb.passers.has(actor.id) && !actorOverlapsTile(actor, bomb.tx, bomb.ty)) {
        bomb.passers.delete(actor.id);
      }
    }
  }
  const exploding = state.bombs.filter((bomb) => bomb.timer <= 0);
  state.bombs = state.bombs.filter((bomb) => bomb.timer > 0);
  exploding.forEach(explode);
}

function explode(bomb) {
  const cells = [{ x: bomb.tx, y: bomb.ty }];
  const dirs = [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 },
  ];
  for (const dir of dirs) {
    for (let i = 1; i <= bomb.range; i += 1) {
      const x = bomb.tx + dir.x * i;
      const y = bomb.ty + dir.y * i;
      const cell = state.map[y]?.[x];
      if (!cell || cell === "wall") break;
      cells.push({ x, y });
      if (cell === "crate") {
        state.map[y][x] = "floor";
        maybePowerup(x, y);
        break;
      }
    }
  }
  state.splashes.push({ cells, life: 0.56, max: 0.56 });
  playSound("explode");
  for (const other of state.bombs) {
    if (cells.some((cell) => cell.x === other.tx && cell.y === other.ty)) other.timer = 0;
  }
  hitActor(state.player, cells);
  hitActor(state.enemy, cells);
}

function dangerCells(extraBombs = []) {
  const danger = new Set();
  for (const bomb of [...state.bombs, ...extraBombs]) {
    for (const cell of bombCells(bomb.tx, bomb.ty, bomb.range)) {
      danger.add(tileKey(cell));
    }
  }
  for (const splash of state.splashes) {
    for (const cell of splash.cells) danger.add(tileKey(cell));
  }
  return danger;
}

function bombCells(tx, ty, range) {
  const cells = [{ x: tx, y: ty }];
  for (const dir of DIRS) {
    for (let i = 1; i <= range; i += 1) {
      const x = tx + dir.x * i;
      const y = ty + dir.y * i;
      const cell = state.map[y]?.[x];
      if (!cell || cell === "wall") break;
      cells.push({ x, y });
      if (cell === "crate") break;
    }
  }
  return cells;
}

function maybePowerup(x, y) {
  if (Math.random() > 0.48) return;
  const roll = Math.random();
  state.powerups.push({
    x,
    y,
    type: roll < 0.34 ? "range" : roll < 0.58 ? "bomb" : roll < 0.78 ? "speed" : roll < 0.9 ? "shield" : "kick",
    bob: Math.random() * Math.PI * 2,
  });
}

function hitActor(actor, cells) {
  const tile = tileOf(actor);
  if (actor.alive && actor.trapped <= 0 && cells.some((cell) => cell.x === tile.x && cell.y === tile.y)) {
    if (actor.shield > 0) {
      actor.shield -= 1;
      playSound("item");
      return;
    }
    actor.trapped = 3.5;
    playSound("trap");
  }
}

function actorOverlapsTile(actor, tx, ty) {
  const radius = 16;
  const left = actor.x - radius;
  const right = actor.x + radius;
  const top = actor.y - radius;
  const bottom = actor.y + radius;
  const tileLeft = tx * TILE;
  const tileRight = tileLeft + TILE;
  const tileTop = ty * TILE;
  const tileBottom = tileTop + TILE;
  return right > tileLeft && left < tileRight && bottom > tileTop && top < tileBottom;
}

function updateSplashes(dt) {
  for (const splash of state.splashes) splash.life -= dt;
  state.splashes = state.splashes.filter((splash) => splash.life > 0);
}

function updateTraps(dt) {
  for (const actor of [state.player, state.enemy]) {
    if (actor.trapped > 0) {
      actor.trapped -= dt;
      if (actor.trapped <= 0) {
        actor.alive = false;
        if (actor === state.player) finish("패배", "물방울에서 빠져나오지 못했습니다.");
        else finish("승리", "상대를 물방울에 가뒀습니다.");
      }
    }
  }
}

function collectPowerups(actor = state.player) {
  const tile = tileOf(actor);
  state.powerups = state.powerups.filter((item) => {
    if (item.x !== tile.x || item.y !== tile.y) return true;
    if (item.type === "range") actor.range = Math.min(6, actor.range + 1);
    if (item.type === "bomb") actor.bombs = Math.min(5, actor.bombs + 1);
    if (item.type === "speed") {
      actor.speedLevel = Math.min(5, actor.speedLevel + 1);
      actor.speed = BASE_SPEED + (actor.speedLevel - 1) * SPEED_STEP;
    }
    if (item.type === "shield") actor.shield = Math.min(2, actor.shield + 1);
    if (item.type === "kick") actor.kick = true;
    playSound("item");
    return false;
  });
}

function finish(title, text) {
  if (state.ended) return;
  state.running = false;
  state.ended = true;
  ui.overlay.querySelector("h2").textContent = title;
  ui.overlay.querySelector("p").textContent = text;
  ui.start.textContent = "다시 시작";
  ui.overlay.classList.remove("hidden");
}

function draw() {
  if (!state) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawMap();
  drawPowerups();
  drawBombs();
  drawSplashes();
  drawActor(state.enemy, "배찌");
  drawActor(state.player, "다오");
}

function drawMap() {
  if (assets.background.complete && assets.background.naturalWidth > 0) {
    ctx.drawImage(assets.background, 0, 0, canvas.width, canvas.height);
  } else {
    ctx.fillStyle = "#dff9f4";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 0; x < COLS; x += 1) {
      const px = x * TILE;
      const py = y * TILE;

      if (state.map[y][x] === "wall") {
        ctx.fillStyle = colors.wallDark;
        roundRect(px + 6, py + 8, TILE - 12, TILE - 12, 8);
        ctx.fill();
        ctx.fillStyle = colors.wall;
        roundRect(px + 6, py + 5, TILE - 12, TILE - 13, 8);
        ctx.fill();
        ctx.fillStyle = colors.wallTop;
        roundRect(px + 11, py + 9, TILE - 22, 8, 5);
        ctx.fill();
        ctx.strokeStyle = "rgba(120, 95, 184, 0.46)";
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      if (state.map[y][x] === "crate") {
        ctx.fillStyle = "rgba(134, 91, 177, 0.18)";
        roundRect(px + 8, py + 10, TILE - 12, TILE - 12, 8);
        ctx.fill();
        ctx.fillStyle = colors.crateDark;
        roundRect(px + 8, py + 8, TILE - 16, TILE - 14, 8);
        ctx.fill();
        ctx.fillStyle = colors.crate;
        roundRect(px + 8, py + 5, TILE - 16, TILE - 15, 8);
        ctx.fill();
        ctx.fillStyle = colors.crateTrim;
        roundRect(px + 14, py + 10, TILE - 28, 7, 5);
        ctx.fill();
        ctx.strokeStyle = "rgba(142, 99, 188, 0.38)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(px + 15, py + 18);
        ctx.lineTo(px + TILE - 15, py + TILE - 16);
        ctx.moveTo(px + TILE - 15, py + 18);
        ctx.lineTo(px + 15, py + TILE - 16);
        ctx.stroke();
      }
    }
  }
}

function drawPowerups() {
  for (const item of state.powerups) {
    item.bob += 0.045;
    const x = item.x * TILE + TILE / 2;
    const y = item.y * TILE + TILE / 2 + Math.sin(item.bob) * 3;
    const palette = {
      range: ["#ffde7a", "#fff6c7", "+"],
      bomb: ["#79e8aa", "#e8fff1", "B"],
      speed: ["#ff8fd1", "#fff0fa", "S"],
      shield: ["#8ec9ff", "#eef8ff", "☆"],
      kick: ["#cda7ff", "#f8f0ff", "K"],
    }[item.type];

    ctx.fillStyle = "rgba(127, 98, 180, 0.22)";
    roundRect(x - 14, y - 11, 30, 28, 8);
    ctx.fill();
    ctx.fillStyle = palette[0];
    roundRect(x - 15, y - 15, 30, 30, 8);
    ctx.fill();
    ctx.fillStyle = palette[1];
    roundRect(x - 9, y - 11, 18, 7, 5);
    ctx.fill();
    ctx.fillStyle = "#5d4d93";
    ctx.font = "bold 17px system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(palette[2], x, y + 2);
  }
}

function drawActor(actor, label) {
  if (!actor.alive) return;
  const bob = Math.sin(performance.now() / 130 + actor.x) * 2;
  const moving = actor.trapped <= 0 && (Math.abs(actor.dirX) + Math.abs(actor.dirY) > 0);
  const image = actor.skin === "dao"
    ? (moving ? assets.daoWalk : assets.dao)
    : (moving ? assets.bazziWalk : assets.bazzi);
  const crop = actorCrop(actor, image, moving);
  const drawWidth = actor.skin === "dao" ? (moving ? 42 : 44) : (moving ? 40 : 42);
  const drawHeight = actor.skin === "dao" ? (moving ? 58 : 54) : (moving ? 58 : 56);
  const lean = actor.dirY < 0 ? -2 : actor.dirY > 0 ? 1.5 : 0;
  const flipX = actor.skin === "bazzi" ? actor.facingX : -actor.facingX;

  ctx.fillStyle = "rgba(75, 60, 130, 0.23)";
  ctx.beginPath();
  ctx.ellipse(actor.x, actor.y + 17, 17, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  drawTeamMarker(actor, actor.y - drawHeight - 6 + bob);

  if (image.complete && image.naturalWidth > 0) {
    const sprite = getCutoutSprite(actor.skin, image, crop);
    ctx.imageSmoothingEnabled = false;
    ctx.save();
    ctx.translate(actor.x, actor.y + bob + lean);
    ctx.scale(flipX, 1);
    if (sprite) {
      ctx.drawImage(sprite, -drawWidth / 2, -drawHeight + 18, drawWidth, drawHeight);
    } else {
      ctx.drawImage(
        image,
        crop.x,
        crop.y,
        crop.w,
        crop.h,
        -drawWidth / 2,
        -drawHeight + 18,
        drawWidth,
        drawHeight,
      );
    }
    ctx.restore();
    ctx.imageSmoothingEnabled = true;
  } else {
    ctx.fillStyle = actor.color;
    ctx.beginPath();
    ctx.arc(actor.x, actor.y - 2 + bob, 17, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = "#4c477c";
  ctx.font = "bold 10px system-ui";
  ctx.textAlign = "center";
  ctx.fillText(label, actor.x, actor.y - 32 + bob);

  if (actor.shield > 0) {
    ctx.strokeStyle = "rgba(108, 190, 255, 0.78)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(actor.x, actor.y - 4, 24, 0, Math.PI * 2);
    ctx.stroke();
  }

  if (actor.kick) {
    ctx.fillStyle = "rgba(93, 77, 147, 0.82)";
    ctx.font = "bold 9px system-ui";
    ctx.fillText("K", actor.x + 18, actor.y + 18);
  }

  if (actor.trapped > 0) {
    ctx.globalAlpha = 0.72;
    ctx.fillStyle = "#7eeaff";
    ctx.beginPath();
    ctx.arc(actor.x, actor.y - 2, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

function actorCrop(actor, image, moving) {
  if (moving && image.complete && image.naturalWidth > 0) {
    const frameCount = 8;
    const frameWidth = image.naturalWidth / frameCount;
    const frame = Math.floor(performance.now() / 250) % frameCount;
    return {
      x: Math.floor(frame * frameWidth),
      y: Math.floor(image.naturalHeight * 0.28),
      w: Math.floor(frameWidth),
      h: Math.floor(image.naturalHeight * 0.42),
    };
  }
  return actor.skin === "dao"
    ? { x: 470, y: 165, w: 630, h: 620 }
    : { x: 455, y: 115, w: 635, h: 755 };
}

function drawTeamMarker(actor, y) {
  const color = teamColor(actor);
  ctx.fillStyle = color;
  ctx.strokeStyle = "rgba(22, 48, 68, 0.45)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(actor.x - 7, y);
  ctx.lineTo(actor.x + 7, y);
  ctx.lineTo(actor.x, y + 9);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

function teamColor(actor) {
  if (actor.team === "blue") return actor.controlled ? "#1678ff" : "#53c8ff";
  if (actor.team === "red") return "#ff4e68";
  if (actor.team === "green") return "#42c772";
  if (actor.team === "yellow") return "#f6c945";
  return "#8d7cff";
}

function getCutoutSprite(key, image, crop) {
  const cacheKey = `${key}:${image.naturalWidth}x${image.naturalHeight}:${crop.x},${crop.y},${crop.w},${crop.h}`;
  if (spriteCache.has(cacheKey)) return spriteCache.get(cacheKey);

  try {
    const sprite = document.createElement("canvas");
    sprite.width = crop.w;
    sprite.height = crop.h;
    const spriteCtx = sprite.getContext("2d", { willReadFrequently: true });
    spriteCtx.drawImage(image, crop.x, crop.y, crop.w, crop.h, 0, 0, crop.w, crop.h);

    const imageData = spriteCtx.getImageData(0, 0, crop.w, crop.h);
    removeConnectedGrayBackground(imageData, crop.w, crop.h);
    spriteCtx.putImageData(imageData, 0, 0);
    spriteCache.set(cacheKey, sprite);
    return sprite;
  } catch {
    spriteCache.set(cacheKey, null);
    return null;
  }
}

function removeConnectedGrayBackground(imageData, width, height) {
  const data = imageData.data;
  const visited = new Uint8Array(width * height);
  const queue = [];
  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const index = y * width + x;
    if (visited[index]) return;
    visited[index] = 1;
    queue.push(index);
  };

  for (let x = 0; x < width; x += 1) {
    push(x, 0);
    push(x, height - 1);
  }
  for (let y = 1; y < height - 1; y += 1) {
    push(0, y);
    push(width - 1, y);
  }

  while (queue.length) {
    const index = queue.pop();
    const offset = index * 4;
    if (!isRemovableGray(data[offset], data[offset + 1], data[offset + 2])) continue;
    data[offset + 3] = 0;
    const x = index % width;
    const y = Math.floor(index / width);
    push(x + 1, y);
    push(x - 1, y);
    push(x, y + 1);
    push(x, y - 1);
  }
}

function isRemovableGray(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const luma = (r + g + b) / 3;
  return max - min < 28 && luma > 48;
}

function drawBombs() {
  for (const bomb of state.bombs) {
    const pulse = Math.sin(performance.now() / 120 + bomb.pulse) * 2;
    const x = bomb.tx * TILE + TILE / 2;
    const y = bomb.ty * TILE + TILE / 2;
    ctx.fillStyle = "#087fb8";
    ctx.beginPath();
    ctx.arc(x, y + 2, 17 + pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#32d5ff";
    ctx.beginPath();
    ctx.arc(x - 2, y - 1, 15 + pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#e6fbff";
    ctx.beginPath();
    ctx.arc(x - 7, y - 8, 5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawSplashes() {
  for (const splash of state.splashes) {
    const alpha = Math.max(0, splash.life / splash.max);
    for (const cell of splash.cells) {
      const x = cell.x * TILE + TILE / 2;
      const y = cell.y * TILE + TILE / 2;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = colors.water;
      roundRect(cell.x * TILE + 6, cell.y * TILE + 12, TILE - 12, TILE - 24, 14);
      ctx.fill();
      roundRect(cell.x * TILE + 12, cell.y * TILE + 6, TILE - 24, TILE - 12, 14);
      ctx.fill();
      ctx.fillStyle = colors.waterLight;
      ctx.beginPath();
      ctx.arc(x - 8, y - 7, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
}

function roundRect(x, y, width, height, radius) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
}

function tileOf(actor) {
  return { x: Math.floor(actor.x / TILE), y: Math.floor(actor.y / TILE) };
}

function tileKey(tile) {
  return `${tile.x},${tile.y}`;
}

function distance(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function updateUi() {
  ui.time.textContent = state.timer;
  ui.bombs.textContent = state.player.bombs;
  ui.range.textContent = state.player.range;
  if (ui.speed) ui.speed.textContent = state.player.speedLevel;
  if (ui.itemHud) {
    const player = state.player;
    const chips = [
      ["O", player.shield > 0 ? `${Math.ceil(player.shieldTime)}s` : "0", player.shield > 0],
      ["N", player.needles || 0, (player.needles || 0) > 0],
      ["K", player.kick ? "ON" : "0", player.kick],
      ["R", player.revives || 0, (player.revives || 0) > 0],
    ];
    ui.itemHud.innerHTML = chips
      .map(([icon, value, active]) => `<span class="item-chip${active ? "" : " empty"}"><b>${icon}</b>${value}</span>`)
      .join("");
  }
}

window.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();
  if (["arrowleft", "arrowright", "arrowup", "arrowdown", " ", "w", "a", "s", "d"].includes(key)) {
    event.preventDefault();
  }
  keys.add(key);
  if (key === " " && state?.running) dropBomb(state.player);
});

window.addEventListener("keyup", (event) => {
  keys.delete(event.key.toLowerCase());
});

function update(dt) {
  state.clock += dt;
  state.timer = Math.max(0, 120 - Math.floor(state.clock));
  if (state.timer <= 0) finish("시간 종료", "무승부입니다. 다시 도전해보세요.");
  state.player.bombCooldown = Math.max(0, state.player.bombCooldown - dt);
  state.enemy.bombCooldown = Math.max(0, state.enemy.bombCooldown - dt);

  movePlayer(dt);
  updateEnemy(dt);
  updateBombs(dt);
  updateSplashes(dt);
  updateTraps(dt);
  collectPowerups();
  collectPowerups(state.enemy);
  updateUi();
}

function updateTraps(dt) {
  for (const actor of [state.player, state.enemy]) {
    if (actor.trapped > 0) {
      actor.trapped -= dt;
      if (actor.trapped <= 0) {
        actor.alive = false;
        if (actor === state.player) finish("패배", "물방울에서 빠져나오지 못했습니다.");
        else finish("승리", "상대를 물방울에 가뒀습니다.");
      }
    }
  }
}

function finish(title, text) {
  if (state.ended) return;
  state.running = false;
  state.ended = true;
  ui.resultTitle.textContent = title;
  ui.resultText.textContent = text;
  ui.selectPanel.classList.add("hidden");
  ui.resultPanel.classList.remove("hidden");
  ui.overlay.classList.remove("hidden");
}

function draw() {
  if (!state) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawMap();
  drawPowerups();
  drawBombs();
  drawSplashes();
  drawActor(state.enemy, state.enemy.skin === "dao" ? "다오" : "배찌");
  drawActor(state.player, state.player.skin === "dao" ? "다오" : "배찌");
}

function freshState() {
  const map = Array.from({ length: ROWS }, () => Array(COLS).fill("floor"));
  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 0; x < COLS; x += 1) {
      const border = x === 0 || y === 0 || x === COLS - 1 || y === ROWS - 1;
      const pillar = x % 2 === 0 && y % 2 === 0;
      if (border || pillar) map[y][x] = "wall";
    }
  }

  const safe = new Set();
  const clearCorner = (sx, sy, hx, hy) => {
    for (let i = 0; i < 5; i += 1) {
      safe.add(`${sx + hx * i},${sy}`);
      safe.add(`${sx},${sy + hy * i}`);
    }
  };
  clearCorner(1, 1, 1, 1);
  clearCorner(13, 1, -1, 1);
  clearCorner(1, 11, 1, -1);
  clearCorner(13, 11, -1, -1);

  for (let y = 1; y < ROWS - 1; y += 1) {
    for (let x = 1; x < COLS - 1; x += 1) {
      if (map[y][x] === "floor" && !safe.has(`${x},${y}`) && Math.random() < 0.58) {
        map[y][x] = "crate";
      }
    }
  }

  const player = makeActor("player", 1, 1, colors.player, selectedSkin, "blue", true);
  const altSkin = selectedSkin === "dao" ? "bazzi" : "dao";
  const actors = selectedMode === "team"
    ? [
        player,
        makeActor("ally", 1, 11, "#32b7ff", altSkin, "blue", false),
        makeActor("enemy", 13, 11, colors.enemy, altSkin, "red", false),
        makeActor("enemy2", 13, 1, "#ff6b8a", selectedSkin, "red", false),
      ]
    : [
        player,
        makeActor("enemy", 13, 11, colors.enemy, altSkin, "red", false),
        makeActor("enemy2", 13, 1, "#ff6b8a", selectedSkin, "green", false),
        makeActor("enemy3", 1, 11, "#32b7ff", altSkin, "yellow", false),
      ];

  return {
    map,
    mode: selectedMode,
    running: false,
    ended: false,
    timer: 120,
    clock: 0,
    bombs: [],
    splashes: [],
    powerups: [],
    actors,
    player,
    enemy: actors.find((actor) => actor.id === "enemy"),
  };
}

function makeActor(id, x, y, color, skin, team = id, controlled = false) {
  const px = x * TILE + TILE / 2;
  const py = y * TILE + TILE / 2;
  return {
    id,
    team,
    controlled,
    x: px,
    y: py,
    spawnX: px,
    spawnY: py,
    dirX: 0,
    dirY: 1,
    facingX: skin === "bazzi" ? 1 : -1,
    speed: controlled ? BASE_SPEED : BASE_SPEED + 10,
    speedLevel: 1,
    color,
    bombs: 1,
    range: 2,
    shield: 0,
    shieldTime: 0,
    needles: 0,
    revives: 0,
    kick: false,
    bombCooldown: 0,
    trapped: 0,
    alive: true,
    skin,
    aiTimer: 0,
    stuckTime: 0,
    targetTile: null,
    lastDir: null,
    lastX: px,
    lastY: py,
  };
}

function update(dt) {
  state.clock += dt;
  state.timer = Math.max(0, 120 - Math.floor(state.clock));
  if (state.timer <= 0) finish("시간 종료", "무승부입니다. 다시 도전해보세요.");

  for (const actor of state.actors) {
    actor.bombCooldown = Math.max(0, actor.bombCooldown - dt);
    if (actor.shieldTime > 0) {
      actor.shieldTime = Math.max(0, actor.shieldTime - dt);
      if (actor.shieldTime <= 0) actor.shield = 0;
    }
  }

  movePlayer(dt);
  for (const actor of state.actors) {
    if (!actor.controlled) updateBot(actor, dt);
  }
  updateBombs(dt);
  updateSplashes(dt);
  updateTraps(dt);
  handleTouchInteractions();
  for (const actor of state.actors) collectPowerups(actor);
  updateActorMotions(dt);
  checkVictory();
  updateUi();
}

function movePlayer(dt) {
  const player = state.player;
  if (!player.alive) return;
  let dx = 0;
  let dy = 0;
  if (keys.has("arrowleft") || keys.has("a")) dx -= 1;
  if (keys.has("arrowright") || keys.has("d")) dx += 1;
  if (keys.has("arrowup") || keys.has("w")) dy -= 1;
  if (keys.has("arrowdown") || keys.has("s")) dy += 1;
  if (dx && dy) dx = 0;
  if (dx || dy) {
    player.dirX = dx;
    player.dirY = dy;
    if (dx !== 0) player.facingX = dx;
    moveActor(player, dx, dy, player.trapped > 0 ? dt * 0.32 : dt);
  } else if (player.trapped <= 0) {
    player.dirX = 0;
    player.dirY = 0;
  }
}

function updateBot(actor, dt) {
  if (!actor.alive || actor.trapped > 0) return;
  const target = nearestOpponent(actor);
  if (!target) return;

  actor.aiTimer = Math.max(0, actor.aiTimer - dt);
  const actorTile = tileOf(actor);
  const targetTile = tileOf(target);
  const danger = dangerCells();

  if (shouldBotBomb(actor, target) && hasEscapeAfterBomb(actor) && canDropBomb(actor)) {
    dropBomb(actor);
    actor.aiTimer = 0;
  }

  const moved = Math.hypot(actor.x - actor.lastX, actor.y - actor.lastY);
  actor.stuckTime = moved < 0.08 ? actor.stuckTime + dt : 0;
  actor.lastX = actor.x;
  actor.lastY = actor.y;

  if (!actor.targetTile || reachedTargetTile(actor) || danger.has(tileKey(actorTile)) || actor.stuckTime > 0.5) {
    const direction = chooseBotDirection(actor, targetTile, danger);
    actor.aiTimer = 0.08;
    actor.dirX = direction?.x || 0;
    actor.dirY = direction?.y || 0;
    actor.targetTile = direction ? { x: actorTile.x + direction.x, y: actorTile.y + direction.y } : null;
    if (direction) actor.lastDir = direction;
    if (actor.dirX !== 0) actor.facingX = actor.dirX;
  }

  moveEnemyTowardTarget(actor, dt);
}

function chooseBotDirection(actor, targetTile, danger) {
  const from = tileOf(actor);
  if (danger.has(tileKey(from))) return findEscapeStep(actor, danger) || chooseAnyOpenDirection(actor, new Set());

  const teammate = nearestTrappedTeammate(actor);
  if (teammate) {
    const step = findNextStep(actor, tileOf(teammate), danger);
    if (step) return step;
  }

  const crateNextToMe = adjacentCrateDirection(from);
  if (crateNextToMe && canDropBomb(actor) && hasEscapeAfterBomb(actor)) {
    dropBomb(actor);
    return findEscapeStep(actor, dangerCells()) || chooseAnyOpenDirection(actor, new Set());
  }

  const powerTarget = nearestReachablePowerup(actor, danger);
  if (powerTarget) {
    const step = findNextStep(actor, powerTarget, danger);
    if (step) return step;
  }

  const breakTarget = nearestBreakableCrateTarget(actor, danger);
  if (breakTarget) {
    if (breakTarget.atTarget && canDropBomb(actor) && hasEscapeAfterBomb(actor)) {
      dropBomb(actor);
      return findEscapeStep(actor, dangerCells()) || chooseAnyOpenDirection(actor, new Set());
    }
    const step = findNextStep(actor, breakTarget, danger);
    if (step) return step;
  }

  return findNextStep(actor, targetTile, danger) || chooseAnyOpenDirection(actor, danger);
}

function shouldBotBomb(actor, target) {
  if (actor.bombCooldown > 0 || !target || target.trapped > 0) return false;
  const from = tileOf(actor);
  const to = tileOf(target);
  const sameLine = from.x === to.x || from.y === to.y;
  return sameLine && distance(from, to) <= actor.range && clearLine(from, to);
}

function nearestOpponent(actor) {
  return state.actors
    .filter((other) => other.alive && other.team !== actor.team)
    .map((other) => ({ actor: other, dist: Math.hypot(other.x - actor.x, other.y - actor.y) }))
    .sort((a, b) => a.dist - b.dist)[0]?.actor || null;
}

function nearestTrappedTeammate(actor) {
  if (state.mode !== "team") return null;
  return state.actors
    .filter((other) => other !== actor && other.alive && other.team === actor.team && other.trapped > 0)
    .map((other) => ({ actor: other, dist: Math.hypot(other.x - actor.x, other.y - actor.y) }))
    .sort((a, b) => a.dist - b.dist)[0]?.actor || null;
}

function canDropBomb(actor) {
  const tile = tileOf(actor);
  const active = state.bombs.filter((bomb) => bomb.owner === actor).length;
  return actor.alive && actor.trapped <= 0 && actor.bombCooldown <= 0 && active < actor.bombs
    && !state.bombs.some((bomb) => bomb.tx === tile.x && bomb.ty === tile.y);
}

function maybePowerup(x, y) {
  if (Math.random() > 0.55) return;
  const roll = Math.random();
  state.powerups.push({
    x,
    y,
    type: roll < 0.26 ? "range" : roll < 0.46 ? "bomb" : roll < 0.62 ? "speed" : roll < 0.74 ? "shield" : roll < 0.86 ? "needle" : roll < 0.95 ? "kick" : "revive",
    bob: Math.random() * Math.PI * 2,
  });
}

function hitActor(actor, cells) {
  const tile = tileOf(actor);
  if (!actor.alive || actor.trapped > 0 || !cells.some((cell) => cell.x === tile.x && cell.y === tile.y)) return;
  if (actor.shield > 0) {
    actor.shield = 0;
    actor.shieldTime = 0;
    playSound("item");
    return;
  }
  actor.trapped = 4.5;
  actor.targetTile = null;
  playSound("trap");
}

function updateTraps(dt) {
  for (const actor of state.actors) {
    if (!actor.alive || actor.trapped <= 0) continue;
    if (actor.needles > 0) {
      actor.needles -= 1;
      actor.trapped = 0;
      playSound("item");
      continue;
    }
    actor.trapped -= dt;
    if (actor.trapped <= 0) {
      actor.alive = false;
      actor.targetTile = null;
      playSound("explode");
    }
  }
}

function collectPowerups(actor = state.player) {
  if (!actor.alive) return;
  const tile = tileOf(actor);
  state.powerups = state.powerups.filter((item) => {
    if (item.x !== tile.x || item.y !== tile.y) return true;
    if (item.type === "range") actor.range = Math.min(6, actor.range + 1);
    if (item.type === "bomb") actor.bombs = Math.min(5, actor.bombs + 1);
    if (item.type === "speed") {
      actor.speedLevel = Math.min(5, actor.speedLevel + 1);
      actor.speed = BASE_SPEED + (actor.speedLevel - 1) * SPEED_STEP + (actor.controlled ? 0 : 10);
    }
    if (item.type === "shield") {
      actor.shield = 1;
      actor.shieldTime = 9;
    }
    if (item.type === "needle") actor.needles = Math.min(3, actor.needles + 1);
    if (item.type === "kick") actor.kick = true;
    if (item.type === "revive") {
      actor.revives = Math.min(2, actor.revives + 1);
      reviveTeammate(actor);
    }
    playSound("item");
    return false;
  });
}

function reviveTeammate(actor) {
  if (state.mode !== "team" || actor.revives <= 0) return false;
  const teammate = state.actors.find((other) => other !== actor && other.team === actor.team && !other.alive);
  if (!teammate) return false;
  actor.revives -= 1;
  teammate.alive = true;
  teammate.trapped = 0;
  teammate.shield = 1;
  teammate.shieldTime = 4;
  teammate.x = teammate.spawnX;
  teammate.y = teammate.spawnY;
  teammate.targetTile = null;
  playSound("win");
  return true;
}

function handleTouchInteractions() {
  for (const actor of state.actors) {
    if (!actor.alive || actor.trapped > 0) continue;
    reviveTeammate(actor);

    for (const other of state.actors) {
      if (actor === other || !other.alive || other.trapped <= 0) continue;
      const touching = Math.hypot(actor.x - other.x, actor.y - other.y) < 30;
      if (!touching) continue;
      if (state.mode === "team" && actor.team === other.team) {
        other.trapped = 0;
        playSound("item");
      } else if (actor.controlled || actor.team !== other.team) {
        other.alive = false;
        other.trapped = 0;
        playSound("win");
      }
    }
  }
}

function checkVictory() {
  if (state.ended) return;
  if (!state.player.alive) {
    finish("패배", "팀이 모두 쓰러졌습니다.");
    return;
  }
  if (state.mode === "team") {
    const blueAlive = state.actors.some((actor) => actor.team === "blue" && actor.alive);
    const redAlive = state.actors.some((actor) => actor.team === "red" && actor.alive);
    if (!blueAlive) finish("패배", "우리 팀이 모두 쓰러졌습니다.");
    if (!redAlive) finish("승리", "상대 팀을 모두 물리쳤습니다.");
    return;
  }
  const opponentsAlive = state.actors.some((actor) => actor !== state.player && actor.alive);
  if (!opponentsAlive) finish("승리", "모든 상대를 물리쳤습니다.");
}

function drawPowerups() {
  for (const item of state.powerups) {
    item.bob += 0.045;
    const x = item.x * TILE + TILE / 2;
    const y = item.y * TILE + TILE / 2 + Math.sin(item.bob) * 3;
    const palette = {
      range: ["#ffde7a", "#fff6c7", "+"],
      bomb: ["#79e8aa", "#e8fff1", "B"],
      speed: ["#ff8fd1", "#fff0fa", "S"],
      shield: ["#8ec9ff", "#eef8ff", "O"],
      needle: ["#f7f7fb", "#ffffff", "N"],
      kick: ["#cda7ff", "#f8f0ff", "K"],
      revive: ["#ff9f8d", "#fff1ed", "R"],
    }[item.type];
    ctx.fillStyle = "rgba(127, 98, 180, 0.22)";
    roundRect(x - 14, y - 11, 30, 28, 8);
    ctx.fill();
    ctx.fillStyle = palette[0];
    roundRect(x - 15, y - 15, 30, 30, 8);
    ctx.fill();
    ctx.fillStyle = palette[1];
    roundRect(x - 9, y - 11, 18, 7, 5);
    ctx.fill();
    ctx.fillStyle = "#5d4d93";
    ctx.font = "bold 17px system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(palette[2], x, y + 2);
  }
}

function draw() {
  if (!state) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawMap();
  drawPowerups();
  drawBombs();
  drawSplashes();
  for (const actor of state.actors) {
    drawActor(actor, actor.skin === "dao" ? "다오" : "배찌");
  }
}

function finish(title, text) {
  if (state.ended) return;
  stopBgm();
  playSound(title === "승리" ? "win" : "trap");
  state.running = false;
  state.ended = true;
  ui.resultTitle.textContent = title;
  ui.resultText.textContent = text;
  ui.selectPanel.classList.add("hidden");
  ui.resultPanel.classList.remove("hidden");
  ui.overlay.classList.remove("hidden");
}

function selectCharacter(skin) {
  selectedSkin = skin;
  ui.cards.forEach((card) => {
    const selected = card.dataset.skin === skin;
    card.classList.toggle("selected", selected);
    card.setAttribute("aria-pressed", String(selected));
  });
  state = freshState();
  updateUi();
  draw();
}

function update(dt) {
  state.clock += dt;
  state.timer = Math.max(0, 120 - Math.floor(state.clock));
  if (state.timer <= 0) finish("시간 종료", "무승부입니다. 다시 도전해보세요.");
  state.player.bombCooldown = Math.max(0, state.player.bombCooldown - dt);
  state.enemy.bombCooldown = Math.max(0, state.enemy.bombCooldown - dt);

  movePlayer(dt);
  updateEnemy(dt);
  updateBombs(dt);
  updateSplashes(dt);
  updateTraps(dt);
  rescueTrappedOpponent();
  collectPowerups();
  collectPowerups(state.enemy);
  updateUi();
}

function updateEnemy(dt) {
  const enemy = state.enemy;
  if (!enemy.alive || enemy.trapped > 0) return;

  enemy.aiTimer = Math.max(0, (enemy.aiTimer || 0) - dt);
  const enemyTile = tileOf(enemy);
  const playerTile = tileOf(state.player);
  const danger = dangerCells();
  const inDanger = danger.has(tileKey(enemyTile));

  if (shouldEnemyBomb(enemyTile, playerTile) && hasEscapeAfterBomb(enemy) && canDropBomb(enemy)) {
    dropBomb(enemy);
    enemy.aiTimer = 0;
  }

  const movedSinceLastFrame = Math.hypot(enemy.x - (enemy.lastX || enemy.x), enemy.y - (enemy.lastY || enemy.y));
  enemy.stuckTime = movedSinceLastFrame < 0.08 ? (enemy.stuckTime || 0) + dt : 0;
  enemy.lastX = enemy.x;
  enemy.lastY = enemy.y;

  if (!enemy.targetTile || reachedTargetTile(enemy) || inDanger || enemy.stuckTime > 0.5) {
    const direction = chooseSmartEnemyDirection(enemy, danger);
    enemy.aiTimer = 0.08;
    enemy.dirX = direction?.x || 0;
    enemy.dirY = direction?.y || 0;
    enemy.targetTile = direction ? { x: enemyTile.x + direction.x, y: enemyTile.y + direction.y } : null;
    if (direction) enemy.lastDir = direction;
    if (enemy.dirX !== 0) enemy.facingX = enemy.dirX;
  }

  if (enemy.dirX === 0 && enemy.dirY === 0) {
    const fallback = chooseAnyOpenDirection(enemy, danger);
    if (fallback) {
      enemy.dirX = fallback.x;
      enemy.dirY = fallback.y;
      enemy.targetTile = { x: enemyTile.x + fallback.x, y: enemyTile.y + fallback.y };
      enemy.lastDir = fallback;
      if (enemy.dirX !== 0) enemy.facingX = enemy.dirX;
    }
  }

  moveEnemyTowardTarget(enemy, dt);
}

function moveEnemyTowardTarget(enemy, dt) {
  if (!enemy.targetTile) {
    enemy.dirX = 0;
    enemy.dirY = 0;
    return;
  }
  if (!canEnter(enemy.targetTile.x, enemy.targetTile.y, enemy)) {
    enemy.targetTile = null;
    return;
  }

  const targetX = enemy.targetTile.x * TILE + TILE / 2;
  const targetY = enemy.targetTile.y * TILE + TILE / 2;
  const dx = targetX - enemy.x;
  const dy = targetY - enemy.y;
  const dist = Math.hypot(dx, dy);
  const step = enemy.speed * dt * 0.98;

  if (dist <= step) {
    enemy.x = targetX;
    enemy.y = targetY;
    enemy.targetTile = null;
    enemy.dirX = 0;
    enemy.dirY = 0;
    return;
  }

  const moveX = Math.abs(dx) >= Math.abs(dy) ? Math.sign(dx) : 0;
  const moveY = moveX === 0 ? Math.sign(dy) : 0;
  if (moveX !== 0) enemy.facingX = moveX;
  enemy.dirX = moveX;
  enemy.dirY = moveY;
  enemy.x += moveX * step;
  enemy.y += moveY * step;
}

function reachedTargetTile(actor) {
  if (!actor.targetTile) return true;
  const targetX = actor.targetTile.x * TILE + TILE / 2;
  const targetY = actor.targetTile.y * TILE + TILE / 2;
  return Math.abs(actor.x - targetX) < 3 && Math.abs(actor.y - targetY) < 3;
}

function chooseSmartEnemyDirection(enemy, danger) {
  const from = tileOf(enemy);
  const playerTile = tileOf(state.player);

  if (danger.has(tileKey(from))) {
    return findEscapeStep(enemy, danger) || chooseAnyOpenDirection(enemy, new Set());
  }

  const crateNextToMe = adjacentCrateDirection(from);
  if (crateNextToMe && canDropBomb(enemy) && hasEscapeAfterBomb(enemy)) {
    dropBomb(enemy);
    return findEscapeStep(enemy, dangerCells()) || chooseAnyOpenDirection(enemy, new Set());
  }

  const powerTarget = nearestReachablePowerup(enemy, danger);
  if (powerTarget) {
    const step = findNextStep(enemy, powerTarget, danger);
    if (step) return step;
  }

  const breakTarget = nearestBreakableCrateTarget(enemy, danger);
  if (breakTarget) {
    if (breakTarget.atTarget && canDropBomb(enemy) && hasEscapeAfterBomb(enemy)) {
      dropBomb(enemy);
      return findEscapeStep(enemy, dangerCells()) || chooseAnyOpenDirection(enemy, new Set());
    }
    const step = findNextStep(enemy, breakTarget, danger);
    if (step) return step;
  }

  const chaseStep = findNextStep(enemy, playerTile, danger);
  if (chaseStep) return chaseStep;

  return chooseAnyOpenDirection(enemy, danger);
}

function nearestReachablePowerup(actor, danger) {
  const from = tileOf(actor);
  return state.powerups
    .map((item) => ({ x: item.x, y: item.y, dist: distance(from, item) }))
    .filter((item) => item.dist <= 10 && findNextStep(actor, item, danger))
    .sort((a, b) => a.dist - b.dist)[0] || null;
}

function nearestBreakableCrateTarget(actor, danger) {
  const from = tileOf(actor);
  const reachable = reachableTiles(actor, danger);
  const options = [];

  for (const tile of reachable) {
    for (const dir of DIRS) {
      if (state.map[tile.y + dir.y]?.[tile.x + dir.x] === "crate") {
        options.push({ ...tile, dist: distance(from, tile), atTarget: tile.x === from.x && tile.y === from.y });
        break;
      }
    }
  }

  return options.sort((a, b) => a.dist - b.dist)[0] || null;
}

function reachableTiles(actor, danger) {
  const start = tileOf(actor);
  const queue = [start];
  const seen = new Set([tileKey(start)]);
  const tiles = [start];

  while (queue.length) {
    const current = queue.shift();
    for (const dir of DIRS) {
      const next = { x: current.x + dir.x, y: current.y + dir.y };
      const key = tileKey(next);
      if (seen.has(key) || danger.has(key) || !canEnter(next.x, next.y, actor)) continue;
      seen.add(key);
      queue.push(next);
      tiles.push(next);
    }
  }

  return tiles;
}

function chooseAnyOpenDirection(actor, danger) {
  const from = tileOf(actor);
  const playerTile = tileOf(state.player);
  const options = DIRS
    .map((dir) => ({ dir, tile: { x: from.x + dir.x, y: from.y + dir.y } }))
    .filter((step) => canEnter(step.tile.x, step.tile.y, actor))
    .filter((step) => !danger.has(tileKey(step.tile)))
    .sort((a, b) => distance(a.tile, playerTile) - distance(b.tile, playerTile));
  const nonReverse = options.find((step) => !isReverse(step.dir, actor.lastDir));
  return nonReverse?.dir || options[0]?.dir || null;
}

function findEscapeStep(actor, danger) {
  const start = tileOf(actor);
  const queue = [{ tile: start, first: null, depth: 0 }];
  const seen = new Set([tileKey(start)]);

  while (queue.length) {
    const current = queue.shift();
    if (current.depth > 0 && !danger.has(tileKey(current.tile))) return current.first;
    if (current.depth >= actor.range + 5) continue;

    for (const dir of DIRS) {
      const next = { x: current.tile.x + dir.x, y: current.tile.y + dir.y };
      const key = tileKey(next);
      if (seen.has(key) || !canEnter(next.x, next.y, actor)) continue;
      seen.add(key);
      queue.push({ tile: next, first: current.first || dir, depth: current.depth + 1 });
    }
  }

  return null;
}

function isReverse(dir, previous) {
  return previous && dir.x === -previous.x && dir.y === -previous.y;
}

function rescueTrappedOpponent() {
  const player = state.player;
  const enemy = state.enemy;
  if (!player.alive || enemy.trapped <= 0 || !enemy.alive) return;
  const touching = Math.hypot(player.x - enemy.x, player.y - enemy.y) < 30;
  if (touching) {
    enemy.alive = false;
    playSound("win");
    finish("승리", "갇힌 상대를 터트렸습니다.");
  }
}

function updateTraps(dt) {
  for (const actor of [state.player, state.enemy]) {
    if (actor.trapped > 0) {
      actor.trapped -= dt;
      if (actor.trapped <= 0) {
        actor.alive = false;
        if (actor === state.player) finish("패배", "물방울에서 빠져나오지 못했습니다.");
        else finish("승리", "상대를 물방울에 가뒀습니다.");
      }
    }
  }
}

function finish(title, text) {
  if (state.ended) return;
  playSound(title === "승리" ? "win" : "trap");
  state.running = false;
  state.ended = true;
  ui.resultTitle.textContent = title;
  ui.resultText.textContent = text;
  ui.selectPanel.classList.add("hidden");
  ui.resultPanel.classList.remove("hidden");
  ui.overlay.classList.remove("hidden");
}

function draw() {
  if (!state) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawMap();
  drawPowerups();
  drawBombs();
  drawSplashes();
  drawActor(state.enemy, state.enemy.skin === "dao" ? "다오" : "배찌");
  drawActor(state.player, state.player.skin === "dao" ? "다오" : "배찌");
}

function update(dt) {
  state.clock += dt;
  state.timer = Math.max(0, 120 - Math.floor(state.clock));
  if (state.timer <= 0) finish("시간 종료", "무승부입니다. 다시 도전해보세요.");
  for (const actor of state.actors) {
    actor.bombCooldown = Math.max(0, actor.bombCooldown - dt);
    if (actor.shieldTime > 0) {
      actor.shieldTime = Math.max(0, actor.shieldTime - dt);
      if (actor.shieldTime <= 0) actor.shield = 0;
    }
  }
  movePlayer(dt);
  for (const actor of state.actors) if (!actor.controlled) updateBot(actor, dt);
  updateBombs(dt);
  updateSplashes(dt);
  updateTraps(dt);
  handleTouchInteractions();
  for (const actor of state.actors) collectPowerups(actor);
  updateActorMotions(dt);
  checkVictory();
  updateUi();
}

function movePlayer(dt) {
  const player = state.player;
  if (!player.alive) return;
  let dx = 0;
  let dy = 0;
  if (keys.has("arrowleft") || keys.has("a")) dx -= 1;
  if (keys.has("arrowright") || keys.has("d")) dx += 1;
  if (keys.has("arrowup") || keys.has("w")) dy -= 1;
  if (keys.has("arrowdown") || keys.has("s")) dy += 1;
  if (dx && dy) dx = 0;
  if (dx || dy) {
    player.dirX = dx;
    player.dirY = dy;
    if (dx !== 0) player.facingX = dx;
    moveActor(player, dx, dy, player.trapped > 0 ? dt * 0.32 : dt);
  }
}

function updateBot(actor, dt) {
  if (!actor.alive || actor.trapped > 0) return;
  const target = nearestOpponent(actor);
  if (!target) return;
  const actorTile = tileOf(actor);
  const danger = dangerCells();
  if (shouldBotBomb(actor, target) && hasEscapeAfterBomb(actor) && canDropBomb(actor)) dropBomb(actor);
  const moved = Math.hypot(actor.x - actor.lastX, actor.y - actor.lastY);
  actor.stuckTime = moved < 0.08 ? actor.stuckTime + dt : 0;
  actor.lastX = actor.x;
  actor.lastY = actor.y;
  if (!actor.targetTile || reachedTargetTile(actor) || danger.has(tileKey(actorTile)) || actor.stuckTime > 0.5) {
    const direction = chooseBotDirection(actor, tileOf(target), danger);
    actor.dirX = direction?.x || 0;
    actor.dirY = direction?.y || 0;
    actor.targetTile = direction ? { x: actorTile.x + direction.x, y: actorTile.y + direction.y } : null;
    if (direction) actor.lastDir = direction;
    if (actor.dirX !== 0) actor.facingX = actor.dirX;
  }
  moveEnemyTowardTarget(actor, dt);
}

function chooseBotDirection(actor, targetTile, danger) {
  const from = tileOf(actor);
  if (danger.has(tileKey(from))) return findEscapeStep(actor, danger) || chooseAnyOpenDirection(actor, new Set());
  const teammate = nearestTrappedTeammate(actor);
  if (teammate) {
    const step = findNextStep(actor, tileOf(teammate), danger);
    if (step) return step;
  }
  const crateNextToMe = adjacentCrateDirection(from);
  if (crateNextToMe && canDropBomb(actor) && hasEscapeAfterBomb(actor)) {
    dropBomb(actor);
    return findEscapeStep(actor, dangerCells()) || chooseAnyOpenDirection(actor, new Set());
  }
  const powerTarget = nearestReachablePowerup(actor, danger);
  if (powerTarget) {
    const step = findNextStep(actor, powerTarget, danger);
    if (step) return step;
  }
  const breakTarget = nearestBreakableCrateTarget(actor, danger);
  if (breakTarget) {
    if (breakTarget.atTarget && canDropBomb(actor) && hasEscapeAfterBomb(actor)) {
      dropBomb(actor);
      return findEscapeStep(actor, dangerCells()) || chooseAnyOpenDirection(actor, new Set());
    }
    const step = findNextStep(actor, breakTarget, danger);
    if (step) return step;
  }
  return findNextStep(actor, targetTile, danger) || chooseAnyOpenDirection(actor, danger);
}

function shouldBotBomb(actor, target) {
  if (actor.bombCooldown > 0 || !target || target.trapped > 0) return false;
  const from = tileOf(actor);
  const to = tileOf(target);
  const sameLine = from.x === to.x || from.y === to.y;
  return sameLine && distance(from, to) <= actor.range && clearLine(from, to);
}

function nearestOpponent(actor) {
  return state.actors
    .filter((other) => other.alive && other.team !== actor.team)
    .map((other) => ({ actor: other, dist: Math.hypot(other.x - actor.x, other.y - actor.y) }))
    .sort((a, b) => a.dist - b.dist)[0]?.actor || null;
}

function nearestTrappedTeammate(actor) {
  if (state.mode !== "team") return null;
  return state.actors
    .filter((other) => other !== actor && other.alive && other.team === actor.team && other.trapped > 0)
    .map((other) => ({ actor: other, dist: Math.hypot(other.x - actor.x, other.y - actor.y) }))
    .sort((a, b) => a.dist - b.dist)[0]?.actor || null;
}

function canDropBomb(actor) {
  const tile = tileOf(actor);
  const active = state.bombs.filter((bomb) => bomb.owner === actor).length;
  return actor.alive && actor.trapped <= 0 && actor.bombCooldown <= 0 && active < actor.bombs
    && !state.bombs.some((bomb) => bomb.tx === tile.x && bomb.ty === tile.y);
}

function maybePowerup(x, y) {
  if (Math.random() > 0.55) return;
  const roll = Math.random();
  state.powerups.push({
    x,
    y,
    type: roll < 0.26 ? "range" : roll < 0.46 ? "bomb" : roll < 0.62 ? "speed" : roll < 0.74 ? "shield" : roll < 0.86 ? "needle" : roll < 0.95 ? "kick" : "revive",
    bob: Math.random() * Math.PI * 2,
  });
}

function explode(bomb) {
  const cells = [{ x: bomb.tx, y: bomb.ty }];
  for (const dir of DIRS) {
    for (let i = 1; i <= bomb.range; i += 1) {
      const x = bomb.tx + dir.x * i;
      const y = bomb.ty + dir.y * i;
      const cell = state.map[y]?.[x];
      if (!cell || cell === "wall") break;
      cells.push({ x, y });
      if (cell === "crate") {
        state.map[y][x] = "floor";
        maybePowerup(x, y);
        break;
      }
    }
  }
  state.splashes.push({ cells, life: 0.56, max: 0.56 });
  playSound("explode");
  for (const other of state.bombs) if (cells.some((cell) => cell.x === other.tx && cell.y === other.ty)) other.timer = 0;
  for (const actor of state.actors) hitActor(actor, cells);
}

function hitActor(actor, cells) {
  const tile = tileOf(actor);
  if (!actor.alive || actor.trapped > 0 || !cells.some((cell) => cell.x === tile.x && cell.y === tile.y)) return;
  if (actor.shield > 0) {
    actor.shield = 0;
    actor.shieldTime = 0;
    playSound("item");
    return;
  }
  actor.trapped = 4.5;
  actor.targetTile = null;
  playSound("trap");
}

function updateTraps(dt) {
  for (const actor of state.actors) {
    if (!actor.alive || actor.trapped <= 0) continue;
    actor.trapped -= dt;
    if (actor.trapped <= 0) {
      actor.alive = false;
      actor.targetTile = null;
      playSound("explode");
    }
  }
}

function useNeedle(actor) {
  if (!actor || actor.trapped <= 0 || actor.needles <= 0) return false;
  actor.needles -= 1;
  actor.trapped = 0;
  playSound("item");
  return true;
}

function collectPowerups(actor = state.player) {
  if (!actor.alive) return;
  const tile = tileOf(actor);
  state.powerups = state.powerups.filter((item) => {
    if (item.x !== tile.x || item.y !== tile.y) return true;
    if (item.type === "range") actor.range = Math.min(6, actor.range + 1);
    if (item.type === "bomb") actor.bombs = Math.min(5, actor.bombs + 1);
    if (item.type === "speed") {
      actor.speedLevel = Math.min(5, actor.speedLevel + 1);
      actor.speed = BASE_SPEED + (actor.speedLevel - 1) * SPEED_STEP + (actor.controlled ? 0 : 10);
    }
    if (item.type === "shield") {
      actor.shield = 1;
      actor.shieldTime = 9;
    }
    if (item.type === "needle") actor.needles = Math.min(3, actor.needles + 1);
    if (item.type === "kick") actor.kick = true;
    if (item.type === "revive") {
      actor.revives = Math.min(2, actor.revives + 1);
      reviveTeammate(actor);
    }
    playSound("item");
    return false;
  });
}

function reviveTeammate(actor) {
  if (state.mode !== "team" || actor.revives <= 0) return false;
  const teammate = state.actors.find((other) => other !== actor && other.team === actor.team && !other.alive);
  if (!teammate) return false;
  actor.revives -= 1;
  teammate.alive = true;
  teammate.trapped = 0;
  teammate.shield = 1;
  teammate.shieldTime = 4;
  teammate.x = teammate.spawnX;
  teammate.y = teammate.spawnY;
  teammate.targetTile = null;
  playSound("win");
  return true;
}

function handleTouchInteractions() {
  for (const actor of state.actors) {
    if (!actor.alive || actor.trapped > 0) continue;
    reviveTeammate(actor);
    for (const other of state.actors) {
      if (actor === other || !other.alive || other.trapped <= 0) continue;
      const touching = Math.hypot(actor.x - other.x, actor.y - other.y) < 30;
      if (!touching) continue;
      if (state.mode === "team" && actor.team === other.team) {
        other.trapped = 0;
        playSound("item");
      } else if (actor.team !== other.team) {
        other.alive = false;
        other.trapped = 0;
        playSound("win");
      }
    }
  }
}

function checkVictory() {
  if (state.ended) return;
  if (state.mode === "team") {
    const blueAlive = state.actors.some((actor) => actor.team === "blue" && actor.alive);
    const redAlive = state.actors.some((actor) => actor.team === "red" && actor.alive);
    if (!blueAlive) finish("패배", "우리 팀이 모두 쓰러졌습니다.");
    if (!redAlive) finish("승리", "상대 팀을 모두 물리쳤습니다.");
    return;
  }
  if (!state.player.alive) finish("패배", "물방울에서 빠져나오지 못했습니다.");
  if (!state.actors.some((actor) => actor !== state.player && actor.alive)) finish("승리", "모든 상대를 물리쳤습니다.");
}

function drawPowerups() {
  for (const item of state.powerups) {
    item.bob += 0.045;
    const x = item.x * TILE + TILE / 2;
    const y = item.y * TILE + TILE / 2 + Math.sin(item.bob) * 3;
    const palette = {
      range: ["#ffde7a", "#fff6c7", "+"],
      bomb: ["#79e8aa", "#e8fff1", "B"],
      speed: ["#ff8fd1", "#fff0fa", "S"],
      shield: ["#8ec9ff", "#eef8ff", "O"],
      needle: ["#f7f7fb", "#ffffff", "N"],
      kick: ["#cda7ff", "#f8f0ff", "K"],
      revive: ["#ff9f8d", "#fff1ed", "R"],
    }[item.type];
    ctx.fillStyle = "rgba(127, 98, 180, 0.22)";
    roundRect(x - 14, y - 11, 30, 28, 8);
    ctx.fill();
    ctx.fillStyle = palette[0];
    roundRect(x - 15, y - 15, 30, 30, 8);
    ctx.fill();
    ctx.fillStyle = palette[1];
    roundRect(x - 9, y - 11, 18, 7, 5);
    ctx.fill();
    ctx.fillStyle = "#5d4d93";
    ctx.font = "bold 17px system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(palette[2], x, y + 2);
  }
}

function draw() {
  if (!state) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawMap();
  drawPowerups();
  drawBombs();
  drawSplashes();
  for (const actor of state.actors) drawActor(actor, actor.skin === "dao" ? "다오" : "배찌");
}

function finish(title, text) {
  if (state.ended) return;
  playSound(title === "승리" ? "win" : "trap");
  state.running = false;
  state.ended = true;
  ui.resultTitle.textContent = title;
  ui.resultText.textContent = text;
  ui.selectPanel.classList.add("hidden");
  ui.resultPanel.classList.remove("hidden");
  ui.overlay.classList.remove("hidden");
}

function selectMode(mode) {
  selectedMode = mode;
  ui.modes.forEach((button) => {
    const selected = button.dataset.mode === mode;
    button.classList.toggle("selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
  state = freshState();
  updateUi();
  draw();
}

function draw() {
  if (!state) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawMap();
  drawPowerups();
  drawBombs();
  drawSplashes();
  for (const actor of state.actors) drawActor(actor, actor.skin === "dao" ? "다오" : "배찌");
}

function finish(title, text) {
  if (state.ended) return;
  stopBgm();
  playSound(title === "승리" ? "win" : "trap");
  state.running = false;
  state.ended = true;
  ui.resultTitle.textContent = title;
  ui.resultText.textContent = text;
  ui.selectPanel.classList.add("hidden");
  ui.resultPanel.classList.remove("hidden");
  ui.overlay.classList.remove("hidden");
}

function reviveTeammate(actor) {
  if (state.mode !== "team" || actor.revives <= 0) return false;
  const teammate = state.actors.find((other) =>
    other !== actor && other.team === actor.team && !other.alive && !other.controlled
  );
  if (!teammate) return false;
  actor.revives -= 1;
  teammate.alive = true;
  teammate.trapped = 0;
  teammate.shield = 1;
  teammate.shieldTime = 4;
  teammate.x = teammate.spawnX;
  teammate.y = teammate.spawnY;
  teammate.targetTile = null;
  playSound("win");
  return true;
}

function checkVictory() {
  if (state.ended) return;
  if (!state.player.alive) {
    finish("패배", "물방울에서 빠져나오지 못했습니다.");
    return;
  }
  if (state.mode === "team") {
    const redAlive = state.actors.some((actor) => actor.team === "red" && actor.alive);
    if (!redAlive) finish("승리", "상대 팀을 모두 물리쳤습니다.");
    return;
  }
  if (!state.actors.some((actor) => actor !== state.player && actor.alive)) {
    finish("승리", "모든 상대를 물리쳤습니다.");
  }
}

function draw() {
  if (!state) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawMap();
  drawPowerups();
  drawBombs();
  drawSplashes();
  for (const actor of state.actors) drawActor(actor, actor.skin === "dao" ? "다오" : "배찌");
}

function finish(title, text) {
  if (state.ended) return;
  stopBgm();
  playSound(title === "승리" ? "win" : "trap");
  state.running = false;
  state.ended = true;
  ui.resultTitle.textContent = title;
  ui.resultText.textContent = text;
  ui.selectPanel.classList.add("hidden");
  ui.resultPanel.classList.remove("hidden");
  ui.overlay.classList.remove("hidden");
}

function drawActor(actor, label) {
  if (!actor.alive) return;
  const image = actor.skin === "dao" ? assets.dao : assets.bazzi;
  const crop = actorCrop(actor);
  const drawHeight = actor.skin === "dao" ? 58 : 60;
  const drawWidth = drawHeight * (crop.w / crop.h);
  const flipX = actor.skin === "bazzi" ? actor.facingX : -actor.facingX;

  ctx.fillStyle = "rgba(75, 60, 130, 0.23)";
  ctx.beginPath();
  ctx.ellipse(actor.x, actor.y + 17, 17, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  drawTeamMarker(actor, actor.y - drawHeight - 6);

  if (image.complete && image.naturalWidth > 0) {
    const sprite = getCutoutSprite(actor.skin, image, crop);
    ctx.imageSmoothingEnabled = false;
    ctx.save();
    ctx.translate(actor.x, actor.y);
    ctx.scale(flipX, 1);
    if (sprite) {
      ctx.drawImage(sprite, -drawWidth / 2, -drawHeight + 18, drawWidth, drawHeight);
    } else {
      ctx.drawImage(image, crop.x, crop.y, crop.w, crop.h, -drawWidth / 2, -drawHeight + 18, drawWidth, drawHeight);
    }
    ctx.restore();
    ctx.imageSmoothingEnabled = true;
  } else {
    ctx.fillStyle = actor.color;
    ctx.beginPath();
    ctx.arc(actor.x, actor.y - 2, 17, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = "#4c477c";
  ctx.font = "bold 10px system-ui";
  ctx.textAlign = "center";
  ctx.fillText(label, actor.x, actor.y - drawHeight - 12);

  if (actor.shield > 0) {
    ctx.strokeStyle = "rgba(108, 190, 255, 0.78)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(actor.x, actor.y - 4, 24, 0, Math.PI * 2);
    ctx.stroke();
  }

  if (actor.kick) {
    ctx.fillStyle = "rgba(93, 77, 147, 0.82)";
    ctx.font = "bold 9px system-ui";
    ctx.fillText("K", actor.x + 18, actor.y + 18);
  }

  if (actor.trapped > 0) {
    ctx.globalAlpha = 0.72;
    ctx.fillStyle = "#7eeaff";
    ctx.beginPath();
    ctx.arc(actor.x, actor.y - 2, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

function actorCrop(actor) {
  return actor.skin === "dao"
    ? { x: 455, y: 175, w: 650, h: 600 }
    : { x: 450, y: 120, w: 650, h: 745 };
}

function updateUi() {
  ui.time.textContent = state.timer;
  ui.bombs.textContent = state.player.bombs;
  ui.range.textContent = state.player.range;
  if (ui.speed) ui.speed.textContent = state.player.speedLevel;
  if (!ui.itemHud) return;

  const player = state.player;
  const chips = [
    ["B", "물풍선", player.bombs, true],
    ["+", "물줄기", player.range, true],
    ["S", "속도", player.speedLevel, true],
    ["O", "보호막", player.shield > 0 ? `${Math.ceil(player.shieldTime)}초` : "-", player.shield > 0],
    ["N", "바늘", player.needles || 0, (player.needles || 0) > 0],
    ["K", "킥", player.kick ? "ON" : "-", player.kick],
    ["R", "부활", player.revives || 0, (player.revives || 0) > 0],
  ];
  ui.itemHud.innerHTML = chips
    .map(([icon, label, value, active]) =>
      `<span class="item-chip${active ? "" : " empty"}"><b>${icon}</b><span><small>${label}</small>${value}</span></span>`
    )
    .join("");
}

function toggleItemGuide(show) {
  ui.itemGuide.classList.toggle("hidden", !show);
}

function moveActor(actor, dx, dy, dt) {
  const step = actor.speed * dt;
  tryMove(actor, dx * step, 0);
  tryMove(actor, 0, dy * step);
}

function movePlayer(dt) {
  const player = state.player;
  if (!player.alive) return;
  let dx = 0;
  let dy = 0;
  if (keys.has("arrowleft") || keys.has("a")) dx -= 1;
  if (keys.has("arrowright") || keys.has("d")) dx += 1;
  if (keys.has("arrowup") || keys.has("w")) dy -= 1;
  if (keys.has("arrowdown") || keys.has("s")) dy += 1;
  if (dx && dy) dx = 0;

  if (dx || dy) {
    player.dirX = dx;
    player.dirY = dy;
    if (dx !== 0) player.facingX = dx;
    moveActor(player, dx, dy, player.trapped > 0 ? dt * 0.32 : dt);
  } else {
    player.dirX = 0;
    player.dirY = 0;
  }
}

function dropBomb(actor) {
  if (!canDropBomb(actor)) return;
  const tile = tileOf(actor);
  state.bombs.push({
    tx: tile.x,
    ty: tile.y,
    timer: 2.3,
    range: actor.range,
    owner: actor,
    passers: new Set([actor.id]),
    pulse: Math.random() * 10,
  });
  actor.bombCooldown = actor.controlled ? 0.18 : 0.95;
  playSound("bomb");
}

function updateBombs(dt) {
  for (const bomb of state.bombs) {
    bomb.timer -= dt;
    for (const actor of state.actors) {
      if (bomb.passers.has(actor.id) && !actorOverlapsTile(actor, bomb.tx, bomb.ty)) {
        bomb.passers.delete(actor.id);
      }
    }
  }
  const exploding = state.bombs.filter((bomb) => bomb.timer <= 0);
  state.bombs = state.bombs.filter((bomb) => bomb.timer > 0);
  exploding.forEach(explode);
}

function update(dt) {
  state.clock += dt;
  state.timer = Math.max(0, 120 - Math.floor(state.clock));
  if (state.timer <= 0) finish("시간 종료", "무승부입니다. 다시 도전해보세요.");

  for (const actor of state.actors) {
    actor.bombCooldown = Math.max(0, actor.bombCooldown - dt);
    actor.reviveEffect = Math.max(0, (actor.reviveEffect || 0) - dt);
    actor.shieldBlockEffect = Math.max(0, (actor.shieldBlockEffect || 0) - dt);
    actor.shieldBlockGrace = Math.max(0, (actor.shieldBlockGrace || 0) - dt);
    if (actor.shieldTime > 0) {
      actor.shieldTime = Math.max(0, actor.shieldTime - dt);
      if (actor.shieldTime <= 0) actor.shield = 0;
    }
  }

  movePlayer(dt);
  for (const actor of state.actors) {
    if (!actor.controlled) updateBot(actor, dt);
  }
  updateBombs(dt);
  updateSplashes(dt);
  updateTraps(dt);
  handleTouchInteractions();
  for (const actor of state.actors) collectPowerups(actor);
  updateActorMotions(dt);
  checkVictory();
  updateUi();
}

function actorTouchesCells(actor, cells) {
  const covered = new Set(cells.map(tileKey));
  const probes = [
    [actor.x, actor.y],
    [actor.x - ACTOR_RADIUS * 0.85, actor.y],
    [actor.x + ACTOR_RADIUS * 0.85, actor.y],
    [actor.x, actor.y - ACTOR_RADIUS * 0.85],
    [actor.x, actor.y + ACTOR_RADIUS * 0.85],
  ];
  return probes.some(([x, y]) => covered.has(`${Math.floor(x / TILE)},${Math.floor(y / TILE)}`));
}

function hitActor(actor, cells) {
  if (!actor.alive || actor.trapped > 0 || !actorTouchesCells(actor, cells)) return;
  if ((actor.shieldBlockGrace || 0) > 0) return;
  if (actor.shield > 0 && actor.shieldTime > 0) {
    actor.shield = 0;
    actor.shieldTime = 0;
    actor.shieldBlockGrace = 0.7;
    actor.shieldBlockEffect = 0.75;
    playSound("item");
    return;
  }
  actor.trapped = 4.5;
  actor.targetTile = null;
  actor.walking = false;
  playSound("trap");
}

function reviveActor(actor, consumeStock = true) {
  if (consumeStock && (actor.revives || 0) <= 0) return false;
  if (consumeStock) actor.revives -= 1;
  actor.alive = true;
  actor.trapped = 0;
  actor.shield = 1;
  actor.shieldTime = 3.5;
  actor.shieldBlockGrace = 0.5;
  actor.reviveEffect = 1.15;
  actor.x = actor.spawnX;
  actor.y = actor.spawnY;
  actor.dirX = 0;
  actor.dirY = 1;
  actor.walking = false;
  actor.targetTile = null;
  playSound("win");
  return true;
}

function updateTraps(dt) {
  for (const actor of state.actors) {
    if (!actor.alive || actor.trapped <= 0) continue;
    actor.trapped -= dt;
    if (actor.trapped > 0) continue;
    if (reviveActor(actor, true)) continue;
    actor.alive = false;
    actor.trapped = 0;
    actor.targetTile = null;
    actor.walking = false;
    playSound("explode");
  }
}

function reviveTeammate(actor) {
  if (state.mode !== "team" || (actor.revives || 0) <= 0) return false;
  const teammate = state.actors.find((other) => other !== actor && other.team === actor.team && !other.alive);
  if (!teammate) return false;
  actor.revives -= 1;
  reviveActor(teammate, false);
  return true;
}

function checkVictory() {
  if (state.ended) return;
  if (!state.player.alive) {
    finish("패배", "부활 아이템이 없어 물방울에서 빠져나오지 못했습니다.");
    return;
  }
  if (state.mode === "team") {
    const blueAlive = state.actors.some((actor) => actor.team === "blue" && actor.alive);
    const redAlive = state.actors.some((actor) => actor.team === "red" && actor.alive);
    if (!blueAlive) finish("패배", "우리 팀이 모두 쓰러졌습니다.");
    if (!redAlive) finish("승리", "상대 팀을 모두 물리쳤습니다.");
    return;
  }
  if (!state.actors.some((actor) => actor !== state.player && actor.alive)) {
    finish("승리", "모든 상대를 물리쳤습니다.");
  }
}

function updateActorMotions(dt) {
  for (const actor of state.actors) {
    if (!actor.alive || actor.trapped > 0) {
      actor.walking = false;
      actor.walkPhase = 0;
      actor.motionX = actor.x;
      actor.motionY = actor.y;
      continue;
    }

    if (actor.motionX === undefined || actor.motionY === undefined) {
      actor.motionX = actor.x;
      actor.motionY = actor.y;
      actor.walking = false;
      actor.walkPhase = 0;
      continue;
    }

    const moved = Math.hypot(actor.x - actor.motionX, actor.y - actor.motionY);
    actor.motionX = actor.x;
    actor.motionY = actor.y;
    actor.walking = moved > 0.18;
    actor.walkPhase = actor.walking ? (actor.walkPhase || 0) + dt * 4.4 : 0;
  }
}

function drawActor(actor, label) {
  if (!actor.alive) return;
  const image = actor.skin === "dao" ? assets.dao : assets.bazzi;
  const crop = actorCrop(actor);
  const drawHeight = actor.skin === "dao" ? 52 : 54;
  const drawWidth = drawHeight * (crop.w / crop.h);
  const flipX = actor.skin === "bazzi" ? actor.facingX : -actor.facingX;
  const phase = (actor.walkPhase || 0) * Math.PI * 2;
  const walk = actor.walking ? Math.sin(phase) : 0;
  const step = actor.walking ? Math.cos(phase * 2) : 0;
  const bob = actor.walking ? step * 1.4 - 1.4 : 0;
  const sway = actor.walking ? walk * 1.15 : 0;
  const tilt = actor.walking ? walk * 0.07 : 0;
  const stretchY = actor.walking ? 1 + Math.max(0, -step) * 0.025 : 1;
  const stretchX = actor.walking ? 1 - Math.max(0, -step) * 0.015 : 1;

  ctx.fillStyle = "rgba(75, 60, 130, 0.23)";
  ctx.beginPath();
  ctx.ellipse(actor.x, actor.y + 16, actor.walking ? 16 : 15, actor.walking ? 5.5 : 6.5, 0, 0, Math.PI * 2);
  ctx.fill();
  drawTeamMarker(actor, actor.y - drawHeight - 6 + bob);

  if ((actor.reviveEffect || 0) > 0) {
    const alpha = actor.reviveEffect / 1.15;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = "#ff8a72";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(actor.x, actor.y - 5, 32 + (1 - alpha) * 34, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = "#ffd35a";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(actor.x, actor.y - 5, 18 + (1 - alpha) * 24, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  if (image.complete && image.naturalWidth > 0) {
    const sprite = getCutoutSprite(actor.skin, image, crop);
    ctx.imageSmoothingEnabled = false;
    ctx.save();
    ctx.translate(actor.x + sway, actor.y + bob);
    ctx.rotate(tilt);
    ctx.scale(flipX * stretchX, stretchY);
    if (sprite) {
      ctx.drawImage(sprite, -drawWidth / 2, -drawHeight + 18, drawWidth, drawHeight);
    } else {
      ctx.drawImage(image, crop.x, crop.y, crop.w, crop.h, -drawWidth / 2, -drawHeight + 18, drawWidth, drawHeight);
    }
    ctx.restore();
    ctx.imageSmoothingEnabled = true;
  } else {
    ctx.fillStyle = actor.color;
    ctx.beginPath();
    ctx.arc(actor.x, actor.y - 2 + bob, 17, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = "#4c477c";
  ctx.font = "bold 10px system-ui";
  ctx.textAlign = "center";
  ctx.fillText(label, actor.x, actor.y - drawHeight - 12 + bob);

  if ((actor.revives || 0) > 0) {
    ctx.fillStyle = "#ff6b6b";
    ctx.beginPath();
    ctx.arc(actor.x + 20, actor.y - drawHeight + 8 + bob, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "bold 9px system-ui";
    ctx.fillText("R", actor.x + 20, actor.y - drawHeight + 11 + bob);
  }

  if (actor.shield > 0 || (actor.shieldBlockEffect || 0) > 0) {
    const blockAlpha = actor.shield > 0 ? 0.78 : Math.max(0.15, actor.shieldBlockEffect / 0.75);
    ctx.strokeStyle = `rgba(108, 190, 255, ${blockAlpha})`;
    ctx.lineWidth = actor.shield > 0 ? 3 : 5;
    ctx.beginPath();
    ctx.arc(actor.x, actor.y - 4 + bob, actor.shield > 0 ? 24 : 30, 0, Math.PI * 2);
    ctx.stroke();
  }

  if (actor.kick) {
    ctx.fillStyle = "rgba(93, 77, 147, 0.82)";
    ctx.font = "bold 9px system-ui";
    ctx.fillText("K", actor.x + 18, actor.y + 18);
  }

  if (actor.trapped > 0) {
    ctx.globalAlpha = 0.72;
    ctx.fillStyle = "#7eeaff";
    ctx.beginPath();
    ctx.arc(actor.x, actor.y - 2, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#24506b";
    ctx.font = "bold 11px system-ui";
    ctx.fillText(Math.ceil(actor.trapped), actor.x, actor.y + 2);
  }
}

function updateUi() {
  ui.time.textContent = state.timer;
  ui.bombs.textContent = state.player.bombs;
  ui.range.textContent = state.player.range;
  if (ui.speed) ui.speed.textContent = state.player.speedLevel;
  if (!ui.itemHud) return;

  const player = state.player;
  const chips = [
    ["B", "물풍선", player.bombs, true, ""],
    ["+", "물줄기", player.range, true, ""],
    ["S", "속도", player.speedLevel, true, ""],
    ["O", "보호막", player.shield > 0 ? `${Math.ceil(player.shieldTime)}초` : "없음", player.shield > 0, "shield-chip"],
    ["N", "바늘", player.needles ? `${player.needles}개` : "없음", (player.needles || 0) > 0, ""],
    ["K", "킥", player.kick ? "ON" : "없음", player.kick, ""],
    ["R", "부활", player.revives ? `${player.revives}회 준비` : "없음", (player.revives || 0) > 0, "revive-chip"],
  ];
  ui.itemHud.innerHTML = chips
    .map(([icon, label, value, active, extraClass]) =>
      `<span class="item-chip ${active ? "ready" : "empty"} ${extraClass}"><b>${icon}</b><span><small>${label}</small>${value}</span></span>`
    )
    .join("");
}

ui.cards.forEach((card) => {
  card.addEventListener("click", () => selectCharacter(card.dataset.skin));
});

ui.modes.forEach((button) => {
  button.addEventListener("click", () => selectMode(button.dataset.mode));
});

ui.itemHelp.addEventListener("click", () => toggleItemGuide(true));
ui.itemGuideClose.addEventListener("click", () => toggleItemGuide(false));
ui.itemGuide.addEventListener("click", (event) => {
  if (event.target === ui.itemGuide) toggleItemGuide(false);
});

window.addEventListener("keydown", (event) => {
  if (event.key === " " && state?.running && state.player.trapped > 0) {
    event.preventDefault();
    useNeedle(state.player);
  }
});

function pressVirtualKey(button) {
  const key = button.dataset.key;
  if (!key) return;
  keys.add(key);
  button.classList.add("pressed");

  if (key === " " && state?.running) {
    if (state.player.trapped > 0) {
      useNeedle(state.player);
    } else {
      dropBomb(state.player);
    }
  }
}

function releaseVirtualKey(button) {
  const key = button.dataset.key;
  if (!key) return;
  keys.delete(key);
  button.classList.remove("pressed");
}

function setupVirtualControls() {
  const activePointers = new Map();
  const buttons = [...document.querySelectorAll(".control-key[data-key]")];

  for (const button of buttons) {
    button.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      button.setPointerCapture?.(event.pointerId);
      activePointers.set(event.pointerId, button);
      pressVirtualKey(button);
    });

    const endPress = (event) => {
      event.preventDefault();
      const activeButton = activePointers.get(event.pointerId) || button;
      releaseVirtualKey(activeButton);
      activePointers.delete(event.pointerId);
    };

    button.addEventListener("pointerup", endPress);
    button.addEventListener("pointercancel", endPress);
    button.addEventListener("lostpointercapture", (event) => {
      const activeButton = activePointers.get(event.pointerId);
      if (activeButton) releaseVirtualKey(activeButton);
      activePointers.delete(event.pointerId);
    });

    button.addEventListener("contextmenu", (event) => event.preventDefault());
  }

  window.addEventListener("blur", () => {
    for (const button of activePointers.values()) releaseVirtualKey(button);
    activePointers.clear();
  });
}

ui.start.addEventListener("click", startGame);
ui.resume.addEventListener("click", startGame);
ui.restart.addEventListener("click", startGame);
setupVirtualControls();

state = freshState();
updateUi();
draw();
