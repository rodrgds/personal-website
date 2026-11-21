// The home boot as a scene (see boot-room.ts for the room itself). The camera
// walks up to the desk, the power button goes down, the boot log plays on the
// monitor while the keys type the login, then the camera flies into the glass
// until the screen is the page.
//
// The monitor's screen is the real boot DOM (CSS3DRenderer), shown through a
// hole the WebGL canvas leaves in front of it, so the text stays sharp.
import * as THREE from "three";
import {
  CSS3DObject,
  CSS3DRenderer,
} from "three/examples/jsm/renderers/CSS3DRenderer.js";
import { SCREEN_H, SCREEN_W, SCREEN_Y, SCREEN_Z, buildRoom } from "./boot-room";

export interface BootStage {
  /** Walk up to the desk and press the power button. */
  powerOn(): Promise<void>;
  /** Press the key that types `code` ("a", "Enter", ...). */
  press(code: string): void;
  /** Flicker the disk light while the log prints. */
  setBusy(busy: boolean): void;
  /** Switch the monitor from the boot log to the real page. */
  showPage(): Promise<void>;
  /**
   * Fly into the screen until the page on it is at its real size, fading the
   * room out on the way, so the real page can take over without a seam.
   */
  zoomIn(): Promise<void>;
  /** Fade the scene out over the page. */
  fadeOut(ms: number): Promise<void>;
  dispose(): void;
}

/** Size of the screen element in CSS pixels; the monitor is 4:3. */
export const SCREEN_WIDTH = 1024;
export const SCREEN_HEIGHT = 768;

const FOV = 34;
const KEY_TRAVEL = 0.014;
const KEY_HOLD_MS = 70;

function easeInOut(t: number): number {
  return t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
}

