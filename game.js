(() => {
  "use strict";

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const W = canvas.width;
  const H = canvas.height;

  const screens = {
    start: document.getElementById("start-screen"),
    victory: document.getElementById("victory-screen"),
    gameover: document.getElementById("gameover-screen"),
  };
  const victoryTimeEl = document.getElementById("victory-time");
  const victoryHpEl = document.getElementById("victory-hp");
  const gameoverBossHpEl = document.getElementById("gameover-boss-hp");
  const resultClassEls = document.querySelectorAll(".result-class");

  // ---------------------------------------------------------------------------
  // Tuning
  // ---------------------------------------------------------------------------

  const ARENA = { x: 24, y: 60, w: W - 48, h: H - 84 };

  const CLASSES = {
    archer: {
      name: "Archer",
      maxHp: 3,
      speed: 250,
      colors: { skin: "#f1c9a0", tunic: "#3f8f4a", pants: "#5a4030", boots: "#3a2a1e", accent: "#2b6634" },
    },
    warrior: {
      name: "Warrior",
      maxHp: 5,
      speed: 225,
      colors: { skin: "#e8b98f", tunic: "#3b5fa8", pants: "#3a3a48", boots: "#2a2a30", accent: "#c9a13a" },
    },
  };

  const PLAYER = { r: 13, scale: 1, accel: 14, invulnTime: 1.0, knockback: 420 };
  const DODGE = { duration: 0.26, speed: 620, cooldown: 0.75 };
  const BOW = {
    drawTime: 0.7,
    minCharge: 0.15,
    cooldown: 0.12,
    minSpeed: 620,
    maxSpeed: 1100,
    minDamage: 4,
    maxDamage: 20,
    moveMul: 0.55,
  };
  const SWORD = { duration: 0.2, cooldown: 0.4, range: 82, arc: 2.1, damage: 13, lunge: 170 };
  const SHIELD = { halfArc: 1.3, moveMul: 0.5 };

  const BOSS = {
    r: 30,
    scale: 1.8,
    maxHp: 600,
    speed: 115,
    preferredDist: 220,
    cooldown: 1.1,
    windup: { aimed: 0.55, spread: 0.7, charge: 0.75, slam: 0.85 },
    aimedSpeed: 380,
    spreadSpeed: 310,
    spreadAngle: 0.3,
    chargeSpeed: 780,
    chargeDistance: 480,
    slamRadius: 125,
    slamTriggerDist: 170,
  };

  // Below this fraction of HP Fatfat moves and attacks faster.
  const ENRAGE_AT = 0.5;

  const ATTACK_COLORS = {
    aimed: "#ff8a3d",
    spread: "#ff4f6a",
    charge: "#ff3b3b",
    slam: "#ff3b3b",
  };

  const FLASH_COLORS = {
    skin: "#fff",
    tunic: "#fff",
    pants: "#fff",
    boots: "#fff",
    accent: "#fff",
  };

  // ---------------------------------------------------------------------------
  // Input
  // ---------------------------------------------------------------------------

  const BINDINGS = {
    left: ["ArrowLeft", "KeyA"],
    right: ["ArrowRight", "KeyD"],
    up: ["ArrowUp", "KeyW"],
    down: ["ArrowDown", "KeyS"],
    dodge: ["Space"],
    block: ["ShiftLeft", "ShiftRight"],
  };
  const BOUND_CODES = new Set(Object.values(BINDINGS).flat());
  const keys = new Set();
  const mouse = { x: W / 2, y: H / 2, left: false, right: false };
  let dodgeQueued = false;

  const isDown = (action) => BINDINGS[action].some((code) => keys.has(code));

  window.addEventListener("keydown", (e) => {
    if (BOUND_CODES.has(e.code)) e.preventDefault();
    keys.add(e.code);
    if (e.repeat) return;
    if (BINDINGS.dodge.includes(e.code) && mode === "playing") dodgeQueued = true;
    if (mode === "start") {
      if (e.code === "Digit1") startGame("archer");
      if (e.code === "Digit2") startGame("warrior");
    } else if ((mode === "victory" || mode === "gameover") && e.code === "Enter") {
      startGame(selectedClass);
    }
  });
  window.addEventListener("keyup", (e) => keys.delete(e.code));

  function updateMouse(e) {
    const rect = canvas.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * W;
    mouse.y = ((e.clientY - rect.top) / rect.height) * H;
  }
  window.addEventListener("mousemove", updateMouse);
  canvas.addEventListener("mousedown", (e) => {
    updateMouse(e);
    if (e.button === 0) mouse.left = true;
    if (e.button === 2) mouse.right = true;
  });
  window.addEventListener("mouseup", (e) => {
    if (e.button === 0) mouse.left = false;
    if (e.button === 2) mouse.right = false;
  });
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  window.addEventListener("blur", () => {
    keys.clear();
    mouse.left = false;
    mouse.right = false;
  });

  document.querySelectorAll(".class-card").forEach((card) =>
    card.addEventListener("click", () => startGame(card.dataset.class))
  );
  document.querySelectorAll(".play-again").forEach((btn) =>
    btn.addEventListener("click", () => startGame(selectedClass))
  );
  document.querySelectorAll(".change-class").forEach((btn) => btn.addEventListener("click", showStart));

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  // "start" | "playing" | "ending" | "victory" | "gameover"
  let mode = "start";
  let selectedClass = "archer";
  let outcome = null;
  let endTimer = 0;
  let fightTime = 0;
  let shake = 0;

  let player, boss, arrows, fireballs, particles, texts;

  function reset(cls) {
    const def = CLASSES[cls];
    player = {
      cls,
      def,
      x: W / 2,
      y: ARENA.y + ARENA.h - 90,
      vx: 0,
      vy: 0,
      kx: 0,
      ky: 0,
      r: PLAYER.r,
      hp: def.maxHp,
      aim: -Math.PI / 2,
      walk: 0,
      moving: false,
      invuln: 0,
      alive: true,
      dodgeT: 0,
      dodgeCd: 0,
      dodgeDx: 0,
      dodgeDy: 0,
      charging: false,
      charge: 0,
      shotCd: 0,
      slashT: 0,
      slashCd: 0,
      slashAngle: 0,
      slashSide: 1,
      slashHit: false,
      blocking: false,
    };
    boss = {
      x: W / 2,
      y: ARENA.y + 130,
      r: BOSS.r,
      hp: BOSS.maxHp,
      displayHp: BOSS.maxHp,
      flash: 0,
      aim: Math.PI / 2,
      walk: 0,
      moving: false,
      state: "move",
      attack: null,
      lastAttack: null,
      timer: 0,
      attackTimer: 1.6,
      strafeDir: 1,
      strafeTimer: 2,
      chargeDir: 0,
      chargeLeft: 0,
      chargeHit: false,
      kx: 0,
      ky: 0,
      dead: false,
      deathT: 0,
      explodeTimer: 0,
      finalBurstDone: false,
      t: 0,
    };
    arrows = [];
    fireballs = [];
    particles = [];
    texts = [];
    fightTime = 0;
    shake = 0;
    outcome = null;
    dodgeQueued = false;
  }

  function hideScreens() {
    Object.values(screens).forEach((s) => s.classList.add("hidden"));
  }

  function startGame(cls) {
    if (mode === "playing" || mode === "ending") return;
    selectedClass = cls;
    reset(cls);
    mode = "playing";
    hideScreens();
  }

  function showStart() {
    mode = "start";
    hideScreens();
    screens.start.classList.remove("hidden");
  }

  function beginEnding(result) {
    mode = "ending";
    outcome = result;
    endTimer = result === "victory" ? 2.6 : 1.5;
  }

  function showEndScreen() {
    mode = outcome;
    resultClassEls.forEach((el) => (el.textContent = player.def.name));
    if (outcome === "victory") {
      victoryTimeEl.textContent = fightTime.toFixed(1) + "s";
      victoryHpEl.textContent = player.hp;
      screens.victory.classList.remove("hidden");
    } else {
      gameoverBossHpEl.textContent = `${Math.ceil(boss.hp)} / ${BOSS.maxHp}`;
      screens.gameover.classList.remove("hidden");
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const rand = (lo, hi) => lo + Math.random() * (hi - lo);
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const angleTo = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);

  function angleDiff(a, b) {
    let d = (a - b) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return Math.abs(d);
  }

  function burst(x, y, { count = 12, color = "#fff", speed = 200, size = 3, life = 0.5 } = {}) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.3 + Math.random() * 0.7);
      const l = life * (0.6 + Math.random() * 0.6);
      particles.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: l,
        maxLife: l,
        size: size * (0.6 + Math.random() * 0.8),
        color,
      });
    }
  }

  function ring(x, y, radius, color, count = 40) {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      const l = rand(0.3, 0.5);
      particles.push({
        x: x + Math.cos(a) * radius * 0.3,
        y: y + Math.sin(a) * radius * 0.3,
        vx: Math.cos(a) * radius * 2.6,
        vy: Math.sin(a) * radius * 2.6,
        life: l,
        maxLife: l,
        size: rand(3, 6),
        color,
      });
    }
  }

  function floatText(x, y, text, color) {
    texts.push({ x: x + rand(-8, 8), y, text, color, life: 0.7, maxLife: 0.7 });
  }

  const isEnraged = () => boss.hp <= BOSS.maxHp * ENRAGE_AT;

  // Clamps an entity's body-center position so its head and feet stay inside the arena.
  function clampToArena(e, scale) {
    const minX = ARENA.x + e.r;
    const maxX = ARENA.x + ARENA.w - e.r;
    const minY = ARENA.y + 22 * scale;
    const maxY = ARENA.y + ARENA.h - 22 * scale;
    const nx = clamp(e.x, minX, maxX);
    const ny = clamp(e.y, minY, maxY);
    const hitWall = nx !== e.x || ny !== e.y;
    e.x = nx;
    e.y = ny;
    return hitWall;
  }

  function insideArena(x, y) {
    return x > ARENA.x && x < ARENA.x + ARENA.w && y > ARENA.y && y < ARENA.y + ARENA.h;
  }

  function playerIsBlockingFrom(angleToThreat) {
    return (
      player.cls === "warrior" && player.blocking && angleDiff(player.aim, angleToThreat) <= SHIELD.halfArc
    );
  }

  function castPoint() {
    const s = BOSS.scale;
    return { x: boss.x + Math.cos(boss.aim) * 22 * s, y: boss.y - 6 * s + Math.sin(boss.aim) * 22 * s };
  }

  // ---------------------------------------------------------------------------
  // Player
  // ---------------------------------------------------------------------------

  function updatePlayer(dt) {
    if (!player.alive) return;
    const p = player;
    const canAct = mode === "playing";

    p.aim = Math.atan2(mouse.y - p.y, mouse.x - p.x);
    p.invuln = Math.max(0, p.invuln - dt);
    p.dodgeCd = Math.max(0, p.dodgeCd - dt);
    p.shotCd = Math.max(0, p.shotCd - dt);
    p.slashCd = Math.max(0, p.slashCd - dt);

    let ix = 0;
    let iy = 0;
    if (isDown("left")) ix -= 1;
    if (isDown("right")) ix += 1;
    if (isDown("up")) iy -= 1;
    if (isDown("down")) iy += 1;
    const len = Math.hypot(ix, iy);
    if (len) {
      ix /= len;
      iy /= len;
    }

    if (dodgeQueued && p.dodgeCd <= 0 && p.dodgeT <= 0 && canAct) {
      p.dodgeT = DODGE.duration;
      p.dodgeCd = DODGE.cooldown + DODGE.duration;
      p.dodgeDx = len ? ix : Math.cos(p.aim);
      p.dodgeDy = len ? iy : Math.sin(p.aim);
      p.charging = false;
      p.charge = 0;
      p.blocking = false;
      burst(p.x, p.y + 18, { count: 8, color: "#bfae95", speed: 90, size: 3, life: 0.35 });
    }
    dodgeQueued = false;

    const dodging = p.dodgeT > 0;
    if (dodging) p.dodgeT -= dt;

    if (p.cls === "archer") updateBow(dt, dodging, canAct);
    else updateSword(dt, dodging, canAct);

    let speed = p.def.speed;
    if (p.charging) speed *= BOW.moveMul;
    if (p.blocking) speed *= SHIELD.moveMul;
    if (p.slashT > 0) speed *= 0.7;

    if (dodging) {
      p.vx = p.dodgeDx * DODGE.speed;
      p.vy = p.dodgeDy * DODGE.speed;
    } else {
      const k = Math.min(1, PLAYER.accel * dt);
      p.vx += (ix * speed - p.vx) * k;
      p.vy += (iy * speed - p.vy) * k;
    }

    p.x += (p.vx + p.kx) * dt;
    p.y += (p.vy + p.ky) * dt;
    const decay = Math.max(0, 1 - 10 * dt);
    p.kx *= decay;
    p.ky *= decay;

    const moveSpeed = Math.hypot(p.vx, p.vy);
    p.moving = moveSpeed > 20;
    p.walk += moveSpeed * dt * 0.06;

    clampToArena(p, PLAYER.scale);

    // Bodies can't overlap; the boss shoves the player out of the way.
    if (!boss.dead) {
      const d = dist(p, boss);
      const minD = p.r + boss.r;
      if (d < minD && d > 0.001) {
        const nx = (p.x - boss.x) / d;
        const ny = (p.y - boss.y) / d;
        p.x = boss.x + nx * minD;
        p.y = boss.y + ny * minD;
        clampToArena(p, PLAYER.scale);
      }
    }
  }

  function updateBow(dt, dodging, canAct) {
    const p = player;
    if (mouse.left && !dodging && canAct && p.shotCd <= 0) {
      p.charging = true;
      p.charge = Math.min(1, p.charge + dt / BOW.drawTime);
    } else if (p.charging) {
      if (p.charge >= BOW.minCharge && canAct) fireArrow();
      p.charging = false;
      p.charge = 0;
      p.shotCd = BOW.cooldown;
    }
  }

  function fireArrow() {
    const p = player;
    const c = p.charge;
    const speed = BOW.minSpeed + (BOW.maxSpeed - BOW.minSpeed) * c;
    const damage = Math.round(BOW.minDamage + (BOW.maxDamage - BOW.minDamage) * Math.pow(c, 1.5));
    const dx = Math.cos(p.aim);
    const dy = Math.sin(p.aim);
    arrows.push({
      x: p.x + dx * 18,
      y: p.y - 8 + dy * 18,
      vx: dx * speed,
      vy: dy * speed,
      angle: p.aim,
      damage,
      full: c >= 1,
    });
    p.kx -= dx * 40;
    p.ky -= dy * 40;
  }

  function updateSword(dt, dodging, canAct) {
    const p = player;
    p.blocking = (mouse.right || isDown("block")) && !dodging && p.slashT <= 0 && canAct;

    if (mouse.left && !p.blocking && !dodging && p.slashCd <= 0 && canAct) {
      p.slashT = SWORD.duration;
      p.slashCd = SWORD.cooldown;
      p.slashAngle = p.aim;
      p.slashSide *= -1;
      p.slashHit = false;
      p.kx += Math.cos(p.aim) * SWORD.lunge;
      p.ky += Math.sin(p.aim) * SWORD.lunge;
    }

    if (p.slashT > 0) {
      p.slashT -= dt;
      if (!p.slashHit && !boss.dead && canAct) {
        const d = dist(p, boss);
        const allowance = Math.asin(Math.min(1, boss.r / Math.max(d, 1)));
        if (d - boss.r <= SWORD.range && angleDiff(angleTo(p, boss), p.slashAngle) <= SWORD.arc / 2 + allowance) {
          p.slashHit = true;
          const hx = boss.x - Math.cos(p.slashAngle) * boss.r * 0.6;
          const hy = boss.y - Math.sin(p.slashAngle) * boss.r * 0.6;
          damageBoss(SWORD.damage, hx, hy, "#e8f0ff");
          shake = Math.max(shake, 4);
        }
      }
    }
  }

  function hurtPlayer(fromX, fromY, color) {
    const p = player;
    if (!p.alive || p.invuln > 0 || p.dodgeT > 0 || mode !== "playing") return false;
    p.hp -= 1;
    p.invuln = PLAYER.invulnTime;
    const a = Math.atan2(p.y - fromY, p.x - fromX);
    p.kx += Math.cos(a) * PLAYER.knockback;
    p.ky += Math.sin(a) * PLAYER.knockback;
    p.charging = false;
    p.charge = 0;
    shake = Math.max(shake, 10);
    burst(p.x, p.y, { count: 22, color, speed: 240, size: 3, life: 0.5 });
    burst(p.x, p.y, { count: 12, color: "#ff4d6d", speed: 160, size: 3, life: 0.45 });

    if (p.hp <= 0) {
      p.hp = 0;
      p.alive = false;
      burst(p.x, p.y, { count: 70, color: p.def.colors.tunic, speed: 360, size: 4, life: 1.0 });
      burst(p.x, p.y, { count: 40, color: "#ffffff", speed: 260, size: 3, life: 0.8 });
      shake = 16;
      beginEnding("gameover");
    }
    return true;
  }

  // Shield block: no damage, just a shove and sparks.
  function blockHit(fromX, fromY, force) {
    const p = player;
    const a = Math.atan2(p.y - fromY, p.x - fromX);
    p.kx += Math.cos(a) * force;
    p.ky += Math.sin(a) * force;
    const sx = p.x + Math.cos(p.aim) * 16;
    const sy = p.y - 8 + Math.sin(p.aim) * 16;
    burst(sx, sy, { count: 14, color: "#ffe08a", speed: 220, size: 2.5, life: 0.3 });
    shake = Math.max(shake, 4);
  }

  // ---------------------------------------------------------------------------
  // Boss
  // ---------------------------------------------------------------------------

  function chooseAttack() {
    const d = dist(player, boss);
    if (d < BOSS.slamTriggerDist && boss.lastAttack !== "slam") return "slam";
    const options = ["aimed", "spread", "charge"].filter((a) => a !== boss.lastAttack);
    return options[Math.floor(Math.random() * options.length)];
  }

  function updateBoss(dt) {
    boss.t += dt;
    boss.flash = Math.max(0, boss.flash - dt);
    boss.displayHp += (boss.hp - boss.displayHp) * Math.min(1, dt * 4);

    if (boss.dead) {
      updateBossDeath(dt);
      return;
    }

    const enraged = isEnraged();
    const fighting = mode === "playing" && player.alive;
    let vx = 0;
    let vy = 0;

    if (boss.state !== "charge") boss.aim = angleTo(boss, player);

    if (boss.state === "move") {
      const d = dist(player, boss);
      const toX = (player.x - boss.x) / (d || 1);
      const toY = (player.y - boss.y) / (d || 1);
      const radial = clamp((d - BOSS.preferredDist) / 80, -1, 1);
      boss.strafeTimer -= dt;
      if (boss.strafeTimer <= 0) {
        boss.strafeDir *= -1;
        boss.strafeTimer = rand(1.4, 3);
      }
      let mx = toX * radial + -toY * boss.strafeDir * 0.6;
      let my = toY * radial + toX * boss.strafeDir * 0.6;
      const ml = Math.hypot(mx, my) || 1;
      const speed = BOSS.speed * (enraged ? 1.3 : 1);
      vx = (mx / ml) * speed;
      vy = (my / ml) * speed;

      if (fighting) {
        boss.attackTimer -= dt;
        if (boss.attackTimer <= 0) {
          boss.attack = chooseAttack();
          boss.state = "windup";
          boss.timer = boss.windupTotal = BOSS.windup[boss.attack] * (enraged ? 0.8 : 1);
          if (boss.attack === "charge") boss.chargeDir = boss.aim;
        }
      }
    } else if (boss.state === "windup") {
      boss.timer -= dt;
      if (boss.attack === "charge") boss.aim = boss.chargeDir;
      if (boss.timer <= 0) executeAttack(enraged);
    } else if (boss.state === "charge") {
      const step = BOSS.chargeSpeed * (enraged ? 1.15 : 1) * dt;
      boss.x += Math.cos(boss.chargeDir) * step;
      boss.y += Math.sin(boss.chargeDir) * step;
      boss.chargeLeft -= step;
      boss.moving = true;
      boss.walk += step * 0.08;
      if (Math.random() < 0.6) {
        burst(boss.x, boss.y + 20 * BOSS.scale, { count: 2, color: "#a8957a", speed: 60, size: 4, life: 0.4 });
      }

      if (!boss.chargeHit && fighting && dist(player, boss) < player.r + boss.r + 4) {
        boss.chargeHit = true;
        if (playerIsBlockingFrom(angleTo(player, boss))) {
          blockHit(boss.x, boss.y, 620);
          endCharge(1.0);
          return;
        }
        hurtPlayer(boss.x, boss.y, ATTACK_COLORS.charge);
      }

      const hitWall = clampToArena(boss, BOSS.scale);
      if (hitWall) {
        shake = Math.max(shake, 12);
        burst(boss.x, boss.y, { count: 24, color: "#c9b89a", speed: 240, size: 4, life: 0.5 });
        endCharge(1.1);
      } else if (boss.chargeLeft <= 0) {
        endCharge(0.6);
      }
      return;
    } else if (boss.state === "recover") {
      boss.timer -= dt;
      if (boss.timer <= 0) {
        boss.state = "move";
        boss.attackTimer = BOSS.cooldown * (enraged ? 0.55 : 0.8);
      }
    }

    boss.x += (vx + boss.kx) * dt;
    boss.y += (vy + boss.ky) * dt;
    const decay = Math.max(0, 1 - 8 * dt);
    boss.kx *= decay;
    boss.ky *= decay;
    const moveSpeed = Math.hypot(vx, vy);
    boss.moving = moveSpeed > 10;
    boss.walk += moveSpeed * dt * 0.05;
    clampToArena(boss, BOSS.scale);
  }

  function endCharge(recoverTime) {
    boss.state = "recover";
    boss.timer = recoverTime;
    boss.lastAttack = "charge";
    boss.attack = null;
  }

  function executeAttack(enraged) {
    const type = boss.attack;
    boss.lastAttack = type;
    const speedMul = enraged ? 1.15 : 1;

    if (type === "aimed" || type === "spread") {
      const cp = castPoint();
      const base = Math.atan2(player.y - cp.y, player.x - cp.x);
      const shots =
        type === "aimed"
          ? [{ angle: base, speed: BOSS.aimedSpeed, r: 11 }]
          : [-1, 0, 1].map((i) => ({ angle: base + i * BOSS.spreadAngle, speed: BOSS.spreadSpeed, r: 9 }));
      for (const s of shots) {
        fireballs.push({
          x: cp.x,
          y: cp.y,
          vx: Math.cos(s.angle) * s.speed * speedMul,
          vy: Math.sin(s.angle) * s.speed * speedMul,
          r: s.r,
          color: ATTACK_COLORS[type],
        });
      }
      burst(cp.x, cp.y, { count: 14, color: ATTACK_COLORS[type], speed: 180, size: 3, life: 0.35 });
      boss.state = "move";
      boss.attack = null;
      boss.attackTimer = BOSS.cooldown * (enraged ? 0.6 : 1);
    } else if (type === "charge") {
      boss.state = "charge";
      boss.chargeLeft = BOSS.chargeDistance;
      boss.chargeHit = false;
    } else if (type === "slam") {
      const feetY = boss.y + 16 * BOSS.scale;
      ring(boss.x, feetY, BOSS.slamRadius, "#ff6a3d", 48);
      burst(boss.x, feetY, { count: 30, color: "#c9b89a", speed: 260, size: 4, life: 0.6 });
      shake = Math.max(shake, 14);
      if (mode === "playing" && player.alive && dist(player, boss) < BOSS.slamRadius + player.r) {
        if (playerIsBlockingFrom(angleTo(player, boss))) blockHit(boss.x, boss.y, 520);
        else hurtPlayer(boss.x, boss.y, ATTACK_COLORS.slam);
      }
      boss.state = "recover";
      boss.timer = 0.55;
      boss.attack = null;
    }
  }

  function damageBoss(amount, x, y, color) {
    if (mode !== "playing" || boss.dead) return;
    boss.hp = Math.max(0, boss.hp - amount);
    boss.flash = 0.07;
    burst(x, y, { count: 6 + Math.round(amount / 3), color, speed: 180, size: 2.5, life: 0.3 });
    floatText(x, y - 10, amount, amount >= 15 ? "#ffd24a" : "#ffffff");

    if (boss.hp <= 0) {
      boss.dead = true;
      boss.state = "dead";
      boss.attack = null;
      for (const f of fireballs) {
        burst(f.x, f.y, { count: 6, color: f.color, speed: 120, size: 2.5, life: 0.3 });
      }
      fireballs = [];
      beginEnding("victory");
    }
  }

  function updateBossDeath(dt) {
    boss.deathT += dt;
    boss.explodeTimer -= dt;
    const s = BOSS.scale;
    if (boss.deathT < 1.5 && boss.explodeTimer <= 0) {
      boss.explodeTimer = 0.1;
      burst(boss.x + rand(-14, 14) * s, boss.y + rand(-24, 18) * s, {
        count: 16,
        color: Math.random() < 0.5 ? "#ffb347" : "#ff4f4f",
        speed: 220,
        size: 4,
        life: 0.6,
      });
      shake = Math.max(shake, 6);
    }
    if (boss.deathT >= 1.5 && !boss.finalBurstDone) {
      boss.finalBurstDone = true;
      burst(boss.x, boss.y, { count: 90, color: "#ffffff", speed: 520, size: 5, life: 1.1 });
      burst(boss.x, boss.y, { count: 70, color: "#ff4f4f", speed: 380, size: 5, life: 1.3 });
      burst(boss.x, boss.y, { count: 60, color: "#ffb347", speed: 280, size: 6, life: 1.4 });
      shake = 18;
    }
  }

  // ---------------------------------------------------------------------------
  // Projectiles, particles
  // ---------------------------------------------------------------------------

  function updateArrows(dt) {
    for (const a of arrows) {
      a.x += a.vx * dt;
      a.y += a.vy * dt;
      if (!boss.dead && Math.hypot(a.x - boss.x, a.y - boss.y) < boss.r) {
        a.dead = true;
        damageBoss(a.damage, a.x, a.y, a.full ? "#ffd24a" : "#e8ffe0");
        if (a.full) shake = Math.max(shake, 4);
      } else if (!insideArena(a.x, a.y)) {
        a.dead = true;
        burst(a.x, a.y, { count: 4, color: "#a8957a", speed: 80, size: 2, life: 0.25 });
      }
    }
    arrows = arrows.filter((a) => !a.dead);
  }

  function updateFireballs(dt) {
    for (const f of fireballs) {
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      if (Math.random() < 0.5) {
        particles.push({
          x: f.x,
          y: f.y,
          vx: rand(-20, 20),
          vy: rand(-20, 20),
          life: 0.25,
          maxLife: 0.25,
          size: f.r * 0.7,
          color: f.color,
        });
      }

      if (mode === "playing" && player.alive && Math.hypot(f.x - player.x, f.y - player.y) < f.r + player.r * 0.7) {
        if (playerIsBlockingFrom(Math.atan2(f.y - player.y, f.x - player.x))) {
          f.dead = true;
          blockHit(f.x, f.y, 140);
        } else if (hurtPlayer(f.x, f.y, f.color)) {
          f.dead = true;
        }
      }
      if (!insideArena(f.x, f.y)) {
        f.dead = true;
        burst(f.x, f.y, { count: 8, color: f.color, speed: 120, size: 3, life: 0.3 });
      }
    }
    fireballs = fireballs.filter((f) => !f.dead);
  }

  function updateParticles(dt) {
    for (const p of particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 1 - 3 * dt;
      p.vy *= 1 - 3 * dt;
      p.life -= dt;
    }
    particles = particles.filter((p) => p.life > 0);
    for (const t of texts) {
      t.y -= 40 * dt;
      t.life -= dt;
    }
    texts = texts.filter((t) => t.life > 0);
  }

  function update(dt) {
    shake = Math.max(0, shake - dt * 40);

    if (mode === "playing" || mode === "ending") {
      if (mode === "playing") fightTime += dt;
      updatePlayer(dt);
      updateBoss(dt);
      updateArrows(dt);
      updateFireballs(dt);

      if (mode === "ending") {
        endTimer -= dt;
        if (endTimer <= 0) showEndScreen();
      }
    }

    updateParticles(dt);
  }

  // ---------------------------------------------------------------------------
  // Render: arena
  // ---------------------------------------------------------------------------

  const floorCanvas = document.createElement("canvas");
  floorCanvas.width = W;
  floorCanvas.height = H;
  buildFloor(floorCanvas.getContext("2d"));

  function buildFloor(g) {
    g.fillStyle = "#14100d";
    g.fillRect(0, 0, W, H);

    const tile = 48;
    for (let y = ARENA.y; y < ARENA.y + ARENA.h; y += tile) {
      for (let x = ARENA.x; x < ARENA.x + ARENA.w; x += tile) {
        const shade = 52 + Math.floor(Math.random() * 14);
        g.fillStyle = `rgb(${shade + 6}, ${shade}, ${shade - 8})`;
        g.fillRect(x, y, tile, tile);
        g.fillStyle = "rgba(0, 0, 0, 0.25)";
        g.fillRect(x, y + tile - 2, tile, 2);
        g.fillRect(x + tile - 2, y, 2, tile);
        if (Math.random() < 0.15) {
          g.strokeStyle = "rgba(0, 0, 0, 0.3)";
          g.lineWidth = 1;
          g.beginPath();
          g.moveTo(x + rand(4, tile - 4), y + rand(4, tile - 4));
          g.lineTo(x + rand(4, tile - 4), y + rand(4, tile - 4));
          g.stroke();
        }
      }
    }

    // Central sigil.
    g.strokeStyle = "rgba(160, 60, 40, 0.25)";
    g.lineWidth = 3;
    const cx = ARENA.x + ARENA.w / 2;
    const cy = ARENA.y + ARENA.h / 2;
    g.beginPath();
    g.arc(cx, cy, 120, 0, Math.PI * 2);
    g.stroke();
    g.beginPath();
    g.arc(cx, cy, 90, 0, Math.PI * 2);
    g.stroke();
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i * Math.PI * 4) / 5;
      const b = -Math.PI / 2 + ((i + 1) * Math.PI * 4) / 5;
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * 90, cy + Math.sin(a) * 90);
      g.lineTo(cx + Math.cos(b) * 90, cy + Math.sin(b) * 90);
      g.stroke();
    }

    // Walls.
    g.fillStyle = "#2b211a";
    g.fillRect(ARENA.x - 14, ARENA.y - 14, ARENA.w + 28, 14);
    g.fillRect(ARENA.x - 14, ARENA.y + ARENA.h, ARENA.w + 28, 14);
    g.fillRect(ARENA.x - 14, ARENA.y, 14, ARENA.h);
    g.fillRect(ARENA.x + ARENA.w, ARENA.y, 14, ARENA.h);
    g.fillStyle = "#4a3a2c";
    g.fillRect(ARENA.x - 14, ARENA.y - 14, ARENA.w + 28, 4);
    g.strokeStyle = "rgba(0, 0, 0, 0.5)";
    g.lineWidth = 2;
    g.strokeRect(ARENA.x, ARENA.y, ARENA.w, ARENA.h);
  }

  const TORCHES = [
    { x: ARENA.x + 10, y: ARENA.y + 10 },
    { x: ARENA.x + ARENA.w - 10, y: ARENA.y + 10 },
    { x: ARENA.x + 10, y: ARENA.y + ARENA.h - 10 },
    { x: ARENA.x + ARENA.w - 10, y: ARENA.y + ARENA.h - 10 },
  ];

  function drawArena(time) {
    ctx.drawImage(floorCanvas, 0, 0);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const [i, t] of TORCHES.entries()) {
      const flicker = 0.85 + Math.sin(time * 9 + i * 2) * 0.08 + Math.random() * 0.07;
      const glow = ctx.createRadialGradient(t.x, t.y, 0, t.x, t.y, 150 * flicker);
      glow.addColorStop(0, "rgba(255, 150, 60, 0.28)");
      glow.addColorStop(1, "rgba(255, 150, 60, 0)");
      ctx.fillStyle = glow;
      ctx.fillRect(t.x - 160, t.y - 160, 320, 320);
      ctx.fillStyle = "#ffb347";
      ctx.beginPath();
      ctx.arc(t.x, t.y, 4 * flicker, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // Render: figures
  // ---------------------------------------------------------------------------

  function line(x1, y1, x2, y2) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  // Draws a standing human figure. (x, y) is the body center; feet are below it.
  function drawBody(f) {
    const { x, y, s } = f;
    const c = f.flash ? FLASH_COLORS : f.colors;
    const facing = Math.cos(f.aim) >= 0 ? 1 : -1;
    const away = Math.sin(f.aim) < -0.35;
    const feetY = y + 20 * s;
    const swing = f.moving ? Math.sin(f.walk) * 5 * s : 0;

    ctx.lineCap = "round";
    ctx.strokeStyle = c.pants;
    ctx.lineWidth = 5 * s;
    line(x - 4 * s, y + 8 * s, x - 4 * s + swing, feetY - 2 * s);
    line(x + 4 * s, y + 8 * s, x + 4 * s - swing, feetY - 2 * s);
    ctx.fillStyle = c.boots;
    ctx.beginPath();
    ctx.ellipse(x - 4 * s + swing, feetY - 1 * s, 3.5 * s, 2.5 * s, 0, 0, Math.PI * 2);
    ctx.ellipse(x + 4 * s - swing, feetY - 1 * s, 3.5 * s, 2.5 * s, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = c.tunic;
    ctx.beginPath();
    ctx.roundRect(x - 10 * s, y - 12 * s, 20 * s, 23 * s, 6 * s);
    ctx.fill();
    ctx.fillStyle = c.accent;
    ctx.fillRect(x - 10 * s, y + 3 * s, 20 * s, 3 * s);

    ctx.fillStyle = c.skin;
    ctx.beginPath();
    ctx.arc(x, y - 20 * s, 8 * s, 0, Math.PI * 2);
    ctx.fill();

    if (!away && !f.flash) {
      ctx.fillStyle = "#1b1410";
      ctx.beginPath();
      ctx.arc(x + facing * 2 * s - 2.5 * s, y - 21 * s, 1.3 * s, 0, Math.PI * 2);
      ctx.arc(x + facing * 2 * s + 2.5 * s, y - 21 * s, 1.3 * s, 0, Math.PI * 2);
      ctx.fill();
    }

    f.headgear?.(f, c, facing, away);
  }

  function hood(f, c, facing, away) {
    const { x, y, s } = f;
    ctx.fillStyle = c.accent;
    ctx.beginPath();
    if (away) {
      ctx.arc(x, y - 20 * s, 9 * s, 0, Math.PI * 2);
    } else {
      ctx.arc(x, y - 21 * s, 9 * s, Math.PI * 0.95, Math.PI * 2.05);
    }
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x - facing * 6 * s, y - 26 * s);
    ctx.lineTo(x - facing * 14 * s, y - 16 * s);
    ctx.lineTo(x - facing * 6 * s, y - 15 * s);
    ctx.closePath();
    ctx.fill();
  }

  function helmet(f, c, facing, away) {
    const { x, y, s } = f;
    ctx.fillStyle = f.flash ? "#fff" : "#9aa3b0";
    ctx.beginPath();
    if (away) {
      ctx.arc(x, y - 20 * s, 9 * s, 0, Math.PI * 2);
    } else {
      ctx.arc(x, y - 21 * s, 9 * s, Math.PI, Math.PI * 2);
      ctx.rect(x - 9 * s, y - 21 * s, 3 * s, 7 * s);
      ctx.rect(x + 6 * s, y - 21 * s, 3 * s, 7 * s);
    }
    ctx.fill();
    ctx.fillStyle = f.flash ? "#fff" : "#c9a13a";
    ctx.fillRect(x - 1.5 * s, y - 31 * s, 3 * s, 5 * s);
  }

  function drawShadow(x, y, s, width = 13) {
    ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
    ctx.beginPath();
    ctx.ellipse(x, y + 20 * s, width * s, 4.5 * s, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawBow(f, layer) {
    const p = player;
    const { x, y, s } = f;
    const behind = Math.sin(p.aim) < -0.2;
    if ((layer === "back") !== behind) return;

    const dx = Math.cos(p.aim);
    const dy = Math.sin(p.aim);
    const shX = x;
    const shY = y - 8 * s;
    const handX = shX + dx * 15 * s;
    const handY = shY + dy * 15 * s;
    const pull = p.charging ? 3 + 13 * p.charge : 1.3;
    const pullX = handX - dx * pull * s;
    const pullY = handY - dy * pull * s;

    const c = f.flash ? FLASH_COLORS : f.colors;
    ctx.strokeStyle = c.skin;
    ctx.lineWidth = 4 * s;
    ctx.lineCap = "round";
    line(shX, shY, handX, handY);
    line(shX, shY, pullX, pullY);

    const bowR = 14 * s;
    const cx = handX - dx * 10 * s;
    const cy = handY - dy * 10 * s;
    ctx.strokeStyle = f.flash ? "#fff" : "#7a4a22";
    ctx.lineWidth = 3 * s;
    ctx.beginPath();
    ctx.arc(cx, cy, bowR, p.aim - 0.9, p.aim + 0.9);
    ctx.stroke();

    const t1x = cx + Math.cos(p.aim - 0.9) * bowR;
    const t1y = cy + Math.sin(p.aim - 0.9) * bowR;
    const t2x = cx + Math.cos(p.aim + 0.9) * bowR;
    const t2y = cy + Math.sin(p.aim + 0.9) * bowR;
    ctx.strokeStyle = "rgba(240, 235, 220, 0.9)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(t1x, t1y);
    ctx.lineTo(pullX, pullY);
    ctx.lineTo(t2x, t2y);
    ctx.stroke();

    if (p.charging) {
      const full = p.charge >= 1;
      ctx.save();
      if (full) {
        ctx.shadowColor = "#ffd24a";
        ctx.shadowBlur = 12;
      }
      ctx.strokeStyle = full ? "#ffd24a" : "#d8c8a8";
      ctx.lineWidth = 2;
      line(pullX, pullY, pullX + dx * 28 * s, pullY + dy * 28 * s);
      ctx.restore();
    }
  }

  function swordAngle() {
    const p = player;
    if (p.slashT > 0) {
      const t = 1 - p.slashT / SWORD.duration;
      const eased = 1 - Math.pow(1 - t, 3);
      return p.slashAngle + p.slashSide * (-1.2 + 2.4 * eased);
    }
    const facing = Math.cos(p.aim) >= 0 ? 1 : -1;
    return p.aim + facing * 0.8;
  }

  function drawSword(x, y, s, angle, length, flash) {
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    const hx = x + dx * 12 * s;
    const hy = y + dy * 12 * s;
    ctx.lineCap = "round";
    ctx.strokeStyle = flash ? "#fff" : "#d9e2ee";
    ctx.lineWidth = 3.5 * s;
    line(hx + dx * 4 * s, hy + dy * 4 * s, hx + dx * length * s, hy + dy * length * s);
    ctx.strokeStyle = flash ? "#fff" : "#c9a13a";
    ctx.lineWidth = 3 * s;
    line(hx + dx * 3 * s - dy * 5 * s, hy + dy * 3 * s + dx * 5 * s, hx + dx * 3 * s + dy * 5 * s, hy + dy * 3 * s - dx * 5 * s);
    return { hx, hy };
  }

  function drawWarriorGear(f, layer) {
    const p = player;
    const { x, y, s } = f;
    const c = f.flash ? FLASH_COLORS : f.colors;
    const facing = Math.cos(p.aim) >= 0 ? 1 : -1;
    const shX = x;
    const shY = y - 8 * s;

    const sa = swordAngle();
    const swordBehind = Math.sin(sa) < -0.2;
    if ((layer === "back") === swordBehind) {
      const { hx, hy } = drawSword(shX, shY, s, sa, 34, f.flash);
      ctx.strokeStyle = c.skin;
      ctx.lineWidth = 4 * s;
      line(shX, shY, hx, hy);
    }

    const shieldBehind = p.blocking && Math.sin(p.aim) < -0.2;
    if ((layer === "back") !== shieldBehind) return;
    ctx.save();
    if (p.blocking) {
      const sx = shX + Math.cos(p.aim) * 15 * s;
      const sy = shY + Math.sin(p.aim) * 15 * s;
      ctx.translate(sx, sy);
      ctx.rotate(p.aim);
      ctx.fillStyle = f.flash ? "#fff" : "#2d4f8f";
      ctx.strokeStyle = f.flash ? "#fff" : "#c9a13a";
      ctx.lineWidth = 2.5 * s;
      ctx.beginPath();
      ctx.ellipse(0, 0, 5 * s, 14 * s, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.translate(x - facing * 11 * s, y - 1 * s);
      ctx.fillStyle = f.flash ? "#fff" : "#2d4f8f";
      ctx.strokeStyle = f.flash ? "#fff" : "#c9a13a";
      ctx.lineWidth = 2.5 * s;
      ctx.beginPath();
      ctx.arc(0, 0, 9 * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = f.flash ? "#fff" : "#c9a13a";
      ctx.beginPath();
      ctx.arc(0, 0, 2.5 * s, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawSlashTrail() {
    const p = player;
    if (p.cls !== "warrior" || p.slashT <= 0) return;
    const start = p.slashAngle - p.slashSide * 1.2;
    const end = swordAngle();
    const alpha = p.slashT / SWORD.duration;
    ctx.save();
    ctx.strokeStyle = `rgba(230, 240, 255, ${0.55 * alpha})`;
    ctx.lineWidth = 14;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(p.x, p.y - 8, SWORD.range * 0.6, Math.min(start, end), Math.max(start, end));
    ctx.stroke();
    ctx.restore();
  }

  function drawPlayer() {
    const p = player;
    if (!p.alive) return;
    if (p.invuln > 0 && Math.floor(p.invuln * 14) % 2 === 0) return;

    const s = PLAYER.scale;
    const rolling = p.dodgeT > 0;
    const f = {
      x: p.x,
      y: p.y,
      s,
      aim: p.aim,
      walk: p.walk,
      moving: p.moving,
      colors: p.def.colors,
      flash: false,
      headgear: p.cls === "archer" ? hood : helmet,
    };
    const gear = p.cls === "archer" ? drawBow : drawWarriorGear;

    drawShadow(p.x, p.y, s);
    ctx.save();
    if (rolling) {
      ctx.globalAlpha = 0.6;
      ctx.translate(p.x, p.y + 6);
      ctx.rotate((1 - p.dodgeT / DODGE.duration) * Math.PI * 2 * Math.sign(p.dodgeDx || 1));
      ctx.scale(0.8, 0.8);
      ctx.translate(-p.x, -p.y - 6);
    }
    gear(f, "back");
    drawBody(f);
    gear(f, "front");
    ctx.restore();
    drawSlashTrail();
  }

  function bossSwordAngle() {
    const facing = Math.cos(boss.aim) >= 0 ? 1 : -1;
    if (boss.state === "windup" && boss.attack === "slam") {
      const t = 1 - boss.timer / boss.windupTotal;
      return -Math.PI / 2 - facing * 0.4 * (1 - t);
    }
    if (boss.state === "windup" && boss.attack === "charge") return boss.aim;
    if (boss.state === "charge") return boss.chargeDir;
    if (boss.state === "recover") return Math.PI / 2 + facing * 0.5;
    return boss.aim + facing * 1.0;
  }

  // Fatfat: round white head on a big round blue body with stubby feet.
  function drawFatfat(x, y, s, flash) {
    const facing = Math.cos(boss.aim) >= 0 ? 1 : -1;
    const away = Math.sin(boss.aim) < -0.35;
    const swing = boss.moving ? Math.sin(boss.walk) * 3 * s : 0;

    ctx.fillStyle = flash ? "#fff" : "#1a3f9a";
    ctx.beginPath();
    ctx.ellipse(x - 7 * s + swing, y + 18 * s, 5 * s, 3.5 * s, 0, 0, Math.PI * 2);
    ctx.ellipse(x + 7 * s - swing, y + 18 * s, 5 * s, 3.5 * s, 0, 0, Math.PI * 2);
    ctx.fill();

    const bodyY = y + 2 * s;
    if (flash) {
      ctx.fillStyle = "#fff";
    } else {
      const body = ctx.createRadialGradient(x - 6 * s, bodyY - 7 * s, 2 * s, x, bodyY, 18 * s);
      body.addColorStop(0, "#6aaeff");
      body.addColorStop(1, "#2457c9");
      ctx.fillStyle = body;
    }
    ctx.beginPath();
    ctx.ellipse(x, bodyY, 17 * s, 16 * s, 0, 0, Math.PI * 2);
    ctx.fill();

    if (!flash) {
      ctx.fillStyle = "rgba(255, 255, 255, 0.18)";
      ctx.beginPath();
      ctx.ellipse(x - 5 * s, bodyY - 5 * s, 7 * s, 5 * s, -0.4, 0, Math.PI * 2);
      ctx.fill();
      if (!away) {
        ctx.strokeStyle = "rgba(10, 30, 80, 0.6)";
        ctx.lineWidth = 1.2 * s;
        ctx.beginPath();
        ctx.arc(x + facing * 2 * s, bodyY + 5 * s, 1.2 * s, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    const headY = y - 19 * s;
    ctx.fillStyle = "#fff";
    ctx.strokeStyle = flash ? "#fff" : "#c9d2de";
    ctx.lineWidth = 1.5 * s;
    ctx.beginPath();
    ctx.arc(x, headY, 10 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    if (away || flash) return;

    const fx = x + facing * 3 * s;
    const enraged = isEnraged();
    ctx.fillStyle = "rgba(255, 130, 150, 0.45)";
    ctx.beginPath();
    ctx.ellipse(fx - 6 * s, headY + 3 * s, 2.2 * s, 1.4 * s, 0, 0, Math.PI * 2);
    ctx.ellipse(fx + 6 * s, headY + 3 * s, 2.2 * s, 1.4 * s, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.fillStyle = enraged ? "#ff2a2a" : "#151515";
    if (enraged) {
      ctx.shadowColor = "#ff2a2a";
      ctx.shadowBlur = 10;
    }
    ctx.beginPath();
    ctx.arc(fx - 3.5 * s, headY - 1 * s, 1.6 * s, 0, Math.PI * 2);
    ctx.arc(fx + 3.5 * s, headY - 1 * s, 1.6 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.strokeStyle = "#151515";
    ctx.lineWidth = 1.2 * s;
    ctx.lineCap = "round";
    if (enraged) {
      line(fx - 6 * s, headY - 5 * s, fx - 1.5 * s, headY - 3 * s);
      line(fx + 6 * s, headY - 5 * s, fx + 1.5 * s, headY - 3 * s);
      ctx.beginPath();
      ctx.arc(fx, headY + 6 * s, 2.5 * s, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(fx, headY + 2.5 * s, 2.5 * s, Math.PI * 0.15, Math.PI * 0.85);
      ctx.stroke();
    }
  }

  function drawBossFigure() {
    if (boss.dead && boss.deathT >= 1.5) return;
    const s = BOSS.scale;
    let x = boss.x;
    let y = boss.y;
    if (boss.dead) {
      x += rand(-3, 3);
      y += rand(-3, 3);
    }
    const flash = boss.flash > 0;
    const armColor = flash ? "#fff" : "#2a62d8";

    drawShadow(x, y, s, 20);

    const sa = bossSwordAngle();
    const shX = x + Math.cos(sa) * 8 * s;
    const shY = y - 2 * s + Math.sin(sa) * 8 * s;
    const swordBehind = Math.sin(sa) < -0.2;
    const drawGreatsword = () => {
      const { hx, hy } = drawSword(shX, shY, s, sa, 36, flash);
      ctx.strokeStyle = armColor;
      ctx.lineWidth = 6 * s;
      ctx.lineCap = "round";
      line(shX, shY, hx, hy);
    };

    if (swordBehind) drawGreatsword();
    drawFatfat(x, y, s, flash);
    if (!swordBehind) drawGreatsword();

    // Casting hand glows while a fireball attack winds up.
    if (boss.state === "windup" && (boss.attack === "aimed" || boss.attack === "spread") && !boss.dead) {
      const t = 1 - boss.timer / boss.windupTotal;
      const cp = castPoint();
      const color = ATTACK_COLORS[boss.attack];
      ctx.strokeStyle = armColor;
      ctx.lineWidth = 6 * s;
      ctx.lineCap = "round";
      line(x, y - 2 * s, cp.x, cp.y);
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 25;
      ctx.globalAlpha = 0.6 + t * 0.4;
      ctx.beginPath();
      ctx.arc(cp.x, cp.y, 4 + t * 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawTelegraphs() {
    if (boss.dead || boss.state !== "windup") return;
    const t = 1 - boss.timer / boss.windupTotal;
    const color = ATTACK_COLORS[boss.attack];
    ctx.save();

    if (boss.attack === "aimed" || boss.attack === "spread") {
      const cp = castPoint();
      const base = Math.atan2(player.y - cp.y, player.x - cp.x);
      const angles = boss.attack === "aimed" ? [base] : [-1, 0, 1].map((i) => base + i * BOSS.spreadAngle);
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.15 + t * 0.35;
      ctx.lineWidth = 2;
      ctx.setLineDash([14, 10]);
      ctx.lineDashOffset = -boss.t * 80;
      for (const a of angles) {
        line(cp.x, cp.y, cp.x + Math.cos(a) * 1200, cp.y + Math.sin(a) * 1200);
      }
    } else if (boss.attack === "charge") {
      const len = BOSS.chargeDistance + boss.r;
      ctx.translate(boss.x, boss.y);
      ctx.rotate(boss.chargeDir);
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.1 + t * 0.2;
      ctx.fillRect(0, -boss.r, len, boss.r * 2);
      ctx.globalAlpha = 0.35 + t * 0.4;
      ctx.fillRect(0, -boss.r, len * t, boss.r * 2);
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.6;
      ctx.lineWidth = 2;
      ctx.strokeRect(0, -boss.r, len, boss.r * 2);
    } else if (boss.attack === "slam") {
      const fy = boss.y + 16 * BOSS.scale;
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.1 + t * 0.15;
      ctx.beginPath();
      ctx.arc(boss.x, fy, BOSS.slamRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.3 + t * 0.3;
      ctx.beginPath();
      ctx.arc(boss.x, fy, BOSS.slamRadius * t, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.8;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(boss.x, fy, BOSS.slamRadius, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // Render: projectiles, particles, HUD
  // ---------------------------------------------------------------------------

  function drawArrows() {
    for (const a of arrows) {
      const dx = Math.cos(a.angle);
      const dy = Math.sin(a.angle);
      ctx.save();
      if (a.full) {
        ctx.shadowColor = "#ffd24a";
        ctx.shadowBlur = 12;
      }
      ctx.strokeStyle = a.full ? "#ffd24a" : "#c8a878";
      ctx.lineWidth = 2;
      line(a.x - dx * 22, a.y - dy * 22, a.x, a.y);
      ctx.fillStyle = "#e0e6ee";
      ctx.beginPath();
      ctx.moveTo(a.x + dx * 6, a.y + dy * 6);
      ctx.lineTo(a.x - dy * 3, a.y + dx * 3);
      ctx.lineTo(a.x + dy * 3, a.y - dx * 3);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "#f0f0f0";
      ctx.lineWidth = 2;
      line(a.x - dx * 22, a.y - dy * 22, a.x - dx * 17 - dy * 4, a.y - dy * 17 + dx * 4);
      line(a.x - dx * 22, a.y - dy * 22, a.x - dx * 17 + dy * 4, a.y - dy * 17 - dx * 4);
      ctx.restore();
    }
  }

  function drawFireballs() {
    ctx.save();
    for (const f of fireballs) {
      ctx.fillStyle = f.color;
      ctx.shadowColor = f.color;
      ctx.shadowBlur = 18;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#fff6d8";
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r * 0.45, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawParticles() {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.restore();

    ctx.save();
    ctx.font = "bold 16px 'Trebuchet MS', system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(0, 0, 0, 0.7)";
    for (const t of texts) {
      ctx.globalAlpha = Math.min(1, (t.life / t.maxLife) * 2);
      ctx.fillStyle = t.color;
      ctx.strokeText(t.text, t.x, t.y);
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.restore();
  }

  function heartPath(cx, cy, size) {
    const s = size / 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy + s * 0.9);
    ctx.bezierCurveTo(cx - s * 1.6, cy - s * 0.2, cx - s * 0.7, cy - s * 1.4, cx, cy - s * 0.5);
    ctx.bezierCurveTo(cx + s * 0.7, cy - s * 1.4, cx + s * 1.6, cy - s * 0.2, cx, cy + s * 0.9);
    ctx.closePath();
  }

  function drawHud() {
    const font = (size) => `bold ${size}px 'Trebuchet MS', system-ui, sans-serif`;

    // Boss HP bar.
    const barW = 440;
    const barH = 20;
    const barX = (W - barW) / 2;
    const barY = 18;
    const ratio = boss.hp / BOSS.maxHp;
    const trail = boss.displayHp / BOSS.maxHp;

    ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
    ctx.beginPath();
    ctx.roundRect(barX - 3, barY - 3, barW + 6, barH + 6, 6);
    ctx.fill();
    ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
    ctx.fillRect(barX, barY, barW * trail, barH);
    const fill = ctx.createLinearGradient(barX, 0, barX + barW, 0);
    fill.addColorStop(0, isEnraged() ? "#ff2a2a" : "#b8322a");
    fill.addColorStop(1, isEnraged() ? "#ff8a3d" : "#e0603a");
    ctx.fillStyle = fill;
    ctx.fillRect(barX, barY, barW * ratio, barH);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(barX, barY, barW, barH);

    ctx.font = font(13);
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#fff";
    ctx.shadowColor = "#000";
    ctx.shadowBlur = 4;
    ctx.textAlign = "left";
    ctx.fillText(isEnraged() ? "FATFAT · ENRAGED" : "FATFAT", barX + 8, barY + barH / 2 + 1);
    ctx.textAlign = "right";
    ctx.fillText(`${Math.ceil(boss.hp)} / ${BOSS.maxHp}`, barX + barW - 8, barY + barH / 2 + 1);
    ctx.shadowBlur = 0;

    // Player hearts.
    ctx.textAlign = "left";
    ctx.font = font(13);
    ctx.fillStyle = player.cls === "archer" ? "#8fe39a" : "#8fb6ff";
    ctx.fillText(player.def.name.toUpperCase(), 26, 18);
    for (let i = 0; i < player.def.maxHp; i++) {
      const cx = 36 + i * 26;
      heartPath(cx, 38, 20);
      if (i < player.hp) {
        ctx.fillStyle = "#ff4d6d";
        ctx.shadowColor = "#ff4d6d";
        ctx.shadowBlur = 8;
        ctx.fill();
        ctx.shadowBlur = 0;
      } else {
        ctx.strokeStyle = "rgba(255, 120, 140, 0.5)";
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }

    // Dodge cooldown.
    const ready = player.dodgeCd <= 0;
    const cdFrac = ready ? 1 : 1 - player.dodgeCd / (DODGE.cooldown + DODGE.duration);
    const dx = W - 150;
    ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
    ctx.fillRect(dx, 30, 124, 10);
    ctx.fillStyle = ready ? "#ffcf7a" : "#8a7050";
    ctx.fillRect(dx, 30, 124 * cdFrac, 10);
    ctx.font = font(12);
    ctx.fillStyle = ready ? "#ffcf7a" : "#a89070";
    ctx.fillText(ready ? "DODGE READY [SPACE]" : "DODGE", dx, 18);
  }

  function drawReticle() {
    if (mode !== "playing") return;
    ctx.save();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(mouse.x, mouse.y, 8, 0, Math.PI * 2);
    ctx.stroke();
    line(mouse.x - 13, mouse.y, mouse.x - 5, mouse.y);
    line(mouse.x + 5, mouse.y, mouse.x + 13, mouse.y);
    line(mouse.x, mouse.y - 13, mouse.x, mouse.y - 5);
    line(mouse.x, mouse.y + 5, mouse.x, mouse.y + 13);
    ctx.restore();
  }

  let clock = 0;

  function render() {
    ctx.save();
    if (shake > 0) ctx.translate(rand(-shake, shake), rand(-shake, shake));
    drawArena(clock);

    if (mode !== "start") {
      drawTelegraphs();
      // Whoever stands lower on screen is closer to the camera, so draw them last.
      if (boss.y + 20 * BOSS.scale < player.y + 20 * PLAYER.scale) {
        drawBossFigure();
        drawPlayer();
      } else {
        drawPlayer();
        drawBossFigure();
      }
      drawArrows();
      drawFireballs();
    }
    drawParticles();
    ctx.restore();

    if (mode !== "start") drawHud();
    drawReticle();
  }

  // ---------------------------------------------------------------------------
  // Main loop
  // ---------------------------------------------------------------------------

  let lastTime = performance.now();

  function loop(now) {
    const dt = Math.min((now - lastTime) / 1000, 1 / 30);
    lastTime = now;
    clock += dt;
    update(dt);
    render();
    requestAnimationFrame(loop);
  }

  reset(selectedClass);
  requestAnimationFrame(loop);
})();
