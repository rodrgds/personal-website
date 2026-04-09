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

  interface Particle {
    id: number;
    x: number;
    y: number;
    vx: number;
    vy: number;
    life: number;
    maxLife: number;
    size: number;
  }

  let host = $state<HTMLSpanElement | undefined>(undefined);
  let playfield = $state<HTMLDivElement | undefined>(undefined);

  let hovered = $state(false);
  let active = $state(false);
  let fadingOut = $state(false);
  let visible = $state(false);

  let pointerId = $state<number | null>(null);
  let pointerClientX = $state(0);
  let pointerClientY = $state(0);

  let fieldWidth = $state(280);
  let fieldHeight = $state(170);

  let ballX = $state(0);
  let ballY = $state(0);
  let ballVx = $state(0);
  let ballVy = $state(0);

  let paddleX = $state(0);
  let paddleY = $state(0);
  let paddleVx = $state(0);
  let paddleVy = $state(0);
  let paddleAngle = $state(0);

  let streak = $state(0);
  let highScore = $state(0);
  let trailParticles = $state<Particle[]>([]);
  let burstParticles = $state<Particle[]>([]);

  let previousTrajectoryX = 0;
  let previousTrajectoryY = 0;
  let repeatedTrajectoryCount = 0;
  let antiCheatCooldown = 0;
  let nextParticleId = 1;

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
    if (!playfield) return;
    const rect = playfield.getBoundingClientRect();
    fieldWidth = rect.width;
    fieldHeight = rect.height;
  }

  function resetSimulation(startX: number, startY: number): void {
    paddleX = clamp(
      startX,
      PADDLE_WIDTH * 0.5,
      fieldWidth - PADDLE_WIDTH * 0.5,
    );
    paddleY = clamp(
      startY,
      PADDLE_HEIGHT * 1.2,
      fieldHeight - PADDLE_HEIGHT * 1.1,
    );
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
  }

  function persistHighScore(): void {
    if (streak > highScore) {
      highScore = streak;
      setStoredJSON(STORAGE_KEY, { highScore });
    }
  }

  function spawnTrail(x: number, y: number): void {
    const particle: Particle = {
      id: nextParticleId++,
      x: x + randomRange(-1.6, 1.6),
      y: y + randomRange(-1.6, 1.6),
      vx: randomRange(-18, 18),
      vy: randomRange(-12, 12),
      life: TRAIL_LIFETIME,
      maxLife: TRAIL_LIFETIME,
      size: randomRange(2.2, 4.2),
    };

    trailParticles = [...trailParticles, particle].slice(-56);
  }

  function spawnImpactBurst(x: number, y: number, side: number): void {
    const created: Particle[] = [];
    for (let i = 0; i < 12; i += 1) {
      const outward = side < 0 ? 1 : -1;
      created.push({
        id: nextParticleId++,
        x,
        y,
        vx: outward * randomRange(45, 120) + randomRange(-12, 12),
        vy: randomRange(-72, 72),
        life: BURST_LIFETIME,
        maxLife: BURST_LIFETIME,
        size: randomRange(2.2, 5.2),
      });
    }

    burstParticles = [...burstParticles, ...created].slice(-100);
  }

  function updateParticles(dt: number): void {
    if (trailParticles.length > 0) {
      const nextTrail: Particle[] = [];
      for (const particle of trailParticles) {
        const life = particle.life - dt;
        if (life <= 0) continue;
        nextTrail.push({
          ...particle,
          life,
          x: particle.x + particle.vx * dt,
          y: particle.y + particle.vy * dt,
        });
      }
      trailParticles = nextTrail;
    }

    if (burstParticles.length > 0) {
      const nextBurst: Particle[] = [];
      for (const particle of burstParticles) {
        const life = particle.life - dt;
        if (life <= 0) continue;
        nextBurst.push({
          ...particle,
          life,
          x: particle.x + particle.vx * dt,
          y: particle.y + particle.vy * dt,
        });
      }
      burstParticles = nextBurst;
    }
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
    if (speed < 160 || antiCheatCooldown > 0) {
      return;
    }

    const trajectoryX = ballVx / speed;
    const trajectoryY = ballVy / speed;

    if (previousTrajectoryX !== 0 || previousTrajectoryY !== 0) {
      const alignment =
        trajectoryX * previousTrajectoryX + trajectoryY * previousTrajectoryY;
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

    if (repeatedTrajectoryCount >= 3) {
      applyAntiCheatKick();
    }
  }

  function pointerToField(
    clientX: number,
    clientY: number,
  ): { x: number; y: number } {
    if (!playfield) return { x: fieldWidth * 0.5, y: fieldHeight * 0.78 };
    const rect = playfield.getBoundingClientRect();
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
        // ignore capture errors on unsupported environments
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

  function simulationFrame(timestamp: number): void {
    if (!visible || !playfield) {
      rafId = undefined;
      return;
    }

    if (!lastFrame) lastFrame = timestamp;
    const dt = clamp((timestamp - lastFrame) / 1000, 0.001, 0.028);
    lastFrame = timestamp;
    antiCheatCooldown = Math.max(0, antiCheatCooldown - dt);

    const pointer = pointerToField(pointerClientX, pointerClientY);

    const targetPaddleX = clamp(
      pointer.x,
      PADDLE_WIDTH * 0.5,
      fieldWidth - PADDLE_WIDTH * 0.5,
    );
    const targetPaddleY = clamp(
      pointer.y,
      PADDLE_HEIGHT * 1.2,
      fieldHeight - PADDLE_HEIGHT * 1.2,
    );

    const previousPaddleX = paddleX;
    const previousPaddleY = paddleY;
    paddleX = lerp(paddleX, targetPaddleX, 0.42);
    paddleY = lerp(paddleY, targetPaddleY, 0.36);
    paddleVx = (paddleX - previousPaddleX) / dt;
    paddleVy = (paddleY - previousPaddleY) / dt;
    const targetAngle = clamp(paddleVx * 0.0014, -0.44, 0.44);
    paddleAngle = lerp(paddleAngle, targetAngle, 0.25);

    ballVy += GRAVITY * dt;

    const drag = Math.exp(-AIR_DRAG * dt);
    ballVx *= drag;

    ballX += ballVx * dt;
    ballY += ballVy * dt;

    spawnTrail(ballX, ballY);

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

      const normalVelocity = ballVx * normalX + ballVy * normalY;
      if (normalVelocity < 0) {
        const restitution = 1.12;
        ballVx -= (1 + restitution) * normalVelocity * normalX;
        ballVy -= (1 + restitution) * normalVelocity * normalY;

        const extraLift = Math.max(130, Math.abs(paddleVx) * 0.05);
        ballVy -= extraLift;
        ballVx += paddleVx * 0.3 + Math.sin(paddleAngle) * 70;

        const speed = Math.hypot(ballVx, ballVy);
        const maxSpeed = 660;
        if (speed > maxSpeed) {
          const ratio = maxSpeed / speed;
          ballVx *= ratio;
          ballVy *= ratio;
        }

        streak += 1;
        persistHighScore();
        registerTrajectoryAfterBounce();
      }
    }

    if (paddleVy < -200) {
      const paddleTop = paddleY - PADDLE_HEIGHT * 0.5;
      const wasBelow = ballY - ballVy * dt > paddleTop + BALL_RADIUS;
      const nowAbove = ballY < paddleTop;
      const horizontalClose = Math.abs(ballX - paddleX) < PADDLE_WIDTH * 0.58;

      if (wasBelow && nowAbove && horizontalClose && ballVy > -90) {
        ballY = paddleTop - BALL_RADIUS;
        ballVy = -Math.max(260, Math.abs(ballVy) + Math.abs(paddleVy) * 0.46);
        ballVx += paddleVx * 0.2;
        streak += 1;
        persistHighScore();
        registerTrajectoryAfterBounce();
      }
    }

    updateParticles(dt);

    rafId = requestAnimationFrame(simulationFrame);
  }

  $effect(() => {
    if (!playfield || !visible) return;

    const observer = new ResizeObserver(() => {
      syncFieldRect();
    });

    observer.observe(playfield);
    return () => observer.disconnect();
  });

  $effect(() => {
    return () => {
      persistHighScore();
      if (rafId) cancelAnimationFrame(rafId);
      if (fadeTimeout) clearTimeout(fadeTimeout);
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
        hoverText="Drag me!!!"
        {hovered}
        active={active || fadingOut}
      />
    </span>
  </button>

  {#if visible}
    <div
      class="playfield"
      class:is-fading={fadingOut}
      bind:this={playfield}
      aria-hidden="true"
      role="presentation"
    >
      <div class="streak-badge">
        <div>streak: {streak}</div>
        <div>high: {highScore}</div>
      </div>

      {#each trailParticles as particle (particle.id)}
        <div
          class="trail-particle"
          style={`transform: translate3d(${particle.x - particle.size * 0.5}px, ${particle.y - particle.size * 0.5}px, 0); width: ${particle.size}px; height: ${particle.size}px; opacity: ${particle.life / particle.maxLife};`}
        ></div>
      {/each}

      {#each burstParticles as particle (particle.id)}
        <div
          class="impact-particle"
          style={`transform: translate3d(${particle.x - particle.size * 0.5}px, ${particle.y - particle.size * 0.5}px, 0); width: ${particle.size}px; height: ${particle.size}px; opacity: ${particle.life / particle.maxLife};`}
        ></div>
      {/each}

      <div
        class="ball"
        style={`transform: translate3d(${ballX - BALL_RADIUS}px, ${ballY - BALL_RADIUS}px, 0);`}
      ></div>
      <div
        class="paddle"
        style={`transform: translate3d(${paddleX - PADDLE_WIDTH * 0.5}px, ${paddleY - PADDLE_HEIGHT * 0.5}px, 0) rotate(${paddleAngle}rad);`}
      ></div>
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
  }

  .table-tennis-trigger:focus-visible {
    outline: 2px dashed var(--text-color);
    outline-offset: 0.16rem;
    border-radius: 0.2rem;
  }

  .label-wrap {
    color: var(--link-color);
  }

  .playfield {
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
  }

  .playfield.is-fading {
    opacity: 0;
    transform: translateY(0.35rem) scale(0.98);
  }

  .ball {
    position: absolute;
    width: calc(2 * 8px);
    height: calc(2 * 8px);
    border-radius: 50%;
    background: radial-gradient(
      circle at 36% 34%,
      #fff 0 45%,
      #ececec 74%,
      #cacaca 100%
    );
    box-shadow:
      0 0.15rem 0.44rem color-mix(in srgb, #000 28%, transparent 72%),
      inset -0.05rem -0.1rem 0.08rem
        color-mix(in srgb, #000 18%, transparent 82%);
    will-change: transform;
  }

  .trail-particle,
  .impact-particle {
    position: absolute;
    border-radius: 50%;
    pointer-events: none;
    will-change: transform, opacity;
  }

  .trail-particle {
    background: color-mix(in srgb, #9b9b9b 75%, transparent 25%);
    filter: blur(0.2px);
  }

  .impact-particle {
    background: color-mix(in srgb, var(--link-color) 70%, white 30%);
  }

  .paddle {
    position: absolute;
    width: calc(96px);
    height: calc(12px);
    border-radius: 999px;
    transform-origin: center;
    background: linear-gradient(
      180deg,
      color-mix(in srgb, var(--link-color) 68%, white 32%),
      color-mix(in srgb, var(--link-color) 76%, black 24%)
    );
    box-shadow:
      inset 0 -0.1rem 0.15rem color-mix(in srgb, #000 32%, transparent 68%),
      0 0.2rem 0.5rem color-mix(in srgb, #000 24%, transparent 76%);
    will-change: transform;
  }

  @media (prefers-reduced-motion: reduce) {
    .playfield {
      transition: opacity 200ms ease;
      transform: none;
    }

    .playfield.is-fading {
      transform: none;
    }
  }
</style>