/** The CRT glass: dark corners and a soft highlight, drawn over the DOM. */
function glassTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 384;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const vignette = ctx.createRadialGradient(256, 192, 120, 256, 192, 330);
    vignette.addColorStop(0, "rgba(0,0,0,0)");
    vignette.addColorStop(1, "rgba(0,0,0,0.55)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, 512, 384);
    const shine = ctx.createLinearGradient(0, 0, 220, 200);
    shine.addColorStop(0, "rgba(255,255,255,0.09)");
    shine.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = shine;
    ctx.beginPath();
    ctx.ellipse(150, 80, 210, 110, -0.35, 0, Math.PI * 2);
    ctx.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** A short mechanical click, synthesised; only when site sound is on. */
function keyClicker(): (enter: boolean) => void {
  let audio: AudioContext | null = null;
  return (enter) => {
    if (document.documentElement.dataset.soundEnabled === "false") return;
    try {
      audio ??= new AudioContext();
      // Browsers keep audio off until the visitor has interacted.
      if (audio.state !== "running") {
        void audio.resume();
        return;
      }
      const length = Math.floor(audio.sampleRate * 0.03);
      const buffer = audio.createBuffer(1, length, audio.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i++)
        data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 3;
      const source = audio.createBufferSource();
      source.buffer = buffer;
      const filter = audio.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = enter ? 1400 : 2600 + Math.random() * 900;
      const gain = audio.createGain();
      gain.gain.value = enter ? 0.35 : 0.22;
      source.connect(filter).connect(gain).connect(audio.destination);
      source.start();
    } catch {
      // No audio is fine.
    }
  };
}

export async function createBootStage(
  screen: HTMLElement,
  pageUrl: string,
): Promise<BootStage> {
  const styles = getComputedStyle(document.documentElement);
  const accent = styles.getPropertyValue("--accent").trim() || "#da702c";
  // The room is dim in both themes; only the screen follows the theme.
  const background = "#0e0d0c";

  const container = document.createElement("div");
  container.className = "boot-stage";
  container.dataset.boot = "off";
  document.body.append(container);

  const css = new CSS3DRenderer();
  css.domElement.className = "boot-stage-css";
  container.append(css.domElement);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.setClearColor(new THREE.Color(background), 1);
  renderer.domElement.className = "boot-stage-gl";
  container.append(renderer.domElement);

  // The look of an old print: film grain and a warm vignette over the scene
  // and the screen, inside a polaroid frame with a caption and a date stamp.
  // The frame opens out during the fly-in, so the page still ends at 1:1.
  const film = document.createElement("div");
  film.className = "boot-film";
  film.setAttribute("aria-hidden", "true");
  const polaroid = document.createElement("div");
  polaroid.className = "boot-polaroid";
  polaroid.setAttribute("aria-hidden", "true");
  const today = new Date();
  const stamp = document.createElement("span");
  stamp.className = "boot-stamp";
  stamp.textContent = `'${String(today.getFullYear()).slice(2)} ${String(today.getMonth() + 1).padStart(2, "0")} ${String(today.getDate()).padStart(2, "0")}`;
  const caption = document.createElement("span");
  caption.className = "boot-caption";
  caption.textContent = "rodrigo at his desk, porto";
  polaroid.append(stamp, caption);
  container.append(film, polaroid);

  const room = await buildRoom(accent);
  const { scene } = room;
  scene.fog = new THREE.Fog(new THREE.Color(background), 8, 18);
  const cssScene = new THREE.Scene();

  // The hole writes transparent pixels, so the DOM behind the canvas shows.
  const hole = new THREE.Mesh(
    new THREE.PlaneGeometry(SCREEN_W + 0.03, SCREEN_H + 0.03),
    new THREE.MeshBasicMaterial({
      color: 0x000000,
      opacity: 0,
      transparent: true,
      blending: THREE.NoBlending,
    }),
  );
  hole.position.set(0, SCREEN_Y, SCREEN_Z);
  hole.renderOrder = 1;
  scene.add(hole);
  const glass = new THREE.Mesh(
    new THREE.PlaneGeometry(SCREEN_W, SCREEN_H),
    new THREE.MeshBasicMaterial({
      map: glassTexture(),
      transparent: true,
      depthWrite: false,
    }),
  );
  glass.position.set(0, SCREEN_Y, SCREEN_Z + 0.004);
  glass.renderOrder = 2;
  scene.add(glass);

  // The real boot screen, sized to the monitor's glass.
  screen.classList.add("boot-3d");
  screen.style.width = `${SCREEN_WIDTH}px`;
  screen.style.height = `${SCREEN_HEIGHT}px`;
  const home = { parent: screen.parentElement, next: screen.nextSibling };
  const object = new CSS3DObject(screen);
  object.position.set(0, SCREEN_Y, SCREEN_Z);
  object.scale.setScalar(SCREEN_W / SCREEN_WIDTH);
  cssScene.add(object);

  // The real page, at the window's size, laid on the glass. It loads while
  // the boot runs; its own boot is skipped because this one counts as seen.
  const page = document.createElement("iframe");
  page.className = "boot-page";
  page.src = pageUrl;
  page.title = "rgo.pt";
  page.tabIndex = -1;
  page.setAttribute("aria-hidden", "true");
  page.style.visibility = "hidden";
  const pageLoaded = new Promise<void>((resolve) => {
    page.addEventListener("load", () => resolve(), { once: true });
  });
  const pageObject = new CSS3DObject(page);
  cssScene.add(pageObject);
  /** World units per CSS pixel, so the page covers the glass. */
  const pageScale = (): number =>
    Math.max(SCREEN_W / window.innerWidth, SCREEN_H / window.innerHeight);
  /** Top-aligned on the glass, so the header is what shows. */
  const pageCentreY = (): number =>
    SCREEN_Y + SCREEN_H / 2 - (window.innerHeight * pageScale()) / 2;
  const placePage = (): void => {
    page.style.width = `${window.innerWidth}px`;
    page.style.height = `${window.innerHeight}px`;
    pageObject.scale.setScalar(pageScale());
    pageObject.position.set(0, pageCentreY(), SCREEN_Z - 0.0005);
  };
  placePage();

  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.05, 80);
  const fromPos = new THREE.Vector3();
  const fromLook = new THREE.Vector3();
  const toPos = new THREE.Vector3();
  const toLook = new THREE.Vector3();
  const look = new THREE.Vector3(0, 1.6, 0);

  /** Pull back on narrow screens so the desk stays in frame. */
  const framing = (): number => {
    const aspect = window.innerWidth / Math.max(1, window.innerHeight);
    return aspect < 1 ? 1 / aspect ** 0.96 : 1;
  };
  // From the doorway behind the chair; the shots look over the left shoulder.
  camera.position.set(-4.2, 4.6, 12).multiplyScalar(framing());
  camera.lookAt(look);

  const resize = (): void => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    camera.aspect = width / Math.max(1, height);
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
    css.setSize(width, height);
    placePage();
  };
  resize();
  window.addEventListener("resize", resize);

  const click = keyClicker();
  const pressed = new Map<THREE.Object3D, number>();
  let busy = false;
  let frame = 0;
  let disposed = false;
  let shown = false;
  let markShown = (): void => {};
  const firstFrame = new Promise<void>((resolve) => {
    markShown = resolve;
  });
  let move: {
    start: number;
    ms: number;
    done: () => void;
    step?: (t: number) => void;
  } | null = null;

  const render = (now: number): void => {
    frame = requestAnimationFrame(render);
    if (move) {
      const t = Math.min(1, (now - move.start) / move.ms);
      const k = easeInOut(t);
      camera.position.lerpVectors(fromPos, toPos, k);
      look.lerpVectors(fromLook, toLook, k);
      camera.lookAt(look);
      move.step?.(t);
      if (t >= 1) {
        const done = move.done;
        move = null;
        done();
      }
    }
    room.person.update(now);
    // Keys go down at once and spring back after a short hold.
    for (const [key, until] of pressed) {
      const base = Number(key.userData.baseY);
      const target = now < until ? base - KEY_TRAVEL : base;
      key.position.y += (target - key.position.y) * (now < until ? 0.8 : 0.35);
      if (now >= until && Math.abs(key.position.y - base) < 0.0005) {
        key.position.y = base;
        pressed.delete(key);
      }
    }
    if (busy) {
      const on = Math.sin(now / 37) + Math.sin(now / 91) > 0.4;
      room.diskLed.emissive.set(on ? 0xffa21f : 0x000000);
    }
    renderer.render(scene, camera);
    css.render(cssScene, camera);
    // Show the canvas once it has a frame, over the lamp-light cover.
    if (!shown) {
      shown = true;
      container.classList.add("is-in");
      markShown();
    }
  };
  frame = requestAnimationFrame(render);

  const travel = (
    position: THREE.Vector3,
    at: THREE.Vector3,
    ms: number,
    step?: (t: number) => void,
  ): Promise<void> =>
    new Promise((resolve) => {
      fromPos.copy(camera.position);
      fromLook.copy(look);
      toPos.copy(position);
      toLook.copy(at);
      move = { start: performance.now(), ms, done: resolve, step };
    });

  const wait = (ms: number): Promise<void> =>
    new Promise((resolve) => window.setTimeout(resolve, ms));

  const desk = new THREE.Vector3(
    0.05,
    1.2,
    0.64 + Math.min(0.55, (framing() - 1) * 0.6),
  );

  return {
    async powerOn() {
      // Slow GPUs can take a while to compile the first frame; the walk
      // starts from the doorway once something is on screen.
      await firstFrame;
      // Walk up behind the chair, to look over the left shoulder.
      await travel(
        new THREE.Vector3(-4.9, 3.2, 5.55).multiplyScalar(framing()),
        desk,
        2000,
      );
      // Rodrigo leans in and presses the power button.
      const button = new THREE.Vector3();
      room.powerButton.getWorldPosition(button);
      container.dataset.boot = "reaching";
      room.person.lean(1);
      button.z += 0.015; // Front face of the switch.
      room.person.reach(button);
      await wait(820);
      room.powerButton.position.z -= 0.015;
      button.z -= 0.015;
      room.person.reach(button);
      click(true);
      await wait(140);
      room.powerButton.position.z += 0.015;
      room.person.reach(null);
      room.person.lean(0);
      for (const led of room.powerLeds) {
        led.color.set(0x8fd14f);
        led.emissive.set(0x5fbf2a);
        led.emissiveIntensity = 1.6;
      }
      room.turbo.color.set(0xffffff);
      await wait(280);
      container.dataset.boot = "running";
      room.glow.intensity = 0.45;
      // Drift closer over the shoulder while it boots.
      void travel(
        new THREE.Vector3(-3.65, 2.98, 5.5).multiplyScalar(framing()),
        new THREE.Vector3(0.05, 1.4, desk.z),
        6500,
      );
    },
    press(code) {
      const key = room.keys.get(code) ?? room.keys.get(code.toLowerCase());
      if (!key) return;
      const now = performance.now();
      pressed.set(key, now + KEY_HOLD_MS);
      const at = new THREE.Vector3();
      key.getWorldPosition(at);
      room.person.tap(at, now);
      click(code === "Enter");
    },
    setBusy(next) {
      busy = next;
      if (!next) room.diskLed.emissive.set(0x000000);
    },
    async showPage() {
      // Give a slow first load a moment, then go on regardless.
      await Promise.race([pageLoaded, wait(2500)]);
      page.style.visibility = "visible";
      page.classList.add("is-on");
      await wait(80);
      object.visible = false;
      await wait(520);
    },
    async zoomIn() {
      // End where one CSS pixel of the page is one pixel of the window.
      const centre = new THREE.Vector3(0, pageCentreY(), SCREEN_Z);
      const height = window.innerHeight * pageScale();
      const distance =
        height / (2 * Math.tan(THREE.MathUtils.degToRad(FOV / 2)));
      const gl = renderer.domElement;
      container.classList.add("is-flying");
      // Margins outside the page take the page's colour as the room goes.
      container.style.background = "var(--background-color)";
      await travel(
        new THREE.Vector3(0, centre.y, SCREEN_Z + distance),
        centre,
        1700,
        (t) => {
          // Rodrigo fades before the camera passes his head; the room fades
          // over the second half of the flight.
          room.person.setOpacity(Math.max(0, 1 - t / 0.35));
          gl.style.opacity = String(Math.min(1, Math.max(0, (1 - t) / 0.5)));
        },
      );
      // The last step (exactly 1:1) is drawn in the frame that ends the
      // flight; let it reach the screen before the page takes over, so a
      // slow last frame cannot show as a snap.
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve());
      });
    },
    async fadeOut(ms) {
      container.style.transition = `opacity ${ms}ms ease`;
      container.style.opacity = "0";
      await wait(ms);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      screen.classList.remove("boot-3d");
      for (const property of [
        "width",
        "height",
        "transform",
        "position",
        "pointer-events",
      ])
        screen.style.removeProperty(property);
      // Put the boot screen back where the page had it.
      if (home.parent) home.parent.insertBefore(screen, home.next);
      room.dispose();
      hole.geometry.dispose();
      glass.geometry.dispose();
      renderer.dispose();
      // dispose() keeps the context; browsers cap live contexts, so release
      // it or repeated boots and inception runs lose the oldest one.
      renderer.forceContextLoss();
      container.remove();
    },
  };
}
