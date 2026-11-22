// `inception` in the tty: the page pulls back onto the computer's monitor,
// then that desk turns out to be on the screen of a laptop, which is on the
// monitor of another desk, and so on, until the visitor kicks out (button or
// Esc). The page stays at the centre the whole way out.
//
// How it stays seamless: the page is drawn once, as the visitor sees it, into
// a texture (modern-screenshot) before anything shows, and that one picture is
// on the monitor from the first frame, at 1:1 over the real page, to the
// deepest level, so no screen ever swaps what it shows. Levels alternate,
// desk and laptop. Level 1 is the desk whose monitor shows the page; level
// n's screen shows level n - 1. Every frame the three levels under the one
// on screen are rendered into textures, deepest first, each from its own
// over-the-shoulder shot. The camera flies
// from "the screen fills the photo" out to that shot; at the end the view is
// identical to the texture the next level shows, so it moves out a level and
// keeps going. The photo is held at 4:3 inside a polaroid border, the shape
// of the glass.
import * as THREE from "three";
import {
  SCREEN_H,
  SCREEN_W,
  SCREEN_Y,
  SCREEN_Z,
  VOID,
  buildRoom,
} from "./boot-room";
import { cue } from "../sound";
import { buildLaptop } from "./inception-laptop";

const FOV = 34;
const PULL_MS = 3600;
/** Levels rendered under the one on screen; deeper ones are a few pixels. */
const DEPTH = 3;
/** How long the desk loop takes; the laptop's follows from the same speed. */
const DESK_LOOP_MS = 7500;
/** The first zoom speeds up from the pause instead of starting at full speed. */
const RAMP_MS = 1800;
const GLASS = new THREE.Vector3(0, SCREEN_Y, SCREEN_Z);
/** The shot the monitor shows, and where every loop ends. */
// Over the shoulder; the loop out of the desk's monitor zooms out ~4x.
const HERO_POS = new THREE.Vector3(-3.45, 2.95, 5.15);
const HERO_LOOK = new THREE.Vector3(0.05, 1.4, 0.65);
// The laptop from the front left, as a product shot; ~2.6x out of its screen.
const LAPTOP_POS = new THREE.Vector3(-2.6, 2.9, 6.6);
const LAPTOP_LOOK = new THREE.Vector3(0.1, 0.95, -0.2);
const TYPING = "pwd ls cd writing ls cat notes ";

