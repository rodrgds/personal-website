<script lang="ts">
  import { onMount, tick } from "svelte";
  import HoverMorphHint from "../../ui/HoverMorphHint.svelte";
  import { getStoredJSON, setStoredJSON } from "../../../lib/client-storage";

  interface GameScore {
    highScore: number;
  }

  const STORAGE_KEY = "table_tennis_now_game_score";
  const DEFAULT_SCORE: GameScore = { highScore: 0 };

  const PADDLE_WIDTH = 96;
  const PADDLE_HEIGHT = 12;
  const BALL_RADIUS = 8;

  const START_LAUNCH_SPEED = 520;
  const GRAVITY = 720;
  const AIR_DRAG = 0.2;
  const SIDE_KICK_MIN = 70;
  const SIDE_KICK_MAX = 125;
  const TRAIL_LIFETIME = 0.18;
  const BURST_LIFETIME = 0.46;

  class Particle {
    id: number;
    x: number;
    y: number;
    vx: number;
    vy: number;
    life: number;
    maxLife: number;
    size: number;

    constructor(id: number, x: number, y: number, vx: number, vy: number, life: number, size: number) {
      this.id = id;
      this.x = x;
      this.y = y;
      this.vx = vx;
      this.vy = vy;
      this.life = life;
      this.maxLife = life;
      this.size = size;
    }

    update(dt: number) {
      this.life -= dt;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      return this.life > 0;
    }
  }

  let host = $state<HTMLSpanElement | undefined>(undefined);
  let playfieldContainer = $state<HTMLDivElement | undefined>(undefined);
  let canvas = $state<HTMLCanvasElement | undefined>(undefined);
  let ctx: CanvasRenderingContext2D | null = null;

  let hovered = $state(false);
  let active = $state(false);
  let fadingOut = $state(false);
  let visible = $state(false);

  let pointerId = $state<number | null>(null);
  let pointerClientX = 0;
  let pointerClientY = 0;

  let fieldWidth = 0;
  let fieldHeight = 0;
  let dpr = 1;

  let ballX = 0;
  let ballY = 0;
  let ballVx = 0;
  let ballVy = 0;

  let paddleX = 0;
  let paddleY = 0;
  let paddleVx = 0;
  let paddleVy = 0;
  let paddleAngle = 0;

  let streak = $state(0);
  let highScore = $state(0);
  let trailParticles: Particle[] = [];
  let burstParticles: Particle[] = [];

  let previousTrajectoryX = 0;
  let previousTrajectoryY = 0;
  let repeatedTrajectoryCount = 0;
  let antiCheatCooldown = 0;
  let hitCooldown = 0;
  let nextParticleId = 1;

  let linkColor = $state("rgba(0, 102, 204, 0.8)");

  let rafId: number | undefined;
  let lastFrame = 0;
  let fadeTimeout: ReturnType<typeof setTimeout> | undefined;

  function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }

  function lerp(from: number, to: number, alpha: number): number {
    return from + (to - from) * alpha;
  }

  function randomRange(min: number, max: number): number {
    return min + Math.random() * (max - min);
  }

  function randomSideKick(): number {
    const direction = Math.random() < 0.5 ? -1 : 1;
    return direction * randomRange(SIDE_KICK_MIN, SIDE_KICK_MAX);
  }

  function syncFieldRect(): void {
    if (!playfieldContainer || !canvas) return;
    const rect = playfieldContainer.getBoundingClientRect();
    fieldWidth = rect.width;
    fieldHeight = rect.height;
    dpr = window.devicePixelRatio || 1;
    
    canvas.width = fieldWidth * dpr;
    canvas.height = fieldHeight * dpr;
    canvas.style.width = `${fieldWidth}px`;
    canvas.style.height = `${fieldHeight}px`;
    
    ctx = canvas.getContext("2d", { alpha: true });
    if (ctx) {
      ctx.scale(dpr, dpr);
      const style = getComputedStyle(document.documentElement);
      linkColor = style.getPropertyValue("--link-color").trim() || "rgba(0, 102, 204, 0.8)";
    }
  }

  function resetSimulation(startX: number, startY: number): void {
    paddleX = clamp(startX, PADDLE_WIDTH * 0.5, fieldWidth - PADDLE_WIDTH * 0.5);
    paddleY = clamp(startY, PADDLE_HEIGHT * 1.2, fieldHeight - PADDLE_HEIGHT * 1.1);
    paddleVx = 0;
    paddleVy = 0;
    paddleAngle = 0;

    ballX = paddleX;
    ballY = paddleY - BALL_RADIUS - PADDLE_HEIGHT * 0.95;
    ballVx = randomSideKick();
    ballVy = -START_LAUNCH_SPEED;
    streak = 0;
    previousTrajectoryX = 0;
    previousTrajectoryY = 0;
    repeatedTrajectoryCount = 0;
    antiCheatCooldown = 0;
    hitCooldown = 0;
    trailParticles = [];
    burstParticles = [];
  }

  function respawnBallOnPaddle(): void {
    ballX = paddleX;
    ballY = paddleY - BALL_RADIUS - PADDLE_HEIGHT * 0.95;
    ballVx = randomSideKick() + paddleVx * 0.04;
    ballVy = -START_LAUNCH_SPEED;
    persistHighScore();
    streak = 0;
    previousTrajectoryX = 0;
    previousTrajectoryY = 0;
    repeatedTrajectoryCount = 0;
    antiCheatCooldown = Math.max(antiCheatCooldown, 0.5);
    hitCooldown = 0;
  }

  function persistHighScore(): void {
    if (streak > highScore) {
      highScore = streak;
      setStoredJSON(STORAGE_KEY, { highScore });
    }
  }

  function spawnTrail(x: number, y: number): void {
    const p = new Particle(
      nextParticleId++,
      x + randomRange(-1.6, 1.6),
      y + randomRange(-1.6, 1.6),
      randomRange(-18, 18),
      randomRange(-12, 12),
      TRAIL_LIFETIME,
      randomRange(2.2, 4.2)
    );
    trailParticles.push(p);
    if (trailParticles.length > 56) trailParticles.shift();
  }

  function spawnImpactBurst(x: number, y: number, side: number): void {
    for (let i = 0; i < 12; i += 1) {
      const outward = side < 0 ? 1 : -1;
      const p = new Particle(
        nextParticleId++,
        x,
        y,
        outward * randomRange(45, 120) + randomRange(-12, 12),
        randomRange(-72, 72),
        BURST_LIFETIME,
        randomRange(2.2, 5.2)
      );
      burstParticles.push(p);
    }
    if (burstParticles.length > 100) burstParticles.splice(0, burstParticles.length - 100);
  }

  function applyAntiCheatKick(): void {
    const side = Math.random() < 0.5 ? -1 : 1;
    const kick = side * randomRange(170, 290);
    ballVx += kick;
    ballVy -= randomRange(50, 95);

    const impactX = ballX + side * randomRange(8, 22);
    const impactY = ballY + randomRange(-8, 8);
    spawnImpactBurst(impactX, impactY, side);

    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("app:toast", {
          detail: {
            message: "oh come on that's no fun!",
            duration: 1900,
          },
        }),
      );
    }

    repeatedTrajectoryCount = 0;
    previousTrajectoryX = 0;
    previousTrajectoryY = 0;
    antiCheatCooldown = 2.8;
  }

  function registerTrajectoryAfterBounce(): void {
    const speed = Math.hypot(ballVx, ballVy);
    if (speed < 160 || antiCheatCooldown > 0) return;

    const trajectoryX = ballVx / speed;
    const trajectoryY = ballVy / speed;
    const isNearlyVertical = Math.abs(trajectoryX) < 0.18;

    if (!isNearlyVertical) {
      repeatedTrajectoryCount = 0;
      previousTrajectoryX = 0;
      previousTrajectoryY = 0;
      return;
    }

    if (previousTrajectoryX !== 0 || previousTrajectoryY !== 0) {
      const alignment = trajectoryX * previousTrajectoryX + trajectoryY * previousTrajectoryY;
      if (alignment > 0.992) {
        repeatedTrajectoryCount += 1;
      } else {
        repeatedTrajectoryCount = 0;
      }
    } else {
      repeatedTrajectoryCount = 0;
    }

    previousTrajectoryX = trajectoryX;
    previousTrajectoryY = trajectoryY;

    if (repeatedTrajectoryCount >= 3) applyAntiCheatKick();
  }

  function pointerToField(clientX: number, clientY: number): { x: number; y: number } {
    if (!playfieldContainer) return { x: fieldWidth * 0.5, y: fieldHeight * 0.78 };
    const rect = playfieldContainer.getBoundingClientRect();
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  }

  async function beginInteraction(event: PointerEvent): Promise<void> {
    pointerId = event.pointerId;
    pointerClientX = event.clientX;
    pointerClientY = event.clientY;

    visible = true;
    active = true;
    fadingOut = false;
    if (fadeTimeout) {
      clearTimeout(fadeTimeout);
      fadeTimeout = undefined;
    }

    await tick();
    syncFieldRect();
    const start = pointerToField(event.clientX, event.clientY);
    resetSimulation(start.x, start.y);

    const target = event.currentTarget;
    if (target instanceof Element) {
      try {
        target.setPointerCapture(event.pointerId);
      } catch {
        // ignore
      }
    }

    if (!rafId) {
      lastFrame = 0;
      rafId = requestAnimationFrame(simulationFrame);
    }
  }

  function endInteraction(): void {
    if (!active) return;
    active = false;
    pointerId = null;
    persistHighScore();
    streak = 0;
    fadingOut = true;

    if (fadeTimeout) clearTimeout(fadeTimeout);
    fadeTimeout = setTimeout(() => {
      fadingOut = false;
      visible = false;
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = undefined;
      }
    }, 230);
  }

  function onPointerDown(event: PointerEvent): void {
    event.preventDefault();
    void beginInteraction(event);
  }

  function onPointerMove(event: PointerEvent): void {
    if (!active || pointerId === null || event.pointerId !== pointerId) return;
    pointerClientX = event.clientX;
    pointerClientY = event.clientY;
  }

  function onPointerStop(event: PointerEvent): void {
    if (pointerId === null || event.pointerId !== pointerId) return;
    endInteraction();
  }

  function renderGame() {
    if (!ctx || !canvas) return;

    // Clear canvas
    ctx.clearRect(0, 0, fieldWidth, fieldHeight);

    // Draw trail particles
    ctx.fillStyle = "rgba(155, 155, 155, 0.5)";
    for (const p of trailParticles) {
      ctx.globalAlpha = p.life / p.maxLife;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Draw burst particles
    ctx.fillStyle = linkColor;
    for (const p of burstParticles) {
      ctx.globalAlpha = p.life / p.maxLife;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1.0;

    // Draw ball
    ctx.save();
    ctx.translate(ballX, ballY);
    ctx.beginPath();
    ctx.arc(0, 0, BALL_RADIUS, 0, Math.PI * 2);
    const ballGradient = ctx.createRadialGradient(-BALL_RADIUS * 0.3, -BALL_RADIUS * 0.3, 0, 0, 0, BALL_RADIUS);
    ballGradient.addColorStop(0, "#ffffff");
    ballGradient.addColorStop(0.45, "#ffffff");
    ballGradient.addColorStop(0.74, "#ececec");
    ballGradient.addColorStop(1, "#cacaca");
    ctx.fillStyle = ballGradient;
    ctx.shadowBlur = 8;
    ctx.shadowColor = "rgba(0, 0, 0, 0.28)";
    ctx.shadowOffsetY = 2;
    ctx.fill();
    ctx.restore();

    // Draw paddle
    ctx.save();
    ctx.translate(paddleX, paddleY);
    ctx.rotate(paddleAngle);
    ctx.beginPath();
    // Round rect for paddle
    const hw = PADDLE_WIDTH / 2;
    const hh = PADDLE_HEIGHT / 2;
    ctx.roundRect(-hw, -hh, PADDLE_WIDTH, PADDLE_HEIGHT, hh);
    ctx.fillStyle = linkColor;
    ctx.shadowBlur = 10;
    ctx.shadowColor = "rgba(0, 0, 0, 0.24)";
    ctx.shadowOffsetY = 4;
    ctx.fill();
    ctx.restore();
  }

  function simulationFrame(timestamp: number): void {
    if (!visible || !playfieldContainer) {
      rafId = undefined;
      return;
    }

    if (!lastFrame) lastFrame = timestamp;
    const dt = clamp((timestamp - lastFrame) / 1000, 0.001, 0.028);
    lastFrame = timestamp;
    antiCheatCooldown = Math.max(0, antiCheatCooldown - dt);
    hitCooldown = Math.max(0, hitCooldown - dt);

    const pointer = pointerToField(pointerClientX, pointerClientY);

    const targetPaddleX = clamp(pointer.x, PADDLE_WIDTH * 0.5, fieldWidth - PADDLE_WIDTH * 0.5);
    const targetPaddleY = clamp(pointer.y, PADDLE_HEIGHT * 1.2, fieldHeight - PADDLE_HEIGHT * 1.2);

    const previousFramePaddleX = paddleX;
    const previousFramePaddleY = paddleY;
    const previousFrameAngle = paddleAngle;

    const nextPaddleX = lerp(paddleX, targetPaddleX, 0.42);
    const nextPaddleY = lerp(paddleY, targetPaddleY, 0.36);
    
    paddleVx = (nextPaddleX - previousFramePaddleX) / dt;
    paddleVy = (nextPaddleY - previousFramePaddleY) / dt;
    
    const targetAngle = clamp(paddleVx * 0.0014, -0.44, 0.44);
    const nextPaddleAngle = lerp(paddleAngle, targetAngle, 0.25);

    const SUBSTEPS = 6;
    const stepDt = dt / SUBSTEPS;

    for (let i = 0; i < SUBSTEPS; i++) {
      const alpha = (i + 1) / SUBSTEPS;
      
      paddleX = lerp(previousFramePaddleX, nextPaddleX, alpha);
      paddleY = lerp(previousFramePaddleY, nextPaddleY, alpha);
      paddleAngle = lerp(previousFrameAngle, nextPaddleAngle, alpha);

      ballVy += GRAVITY * stepDt;
      const drag = Math.exp(-AIR_DRAG * stepDt);
      ballVx *= drag;
      ballX += ballVx * stepDt;
      ballY += ballVy * stepDt;

      if (i === 0) spawnTrail(ballX, ballY);

      if (ballX - BALL_RADIUS <= 0) {
        ballX = BALL_RADIUS;
        ballVx = Math.abs(ballVx) * 0.9;
      } else if (ballX + BALL_RADIUS >= fieldWidth) {
        ballX = fieldWidth - BALL_RADIUS;
        ballVx = -Math.abs(ballVx) * 0.9;
      }

      if (ballY - BALL_RADIUS <= 0) {
        ballY = BALL_RADIUS;
        ballVy = Math.abs(ballVy) * 0.84;
      } else if (ballY - BALL_RADIUS > fieldHeight) {
        respawnBallOnPaddle();
      }

      const cos = Math.cos(paddleAngle);
      const sin = Math.sin(paddleAngle);
      const localX = cos * (ballX - paddleX) + sin * (ballY - paddleY);
      const localY = -sin * (ballX - paddleX) + cos * (ballY - paddleY);

      const halfW = PADDLE_WIDTH * 0.5;
      const halfH = PADDLE_HEIGHT * 0.5;

      const closestX = clamp(localX, -halfW, halfW);
      const closestY = clamp(localY, -halfH, halfH);
      const deltaX = localX - closestX;
      const deltaY = localY - closestY;
      const distSq = deltaX * deltaX + deltaY * deltaY;

      if (distSq < BALL_RADIUS * BALL_RADIUS) {
        const dist = Math.sqrt(Math.max(distSq, 0.0001));
        const penetration = BALL_RADIUS - dist;

        let localNormalX = deltaX / dist;
        let localNormalY = deltaY / dist;
        if (!Number.isFinite(localNormalX) || !Number.isFinite(localNormalY)) {
          localNormalX = 0;
          localNormalY = -1;
        }

        const normalX = cos * localNormalX - sin * localNormalY;
        const normalY = sin * localNormalX + cos * localNormalY;

        ballX += normalX * penetration;
        ballY += normalY * penetration;

        const relVx = ballVx - paddleVx;
        const relVy = ballVy - paddleVy;
        const relNormalVel = relVx * normalX + relVy * normalY;

        if (relNormalVel < 0) {
          const restitution = 0.85; 
          ballVx -= (1 + restitution) * relNormalVel * normalX;
          ballVy -= (1 + restitution) * relNormalVel * normalY;
          const extraLift = Math.max(100, Math.abs(paddleVx) * 0.03);
          ballVy -= extraLift; 
          ballVx += paddleVx * 0.2 + Math.sin(paddleAngle) * 50;
          if (paddleVy < -10) ballVy += paddleVy * 0.4;

          const speed = Math.hypot(ballVx, ballVy);
          const maxSpeed = 720;
          if (speed > maxSpeed) {
            const ratio = maxSpeed / speed;
            ballVx *= ratio;
            ballVy *= ratio;
          }

          if (hitCooldown === 0) {
            streak += 1;
            hitCooldown = 0.15;
            persistHighScore();
          }
          registerTrajectoryAfterBounce();
        }
      }
    }

    // Update particles efficiently
    trailParticles = trailParticles.filter(p => p.update(dt));
    burstParticles = burstParticles.filter(p => p.update(dt));

    renderGame();
    rafId = requestAnimationFrame(simulationFrame);
  }

  $effect(() => {
    if (!playfieldContainer || !visible) return;
    const observer = new ResizeObserver(() => syncFieldRect());
    observer.observe(playfieldContainer);
    syncFieldRect();
    return () => observer.disconnect();
  });

  $effect(() => {
    return () => {
      persistHighScore();
      if (rafId) cancelAnimationFrame(rafId);
      if (fadeTimeout) clearTimeout(fadeTimeout);
    };
  });

  $effect(() => {
    if (!active || typeof document === "undefined") return;
    const previousOverflow = document.body.style.overflow;
    const previousTouchAction = document.body.style.touchAction;
    document.body.style.overflow = "hidden";
    document.body.style.touchAction = "none";
    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.touchAction = previousTouchAction;
    };
  });

  onMount(() => {
    const stored = getStoredJSON(STORAGE_KEY, DEFAULT_SCORE);
    highScore = stored.highScore;
  });
</script>

<span class="table-tennis-mini" bind:this={host}>
  <button
    type="button"
    class="table-tennis-trigger"
    aria-label="Start table tennis mini interaction"
    onpointerdown={onPointerDown}
    onpointerenter={() => (hovered = true)}
    onpointerleave={() => (hovered = false)}
  >
    <span aria-hidden="true">🏓</span>
    <span class="label-wrap">
      <HoverMorphHint
        idleText="Table Tennis"
        hoverText="Drag This!"
        {hovered}
        active={active || fadingOut}
      />
    </span>
  </button>

  {#if visible}
    <div
      class="playfield-container"
      class:is-fading={fadingOut}
      bind:this={playfieldContainer}
      aria-hidden="true"
      role="presentation"
    >
      <div class="streak-badge">
        <div>streak: {streak}</div>
        <div>high: {highScore}</div>
      </div>

      <canvas bind:this={canvas} class="game-canvas"></canvas>
    </div>
  {/if}
</span>

<svelte:window
  onpointermove={onPointerMove}
  onpointerup={onPointerStop}
  onpointercancel={onPointerStop}
/>

<style>
  .table-tennis-mini {
    position: relative;
    display: inline-block;
    min-width: 0;
  }

  .table-tennis-trigger {
    appearance: none;
    border: none;
    background: none;
    padding: 0;
    margin: 0;
    color: inherit;
    font: inherit;
    display: inline-flex;
    align-items: baseline;
    gap: 0.3rem;
    cursor: pointer;
    line-height: inherit;
    touch-action: none;
  }

  .table-tennis-trigger:focus-visible {
    outline: 2px dashed var(--text-color);
    outline-offset: 0.16rem;
    border-radius: 0.2rem;
  }

  .label-wrap {
    color: var(--link-color);
  }

  .playfield-container {
    position: fixed;
    inset: 0;
    background: color-mix(
      in srgb,
      var(--background-color) 65%,
      transparent 35%
    );
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
    pointer-events: none;
    opacity: 1;
    transform: translateY(0) scale(1);
    transition:
      opacity 220ms ease,
      transform 220ms ease;
    z-index: 18;
  }

  .game-canvas {
    display: block;
    width: 100%;
    height: 100%;
  }

  .streak-badge {
    position: absolute;
    top: 1rem;
    right: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    font-family: var(--font-family-mono);
    font-size: 0.9rem;
    padding: 0.38rem 0.6rem;
    border-radius: 0.36rem;
    border: 1px solid color-mix(in srgb, var(--text-color) 25%, transparent 75%);
    background: color-mix(
      in srgb,
      var(--background-color) 86%,
      transparent 14%
    );
    color: var(--heading-color);
    box-shadow: 0 0.2rem 0.4rem color-mix(in srgb, #000 12%, transparent 88%);
    z-index: 20;
  }

  .playfield-container.is-fading {
    opacity: 0;
    transform: translateY(0.35rem) scale(0.98);
  }

  @media (prefers-reduced-motion: reduce) {
    .playfield-container {
      transition: opacity 200ms ease;
      transform: none;
    }

    .playfield-container.is-fading {
      transform: none;
    }
  }
</style>
