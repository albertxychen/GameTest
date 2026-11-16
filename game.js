(() => {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const W = canvas.width;
  const H = canvas.height;

  const scoreEl = document.getElementById("score");
  const bestEl = document.getElementById("best");
  const finalScoreEl = document.getElementById("final-score");
  const newBestEl = document.getElementById("new-best");
  const startScreen = document.getElementById("start-screen");
  const gameOverScreen = document.getElementById("game-over-screen");

  const COIN_POINTS = 10;
  const PLAYER_SPEED = 320;

  let state = "start"; // "start" | "playing" | "over"
  let player, obstacles, coins, particles;
  let score, elapsed, obstacleTimer, coinTimer, lastTime;
  let best = Number(localStorage.getItem("coinDodgerBest")) || 0;
  bestEl.textContent = best;

  const keys = {};

  function reset() {
    player = { x: W / 2 - 18, y: H - 70, w: 36, h: 36 };
    obstacles = [];
    coins = [];
    particles = [];
    score = 0;
    elapsed = 0;
    obstacleTimer = 0;
    coinTimer = 0.5;
    scoreEl.textContent = score;
  }

  function startGame() {
    reset();
    state = "playing";
    startScreen.classList.add("hidden");
    gameOverScreen.classList.add("hidden");
    lastTime = performance.now();
  }

  function endGame() {
    state = "over";
    finalScoreEl.textContent = score;
    const isBest = score > best;
    if (isBest) {
      best = score;
      localStorage.setItem("coinDodgerBest", best);
      bestEl.textContent = best;
    }
    newBestEl.classList.toggle("hidden", !isBest);
    gameOverScreen.classList.remove("hidden");
  }

  // Difficulty ramps up over time.
  function difficulty() {
    return Math.min(1 + elapsed / 20, 3.5);
  }

  function spawnObstacle() {
    const w = 30 + Math.random() * 50;
    obstacles.push({
      x: Math.random() * (W - w),
      y: -40,
      w,
      h: 22 + Math.random() * 18,
      vy: (140 + Math.random() * 100) * difficulty(),
      hue: Math.floor(Math.random() * 40),
    });
  }

  function spawnCoin() {
    const r = 11;
    coins.push({
      x: r + Math.random() * (W - r * 2),
      y: -r,
      r,
      vy: 120 + Math.random() * 60,
      spin: Math.random() * Math.PI * 2,
    });
  }

  function burst(x, y, color, count) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 60 + Math.random() * 160;
      particles.push({
        x, y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: 0.5 + Math.random() * 0.3,
        color,
      });
    }
  }

  function rectsOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function circleRectOverlap(c, r) {
    const cx = Math.max(r.x, Math.min(c.x, r.x + r.w));
    const cy = Math.max(r.y, Math.min(c.y, r.y + r.h));
    const dx = c.x - cx;
    const dy = c.y - cy;
    return dx * dx + dy * dy < c.r * c.r;
  }

  function update(dt) {
    elapsed += dt;

    let dx = 0, dy = 0;
    if (keys.ArrowLeft) dx -= 1;
    if (keys.ArrowRight) dx += 1;
    if (keys.ArrowUp) dy -= 1;
    if (keys.ArrowDown) dy += 1;
    if (dx && dy) { dx *= Math.SQRT1_2; dy *= Math.SQRT1_2; }
    player.x = Math.max(0, Math.min(W - player.w, player.x + dx * PLAYER_SPEED * dt));
    player.y = Math.max(0, Math.min(H - player.h, player.y + dy * PLAYER_SPEED * dt));

    obstacleTimer -= dt;
    if (obstacleTimer <= 0) {
      spawnObstacle();
      obstacleTimer = (0.6 + Math.random() * 0.5) / difficulty();
    }
    coinTimer -= dt;
    if (coinTimer <= 0) {
      spawnCoin();
      coinTimer = 0.9 + Math.random() * 1.2;
    }

    // Slightly forgiving hitbox for the player against obstacles.
    const hitbox = { x: player.x + 4, y: player.y + 4, w: player.w - 8, h: player.h - 8 };

    for (const o of obstacles) {
      o.y += o.vy * dt;
      if (rectsOverlap(hitbox, o)) {
        burst(player.x + player.w / 2, player.y + player.h / 2, "#4ad8ff", 30);
        endGame();
        return;
      }
    }
    obstacles = obstacles.filter((o) => o.y < H + 50);

    for (const c of coins) {
      c.y += c.vy * dt;
      c.spin += dt * 6;
      if (!c.taken && circleRectOverlap(c, player)) {
        c.taken = true;
        score += COIN_POINTS;
        scoreEl.textContent = score;
        burst(c.x, c.y, "#ffd84a", 12);
      }
    }
    coins = coins.filter((c) => !c.taken && c.y < H + 20);
  }

  function updateParticles(dt) {
    for (const p of particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
    }
    particles = particles.filter((p) => p.life > 0);
  }

  function drawPlayer() {
    const { x, y, w, h } = player;
    ctx.fillStyle = "#4ad8ff";
    ctx.shadowColor = "#4ad8ff";
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 8);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#0b0f1e";
    ctx.fillRect(x + 9, y + 11, 5, 7);
    ctx.fillRect(x + w - 14, y + 11, 5, 7);
  }

  function drawObstacle(o) {
    ctx.fillStyle = `hsl(${o.hue}, 85%, 55%)`;
    ctx.beginPath();
    ctx.roundRect(o.x, o.y, o.w, o.h, 4);
    ctx.fill();
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.fillRect(o.x, o.y + o.h - 5, o.w, 5);
  }

  function drawCoin(c) {
    const sx = Math.abs(Math.cos(c.spin)) * c.r + 2;
    ctx.fillStyle = "#ffd84a";
    ctx.shadowColor = "#ffd84a";
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.ellipse(c.x, c.y, sx, c.r, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "#b8860b";
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  const stars = Array.from({ length: 60 }, () => ({
    x: Math.random() * W,
    y: Math.random() * H,
    s: Math.random() * 1.8 + 0.4,
  }));

  function drawBackground(dt) {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    for (const st of stars) {
      st.y += st.s * 30 * dt;
      if (st.y > H) { st.y = 0; st.x = Math.random() * W; }
      ctx.fillRect(st.x, st.y, st.s, st.s);
    }
  }

  function render(dt) {
    drawBackground(dt);
    if (state !== "start") {
      obstacles.forEach(drawObstacle);
      coins.forEach(drawCoin);
      if (state === "playing") drawPlayer();
    }
    for (const p of particles) {
      ctx.globalAlpha = Math.max(p.life / 0.8, 0);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
    }
    ctx.globalAlpha = 1;
  }

  function loop(now) {
    const dt = Math.min((now - (lastTime || now)) / 1000, 0.05);
    lastTime = now;
    if (state === "playing") update(dt);
    updateParticles(dt);
    render(dt);
    requestAnimationFrame(loop);
  }

  window.addEventListener("keydown", (e) => {
    if (e.key.startsWith("Arrow")) {
      keys[e.key] = true;
      e.preventDefault();
    }
    if (e.key === "Enter" && state !== "playing") startGame();
  });
  window.addEventListener("keyup", (e) => {
    keys[e.key] = false;
  });
  window.addEventListener("blur", () => {
    for (const k in keys) keys[k] = false;
  });

  document.getElementById("start-btn").addEventListener("click", startGame);
  document.getElementById("restart-btn").addEventListener("click", startGame);

  reset();
  requestAnimationFrame(loop);
})();