interface Pose {
  pos: THREE.Vector3;
  look: THREE.Vector3;
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

let stopCurrent: (() => void) | null = null;

const smooth = (t: number): number => t * t * (3 - 2 * t);
const clamp01 = (t: number): number => Math.min(1, Math.max(0, t));

/**
 * Fly between two poses: the look point and the direction ease, the distance
 * grows exponentially, so the zoom rate is steady and loops line up.
 */
function between(
  from: Pose,
  to: Pose,
  u: number,
  eased: number,
  out: THREE.PerspectiveCamera,
): void {
  const look = from.look.clone().lerp(to.look, eased);
  const fromDir = from.pos.clone().sub(from.look);
  const toDir = to.pos.clone().sub(to.look);
  const fromDistance = fromDir.length();
  const toDistance = toDir.length();
  const turn = new THREE.Quaternion().setFromUnitVectors(
    fromDir.clone().normalize(),
    toDir.clone().normalize(),
  );
  const direction = fromDir
    .normalize()
    .applyQuaternion(new THREE.Quaternion().slerp(turn, eased));
  const distance = fromDistance * (toDistance / fromDistance) ** u;
  out.position.copy(look).addScaledVector(direction, distance);
  out.lookAt(look);
}

/** The 4:3 photo inside the polaroid border, in window pixels. */
function photoRect(width: number, height: number): Rect {
  const vmin = Math.min(width, height) / 100;
  const side = Math.min(32, Math.max(10, 3.2 * vmin));
  const chin = Math.min(120, Math.max(48, 12 * vmin));
  const room = { width: width - 2 * side, height: height - side - chin };
  const photoWidth = Math.min(room.width, (room.height * 4) / 3);
  const photoHeight = (photoWidth * 3) / 4;
  return {
    x: (width - photoWidth) / 2,
    y: side + (room.height - photoHeight) / 2,
    width: photoWidth,
    height: photoHeight,
  };
}

/**
 * A sphere in the fog colour around a scene. Where nothing else is, the
 * picture is this sphere rather than the clear colour: the clear colour is
 * written raw to the window but tone-mapped when a texture of it is shown,
 * so it came out darker on the screens than in the room, a seam each loop.
 */
function addBackdrop(scene: THREE.Scene, color: number): THREE.Mesh {
  const backdrop = new THREE.Mesh(
    new THREE.SphereGeometry(40, 32, 16),
    new THREE.MeshBasicMaterial({ color, side: THREE.BackSide }),
  );
  scene.add(backdrop);
  return backdrop;
}

/**
 * The page as the visitor sees it, as a canvas, for the monitor: at the
 * screen's own pixel density, since the first frame shows it at 1:1. Only
 * what is on screen (and above it) is drawn.
 */
async function snapshotPage(): Promise<HTMLCanvasElement | null> {
  try {
    const { domToCanvas } = await import("modern-screenshot");
    const width = window.innerWidth;
    const height = window.innerHeight;
    const scrolled = window.scrollY;
    return await domToCanvas(document.body, {
      width,
      height,
      scale: Math.min(2, window.devicePixelRatio || 1),
      backgroundColor: getComputedStyle(document.body).backgroundColor,
      style: { margin: "0", transform: `translateY(${-scrolled}px)` },
      timeout: 3000,
      // Leave out the stage itself, closed dialogs, anything below the fold,
      // and pictures from other sites (they refuse to be read back).
      filter: (node) =>
        !(node instanceof Element) ||
        (!node.matches(".boot-stage, .peek, script, dialog:not([open])") &&
          !(
            node instanceof HTMLImageElement &&
            new URL(node.currentSrc || node.src, location.href).origin !==
              location.origin
          ) &&
          node.getBoundingClientRect().top < height + 64),
    });
  } catch {
    return null;
  }
}

export function stopInception(): void {
  stopCurrent?.();
}

export async function startInception(): Promise<void> {
  if (stopCurrent) return;
  // Start drawing the page now, while the scene builds.
  const snapshot = snapshotPage();
  const accent =
    getComputedStyle(document.documentElement)
      .getPropertyValue("--accent")
      .trim() || "#da702c";

  const container = document.createElement("div");
  container.className = "boot-stage inception-stage";
  container.style.visibility = "hidden";
  container.setAttribute("role", "dialog");
  container.setAttribute("aria-label", "Inception: press Escape to wake up");
  document.body.append(container);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  // Two renders a frame, so a little less resolution than the boot.
  renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // No tone mapping here. three.js tone-maps only what is drawn to the
  // window, and applies fog after it there but before it in a texture, so
  // with ACES every screen showed fog and dark areas darker than the room it
  // flies out to: a visible seam each loop. Without it both paths match.
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  // The two renders a frame share one shadow pass (see render()).
  renderer.shadowMap.autoUpdate = false;
  renderer.setClearColor(0x0e0d0c, 1);
  renderer.domElement.className = "boot-stage-gl";
  renderer.domElement.style.opacity = "0";
  container.append(renderer.domElement);

  const film = document.createElement("div");
  film.className = "boot-film";
  const polaroid = document.createElement("div");
  polaroid.className = "boot-polaroid";
  polaroid.style.borderWidth = "0";
  const caption = document.createElement("span");
  caption.className = "boot-caption";
  caption.textContent = "rodrigo at his desk, porto";
  const stamp = document.createElement("span");
  stamp.className = "boot-stamp";
  const today = new Date();
  stamp.textContent = `'${String(today.getFullYear()).slice(2)} ${String(today.getMonth() + 1).padStart(2, "0")} ${String(today.getDate()).padStart(2, "0")}`;
  polaroid.append(stamp, caption);
  const kick = document.createElement("button");
  kick.type = "button";
  kick.className = "inception-kick";
  kick.textContent = "kick";
  kick.title = "Wake up (Esc)";
  container.append(film, polaroid, kick);

  // The room, with the lights on, and a spinning top on the desk.
  const room = await buildRoom(accent);
  const { scene } = room;
  scene.fog = new THREE.Fog(VOID, 8, 18);
  for (const led of room.powerLeds) {
    led.color.set(0x8fd14f);
    led.emissive.set(0x5fbf2a);
    led.emissiveIntensity = 1.6;
  }
  room.turbo.color.set(0xffffff);
  room.glow.intensity = 0.45;
  const brass = new THREE.MeshStandardMaterial({
    color: 0xb08a4a,
    metalness: 0.7,
    roughness: 0.3,
  });
  const top = new THREE.Group();
  const body = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.11, 24), brass);
  body.rotation.x = Math.PI;
  body.position.y = 0.055;
  const crown = new THREE.Mesh(
    new THREE.CylinderGeometry(0.07, 0.07, 0.025, 24),
    brass,
  );
  crown.position.y = 0.12;
  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.012, 0.012, 0.07, 10),
    brass,
  );
  stem.position.y = 0.165;
  top.add(body, crown, stem);
  for (const part of [body, crown, stem]) part.castShadow = true;
  top.position.set(-1.0, 0, 0.95);
  scene.add(top);

  // One texture per level under the screen, desk-shaped (16:10, for the
  // laptop's screen) and laptop-shaped (4:3, for the desk's monitor); only the
  // nearest is antialiased, since the deeper ones are small.
  const makeTargets = (): THREE.WebGLRenderTarget[] =>
    Array.from(
      { length: DEPTH },
      (_, depth) =>
        new THREE.WebGLRenderTarget(16, 16, {
          type: THREE.HalfFloatType,
          // Antialiased like the window, so a loop's first frame (this
          // texture) matches its last (the window) exactly.
          samples: depth === 0 ? 4 : 0,
          generateMipmaps: true,
          minFilter: THREE.LinearMipmapLinearFilter,
        }),
    );
  const deskTargets = makeTargets();
  const laptopTargets = makeTargets();
  const laptop = buildLaptop(renderer);
  const laptopBackdrop = addBackdrop(laptop.scene, VOID);
  // A screen with nothing on it, for a level deeper than the ones drawn.
  const blank = new THREE.DataTexture(new Uint8Array([8, 8, 8, 255]), 1, 1);
  blank.needsUpdate = true;
  let pageTexture: THREE.Texture | null = null;
  const screenMaterial = new THREE.MeshBasicMaterial({
    map: blank,
    transparent: true,
    opacity: 0,
  });
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(SCREEN_W, SCREEN_H),
    screenMaterial,
  );
  screen.position.copy(GLASS).add(new THREE.Vector3(0, 0, 0.002));
  screen.renderOrder = 2;
  scene.add(screen);
  // The page itself, on level 1's monitor: the snapshot on a plane the size
  // and place the page has at 1:1 (layout() sizes it), just in front of the
  // screen. The case hides what lies beyond the glass once it fades in.
  const pageMaterial = new THREE.MeshBasicMaterial({ map: blank });
  const pagePlane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), pageMaterial);
  pagePlane.renderOrder = 3;
  pagePlane.visible = false;
  scene.add(pagePlane);

  const camera = new THREE.PerspectiveCamera(FOV, 4 / 3, 0.05, 80);
  // Same pose and vertical field as the photo, but 16:10: its centre 4:3
  // crop is exactly what the window shows at the end of a desk loop.
  const heroCamera = new THREE.PerspectiveCamera(FOV, 16 / 10, 0.05, 80);
  heroCamera.position.copy(HERO_POS);
  heroCamera.lookAt(HERO_LOOK);
  const glassPose: Pose = {
    pos: GLASS.clone().add(
      new THREE.Vector3(
        0,
        0,
        SCREEN_H / (2 * Math.tan(THREE.MathUtils.degToRad(FOV / 2))),
      ),
    ),
    look: GLASS.clone(),
  };
  const heroPose: Pose = { pos: HERO_POS.clone(), look: HERO_LOOK.clone() };
  const laptopCamera = new THREE.PerspectiveCamera(FOV, 4 / 3, 0.05, 60);
  laptopCamera.position.copy(LAPTOP_POS);
  laptopCamera.lookAt(LAPTOP_LOOK);
  const laptopHero: Pose = {
    pos: LAPTOP_POS.clone(),
    look: LAPTOP_LOOK.clone(),
  };
  // Straight at the laptop's 4:3 picture, close enough that it fills the photo.
  const pictureCentre = new THREE.Vector3();
  laptop.picture.getWorldPosition(pictureCentre);
  const pictureNormal = new THREE.Vector3(0, 0, 1).applyQuaternion(
    laptop.picture.getWorldQuaternion(new THREE.Quaternion()),
  );
  const laptopGlass: Pose = {
    pos: pictureCentre
      .clone()
      .addScaledVector(
        pictureNormal,
        laptop.pictureHeight /
          (2 * Math.tan(THREE.MathUtils.degToRad(FOV / 2))),
      ),
    look: pictureCentre.clone(),
  };
  // One zoom speed for both levels (in log-distance per ms), so the speed
  // does not change at the seams; each loop lasts as long as its zoom needs.
  const span = (pose: Pose): number => pose.pos.distanceTo(pose.look);
  const zoomRate = Math.log(span(heroPose) / span(glassPose)) / DESK_LOOP_MS;
  const laptopLoopMs =
    Math.log(span(laptopHero) / span(laptopGlass)) / zoomRate;
  const cycleMs = laptopLoopMs + DESK_LOOP_MS;
  let pagePose: Pose = glassPose;
  let rect = photoRect(window.innerWidth, window.innerHeight);

  /** Size everything to the window; the camera's own view is the photo. */
  const layout = (): void => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    rect = photoRect(width, height);
    // Textures at the photo's real pixel size: no softer picture at the seam.
    const textureHeight = Math.min(
      1200,
      Math.round(rect.height * renderer.getPixelRatio()),
    );
    // Each level down is about a third the size of the one above.
    deskTargets.forEach((target, depth) => {
      const height = Math.max(96, Math.round(textureHeight / 3 ** depth));
      target.setSize(Math.round(height * 1.6), height);
    });
    laptopTargets.forEach((target, depth) => {
      const height = Math.max(96, Math.round(textureHeight / 3 ** depth));
      target.setSize(Math.round((height * 4) / 3), height);
    });
    renderer.setSize(width, height);
    camera.setViewOffset(
      rect.width,
      rect.height,
      -rect.x,
      -rect.y,
      width,
      height,
    );
    // The page covers the screen and hangs from its top edge, as it would
    // fill a window of the screen's width.
    const scale = Math.max(SCREEN_W / width, SCREEN_H / height);
    pagePlane.scale.set(width * scale, height * scale, 1);
    const centre = new THREE.Vector3(
      0,
      SCREEN_Y + SCREEN_H / 2 - (height * scale) / 2,
      SCREEN_Z + 0.003,
    );
    pagePlane.position.copy(centre);
    // Where the camera sits for the page to fill the window at 1:1.
    const distance =
      (rect.height * scale) / (2 * Math.tan(THREE.MathUtils.degToRad(FOV / 2)));
    const axis = centre
      .clone()
      .add(
        new THREE.Vector3(
          (rect.x + rect.width / 2 - width / 2) * scale,
          -(rect.y + rect.height / 2 - height / 2) * scale,
          0,
        ),
      );
    pagePose = {
      pos: axis.clone().add(new THREE.Vector3(0, 0, distance)),
      look: axis,
    };
    if (container.classList.contains("is-dreaming")) frameThePhoto();
  };
  /** The polaroid border around the 4:3 photo. */
  const frameThePhoto = (): void => {
    const bottom = window.innerHeight - rect.y - rect.height;
    polaroid.style.setProperty("--chin", `${bottom}px`);
    polaroid.style.borderWidth = `${rect.y}px ${window.innerWidth - rect.x - rect.width}px ${bottom}px ${rect.x}px`;
  };
  layout();

  const pressed = new Map<THREE.Object3D, number>();
  let typed = 0;
  let nextKey = 0;
  let frame = 0;
  let stopped = false;
  let frameCount = 0;
  // The level on screen: 1 is the desk with the page, then laptop, desk...
  let shown = 1;
  // The clock starts on the first frame on screen, however long loading took.
  let start = 0;
  let loopsFrom = 0;

  /** The texture of a level, at its depth under the one on screen. */
  const textureOf = (level: number, depth: number): THREE.Texture =>
    (level % 2 === 1 ? deskTargets : laptopTargets)[depth - 1]?.texture ??
    blank;

  const render = (now: number): void => {
    frame = requestAnimationFrame(render);
    if (!start) start = now;
    const t = now - start;
    // 1. Pull back from the page to the over-the-shoulder shot.
    // 2. Fly out of screen after screen.
    const holding = !loopsFrom && t < PULL_MS;
    let level = 1;
    if (holding) {
      const u = clamp01(t / PULL_MS);
      const eased = smooth(u);
      between(pagePose, heroPose, eased, eased, camera);
      renderer.domElement.style.opacity = String(clamp01(u / 0.45));
    } else {
      loopsFrom ||= t;
      // Set every frame: a long frame (a GPU hitch, a background tab) can
      // skip the fade, and the scene must not stay faded.
      renderer.domElement.style.opacity = "1";
      // Loops alternate: out of the laptop's screen (showing the desk), then
      // out of the desk's monitor (showing the laptop), and so on.
      const loopTime = t - loopsFrom;
      const run =
        loopTime < RAMP_MS
          ? (loopTime * loopTime) / (2 * RAMP_MS)
          : loopTime - RAMP_MS / 2;
      const cycle = Math.floor(run / cycleMs);
      const inCycle = run - cycle * cycleMs;
      const onLaptop = inCycle < laptopLoopMs;
      level = cycle * 2 + (onLaptop ? 2 : 3);
      const u = onLaptop
        ? inCycle / laptopLoopMs
        : (inCycle - laptopLoopMs) / DESK_LOOP_MS;
      if (onLaptop) between(laptopGlass, laptopHero, u, smooth(u), camera);
      else between(glassPose, heroPose, u, smooth(u), camera);
    }
    const fresh = level !== shown;
    if (fresh) {
      shown = level;
      caption.textContent =
        level % 2 === 0
          ? `the laptop, level ${level}`
          : `rodrigo at his desk, level ${level}`;
    }

    // Rodrigo keeps working, and the top keeps spinning.
    if (now > nextKey) {
      const char = TYPING.charAt(typed);
      typed = (typed + 1) % TYPING.length;
      const key = room.keys.get(char);
      if (key) {
        pressed.set(key, now + 70);
        const at = new THREE.Vector3();
        key.getWorldPosition(at);
        room.person.tap(at, now);
      }
      nextKey = now + (char === " " ? 520 : 105) + Math.random() * 120;
    }
    for (const [key, until] of pressed) {
      const base = Number(key.userData.baseY);
      const target = now < until ? base - 0.014 : base;
      key.position.y += (target - key.position.y) * (now < until ? 0.8 : 0.35);
      if (now >= until && Math.abs(key.position.y - base) < 0.0005) {
        key.position.y = base;
        pressed.delete(key);
      }
    }
    top.rotation.y = now / 40;
    top.rotation.z = Math.sin(now / 300) * 0.05;
    room.person.update(now);

    // The levels under the screen, deepest first, each showing the one
    // below it on its screen. The deepest changes every other frame, which
    // nobody can tell at its size. Each scene's shadows update once a frame.
    frameCount += 1;
    let deskShadows = true;
    let laptopShadows = true;
    const deepest = Math.max(1, level - DEPTH);
    for (let inner = deepest; inner < level; inner++) {
      const depth = level - inner;
      if (depth === DEPTH && !fresh && frameCount % 2 === 1) continue;
      const below =
        inner - 1 >= deepest ? textureOf(inner - 1, depth + 1) : blank;
      const target = (inner % 2 === 1 ? deskTargets : laptopTargets)[depth - 1];
      if (!target) continue;
      renderer.setRenderTarget(target);
      if (inner % 2 === 1) {
        screenMaterial.map = below;
        screenMaterial.opacity = 1;
        pagePlane.visible = inner === 1 && pageTexture !== null;
        renderer.shadowMap.needsUpdate = deskShadows;
        deskShadows = false;
        renderer.render(scene, heroCamera);
      } else {
        laptop.pictureMaterial.map = below;
        renderer.shadowMap.needsUpdate = laptopShadows;
        laptopShadows = false;
        renderer.render(laptop.scene, laptopCamera);
      }
    }
    renderer.setRenderTarget(null);
    pagePlane.visible = false;

    // Then the window, with the same page plane on level 1.
    if (level % 2 === 1) {
      screenMaterial.map = level === 1 ? blank : textureOf(level - 1, 1);
      screenMaterial.opacity = 1;
      pagePlane.visible = level === 1 && pageTexture !== null;
      renderer.shadowMap.needsUpdate = deskShadows;
      renderer.render(scene, camera);
      pagePlane.visible = false;
    } else {
      laptop.pictureMaterial.map = textureOf(level - 1, 1);
      renderer.shadowMap.needsUpdate = laptopShadows;
      renderer.render(laptop.scene, camera);
    }
  };

  const onKey = (event: KeyboardEvent): void => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      stop();
    }
  };

  const stop = (): void => {
    if (stopped) return;
    stopped = true;
    cue("close");
    stopCurrent = null;
    window.removeEventListener("keydown", onKey, true);
    window.removeEventListener("resize", layout);
    document.removeEventListener("astro:before-swap", stop);
    container.style.transition = "opacity 0.5s ease";
    container.style.opacity = "0";
    window.setTimeout(() => {
      cancelAnimationFrame(frame);
      room.dispose();
      for (const target of [...deskTargets, ...laptopTargets]) target.dispose();
      laptop.dispose();
      laptopBackdrop.geometry.dispose();
      if (laptopBackdrop.material instanceof THREE.Material)
        laptopBackdrop.material.dispose();
      blank.dispose();
      pageTexture?.dispose();
      screen.geometry.dispose();
      screenMaterial.dispose();
      pagePlane.geometry.dispose();
      pageMaterial.dispose();
      renderer.dispose();
      // dispose() keeps the context; browsers cap live contexts, so release
      // it or repeated boots and inception runs lose the oldest one.
      renderer.forceContextLoss();
      // three.js shares some textures across renderers, and their GPU copies
      // keep this canvas, and the DOM around it, alive. Cut the DOM loose
      // from this run (the kick button's handler holds the whole scene), or
      // every run stays in memory.
      kick.removeEventListener("click", stop);
      renderer.domElement.remove();
      container.remove();
    }, 520);
  };
  stopCurrent = stop;
  kick.addEventListener("click", stop);
  window.addEventListener("keydown", onKey, true);
  window.addEventListener("resize", layout);
  document.addEventListener("astro:before-swap", stop);

  const pictured = snapshot.then((canvas) => {
    if (!canvas || stopped) return;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    pageTexture = texture;
    pageMaterial.map = texture;
  });

  // Compile every shader now, while the page is drawn, so the first frames
  // do not stall.
  const compiled = renderer
    .compileAsync(scene, camera)
    .then(() => renderer.compileAsync(scene, heroCamera))
    .then(() => renderer.compileAsync(laptop.scene, laptopCamera))
    .catch(() => undefined);
  await Promise.all([compiled, pictured]);
  if (stopped) return;
  // Fade in over the real page, which hides any small difference between it
  // and the copy on the monitor; the pull-back starts slowly.
  container.style.opacity = "0";
  container.style.visibility = "visible";
  cue("open");
  container.style.transition = "opacity 0.3s ease";
  frame = requestAnimationFrame(render);
  requestAnimationFrame(() => {
    container.style.opacity = "1";
  });
  // The border and the film come in as the camera pulls back.
  window.setTimeout(() => {
    if (stopped) return;
    container.classList.add("is-dreaming");
    frameThePhoto();
  }, 500);
}
