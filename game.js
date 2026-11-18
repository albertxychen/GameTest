(() => {
  "use strict";

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const W = canvas.width;
  const H = canvas.height;

  const screens = {
    difficulty: document.getElementById("difficulty-screen"),
    classes: document.getElementById("class-screen"),
    abilities: document.getElementById("ability-screen"),
    victory: document.getElementById("victory-screen"),
    gameover: document.getElementById("gameover-screen"),
  };
  const victoryTimeEl = document.getElementById("victory-time");
  const victoryHpEl = document.getElementById("victory-hp");
  const gameoverBossHpEl = document.getElementById("gameover-boss-hp");
  const resultClassEls = document.querySelectorAll(".result-class");
  const bossNameEls = document.querySelectorAll(".boss-name");
  const abilityTitleEl = document.getElementById("ability-title");
  const abilityCardsEl = document.getElementById("ability-cards");
  const classDifficultyEl = document.getElementById("class-difficulty");

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

  // One ability is picked per run. Active abilities are used with Q.
  const ABILITIES = {
    archer: {
      rain: {
        name: "Arrow Rain",
        desc: "Call down a volley of arrows on the spot under your cursor.",
        stats: ["24 arrows over 1.2s", "4 damage each", "Cooldown 15s"],
        cooldown: 15,
        radius: 90,
        delay: 0.5,
        duration: 1.2,
        arrows: 24,
        damage: 4,
      },
      flame: {
        name: "Flaming Arrows",
        desc: "Your next 10 arrows are set on fire and burn the boss.",
        stats: ["+3 fire damage per hit", "Burn: 3 damage every 0.5s for 3s", "Cooldown 18s"],
        cooldown: 18,
        shots: 10,
        hitDamage: 3,
        burnDuration: 3,
        burnTick: 0.5,
        burnDamage: 3,
      },
      boots: {
        name: "Flying Boots",
        desc: "Enchanted boots: hold left click to spam arrows with no draw time.",
        stats: ["Rapid fire, unlimited arrows", "+50% arrow damage, +30% speed", "Lasts 8s · Cooldown 16s"],
        cooldown: 16,
        duration: 8,
        damageMul: 1.5,
        speedMul: 1.3,
        rapidInterval: 0.2,
        rapidDamage: 2,
        rapidSpeed: 1000,
        rapidSpread: 0.05,
      },
    },
    warrior: {
      call: {
        name: "Warrior's Call",
        desc: "Each use permanently boosts damage and attack speed, but weighs you down.",
        stats: ["+15% damage, +12% attack speed", "-8% move speed, +0.15s dodge cooldown", "Cooldown 10s"],
        cooldown: 10,
        damage: 0.15,
        attackSpeed: 0.12,
        moveSpeed: 0.08,
        minMoveMul: 0.4,
        dodgeCooldown: 0.15,
      },
      infernal: {
        name: "Infernal Shield",
        desc: "Raise a flaming shield that completely blocks the next attack that hits you.",
        stats: ["+2 max hearts (7 total)", "Blocks 1 attack per use", "Cooldown 15s"],
        cooldown: 15,
        bonusHp: 2,
      },
      lastDance: {
        name: "Last Dance",
        desc: "Passive. Triggers automatically when you drop to 1 heart.",
        stats: ["+100% damage", "+50% movement speed", "No activation needed"],
        passive: true,
        damageMul: 2,
        speedMul: 1.5,
      },
    },
  };

  const FATFAT_COLORS = {
    head: "#fff",
    headStroke: "#c9d2de",
    bodyLight: "#6aaeff",
    bodyDark: "#2457c9",
    feet: "#1a3f9a",
    arm: "#2a62d8",
    belly: "rgba(10, 30, 80, 0.6)",
  };

  const TONI_COLORS = {
    head: "#d6d9de",
    headStroke: "#a3a8b0",
    bodyLight: "#7d838c",
    bodyDark: "#41454c",
    feet: "#2e3136",
    arm: "#50555d",
    belly: "rgba(20, 20, 25, 0.6)",
  };

  const BOSS = {
    name: "Fatfat",
    kind: "fatfat",
    colors: FATFAT_COLORS,
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
    windupMul: 1,
    recoverMul: 1,
    // Hits the shield absorbs before breaking; 0 means no shield.
    shieldHits: 0,
    stunMin: 3,
    stunMax: 5,
  };

  // Easy is the base BOSS tuning; other difficulties override parts of it.
  const DIFFICULTIES = {
    easy: { name: "Easy", boss: {} },
    hard: {
      name: "Hard",
      boss: {
        maxHp: 1000,
        slamRadius: 185,
        slamTriggerDist: 235,
        cooldown: 0.15,
        windupMul: 0.75,
        recoverMul: 0.5,
        shieldHits: 3,
      },
    },
    extreme: {
      name: "Extreme",
      boss: {
        name: "Toni",
        kind: "toni",
        colors: TONI_COLORS,
        maxHp: 2000,
        speed: 125,
        cooldown: 0.35,
        recoverMul: 0.6,
        chargeSpeed: 1150,
        chargeDistance: 560,
        windup: { nova: 0.5, charge: 0.4, laser: 0.35, crystals: 0.8, rain: 0.6, minions: 0.8 },
      },
    },
  };

  // Toni's attacks. Cooldowns are per attack; 0 means he can use it back to back.
  // Rage (below ENRAGE_AT) halves cooldowns and reduces damage taken.
  const TONI = {
    cooldowns: { crystals: 30, rain: 20, minions: 45, nova: 0, charge: 0, laser: 0 },
    // So the big attacks don't all land in the first few seconds of the fight.
    startCooldowns: { crystals: 8, rain: 5, minions: 12 },
    rageDamageTaken: 0.7,
    rageCooldownMul: 0.5,
    crystal: { count: 4, hp: 50, r: 16 },
    rain: { fallTime: 0.4, slack: 0.45, minWarn: 1.0, inset: 16 },
    nova: { shots: 16, speed: 440, r: 8 },
    laser: { lockTime: 0.3, beamTime: 0.25, width: 26 },
    minion: { archer: 3, warrior: 4, hp: 100, r: 14, scale: 0.75, speed: 150, spawnTime: 0.5 },
  };

  const CRYSTAL_COLOR = "#c77dff";

  const SHIELD_COLOR = "#7fd8ff";

  // Released when Fatfat's shield comes back, so the player can't stay in melee
  // range and re-break it immediately. The knockback ignores blocking and dodging.
  const SHOCKWAVE = { speed: 950, maxRadius: 420, knockback: 2800, warnTime: 0.6 };

  // Below this fraction of HP Fatfat moves and attacks faster.
  const ENRAGE_AT = 0.5;

  const ATTACK_COLORS = {
    aimed: "#ff8a3d",
    spread: "#ff4f6a",
    charge: "#ff3b3b",
    slam: "#ff3b3b",
    nova: "#d9a8ff",
    laser: "#ff4fd8",
    crystals: CRYSTAL_COLOR,
    rain: "#ff3b3b",
    minions: "#7fb0ff",
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
    ability: ["KeyQ"],
  };
  const BOUND_CODES = new Set(Object.values(BINDINGS).flat());
  const keys = new Set();
  const mouse = { x: W / 2, y: H / 2, left: false, right: false };
  let dodgeQueued = false;
  let abilityQueued = false;

  const isDown = (action) => BINDINGS[action].some((code) => keys.has(code));

  window.addEventListener("keydown", (e) => {
    if (BOUND_CODES.has(e.code)) e.preventDefault();
    keys.add(e.code);
    if (e.repeat) return;
    if (mode === "playing") {
      if (BINDINGS.dodge.includes(e.code)) dodgeQueued = true;
      if (BINDINGS.ability.includes(e.code)) abilityQueued = true;
    } else if (mode === "difficulty") {
      if (e.code === "Digit1" || e.code === "KeyE") chooseDifficulty("easy");
      if (e.code === "Digit2" || e.code === "KeyH") chooseDifficulty("hard");
      if (e.code === "Digit3" || e.code === "KeyX") chooseDifficulty("extreme");
    } else if (mode === "classes") {
      if (e.code === "Digit1") showAbilities("archer");
      if (e.code === "Digit2") showAbilities("warrior");
      if (e.code === "Escape" || e.code === "Backspace") showDifficulty();
    } else if (mode === "abilities") {
      const ids = Object.keys(ABILITIES[selectedClass]);
      const index = ["Digit1", "Digit2", "Digit3"].indexOf(e.code);
      if (index >= 0 && ids[index]) startGame(selectedClass, ids[index]);
      if (e.code === "Escape" || e.code === "Backspace") showClasses();
    } else if ((mode === "victory" || mode === "gameover") && e.code === "Enter") {
      startGame(selectedClass, selectedAbility);
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

  document.querySelectorAll(".class-card[data-class]").forEach((card) =>
    card.addEventListener("click", () => showAbilities(card.dataset.class))
  );
  document.querySelectorAll(".play-again").forEach((btn) =>
    btn.addEventListener("click", () => startGame(selectedClass, selectedAbility))
  );
  document.querySelectorAll(".change-class").forEach((btn) => btn.addEventListener("click", showClasses));
  document.getElementById("ability-back").addEventListener("click", showClasses);
  document.getElementById("class-back").addEventListener("click", showDifficulty);
  document.querySelectorAll(".difficulty-card").forEach((card) =>
    card.addEventListener("click", () => chooseDifficulty(card.dataset.difficulty))
  );

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  // "difficulty" | "classes" | "abilities" | "playing" | "ending" | "victory" | "gameover"
  let mode = "difficulty";
  let selectedClass = "archer";
  let selectedAbility = "rain";
  let selectedDifficulty = "easy";
  let bossStats = BOSS;
  let outcome = null;
  let endTimer = 0;
  let fightTime = 0;
  let shake = 0;

  let player, boss, arrows, fireballs, shockwaves, rains, particles, texts;
  let crystals, minions, zoneRains;

  function reset(cls, abilityId) {
    bossStats = { ...BOSS, ...DIFFICULTIES[selectedDifficulty].boss };
    const def = CLASSES[cls];
    const ability = ABILITIES[cls][abilityId];
    const maxHp = def.maxHp + (ability.bonusHp || 0);
    player = {
      cls,
      def,
      abilityId,
      ability,
      maxHp,
      abilityCd: 0,
      flameShots: 0,
      bootsT: 0,
      callStacks: 0,
      infernalShield: false,
      lastDance: false,
      x: W / 2,
      y: ARENA.y + ARENA.h - 90,
      vx: 0,
      vy: 0,
      kx: 0,
      ky: 0,
      r: PLAYER.r,
      hp: maxHp,
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
      slashId: 0,
      blocking: false,
    };
    boss = {
      x: W / 2,
      y: ARENA.y + 130,
      r: BOSS.r,
      hp: bossStats.maxHp,
      displayHp: bossStats.maxHp,
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
      burnT: 0,
      burnTick: 0,
      shield: bossStats.shieldHits,
      shieldFlash: 0,
      stunT: 0,
      stunTotal: 0,
      cds: { ...TONI.startCooldowns },
      raged: false,
      laserAngle: 0,
      beamT: 0,
      immuneTextCd: 0,
      t: 0,
    };
    arrows = [];
    fireballs = [];
    shockwaves = [];
    crystals = [];
    minions = [];
    zoneRains = [];
    rains = [];
    particles = [];
    texts = [];
    fightTime = 0;
    shake = 0;
    outcome = null;
    dodgeQueued = false;
    abilityQueued = false;
  }

  function hideScreens() {
    Object.values(screens).forEach((s) => s.classList.add("hidden"));
  }

  function showAbilities(cls) {
    mode = "abilities";
    selectedClass = cls;
    abilityTitleEl.textContent = CLASSES[cls].name;
    abilityTitleEl.dataset.class = cls;
    abilityCardsEl.replaceChildren(
      ...Object.entries(ABILITIES[cls]).map(([id, a], i) => {
        const card = document.createElement("button");
        card.type = "button";
        card.className = "class-card ability-card";
        card.dataset.ability = id;

        const key = document.createElement("span");
        key.className = "key";
        key.textContent = String(i + 1);
        const name = document.createElement("h2");
        name.textContent = a.name;
        const desc = document.createElement("p");
        desc.textContent = a.desc;
        const stats = document.createElement("ul");
        for (const s of a.stats) {
          const li = document.createElement("li");
          li.textContent = s;
          stats.append(li);
        }
        card.append(key, name, desc, stats);
        card.addEventListener("click", () => startGame(cls, id));
        return card;
      })
    );
    hideScreens();
    screens.abilities.classList.remove("hidden");
  }

  function startGame(cls, abilityId) {
    if (mode === "playing" || mode === "ending") return;
    selectedClass = cls;
    selectedAbility = abilityId;
    reset(cls, abilityId);
    mode = "playing";
    hideScreens();
  }

  function showDifficulty() {
    mode = "difficulty";
    hideScreens();
    screens.difficulty.classList.remove("hidden");
  }

  function chooseDifficulty(id) {
    selectedDifficulty = id;
    classDifficultyEl.textContent = DIFFICULTIES[id].name;
    classDifficultyEl.dataset.difficulty = id;
    showClasses();
  }

  function showClasses() {
    mode = "classes";
    hideScreens();
    screens.classes.classList.remove("hidden");
  }

  function beginEnding(result) {
    mode = "ending";
    outcome = result;
    endTimer = result === "victory" ? 2.6 : 1.5;
  }

  function showEndScreen() {
    mode = outcome;
    const summary = `${player.def.name} · ${player.ability.name} · ${DIFFICULTIES[selectedDifficulty].name}`;
    resultClassEls.forEach((el) => (el.textContent = summary));
    bossNameEls.forEach((el) => (el.textContent = bossStats.name));
    if (outcome === "victory") {
      victoryTimeEl.textContent = fightTime.toFixed(1) + "s";
      victoryHpEl.textContent = player.hp;
      screens.victory.classList.remove("hidden");
    } else {
      gameoverBossHpEl.textContent = `${Math.ceil(boss.hp)} / ${bossStats.maxHp}`;
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

  const isEnraged = () => boss.hp <= bossStats.maxHp * ENRAGE_AT;

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

  function damageMul() {
    const p = player;
    let mul = 1;
    if (p.bootsT > 0) mul *= ABILITIES.archer.boots.damageMul;
    mul *= 1 + p.callStacks * ABILITIES.warrior.call.damage;
    if (p.lastDance) mul *= ABILITIES.warrior.lastDance.damageMul;
    return mul;
  }

  function moveMul() {
    const p = player;
    const call = ABILITIES.warrior.call;
    let mul = Math.max(call.minMoveMul, 1 - p.callStacks * call.moveSpeed);
    if (p.bootsT > 0) mul *= ABILITIES.archer.boots.speedMul;
    if (p.lastDance) mul *= ABILITIES.warrior.lastDance.speedMul;
    return mul;
  }

  const dodgeCooldown = () => DODGE.cooldown + player.callStacks * ABILITIES.warrior.call.dodgeCooldown;
  const slashCooldown = () =>
    Math.max(SWORD.duration, SWORD.cooldown / (1 + player.callStacks * ABILITIES.warrior.call.attackSpeed));

  function useAbility() {
    const p = player;
    const a = p.ability;
    if (a.passive || p.abilityCd > 0) return;
    if (p.abilityId === "infernal" && p.infernalShield) return;
    p.abilityCd = a.cooldown;

    if (p.abilityId === "rain") {
      const x = clamp(mouse.x, ARENA.x, ARENA.x + ARENA.w);
      const y = clamp(mouse.y, ARENA.y, ARENA.y + ARENA.h);
      rains.push({ x, y, delay: a.delay, t: 0, spawned: 0, falling: [], total: 0 });
    } else if (p.abilityId === "flame") {
      p.flameShots = a.shots;
      burst(p.x, p.y - 8, { count: 20, color: "#ff8a3d", speed: 160, size: 3, life: 0.5 });
    } else if (p.abilityId === "boots") {
      p.bootsT = a.duration;
      burst(p.x, p.y + 18, { count: 20, color: "#9be7ff", speed: 180, size: 3, life: 0.5 });
    } else if (p.abilityId === "call") {
      p.callStacks += 1;
      ring(p.x, p.y + 10, 70, "#ffcf7a", 30);
      floatText(p.x, p.y - 40, `WARRIOR'S CALL x${p.callStacks}`, "#ffcf7a");
      shake = Math.max(shake, 5);
    } else if (p.abilityId === "infernal") {
      p.infernalShield = true;
      ring(p.x, p.y, 60, "#ff6a2a", 36);
    }
  }

  function updatePlayer(dt) {
    if (!player.alive) return;
    const p = player;
    const canAct = mode === "playing";

    p.aim = Math.atan2(mouse.y - p.y, mouse.x - p.x);
    p.invuln = Math.max(0, p.invuln - dt);
    p.dodgeCd = Math.max(0, p.dodgeCd - dt);
    p.shotCd = Math.max(0, p.shotCd - dt);
    p.slashCd = Math.max(0, p.slashCd - dt);
    p.abilityCd = Math.max(0, p.abilityCd - dt);
    p.bootsT = Math.max(0, p.bootsT - dt);
    if (abilityQueued && canAct && p.dodgeT <= 0) useAbility();
    abilityQueued = false;

    if (p.abilityId === "lastDance" && !p.lastDance && p.hp === 1) {
      p.lastDance = true;
      ring(p.x, p.y, 90, "#ff3b5c", 48);
      floatText(p.x, p.y - 44, "LAST DANCE!", "#ff3b5c");
      shake = Math.max(shake, 10);
    }

    if (p.infernalShield && Math.random() < 0.4) {
      const a = Math.random() * Math.PI * 2;
      particles.push({
        x: p.x + Math.cos(a) * 20,
        y: p.y + Math.sin(a) * 20,
        vx: 0,
        vy: -60,
        life: 0.4,
        maxLife: 0.4,
        size: 4,
        color: Math.random() < 0.5 ? "#ff6a2a" : "#ffb347",
      });
    }

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
      p.dodgeCd = dodgeCooldown() + DODGE.duration;
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

    let speed = p.def.speed * moveMul();
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
    if (p.bootsT > 0) {
      p.charging = false;
      p.charge = 0;
      if (mouse.left && !dodging && canAct && p.shotCd <= 0) {
        fireRapidArrow();
        p.shotCd = ABILITIES.archer.boots.rapidInterval;
      }
      return;
    }
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
    const base = BOW.minDamage + (BOW.maxDamage - BOW.minDamage) * Math.pow(c, 1.5);
    const damage = Math.round(base * damageMul());
    const onFire = p.flameShots > 0;
    if (onFire) p.flameShots -= 1;
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
      fire: onFire,
    });
    p.kx -= dx * 40;
    p.ky -= dy * 40;
  }

  function fireRapidArrow() {
    const p = player;
    const boots = ABILITIES.archer.boots;
    const angle = p.aim + rand(-boots.rapidSpread, boots.rapidSpread);
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    arrows.push({
      x: p.x + dx * 18,
      y: p.y - 8 + dy * 18,
      vx: dx * boots.rapidSpeed,
      vy: dy * boots.rapidSpeed,
      angle,
      damage: Math.round(boots.rapidDamage * damageMul()),
      rapid: true,
    });
  }

  function updateSword(dt, dodging, canAct) {
    const p = player;
    p.blocking = (mouse.right || isDown("block")) && !dodging && p.slashT <= 0 && canAct;

    if (mouse.left && !p.blocking && !dodging && p.slashCd <= 0 && canAct) {
      p.slashT = SWORD.duration;
      p.slashCd = slashCooldown();
      p.slashAngle = p.aim;
      p.slashSide *= -1;
      p.slashHit = false;
      p.slashId += 1;
      p.kx += Math.cos(p.aim) * SWORD.lunge;
      p.ky += Math.sin(p.aim) * SWORD.lunge;
    }

    if (p.slashT > 0) {
      p.slashT -= dt;
      if (!canAct) return;
      const damage = Math.round(SWORD.damage * damageMul());
      const color = p.lastDance ? "#ff3b5c" : "#e8f0ff";
      if (!p.slashHit && !boss.dead && slashReaches(boss)) {
        p.slashHit = true;
        const hx = boss.x - Math.cos(p.slashAngle) * boss.r * 0.6;
        const hy = boss.y - Math.sin(p.slashAngle) * boss.r * 0.6;
        damageBoss(damage, hx, hy, color);
        shake = Math.max(shake, 4);
      }
      for (const t of [...crystals, ...minions]) {
        if (t.slashId !== p.slashId && t.hp > 0 && slashReaches(t)) {
          t.slashId = p.slashId;
          damageAdd(t, damage, t.x, t.y - 6, color);
          shake = Math.max(shake, 3);
        }
      }
    }
  }

  function slashReaches(t) {
    const p = player;
    const d = dist(p, t);
    const allowance = Math.asin(Math.min(1, t.r / Math.max(d, 1)));
    return d - t.r <= SWORD.range && angleDiff(angleTo(p, t), p.slashAngle) <= SWORD.arc / 2 + allowance;
  }

  function hurtPlayer(fromX, fromY, color) {
    const p = player;
    if (!p.alive || p.invuln > 0 || p.dodgeT > 0 || mode !== "playing") return false;

    // Brief invulnerability after an Infernal Shield block so the rest of a spread can't land instantly.
    if (p.infernalShield) {
      p.infernalShield = false;
      p.invuln = 0.5;
      ring(p.x, p.y, 45, "#ff6a2a", 28);
      floatText(p.x, p.y - 36, "BLOCKED", "#ffb347");
      shake = Math.max(shake, 4);
      return true;
    }

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
    if (bossStats.kind === "toni") return chooseToniAttack();
    const d = dist(player, boss);
    if (d < bossStats.slamTriggerDist && boss.lastAttack !== "slam") return "slam";
    const options = ["aimed", "spread", "charge"].filter((a) => a !== boss.lastAttack);
    return options[Math.floor(Math.random() * options.length)];
  }

  function updateBoss(dt) {
    boss.t += dt;
    boss.flash = Math.max(0, boss.flash - dt);
    boss.shieldFlash = Math.max(0, boss.shieldFlash - dt);
    boss.displayHp += (boss.hp - boss.displayHp) * Math.min(1, dt * 4);

    if (boss.dead) {
      updateBossDeath(dt);
      return;
    }

    const enraged = isEnraged();
    const fighting = mode === "playing" && player.alive;
    let vx = 0;
    let vy = 0;

    if (bossStats.kind === "toni") updateToniTimers(dt, enraged);

    if (boss.state !== "charge" && boss.state !== "stunned" && boss.state !== "laser") {
      boss.aim = angleTo(boss, player);
    }

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
      const speed = bossStats.speed * (enraged ? 1.3 : 1);
      vx = (mx / ml) * speed;
      vy = (my / ml) * speed;

      if (fighting) {
        boss.attackTimer -= dt;
        if (boss.attackTimer <= 0) {
          boss.attack = chooseAttack();
          boss.state = "windup";
          boss.timer = boss.windupTotal = bossStats.windup[boss.attack] * bossStats.windupMul * (enraged ? 0.8 : 1);
          if (boss.attack === "charge") boss.chargeDir = boss.aim;
        }
      }
    } else if (boss.state === "windup") {
      boss.timer -= dt;
      if (boss.attack === "charge") boss.aim = boss.chargeDir;
      if (boss.timer <= 0) executeAttack(enraged);
    } else if (boss.state === "charge") {
      const step = bossStats.chargeSpeed * (enraged ? 1.15 : 1) * dt;
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
        boss.attackTimer = bossStats.cooldown * (enraged ? 0.55 : 0.8);
      }
    } else if (boss.state === "laser") {
      boss.timer -= dt;
      if (boss.timer <= 0) fireLaser(enraged);
    } else if (boss.state === "stunned") {
      boss.stunT -= dt;
      if (boss.stunT <= 0) {
        boss.state = "move";
        boss.shield = bossStats.shieldHits;
        boss.shieldFlash = 0.3;
        boss.attackTimer = 0.8;
        burst(boss.x, boss.y, { count: 24, color: SHIELD_COLOR, speed: 200, size: 3, life: 0.45 });
        floatText(boss.x, boss.y - 70, "SHIELD UP", SHIELD_COLOR);
        shockwaves.push({ x: boss.x, y: boss.y + 16 * BOSS.scale, r: 0, hit: false });
        shake = Math.max(shake, 12);
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
    boss.timer = recoverTime * bossStats.recoverMul;
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
      boss.attackTimer = bossStats.cooldown * (enraged ? 0.6 : 1);
    } else if (type === "charge") {
      boss.state = "charge";
      boss.chargeLeft = bossStats.chargeDistance;
      boss.chargeHit = false;
    } else if (type === "nova" || type === "laser" || type === "crystals" || type === "rain" || type === "minions") {
      executeToniAttack(type, enraged);
    } else if (type === "slam") {
      const feetY = boss.y + 16 * BOSS.scale;
      ring(boss.x, feetY, bossStats.slamRadius, "#ff6a3d", 48);
      burst(boss.x, feetY, { count: 30, color: "#c9b89a", speed: 260, size: 4, life: 0.6 });
      shake = Math.max(shake, 14);
      if (mode === "playing" && player.alive && dist(player, boss) < bossStats.slamRadius + player.r) {
        if (playerIsBlockingFrom(angleTo(player, boss))) blockHit(boss.x, boss.y, 520);
        else hurtPlayer(boss.x, boss.y, ATTACK_COLORS.slam);
      }
      boss.state = "recover";
      boss.timer = 0.55 * bossStats.recoverMul;
      boss.attack = null;
    }
  }

  // `hit: false` marks follow-up damage (burn ticks, a fire arrow's bonus) that
  // shouldn't chip the shield on its own.
  function damageBoss(amount, x, y, color, { textColor, showText = true, hit = true } = {}) {
    if (mode !== "playing" || boss.dead) return;
    if (boss.shield > 0) {
      if (hit) hitBossShield(x, y);
      return;
    }
    if (crystals.length) {
      burst(x, y, { count: 6, color: CRYSTAL_COLOR, speed: 160, size: 2.5, life: 0.25 });
      if (hit && boss.immuneTextCd <= 0) {
        boss.immuneTextCd = 0.6;
        floatText(x, y - 10, "IMMUNE", CRYSTAL_COLOR);
      }
      return;
    }
    if (bossStats.kind === "toni" && isEnraged()) amount = Math.max(1, Math.round(amount * TONI.rageDamageTaken));
    boss.hp = Math.max(0, boss.hp - amount);
    boss.flash = 0.07;
    burst(x, y, { count: 6 + Math.round(amount / 3), color, speed: 180, size: 2.5, life: 0.3 });
    if (showText) floatText(x, y - 10, amount, textColor || (amount >= 15 ? "#ffd24a" : "#ffffff"));

    if (boss.hp <= 0) {
      boss.dead = true;
      boss.state = "dead";
      boss.attack = null;
      for (const f of fireballs) {
        burst(f.x, f.y, { count: 6, color: f.color, speed: 120, size: 2.5, life: 0.3 });
      }
      fireballs = [];
      for (const t of [...crystals, ...minions]) {
        burst(t.x, t.y, { count: 20, color: t.kind === "crystal" ? CRYSTAL_COLOR : "#6aaeff", speed: 220, size: 3, life: 0.5 });
      }
      crystals = [];
      minions = [];
      zoneRains = [];
      beginEnding("victory");
    }
  }

  function hitBossShield(x, y) {
    boss.shield -= 1;
    boss.shieldFlash = 0.15;
    burst(x, y, { count: 10, color: SHIELD_COLOR, speed: 200, size: 3, life: 0.3 });
    if (boss.shield > 0) {
      floatText(x, y - 10, "BLOCKED", SHIELD_COLOR);
      return;
    }
    boss.state = "stunned";
    boss.attack = null;
    boss.stunT = boss.stunTotal = rand(bossStats.stunMin, bossStats.stunMax);
    burst(boss.x, boss.y, { count: 50, color: SHIELD_COLOR, speed: 340, size: 4, life: 0.6 });
    ring(boss.x, boss.y, 70, SHIELD_COLOR, 36);
    floatText(boss.x, boss.y - 70, "STUNNED!", "#ffe08a");
    shake = Math.max(shake, 10);
  }

  // ---------------------------------------------------------------------------
  // Toni (Extreme)
  // ---------------------------------------------------------------------------

  function updateToniTimers(dt, enraged) {
    for (const id in boss.cds) boss.cds[id] = Math.max(0, boss.cds[id] - dt);
    boss.immuneTextCd = Math.max(0, boss.immuneTextCd - dt);
    boss.beamT = Math.max(0, boss.beamT - dt);
    if (enraged && !boss.raged) {
      boss.raged = true;
      for (const id in boss.cds) boss.cds[id] *= TONI.rageCooldownMul;
      ring(boss.x, boss.y, 110, "#ff2a2a", 48);
      floatText(boss.x, boss.y - 80, "RAGE MODE", "#ff4f4f");
      shake = Math.max(shake, 12);
    }
  }

  function chooseToniAttack() {
    const options = Object.keys(TONI.cooldowns).filter(
      (id) => !(boss.cds[id] > 0) && id !== boss.lastAttack && !(id === "crystals" && crystals.length)
    );
    return options[Math.floor(Math.random() * options.length)] || "nova";
  }

  function executeToniAttack(type, enraged) {
    const cd = TONI.cooldowns[type] * (enraged ? TONI.rageCooldownMul : 1);
    if (cd > 0) boss.cds[type] = cd;
    boss.attack = null;
    boss.state = "move";
    boss.attackTimer = bossStats.cooldown * (enraged ? 0.6 : 1);

    if (type === "nova") {
      const n = TONI.nova;
      const cp = { x: boss.x, y: boss.y - 4 * BOSS.scale };
      const offset = Math.random() * Math.PI * 2;
      for (let i = 0; i < n.shots; i++) {
        const a = offset + (i / n.shots) * Math.PI * 2;
        const speed = n.speed * (enraged ? 1.15 : 1);
        fireballs.push({
          x: cp.x,
          y: cp.y,
          vx: Math.cos(a) * speed,
          vy: Math.sin(a) * speed,
          r: n.r,
          color: ATTACK_COLORS.nova,
          crystal: true,
        });
      }
      burst(cp.x, cp.y, { count: 24, color: ATTACK_COLORS.nova, speed: 220, size: 3, life: 0.4 });
    } else if (type === "laser") {
      boss.state = "laser";
      boss.laserAngle = Math.atan2(player.y - castPoint().y, player.x - castPoint().x);
      boss.aim = boss.laserAngle;
      boss.timer = TONI.laser.lockTime;
    } else if (type === "crystals") {
      spawnCrystals();
    } else if (type === "rain") {
      const warn = startZoneRain();
      boss.state = "recover";
      boss.timer = warn + 0.2;
    } else if (type === "minions") {
      spawnMinions();
    }
  }

  // Distance from point p to the laser ray starting at (x, y) with angle a.
  function distToRay(p, x, y, a) {
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    const t = Math.max(0, (p.x - x) * dx + (p.y - y) * dy);
    return Math.hypot(p.x - (x + dx * t), p.y - (y + dy * t));
  }

  function fireLaser(enraged) {
    const cp = castPoint();
    const a = boss.laserAngle;
    boss.beamT = TONI.laser.beamTime;
    boss.state = "recover";
    boss.timer = 0.35 * bossStats.recoverMul;
    shake = Math.max(shake, 8);
    for (let i = 0; i < 20; i++) {
      const d = rand(30, 900);
      burst(cp.x + Math.cos(a) * d, cp.y + Math.sin(a) * d, { count: 1, color: ATTACK_COLORS.laser, speed: 120, size: 3, life: 0.35 });
    }
    if (mode === "playing" && player.alive && distToRay(player, cp.x, cp.y, a) < TONI.laser.width / 2 + player.r) {
      if (playerIsBlockingFrom(angleTo(player, boss))) blockHit(cp.x, cp.y, 380);
      else hurtPlayer(cp.x, cp.y, ATTACK_COLORS.laser);
    }
  }

  function spawnCrystals() {
    const c = TONI.crystal;
    const margin = 60;
    crystals = [];
    for (let i = 0; i < c.count; i++) {
      let best = null;
      for (let tries = 0; tries < 60; tries++) {
        const pt = {
          x: rand(ARENA.x + margin, ARENA.x + ARENA.w - margin),
          y: rand(ARENA.y + margin, ARENA.y + ARENA.h - margin),
        };
        const ok =
          dist(pt, boss) > 200 && dist(pt, player) > 90 && crystals.every((o) => dist(pt, o) > 160);
        best = pt;
        if (ok) break;
      }
      crystals.push({ kind: "crystal", x: best.x, y: best.y, r: c.r, hp: c.hp, maxHp: c.hp, flash: 0, slashId: 0, t: 0 });
      burst(best.x, best.y, { count: 18, color: CRYSTAL_COLOR, speed: 200, size: 3, life: 0.5 });
    }
    ring(boss.x, boss.y, 80, CRYSTAL_COLOR, 36);
    floatText(boss.x, boss.y - 80, "FORCE FIELD", CRYSTAL_COLOR);
  }

  function spawnMinions() {
    const m = TONI.minion;
    const count = m[player.cls];
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + rand(-0.3, 0.3);
      const e = {
        kind: "minion",
        x: boss.x + Math.cos(a) * 70,
        y: boss.y + Math.sin(a) * 70,
        r: m.r,
        hp: m.hp,
        maxHp: m.hp,
        flash: 0,
        slashId: 0,
        spawnT: m.spawnTime,
        aim: a,
        walk: rand(0, 6),
        moving: false,
        kx: 0,
        ky: 0,
      };
      clampToArena(e, m.scale);
      minions.push(e);
      burst(e.x, e.y, { count: 14, color: "#6aaeff", speed: 160, size: 3, life: 0.45 });
    }
    floatText(boss.x, boss.y - 80, "MINIONS!", "#7fb0ff");
  }

  // Splits the arena into uneven cells; crystals fall on every cell but one.
  // The warning lasts just long enough for the player to run to the safe cell.
  function startZoneRain() {
    const r = TONI.rain;
    let cols = 2 + Math.floor(Math.random() * 3);
    let rows = 1 + Math.floor(Math.random() * 2);
    if (cols * rows < 3) rows = 2;
    const cuts = (start, size, n) => {
      const out = [start];
      for (let i = 1; i < n; i++) out.push(start + (size * i) / n + rand(-0.15, 0.15) * (size / n));
      out.push(start + size);
      return out;
    };
    const xs = cuts(ARENA.x, ARENA.w, cols);
    const ys = cuts(ARENA.y, ARENA.h, rows);
    const cells = [];
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) cells.push({ x: xs[i], y: ys[j], w: xs[i + 1] - xs[i], h: ys[j + 1] - ys[j] });
    }
    const inCell = (c, p) => p.x >= c.x && p.x <= c.x + c.w && p.y >= c.y && p.y <= c.y + c.h;
    const candidates = cells.filter((c) => !inCell(c, player));
    const safe = candidates[Math.floor(Math.random() * candidates.length)];

    const nx = clamp(player.x, safe.x + r.inset, safe.x + safe.w - r.inset);
    const ny = clamp(player.y, safe.y + r.inset, safe.y + safe.h - r.inset);
    const speed = player.def.speed * moveMul();
    const warn = Math.max(r.minWarn, Math.hypot(nx - player.x, ny - player.y) / speed + r.slack);

    const drops = [];
    for (const c of cells) {
      if (c === safe) continue;
      const n = Math.max(3, Math.round((c.w * c.h) / 9000));
      for (let i = 0; i < n; i++) {
        drops.push({ x: rand(c.x + 10, c.x + c.w - 10), y: rand(c.y + 10, c.y + c.h - 10), h: rand(260, 360) });
      }
    }
    zoneRains.push({ cells, safe, t: 0, warn, drops, landed: false, linger: 0.35 });
    return warn;
  }

  function damageAdd(t, amount, x, y, color) {
    if (t.hp <= 0) return;
    t.hp = Math.max(0, t.hp - amount);
    t.flash = 0.07;
    burst(x, y, { count: 5 + Math.round(amount / 3), color, speed: 160, size: 2.5, life: 0.3 });
    floatText(x, y - 10, amount, "#ffffff");
    if (t.hp > 0) return;
    const color2 = t.kind === "crystal" ? CRYSTAL_COLOR : "#6aaeff";
    burst(t.x, t.y, { count: 30, color: color2, speed: 260, size: 3.5, life: 0.55 });
    shake = Math.max(shake, 6);
    if (t.kind === "crystal") {
      crystals = crystals.filter((c) => c !== t);
      if (!crystals.length) {
        ring(boss.x, boss.y, 90, CRYSTAL_COLOR, 40);
        floatText(boss.x, boss.y - 80, "FORCE FIELD DOWN", "#ffe08a");
      }
    } else {
      minions = minions.filter((m) => m !== t);
    }
  }

  function updateCrystals(dt) {
    for (const c of crystals) {
      c.t += dt;
      c.flash = Math.max(0, c.flash - dt);
    }
  }

  function updateMinions(dt) {
    const m = TONI.minion;
    const fighting = mode === "playing" && player.alive;
    for (const e of minions) {
      e.flash = Math.max(0, e.flash - dt);
      if (e.spawnT > 0) {
        e.spawnT -= dt;
        continue;
      }
      e.aim = angleTo(e, player);
      let vx = fighting ? Math.cos(e.aim) * m.speed : 0;
      let vy = fighting ? Math.sin(e.aim) * m.speed : 0;
      for (const o of minions) {
        if (o === e) continue;
        const d = dist(e, o);
        if (d < e.r * 2.2 && d > 0.01) {
          vx += ((e.x - o.x) / d) * 90;
          vy += ((e.y - o.y) / d) * 90;
        }
      }
      e.x += (vx + e.kx) * dt;
      e.y += (vy + e.ky) * dt;
      const decay = Math.max(0, 1 - 8 * dt);
      e.kx *= decay;
      e.ky *= decay;
      e.moving = Math.hypot(vx, vy) > 10;
      e.walk += Math.hypot(vx, vy) * dt * 0.08;
      clampToArena(e, m.scale);

      if (fighting && dist(e, player) < e.r + player.r) {
        const away = angleTo(player, e);
        e.kx = Math.cos(away) * 420;
        e.ky = Math.sin(away) * 420;
        if (playerIsBlockingFrom(away)) blockHit(e.x, e.y, 160);
        else hurtPlayer(e.x, e.y, ATTACK_COLORS.minions);
      }
    }
  }

  function updateZoneRains(dt) {
    const r = TONI.rain;
    for (const z of zoneRains) {
      z.t += dt;
      if (!z.landed && z.t >= z.warn) {
        z.landed = true;
        shake = Math.max(shake, 12);
        for (const d of z.drops) burst(d.x, d.y, { count: 6, color: CRYSTAL_COLOR, speed: 160, size: 3, life: 0.4 });
        const s = z.safe;
        const safe = player.x >= s.x && player.x <= s.x + s.w && player.y >= s.y && player.y <= s.y + s.h;
        if (mode === "playing" && player.alive && !safe) {
          player.dodgeT = 0;
          hurtPlayer(player.x, player.y - 30, CRYSTAL_COLOR);
        }
      }
      if (z.landed) z.linger -= dt;
    }
    zoneRains = zoneRains.filter((z) => z.linger > 0);
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
      if (a.fire && Math.random() < 0.7) {
        particles.push({
          x: a.x - Math.cos(a.angle) * 10,
          y: a.y - Math.sin(a.angle) * 10,
          vx: rand(-20, 20),
          vy: rand(-40, 0),
          life: 0.25,
          maxLife: 0.25,
          size: 4,
          color: Math.random() < 0.5 ? "#ff6a2a" : "#ffd24a",
        });
      }
      const add = mode === "playing" && [...crystals, ...minions].find((t) => t.hp > 0 && Math.hypot(a.x - t.x, a.y - t.y) < t.r + 4);
      if (add) {
        a.dead = true;
        damageAdd(add, a.damage + (a.fire ? ABILITIES.archer.flame.hitDamage : 0), a.x, a.y, a.full ? "#ffd24a" : "#e8ffe0");
      } else if (!boss.dead && Math.hypot(a.x - boss.x, a.y - boss.y) < boss.r) {
        a.dead = true;
        damageBoss(a.damage, a.x, a.y, a.full ? "#ffd24a" : "#e8ffe0");
        if (a.fire) {
          const flame = ABILITIES.archer.flame;
          damageBoss(Math.round(flame.hitDamage * damageMul()), a.x, a.y + 12, "#ff6a2a", {
            textColor: "#ff8a3d",
            hit: false,
          });
          boss.burnT = flame.burnDuration;
        }
        if (a.full) shake = Math.max(shake, 4);
      } else if (!insideArena(a.x, a.y)) {
        a.dead = true;
        burst(a.x, a.y, { count: 4, color: "#a8957a", speed: 80, size: 2, life: 0.25 });
      }
    }
    arrows = arrows.filter((a) => !a.dead);
  }

  function updateBurn(dt) {
    if (boss.burnT <= 0 || boss.dead) return;
    const flame = ABILITIES.archer.flame;
    boss.burnT -= dt;
    boss.burnTick -= dt;
    if (boss.burnTick <= 0) {
      boss.burnTick = flame.burnTick;
      damageBoss(flame.burnDamage, boss.x + rand(-12, 12), boss.y - 10, "#ff6a2a", {
        textColor: "#ff8a3d",
        hit: false,
      });
    }
    if (Math.random() < 0.6) {
      particles.push({
        x: boss.x + rand(-26, 26),
        y: boss.y + rand(-30, 20),
        vx: rand(-15, 15),
        vy: rand(-90, -40),
        life: 0.45,
        maxLife: 0.45,
        size: rand(3, 6),
        color: Math.random() < 0.5 ? "#ff6a2a" : "#ffb347",
      });
    }
  }

  // Arrow Rain: after a short delay, arrows fall across the zone; each one that lands
  // while the boss is inside the zone deals damage.
  function updateRains(dt) {
    const a = ABILITIES.archer.rain;
    const interval = a.duration / a.arrows;
    for (const r of rains) {
      if (r.delay > 0) {
        r.delay -= dt;
        continue;
      }
      r.t += dt;
      while (r.spawned < a.arrows && r.t >= r.spawned * interval) {
        r.spawned += 1;
        const ang = Math.random() * Math.PI * 2;
        const d = Math.sqrt(Math.random()) * a.radius;
        r.falling.push({ x: r.x + Math.cos(ang) * d, y: r.y + Math.sin(ang) * d, h: rand(220, 300) });
      }
      for (const f of r.falling) {
        f.h -= 950 * dt;
        if (f.h <= 0 && !f.landed) {
          f.landed = true;
          burst(f.x, f.y, { count: 3, color: "#d8c8a8", speed: 70, size: 2, life: 0.2 });
          if (!boss.dead && Math.hypot(boss.x - r.x, boss.y - r.y) < a.radius + boss.r * 0.5) {
            const dmg = Math.round(a.damage * damageMul());
            r.total += dmg;
            damageBoss(dmg, f.x, f.y, "#e8ffe0", { showText: false });
          }
        }
      }
      r.falling = r.falling.filter((f) => !f.landed);
      if (r.spawned >= a.arrows && r.falling.length === 0) {
        r.done = true;
        if (r.total > 0) floatText(boss.x, boss.y - 60, `ARROW RAIN ${r.total}`, "#ffd24a");
      }
    }
    rains = rains.filter((r) => !r.done);
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

  function updateShockwaves(dt) {
    for (const w of shockwaves) {
      w.r += SHOCKWAVE.speed * dt;
      if (!w.hit && mode === "playing" && player.alive && Math.hypot(player.x - w.x, player.y - w.y) < w.r + player.r) {
        w.hit = true;
        player.dodgeT = 0;
        player.blocking = false;
        hurtPlayer(w.x, w.y, SHIELD_COLOR);
        const a = Math.atan2(player.y - w.y, player.x - w.x);
        player.kx = Math.cos(a) * SHOCKWAVE.knockback;
        player.ky = Math.sin(a) * SHOCKWAVE.knockback;
      }
    }
    shockwaves = shockwaves.filter((w) => w.r < SHOCKWAVE.maxRadius);
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
      updateRains(dt);
      updateBurn(dt);
      updateFireballs(dt);
      updateShockwaves(dt);
      updateCrystals(dt);
      updateMinions(dt);
      updateZoneRains(dt);

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
      const fire = p.flameShots > 0;
      ctx.save();
      if (full || fire) {
        ctx.shadowColor = fire ? "#ff6a2a" : "#ffd24a";
        ctx.shadowBlur = 12;
      }
      ctx.strokeStyle = fire ? "#ff8a3d" : full ? "#ffd24a" : "#d8c8a8";
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
    drawPlayerAuras();
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
    if (p.bootsT > 0) drawBootWings(f);
    gear(f, "front");
    ctx.restore();
    drawSlashTrail();
  }

  function drawPlayerAuras() {
    const p = player;
    const pulse = 1 + Math.sin(clock * 8) * 0.08;
    const auras = [];
    if (p.infernalShield) auras.push({ color: "255, 106, 42", radius: 26 });
    if (p.lastDance) auras.push({ color: "255, 59, 92", radius: 30 });
    if (p.bootsT > 0) auras.push({ color: "155, 231, 255", radius: 22 });
    if (!auras.length) return;

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const a of auras) {
      const r = a.radius * pulse;
      const g = ctx.createRadialGradient(p.x, p.y, r * 0.3, p.x, p.y, r * 1.4);
      g.addColorStop(0, `rgba(${a.color}, 0.35)`);
      g.addColorStop(1, `rgba(${a.color}, 0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r * 1.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = `rgba(${a.color}, 0.6)`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y + 20, r, r * 0.35, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawBootWings(f) {
    const { x, y, s } = f;
    const flap = Math.sin(clock * 20) * 2 * s;
    ctx.fillStyle = "#e8fbff";
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(x + side * 6 * s, y + 17 * s);
      ctx.lineTo(x + side * 15 * s, y + 11 * s - flap);
      ctx.lineTo(x + side * 12 * s, y + 18 * s);
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawRains() {
    const a = ABILITIES.archer.rain;
    for (const r of rains) {
      const warming = r.delay > 0;
      ctx.save();
      ctx.strokeStyle = "#ffd24a";
      ctx.fillStyle = "#ffd24a";
      ctx.globalAlpha = warming ? 0.15 + (1 - r.delay / a.delay) * 0.15 : 0.18;
      ctx.beginPath();
      ctx.arc(r.x, r.y, a.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.7;
      ctx.lineWidth = 2;
      ctx.setLineDash([10, 8]);
      ctx.lineDashOffset = -clock * 40;
      ctx.stroke();
      ctx.restore();

      ctx.save();
      ctx.strokeStyle = "#e8dcc0";
      ctx.lineWidth = 2;
      for (const f of r.falling) {
        line(f.x - 3, f.y - f.h - 22, f.x, f.y - f.h);
      }
      ctx.restore();
    }
  }

  function bossSwordAngle() {
    const facing = Math.cos(boss.aim) >= 0 ? 1 : -1;
    if (boss.state === "windup" && boss.attack === "slam") {
      const t = 1 - boss.timer / boss.windupTotal;
      return -Math.PI / 2 - facing * 0.4 * (1 - t);
    }
    if (boss.state === "windup" && boss.attack === "charge") return boss.aim;
    if (boss.state === "charge") return boss.chargeDir;
    if (boss.state === "laser") return boss.aim + facing * 1.4;
    if (boss.state === "recover") return Math.PI / 2 + facing * 0.5;
    if (boss.state === "stunned") return Math.PI / 2 + facing * 0.15;
    return boss.aim + facing * 1.0;
  }

  // Fatfat's model: round head on a big round body with stubby feet. Toni and
  // the minions reuse it with their own palette. `e` supplies aim/walk/moving.
  function drawFatfat(e, x, y, s, flash, colors, angry) {
    const facing = Math.cos(e.aim) >= 0 ? 1 : -1;
    const away = Math.sin(e.aim) < -0.35;
    const swing = e.moving ? Math.sin(e.walk) * 3 * s : 0;

    ctx.fillStyle = flash ? "#fff" : colors.feet;
    ctx.beginPath();
    ctx.ellipse(x - 7 * s + swing, y + 18 * s, 5 * s, 3.5 * s, 0, 0, Math.PI * 2);
    ctx.ellipse(x + 7 * s - swing, y + 18 * s, 5 * s, 3.5 * s, 0, 0, Math.PI * 2);
    ctx.fill();

    const bodyY = y + 2 * s;
    if (flash) {
      ctx.fillStyle = "#fff";
    } else {
      const body = ctx.createRadialGradient(x - 6 * s, bodyY - 7 * s, 2 * s, x, bodyY, 18 * s);
      body.addColorStop(0, colors.bodyLight);
      body.addColorStop(1, colors.bodyDark);
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
        ctx.strokeStyle = colors.belly;
        ctx.lineWidth = 1.2 * s;
        ctx.beginPath();
        ctx.arc(x + facing * 2 * s, bodyY + 5 * s, 1.2 * s, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    const headY = y - 19 * s;
    ctx.fillStyle = flash ? "#fff" : colors.head;
    ctx.strokeStyle = flash ? "#fff" : colors.headStroke;
    ctx.lineWidth = 1.5 * s;
    ctx.beginPath();
    ctx.arc(x, headY, 10 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    if (away || flash) return;

    const fx = x + facing * 3 * s;
    const enraged = angry;
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
    const armColor = flash ? "#fff" : bossStats.colors.arm;

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
    drawFatfat(boss, x, y, s, flash, bossStats.colors, isEnraged());
    if (!swordBehind) drawGreatsword();

    // Casting hand glows while a projectile or laser attack winds up.
    const casting =
      (boss.state === "windup" && ["aimed", "spread", "laser"].includes(boss.attack)) || boss.state === "laser";
    if (casting && !boss.dead) {
      const t = boss.state === "laser" ? 1 : 1 - boss.timer / boss.windupTotal;
      const cp = castPoint();
      const color = ATTACK_COLORS[boss.attack || "laser"];
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

    if (boss.dead) return;
    if (boss.shield > 0) drawBossShield(x, y, s);
    if (crystals.length) drawForceField(x, y, s);
    if (boss.state === "stunned") drawStunStars(x, y - 31 * s, s);
  }

  function drawForceField(x, y, s) {
    const cy = y - 6 * s;
    const pulse = 0.5 + Math.sin(boss.t * 6) * 0.5;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.shadowColor = CRYSTAL_COLOR;
    ctx.shadowBlur = 18;
    ctx.fillStyle = CRYSTAL_COLOR;
    ctx.globalAlpha = 0.1 + pulse * 0.06;
    ctx.beginPath();
    ctx.ellipse(x, cy, 27 * s, 32 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = CRYSTAL_COLOR;
    ctx.lineWidth = 3;
    ctx.globalAlpha = 0.6 + pulse * 0.3;
    ctx.setLineDash([12, 6]);
    ctx.lineDashOffset = -boss.t * 40;
    ctx.stroke();
    ctx.restore();
  }

  // Tethers from each crystal to Toni, drawn under the figures.
  function drawCrystalTethers() {
    if (!crystals.length || boss.dead) return;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = CRYSTAL_COLOR;
    ctx.shadowColor = CRYSTAL_COLOR;
    ctx.shadowBlur = 10;
    for (const c of crystals) {
      ctx.globalAlpha = 0.35 + 0.25 * Math.sin(c.t * 10);
      ctx.lineWidth = 2.5;
      ctx.setLineDash([16, 8]);
      ctx.lineDashOffset = c.t * 60;
      line(c.x, c.y - 10, boss.x, boss.y - 6 * BOSS.scale);
    }
    ctx.restore();
  }

  function drawCrystals() {
    for (const c of crystals) {
      const bob = Math.sin(c.t * 3) * 3;
      const cy = c.y - 10 + bob;
      ctx.save();
      ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
      ctx.beginPath();
      ctx.ellipse(c.x, c.y + 14, 12, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowColor = CRYSTAL_COLOR;
      ctx.shadowBlur = 18;
      ctx.fillStyle = c.flash > 0 ? "#fff" : CRYSTAL_COLOR;
      ctx.beginPath();
      ctx.moveTo(c.x, cy - 22);
      ctx.lineTo(c.x + 11, cy);
      ctx.lineTo(c.x, cy + 18);
      ctx.lineTo(c.x - 11, cy);
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "rgba(255, 255, 255, 0.45)";
      ctx.beginPath();
      ctx.moveTo(c.x, cy - 22);
      ctx.lineTo(c.x + 4, cy);
      ctx.lineTo(c.x, cy + 18);
      ctx.lineTo(c.x - 3, cy);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      drawMiniBar(c.x, cy - 32, 36, c.hp / c.maxHp, CRYSTAL_COLOR);
    }
  }

  function drawMinions() {
    const m = TONI.minion;
    for (const e of minions) {
      const rise = e.spawnT > 0 ? 1 - e.spawnT / m.spawnTime : 1;
      ctx.save();
      ctx.globalAlpha = 0.3 + rise * 0.7;
      drawShadow(e.x, e.y, m.scale, 20);
      drawFatfat(e, e.x, e.y, m.scale, e.flash > 0, FATFAT_COLORS, true);
      ctx.restore();
      drawMiniBar(e.x, e.y - 34 * m.scale - 8, 30, e.hp / e.maxHp, "#ff4f4f");
    }
  }

  function drawMiniBar(x, y, w, frac, color) {
    ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
    ctx.fillRect(x - w / 2 - 1, y - 1, w + 2, 6);
    ctx.fillStyle = color;
    ctx.fillRect(x - w / 2, y, w * frac, 4);
  }

  function drawLaser() {
    if (boss.dead) return;
    const cp = castPoint();
    const L = 1400;
    const a = boss.laserAngle;
    ctx.save();
    if (boss.state === "laser") {
      // Locked: the beam path flashes before it fires.
      ctx.strokeStyle = ATTACK_COLORS.laser;
      ctx.globalAlpha = 0.25 + 0.5 * Math.abs(Math.sin(boss.t * 30));
      ctx.lineWidth = TONI.laser.width;
      line(cp.x, cp.y, cp.x + Math.cos(a) * L, cp.y + Math.sin(a) * L);
    }
    if (boss.beamT > 0) {
      const t = boss.beamT / TONI.laser.beamTime;
      ctx.globalCompositeOperation = "lighter";
      ctx.shadowColor = ATTACK_COLORS.laser;
      ctx.shadowBlur = 30;
      ctx.strokeStyle = ATTACK_COLORS.laser;
      ctx.globalAlpha = t;
      ctx.lineWidth = TONI.laser.width * (0.6 + t * 0.6);
      line(cp.x, cp.y, cp.x + Math.cos(a) * L, cp.y + Math.sin(a) * L);
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = TONI.laser.width * 0.3 * t;
      line(cp.x, cp.y, cp.x + Math.cos(a) * L, cp.y + Math.sin(a) * L);
    }
    ctx.restore();
  }

  function drawZoneRains() {
    const r = TONI.rain;
    ctx.save();
    ctx.beginPath();
    ctx.rect(ARENA.x, ARENA.y, ARENA.w, ARENA.h);
    ctx.clip();
    for (const z of zoneRains) {
      const t = Math.min(1, z.t / z.warn);
      for (const c of z.cells) {
        const safe = c === z.safe;
        ctx.fillStyle = safe ? "#5dff8a" : "#ff3b3b";
        ctx.globalAlpha = z.landed ? (safe ? 0.12 : 0.35) * (z.linger / 0.35) : safe ? 0.14 + 0.06 * Math.sin(z.t * 10) : 0.08 + t * 0.22;
        ctx.fillRect(c.x, c.y, c.w, c.h);
        ctx.strokeStyle = safe ? "#5dff8a" : "#ff6a5a";
        ctx.globalAlpha = z.landed ? 0.3 : 0.7;
        ctx.lineWidth = 3;
        ctx.strokeRect(c.x + 1.5, c.y + 1.5, c.w - 3, c.h - 3);
        if (safe && !z.landed) {
          ctx.globalAlpha = 0.9;
          ctx.fillStyle = "#5dff8a";
          ctx.font = "bold 22px 'Trebuchet MS', system-ui, sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("SAFE", c.x + c.w / 2, c.y + c.h / 2);
        }
      }
      // Countdown bar across the top of the arena.
      if (!z.landed) {
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = "#ff3b3b";
        ctx.fillRect(ARENA.x, ARENA.y, ARENA.w * (1 - t), 4);
      }
      const fallLeft = z.warn - z.t;
      if (!z.landed && fallLeft < r.fallTime) {
        const k = fallLeft / r.fallTime;
        ctx.globalAlpha = 1;
        ctx.fillStyle = CRYSTAL_COLOR;
        ctx.shadowColor = CRYSTAL_COLOR;
        ctx.shadowBlur = 10;
        for (const d of z.drops) {
          const y = d.y - d.h * k;
          ctx.beginPath();
          ctx.moveTo(d.x, y - 14);
          ctx.lineTo(d.x + 6, y);
          ctx.lineTo(d.x, y + 8);
          ctx.lineTo(d.x - 6, y);
          ctx.closePath();
          ctx.fill();
        }
        ctx.shadowBlur = 0;
      }
    }
    ctx.restore();
  }

  function drawShockwaves() {
    ctx.save();
    if (!boss.dead && boss.state === "stunned" && boss.stunT < SHOCKWAVE.warnTime) {
      const t = 1 - boss.stunT / SHOCKWAVE.warnTime;
      const fy = boss.y + 16 * BOSS.scale;
      ctx.strokeStyle = SHIELD_COLOR;
      ctx.globalAlpha = 0.3 + 0.5 * Math.abs(Math.sin(boss.t * 18));
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(boss.x, fy, 30 + t * 40, (30 + t * 40) * 0.45, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = "lighter";
    for (const w of shockwaves) {
      const fade = 1 - w.r / SHOCKWAVE.maxRadius;
      ctx.shadowColor = SHIELD_COLOR;
      ctx.shadowBlur = 20;
      ctx.strokeStyle = SHIELD_COLOR;
      ctx.globalAlpha = 0.9 * fade;
      ctx.lineWidth = 10 * fade + 2;
      ctx.beginPath();
      ctx.arc(w.x, w.y, w.r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = "#fff";
      ctx.globalAlpha = 0.7 * fade;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(w.x, w.y, Math.max(0, w.r - 8), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawBossShield(x, y, s) {
    const cy = y - 6 * s;
    const pulse = 0.5 + Math.sin(boss.t * 4) * 0.5;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.shadowColor = SHIELD_COLOR;
    ctx.shadowBlur = 16;
    ctx.fillStyle = SHIELD_COLOR;
    ctx.globalAlpha = boss.shieldFlash > 0 ? 0.35 : 0.08 + pulse * 0.05;
    ctx.beginPath();
    ctx.ellipse(x, cy, 25 * s, 30 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = boss.shieldFlash > 0 ? "#fff" : SHIELD_COLOR;
    ctx.lineWidth = 2.5;
    ctx.globalAlpha = 0.55 + pulse * 0.25;
    ctx.stroke();
    ctx.restore();

    // One pip per remaining hit, floating above the head.
    ctx.save();
    const total = bossStats.shieldHits;
    const gap = 16;
    const startX = x - ((total - 1) * gap) / 2;
    const py = y - 35 * s;
    for (let i = 0; i < total; i++) {
      const px = startX + i * gap;
      ctx.beginPath();
      ctx.moveTo(px, py - 6);
      ctx.lineTo(px + 5, py - 3);
      ctx.lineTo(px + 5, py + 2);
      ctx.lineTo(px, py + 6);
      ctx.lineTo(px - 5, py + 2);
      ctx.lineTo(px - 5, py - 3);
      ctx.closePath();
      if (i < boss.shield) {
        ctx.fillStyle = SHIELD_COLOR;
        ctx.shadowColor = SHIELD_COLOR;
        ctx.shadowBlur = 8;
        ctx.fill();
        ctx.shadowBlur = 0;
      }
      ctx.strokeStyle = "rgba(255, 255, 255, 0.7)";
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawStunStars(x, y, s) {
    ctx.save();
    ctx.fillStyle = "#ffe08a";
    ctx.shadowColor = "#ffe08a";
    ctx.shadowBlur = 8;
    for (let i = 0; i < 3; i++) {
      const a = boss.t * 4 + (i / 3) * Math.PI * 2;
      const sx = x + Math.cos(a) * 12 * s;
      const sy = y + Math.sin(a) * 3.5 * s;
      ctx.beginPath();
      for (let k = 0; k < 10; k++) {
        const r = k % 2 ? 2.5 : 6;
        const pa = -Math.PI / 2 + (k * Math.PI) / 5;
        ctx.lineTo(sx + Math.cos(pa) * r, sy + Math.sin(pa) * r);
      }
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
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
      const len = bossStats.chargeDistance + boss.r;
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
    } else if (boss.attack === "nova") {
      const n = TONI.nova;
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.15 + t * 0.4;
      ctx.lineWidth = 2;
      for (let i = 0; i < n.shots; i++) {
        const a = (i / n.shots) * Math.PI * 2 + boss.t;
        const r1 = 40;
        const r2 = 40 + 80 * t;
        line(boss.x + Math.cos(a) * r1, boss.y + Math.sin(a) * r1, boss.x + Math.cos(a) * r2, boss.y + Math.sin(a) * r2);
      }
    } else if (boss.attack === "laser") {
      // Tracking: a thin line follows the player until it locks.
      const cp = castPoint();
      const a = Math.atan2(player.y - cp.y, player.x - cp.x);
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.25 + t * 0.4;
      ctx.lineWidth = 2;
      ctx.setLineDash([10, 8]);
      ctx.lineDashOffset = -boss.t * 120;
      line(cp.x, cp.y, cp.x + Math.cos(a) * 1400, cp.y + Math.sin(a) * 1400);
    } else if (boss.attack === "crystals" || boss.attack === "rain" || boss.attack === "minions") {
      const fy = boss.y + 16 * BOSS.scale;
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      for (let k = 0; k < 2; k++) {
        const r = 30 + ((t + k * 0.5) % 1) * 70;
        ctx.globalAlpha = 0.7 * (1 - ((t + k * 0.5) % 1));
        ctx.beginPath();
        ctx.ellipse(boss.x, fy, r, r * 0.4, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    } else if (boss.attack === "slam") {
      const fy = boss.y + 16 * BOSS.scale;
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.1 + t * 0.15;
      ctx.beginPath();
      ctx.arc(boss.x, fy, bossStats.slamRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.3 + t * 0.3;
      ctx.beginPath();
      ctx.arc(boss.x, fy, bossStats.slamRadius * t, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.8;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(boss.x, fy, bossStats.slamRadius, 0, Math.PI * 2);
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
      if (a.full || a.fire || a.rapid) {
        ctx.shadowColor = a.fire ? "#ff6a2a" : a.rapid ? "#9be7ff" : "#ffd24a";
        ctx.shadowBlur = 12;
      }
      ctx.strokeStyle = a.fire ? "#ff8a3d" : a.rapid ? "#9be7ff" : a.full ? "#ffd24a" : "#c8a878";
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
      if (f.crystal) {
        const a = Math.atan2(f.vy, f.vx);
        const dx = Math.cos(a);
        const dy = Math.sin(a);
        ctx.beginPath();
        ctx.moveTo(f.x + dx * f.r * 1.8, f.y + dy * f.r * 1.8);
        ctx.lineTo(f.x - dy * f.r * 0.8, f.y + dx * f.r * 0.8);
        ctx.lineTo(f.x - dx * f.r * 1.4, f.y - dy * f.r * 1.4);
        ctx.lineTo(f.x + dy * f.r * 0.8, f.y - dx * f.r * 0.8);
        ctx.closePath();
        ctx.fill();
        continue;
      }
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
    const barW = 380;
    const barH = 20;
    const barX = (W - barW) / 2;
    const barY = 18;
    const ratio = boss.hp / bossStats.maxHp;
    const trail = boss.displayHp / bossStats.maxHp;

    ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
    ctx.beginPath();
    ctx.roundRect(barX - 3, barY - 3, barW + 6, barH + 6, 6);
    ctx.fill();
    ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
    ctx.fillRect(barX, barY, barW * trail, barH);
    const fill = ctx.createLinearGradient(barX, 0, barX + barW, 0);
    if (crystals.length) {
      fill.addColorStop(0, "#7a3fb8");
      fill.addColorStop(1, CRYSTAL_COLOR);
    } else {
      fill.addColorStop(0, isEnraged() ? "#ff2a2a" : "#b8322a");
      fill.addColorStop(1, isEnraged() ? "#ff8a3d" : "#e0603a");
    }
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
    const labelParts = [bossStats.name.toUpperCase()];
    if (selectedDifficulty !== "easy") labelParts.push(DIFFICULTIES[selectedDifficulty].name.toUpperCase());
    if (boss.state === "stunned") labelParts.push("STUNNED");
    else if (crystals.length) labelParts.push("INVINCIBLE");
    else if (isEnraged()) labelParts.push(bossStats.kind === "toni" ? "RAGE" : "ENRAGED");
    ctx.fillText(labelParts.join(" · "), barX + 8, barY + barH / 2 + 1);
    ctx.textAlign = "right";
    ctx.fillText(`${Math.ceil(boss.hp)} / ${bossStats.maxHp}`, barX + barW - 8, barY + barH / 2 + 1);
    ctx.shadowBlur = 0;

    if (boss.state === "stunned") {
      ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
      ctx.fillRect(barX, barY + barH + 4, barW, 5);
      ctx.fillStyle = "#ffe08a";
      ctx.fillRect(barX, barY + barH + 4, barW * (boss.stunT / boss.stunTotal), 5);
    }

    // Player hearts.
    ctx.textAlign = "left";
    ctx.font = font(13);
    ctx.fillStyle = player.cls === "archer" ? "#8fe39a" : "#8fb6ff";
    ctx.fillText(player.def.name.toUpperCase(), 26, 18);
    for (let i = 0; i < player.maxHp; i++) {
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

    drawAbilityHud(font);

    // Dodge cooldown.
    const ready = player.dodgeCd <= 0;
    const cdFrac = ready ? 1 : 1 - player.dodgeCd / (dodgeCooldown() + DODGE.duration);
    const dx = W - 134;
    ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
    ctx.fillRect(dx, 30, 110, 10);
    ctx.fillStyle = ready ? "#ffcf7a" : "#8a7050";
    ctx.fillRect(dx, 30, 110 * cdFrac, 10);
    ctx.font = font(12);
    ctx.fillStyle = ready ? "#ffcf7a" : "#a89070";
    ctx.fillText(ready ? "DODGE [SPACE]" : "DODGE", dx, 18);
  }

  function abilityStatus() {
    const p = player;
    const cdText = p.abilityCd > 0 ? `${p.abilityCd.toFixed(1)}s` : "READY";
    switch (p.abilityId) {
      case "flame":
        return p.flameShots > 0 ? `${p.flameShots} FLAMING ARROWS` : cdText;
      case "boots":
        return p.bootsT > 0 ? `ACTIVE ${p.bootsT.toFixed(1)}s` : cdText;
      case "call":
        return `x${p.callStacks} STACKS · ${cdText}`;
      case "infernal":
        return p.infernalShield ? (p.abilityCd > 0 ? `SHIELD UP · ${cdText}` : "SHIELD UP") : cdText;
      case "lastDance":
        return p.lastDance ? "ACTIVE!" : "PASSIVE · AT 1 HEART";
      default:
        return cdText;
    }
  }

  function drawAbilityHud(font) {
    const p = player;
    const a = p.ability;
    const x = 686;
    const w = 124;
    const active = p.bootsT > 0 || p.infernalShield || p.flameShots > 0 || p.lastDance;
    const frac = a.passive ? (p.lastDance ? 1 : 0) : p.abilityCd > 0 ? 1 - p.abilityCd / a.cooldown : 1;
    const ready = !a.passive && p.abilityCd <= 0;
    const color = active ? "#ff8a3d" : ready ? "#8fe3ff" : "#5a7a8a";

    ctx.textAlign = "left";
    ctx.font = font(12);
    ctx.fillStyle = color;
    ctx.fillText(a.passive ? a.name.toUpperCase() : `[Q] ${a.name.toUpperCase()}`, x, 18);
    ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
    ctx.fillRect(x, 30, w, 10);
    ctx.fillStyle = color;
    ctx.fillRect(x, 30, w * frac, 10);
    ctx.font = font(10);
    ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
    ctx.fillText(abilityStatus(), x, 51);
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

    if (mode !== "difficulty" && mode !== "classes" && mode !== "abilities") {
      drawZoneRains();
      drawTelegraphs();
      drawShockwaves();
      drawRains();
      drawCrystalTethers();
      drawCrystals();
      drawMinions();
      // Whoever stands lower on screen is closer to the camera, so draw them last.
      if (boss.y + 20 * BOSS.scale < player.y + 20 * PLAYER.scale) {
        drawBossFigure();
        drawPlayer();
      } else {
        drawPlayer();
        drawBossFigure();
      }
      drawLaser();
      drawArrows();
      drawFireballs();
    }
    drawParticles();
    ctx.restore();

    if (mode !== "difficulty" && mode !== "classes" && mode !== "abilities") drawHud();
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

  reset(selectedClass, selectedAbility);
  requestAnimationFrame(loop);
})();
