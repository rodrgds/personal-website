// The boot scene: a beige PC on a wooden desk at night, lit by a desk lamp.
// There is no room: the desk stands on a floor that runs off into the dark
// like a studio shot, the same look as inception's laptop level. The PC is a model (pc.glb, "Personal
// Computer" by Juan Foo, CC-BY-4.0); the keyboard, mouse, props and Rodrigo
// are built from primitives and canvas textures. Units are roughly 25cm.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import pcModel from "../../assets/models/pc.glb?url";
import { FLOOR_Y, buildPerson, type Person } from "./boot-person";

export const SCREEN_W = 1.28;
export const SCREEN_H = 0.96;
// The PC model is placed so its screen lands here (see placeComputer).
export const SCREEN_Y = 1.65;
export const SCREEN_Z = -0.25;

const BEIGE = 0xdcd3bd;
const BEIGE_DARK = 0xc2b89f;
const CAP_LIGHT = 0xbfb6a1;
const CAP_DARK = 0xaba28c;

/** The colour the desk and everything else fades into. */
export const VOID = 0x0e0d0c;
/** Model-space measures of the PC (pc.glb faces +x, its screen ~4:3). */
const MODEL = {
  screenFront: -0.398,
  screenCentreY: 15.204,
  screenCentreZ: 0.042,
  screenWidth: 0.3,
  caseFront: -0.187,
};
const MODEL_SCALE = SCREEN_W / MODEL.screenWidth;
/** Front face of the system unit, in world space. */
const CASE_FRONT =
  SCREEN_Z + MODEL_SCALE * (MODEL.caseFront - MODEL.screenFront);

/** Parts the timeline drives. */
export interface Room {
  scene: THREE.Scene;
  powerButton: THREE.Object3D;
  /** Power LEDs on the case and the monitor. */
  powerLeds: THREE.MeshStandardMaterial[];
  /** Hard disk / floppy activity LED. */
  diskLed: THREE.MeshStandardMaterial;
  /** The turbo display; shows "33" when powered. */
  turbo: THREE.MeshBasicMaterial;
  glow: THREE.PointLight;
  /** Keys by the character or name they type, e.g. "a", "Enter". */
  keys: Map<string, THREE.Object3D>;
  /** Rodrigo at the desk. */
  person: Person;
  /** Textures and materials to free with the scene. */
  dispose(): void;
}

// ---------------------------------------------------------------------------
// Small helpers

function canvasTexture(
  width: number,
  height: number,
  draw: (ctx: CanvasRenderingContext2D) => void,
): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (ctx) draw(ctx);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function plastic(color: number, roughness = 0.6): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 });
}

function box(
  size: [number, number, number],
  material: THREE.Material,
  position: [number, number, number],
  radius = 0,
): THREE.Mesh {
  const geometry =
    radius > 0
      ? new RoundedBoxGeometry(size[0], size[1], size[2], 2, radius)
      : new THREE.BoxGeometry(...size);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** A box whose back (or top) face shrinks, for CRT housings and keycaps. */
function taperedBox(
  width: number,
  height: number,
  depth: number,
  taper: number,
  axis: "back" | "top",
): THREE.BufferGeometry {
  const geometry = new THREE.BoxGeometry(width, height, depth);
  const position = geometry.getAttribute("position");
  for (let i = 0; i < position.count; i++) {
    const shrink =
      axis === "back" ? position.getZ(i) < 0 : position.getY(i) > 0;
    if (!shrink) continue;
    position.setX(i, position.getX(i) * taper);
    if (axis === "back") position.setY(i, position.getY(i) * taper);
    else position.setZ(i, position.getZ(i) * taper);
  }
  geometry.computeVertexNormals();
  return geometry;
}

function textPlane(
  text: string,
  size: [number, number],
  color: string,
  weight = 700,
): THREE.Mesh {
  const texture = canvasTexture(
    512,
    Math.round((512 * size[1]) / size[0]),
    (ctx) => {
      ctx.fillStyle = color;
      ctx.font = `${weight} ${Math.round(ctx.canvas.height * 0.62)}px "JetBrains Mono", monospace`;
      ctx.textBaseline = "middle";
      ctx.fillText(text, 6, ctx.canvas.height / 2);
    },
  );
  return new THREE.Mesh(
    new THREE.PlaneGeometry(...size),
    new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
    }),
  );
}

// ---------------------------------------------------------------------------
// Textures

/** Wood grain that tiles both ways. */
export function woodTexture(): THREE.CanvasTexture {
  const texture = canvasTexture(1024, 512, (ctx) => {
    ctx.fillStyle = "#4a3322";
    ctx.fillRect(0, 0, 1024, 512);
    for (let i = 0; i < 140; i++) {
      const y = Math.random() * 512;
      const waves = 1 + (i % 3);
      const phase = Math.random() * Math.PI * 2;
      const amplitude = 3 + Math.random() * 5;
      ctx.strokeStyle = `rgba(${30 + Math.random() * 30}, ${18 + Math.random() * 14}, 8, ${0.15 + Math.random() * 0.25})`;
      ctx.lineWidth = 1 + Math.random() * 3;
      // Whole waves across the width, drawn again a height up and down, so
      // the edges meet.
      for (const shift of [-512, 0, 512]) {
        ctx.beginPath();
        for (let x = 0; x <= 1024; x += 32) {
          const at =
            y +
            shift +
            Math.sin((x / 1024) * Math.PI * 2 * waves + phase) * amplitude;
          if (x === 0) ctx.moveTo(x, at);
          else ctx.lineTo(x, at);
        }
        ctx.stroke();
      }
    }
  });
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

/** Wide floorboards that tile, dark under the wood of the desk. */
function floorTexture(): THREE.CanvasTexture {
  const texture = canvasTexture(1024, 1024, (ctx) => {
    ctx.fillStyle = "#3b2c21";
    ctx.fillRect(0, 0, 1024, 1024);
    // Eight boards across, each a little different, with butt joints
    // staggered along them and fine grain.
    for (let board = 0; board < 8; board++) {
      const x = board * 128;
      const tone = 44 + ((board * 37) % 7) * 3;
      ctx.fillStyle = `rgb(${tone + 12}, ${tone}, ${tone - 8})`;
      ctx.fillRect(x, 0, 128, 1024);
      for (let i = 0; i < 22; i++) {
        const gx = x + 6 + Math.random() * 116;
        ctx.strokeStyle = `rgba(16, 10, 6, ${0.12 + Math.random() * 0.2})`;
        ctx.lineWidth = 1 + Math.random() * 2;
        ctx.beginPath();
        ctx.moveTo(gx, 0);
        for (let y = 0; y <= 1024; y += 64)
          ctx.lineTo(gx + Math.sin((y / 1024) * Math.PI * 2 + i) * 3, y);
        ctx.stroke();
      }
      ctx.fillStyle = "rgba(8, 5, 3, 0.9)";
      ctx.fillRect(x, 0, 3, 1024);
      const joint = ((board * 389) % 1024) | 0;
      ctx.fillRect(x, joint, 128, 3);
    }
  });
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

/** An endless floor at this height, fading into the fog. */
export function buildFloor(y: number, boardsEvery: number): THREE.Mesh {
  const size = 90;
  const boards = floorTexture();
  boards.repeat.set(size / boardsEvery, size / boardsEvery);
  boards.anisotropy = 8;
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshStandardMaterial({ map: boards, roughness: 0.85 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = y;
  floor.receiveShadow = true;
  return floor;
}

export interface DeskSize {
  width: number;
  depth: number;
  /** From the floor to the top of the desk, which sits at y = 0. */
  height: number;
  top: number;
  leg: number;
  /** How many grain textures fit across and along the top. */
  grain: [number, number];
}

/**
 * A plain wooden desk with its top at y = 0: a rounded top, an apron under
 * it and four slightly tapered legs.
 */
export function buildDesk(size: DeskSize): THREE.Group {
  const desk = new THREE.Group();
  const grain = woodTexture();
  grain.repeat.set(...size.grain);
  const wood = new THREE.MeshStandardMaterial({ map: grain, roughness: 0.62 });
  const top = new THREE.Mesh(
    new RoundedBoxGeometry(size.width, size.top, size.depth, 3, size.top * 0.3),
    wood,
  );
  top.position.y = -size.top / 2;
  top.castShadow = true;
  top.receiveShadow = true;
  desk.add(top);
  // The legs and apron in a slightly darker stain, as end grain reads.
  const frame = new THREE.MeshStandardMaterial({
    map: grain,
    color: 0xb59a85,
    roughness: 0.7,
  });
  const inset = size.leg * 1.2;
  const apron = size.top * 1.8;
  const legLength = size.height - size.top;
  for (const x of [-1, 1]) {
    for (const z of [-1, 1]) {
      const leg = new THREE.Mesh(
        new THREE.CylinderGeometry(
          size.leg * 0.42,
          size.leg * 0.3,
          legLength,
          4,
        ),
        frame,
      );
      leg.rotation.y = Math.PI / 4;
      leg.position.set(
        x * (size.width / 2 - inset),
        -size.top - legLength / 2,
        z * (size.depth / 2 - inset),
      );
      leg.castShadow = true;
      leg.receiveShadow = true;
      desk.add(leg);
    }
  }
  const rails: Array<[number, number, number, number]> = [
    [size.width - 2 * inset, size.leg * 0.25, 0, size.depth / 2 - inset],
    [size.width - 2 * inset, size.leg * 0.25, 0, -(size.depth / 2 - inset)],
    [size.leg * 0.25, size.depth - 2 * inset, size.width / 2 - inset, 0],
    [size.leg * 0.25, size.depth - 2 * inset, -(size.width / 2 - inset), 0],
  ];
  for (const [width, depth, x, z] of rails) {
    const rail = new THREE.Mesh(
      new THREE.BoxGeometry(width, apron, depth),
      frame,
    );
    rail.position.set(x, -size.top - apron / 2, z);
    rail.castShadow = true;
    desk.add(rail);
  }
  return desk;
}

// ---------------------------------------------------------------------------
// Keyboard and mouse, after the compact 80s all-in-ones.

/**
 * A rounded box whose top slopes down towards +z (the user): `back` is the
 * height at -z, `front` at +z. The bottom stays flat on the desk.
 */
function wedgeGeometry(
  width: number,
  depth: number,
  front: number,
  back: number,
  radius: number,
): THREE.BufferGeometry {
  const geometry = new RoundedBoxGeometry(width, back, depth, 4, radius);
  const position = geometry.getAttribute("position");
  for (let i = 0; i < position.count; i++) {
    const y = position.getY(i);
    const z = position.getZ(i);
    const towardsFront = (z + depth / 2) / depth;
    const lift = (y + back / 2) / back;
    position.setY(i, y - (back - front) * towardsFront * lift + back / 2);
  }
  geometry.computeVertexNormals();
  return geometry;
}

interface KeySpec {
  /** Legend printed on the cap. */
  label: string;
  /** What it types, when it types something. */
  code?: string;
  /** Width in key units. */
  width?: number;
}

const letters = (row: string): KeySpec[] =>
  [...row].map((char) => ({ label: char.toUpperCase(), code: char }));

const KEY_ROWS: KeySpec[][] = [
  [
    { label: "`", code: "`" },
    ...letters("1234567890"),
    { label: "-", code: "-" },
    { label: "=", code: "=" },
    { label: "backspace", width: 2 },
  ],
  [
    { label: "tab", width: 1.5 },
    ...letters("qwertyuiop"),
    { label: "[", code: "[" },
    { label: "]", code: "]" },
    { label: "\\", width: 1.5, code: "\\" },
  ],
  [
    { label: "caps lock", width: 1.75 },
    ...letters("asdfghjkl"),
    { label: ";", code: ";" },
    { label: "'", code: "'" },
    { label: "return", width: 2.25, code: "Enter" },
  ],
  [
    { label: "shift", width: 2.25 },
    ...letters("zxcvbnm"),
    { label: ",", code: "," },
    { label: ".", code: "." },
    { label: "/", code: "/" },
    { label: "shift", width: 2.75 },
  ],
  [
    { label: "option", width: 1.5 },
    { label: "cmd", width: 1.5 },
    { label: "", width: 7.5, code: " " },
    { label: "enter", width: 2.25 },
    { label: "option", width: 2.25 },
  ],
];

const UNIT = 0.1;
const CAP = 0.086;
/** Each row is tilted a little differently, like sculpted keycaps. */
const ROW_TILT = [0.16, 0.08, 0, -0.06, -0.1];
const KB_DEPTH = 0.8;
const KB_FRONT = 0.07;
const KB_BACK = 0.17;
const KB_SLOPE = Math.atan((KB_BACK - KB_FRONT) / KB_DEPTH);

function buildKeyboard(keys: Map<string, THREE.Object3D>): THREE.Group {
  const board = new THREE.Group();
  const legends = new Map<string, number>();
  for (const label of KEY_ROWS.flat().map((key) => key.label))
    if (label && !legends.has(label)) legends.set(label, legends.size);
  const cell = 128;
  const columns = 16;
  const rowsInAtlas = Math.ceil(legends.size / columns);
  // Legends sit in the top-left corner of each cap, small and dark.
  const atlas = canvasTexture(columns * cell, rowsInAtlas * cell, (ctx) => {
    ctx.fillStyle = "#4d483e";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    for (const [label, index] of legends) {
      const size = label.length > 2 ? 22 : 40;
      ctx.font = `500 ${size}px "JetBrains Mono", monospace`;
      ctx.fillText(
        label,
        (index % columns) * cell + 14,
        Math.floor(index / columns) * cell + 12,
      );
    }
  });
  const legendMaterial = new THREE.MeshBasicMaterial({
    map: atlas,
    transparent: true,
    depthWrite: false,
  });
  const caps = plastic(CAP_LIGHT, 0.55);
  const mods = plastic(CAP_DARK, 0.55);

  // The case: a wedge, thin at the front, with a flat palm band.
  const width = 15 * UNIT;
  const base = new THREE.Mesh(
    wedgeGeometry(width + 0.16, KB_DEPTH, KB_FRONT, KB_BACK, 0.035),
    plastic(BEIGE, 0.6),
  );
  base.castShadow = true;
  base.receiveShadow = true;
  board.add(base);
  // A seam line around the case, a third of the way up.
  const seam = new THREE.Mesh(
    wedgeGeometry(width + 0.165, KB_DEPTH + 0.005, 0.012, 0.012, 0.004),
    plastic(0xa79e89, 0.8),
  );
  seam.position.y = 0.02;
  board.add(seam);

  // The keys ride on a plane that follows the slope of the case.
  const deck = new THREE.Group();
  const deckZ = -KB_DEPTH / 2 + 0.05 + 2.5 * UNIT;
  const surface = (z: number): number =>
    KB_BACK - (KB_BACK - KB_FRONT) * ((z + KB_DEPTH / 2) / KB_DEPTH);
  deck.position.set(0, surface(deckZ) - 0.035, deckZ);
  deck.rotation.x = KB_SLOPE;
  board.add(deck);
  const well = new THREE.Mesh(
    new RoundedBoxGeometry(width + 0.03, 0.03, 5 * UNIT + 0.03, 2, 0.01),
    plastic(0x8f8674, 0.85),
  );
  deck.add(well);

  KEY_ROWS.forEach((row, rowIndex) => {
    let x = -width / 2;
    const z = (rowIndex - 2) * UNIT;
    for (const spec of row) {
      const span = (spec.width ?? 1) * UNIT;
      const capWidth = span - (UNIT - CAP);
      const key = new THREE.Group();
      const cap = new THREE.Mesh(
        taperedBox(capWidth, 0.065, CAP, 0.76, "top"),
        (spec.width ?? 1) > 1 ? mods : caps,
      );
      // Keycaps only receive shadows: dozens of tiny casters cost a shadow
      // pass each frame and nobody sees their shadows.
      cap.castShadow = false;
      cap.receiveShadow = true;
      key.add(cap);
      const index = legends.get(spec.label);
      if (index !== undefined) {
        const legend = new THREE.PlaneGeometry(CAP * 0.72, CAP * 0.72);
        const u = (index % columns) / columns;
        const v = 1 - (Math.floor(index / columns) + 1) / rowsInAtlas;
        const uv = legend.getAttribute("uv");
        for (let i = 0; i < uv.count; i++)
          uv.setXY(i, u + uv.getX(i) / columns, v + uv.getY(i) / rowsInAtlas);
        const mesh = new THREE.Mesh(legend, legendMaterial);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(
          (spec.width ?? 1) > 1.25 ? -capWidth / 2 + CAP * 0.4 : 0,
          0.033,
          0,
        );
        key.add(mesh);
      }
      key.rotation.x = ROW_TILT[rowIndex] ?? 0;
      key.position.set(x + span / 2, 0.05, z);
      key.userData.baseY = 0.05;
      deck.add(key);
      if (spec.code && !keys.has(spec.code)) keys.set(spec.code, key);
      x += span;
    }
  });

  // Our mark on the palm band, bottom left.
  const mark = textPlane("r", [0.06, 0.06], "#a39a85", 800);
  mark.rotation.x = -Math.PI / 2 + KB_SLOPE;
  mark.position.set(-width / 2 + 0.02, surface(0.32) + 0.002, 0.32);
  board.add(mark);
  return board;
}

/** The one-button mouse: a tall box sloping to the hand, button at the far end. */
function buildMouse(shell: THREE.Material, dark: THREE.Material): THREE.Group {
  const mouse = new THREE.Group();
  const depth = 0.42;
  const body = new THREE.Mesh(
    wedgeGeometry(0.25, depth, 0.075, 0.12, 0.035),
    shell,
  );
  body.castShadow = true;
  body.receiveShadow = true;
  mouse.add(body);
  const slope = Math.atan((0.12 - 0.075) / depth);
  const top = (z: number): number =>
    0.12 - (0.12 - 0.075) * ((z + depth / 2) / depth);
  // The button: a plate set into the far third, with a dark gap around it.
  const gap = new THREE.Mesh(
    new RoundedBoxGeometry(0.2, 0.012, 0.14, 2, 0.005),
    dark,
  );
  gap.rotation.x = slope;
  gap.position.set(0, top(-0.12) - 0.002, -0.12);
  mouse.add(gap);
  const button = new THREE.Mesh(
    new RoundedBoxGeometry(0.188, 0.016, 0.128, 2, 0.006),
    shell,
  );
  button.rotation.x = slope;
  button.position.set(0, top(-0.12) + 0.004, -0.12);
  button.castShadow = true;
  mouse.add(button);
  const badge = textPlane("r", [0.05, 0.05], "#a39a85", 800);
  badge.rotation.x = -Math.PI / 2 + slope;
  badge.position.set(-0.06, top(0.13) + 0.002, 0.13);
  mouse.add(badge);
  return mouse;
}

// ---------------------------------------------------------------------------
// The room

/**
 * Free every geometry, material and texture in a scene (canvas textures and
 * the model's colour and metal/roughness maps), so repeated boots and
 * inception runs do not pile up GPU memory. Render-target textures belong
 * to their targets, which their owner disposes.
 */
export function disposeScene(scene: THREE.Object3D): void {
  const materials = new Set<THREE.Material>();
  scene.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    node.geometry.dispose();
    if (node instanceof THREE.InstancedMesh) node.dispose();
    const list = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of list) materials.add(material);
  });
  for (const material of materials) {
    for (const value of Object.values(material)) {
      if (!(value instanceof THREE.Texture) || value.isRenderTargetTexture)
        continue;
      value.dispose();
      // The model's images decode to ImageBitmaps, which hold memory until
      // closed.
      const image: unknown = value.source.data;
      if (image instanceof ImageBitmap) image.close();
    }
    material.dispose();
  }
}

/**
 * "Personal Computer" by Juan Foo (CC-BY-4.0), turned to face +z and scaled
 * so its screen sits at SCREEN_* (which puts the case on the desk). Its own
 * keyboard and glass are hidden: the room draws a keyboard whose keys move,
 * and the screen is the boot DOM or a texture.
 */
async function placeComputer(scene: THREE.Scene): Promise<void> {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.loadAsync(pcModel);
  const pc = gltf.scene;
  pc.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    const material = Array.isArray(node.material)
      ? node.material[0]
      : node.material;
    // Its keyboard, and the glass (two meshes named after the "screen"
    // material: the curved tube face and the box behind it).
    if (/kewboard|screen/i.test(node.name) || material?.name === "screen") {
      node.visible = false;
      return;
    }
    node.castShadow = true;
    node.receiveShadow = true;
  });
  const holder = new THREE.Group();
  holder.rotation.y = -Math.PI / 2;
  holder.scale.setScalar(MODEL_SCALE);
  // After the turn, model (x, y, z) maps to world (-z, y, x) times the scale.
  holder.position.set(
    MODEL_SCALE * MODEL.screenCentreZ,
    SCREEN_Y - MODEL_SCALE * MODEL.screenCentreY,
    SCREEN_Z - MODEL_SCALE * MODEL.screenFront,
  );
  holder.add(pc);
  scene.add(holder);
}

export async function buildRoom(accent: string): Promise<Room> {
  const scene = new THREE.Scene();
  const keys = new Map<string, THREE.Object3D>();
  const shell = plastic(BEIGE, 0.55);
  shell.side = THREE.DoubleSide;
  const shellDark = plastic(BEIGE_DARK, 0.6);

  // Lights: a dim warm fill, a cool rim from behind, and the desk lamp
  // (below) doing most of the work.
  scene.add(new THREE.HemisphereLight(0xffe7c8, 0x22180f, 0.8));
  // A soft fill from the front left, like a photographer's bounce card.
  const fill = new THREE.DirectionalLight(0xfff0dc, 0.55);
  fill.position.set(-3, 3.5, 5);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0x9fb2ff, 0.35);
  rim.position.set(-3.5, 4, -4);
  scene.add(rim);

  // The far side of everything: a dark dome in the fog's colour. It is drawn
  // and fogged like the desk, so the desk fades into it without a horizon,
  // with or without tone mapping.
  scene.add(
    new THREE.Mesh(
      new THREE.SphereGeometry(30, 32, 16),
      new THREE.MeshBasicMaterial({ color: VOID, side: THREE.BackSide }),
    ),
  );

  // The desk, on a floor that runs off into the dark.
  const desk = buildDesk({
    width: 7.2,
    depth: 3.9,
    height: -FLOOR_Y,
    top: 0.14,
    leg: 0.26,
    grain: [1, 1],
  });
  desk.position.z = 0.3;
  scene.add(desk, buildFloor(FLOOR_Y, 6));

  const person = buildPerson();
  scene.add(person.group);

  // The computer (a model), plus the bits the boot drives: a power button
  // and LED on the left of the system unit, and a disk light by the drive.
  await placeComputer(scene);
  const powerButton = new THREE.Mesh(
    new THREE.CylinderGeometry(0.045, 0.045, 0.03, 24),
    shellDark,
  );
  powerButton.rotation.x = Math.PI / 2;
  powerButton.position.set(-0.95, 0.3, CASE_FRONT + 0.012);
  powerButton.castShadow = true;
  scene.add(powerButton);
  const led = (color: number): THREE.MeshStandardMaterial =>
    new THREE.MeshStandardMaterial({
      color,
      emissive: 0x000000,
      roughness: 0.3,
    });
  const powerLed = led(0x1d2a12);
  const diskLed = led(0x2a1d0a);
  scene.add(
    box([0.04, 0.015, 0.01], powerLed, [-0.78, 0.3, CASE_FRONT + 0.006]),
  );
  scene.add(
    box([0.04, 0.015, 0.01], diskLed, [1.25, 0.16, CASE_FRONT + 0.006]),
  );
  // A small amber display, dark until powered.
  const turbo = new THREE.MeshBasicMaterial({ color: 0x2a0d0a });
  turbo.map = canvasTexture(128, 64, (ctx) => {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, 128, 64);
    ctx.fillStyle = "#ff8a2a";
    ctx.font = '700 40px "JetBrains Mono", monospace';
    ctx.textBaseline = "middle";
    ctx.fillText("8MHz", 8, 34);
  });
  const display = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.06), turbo);
  display.position.set(-0.55, 0.3, CASE_FRONT + 0.004);
  scene.add(display);

  // Cables: keyboard and mouse into the side of the case.
  const cable = new THREE.MeshStandardMaterial({
    color: 0xcfc6b0,
    roughness: 0.6,
  });
  const cableTube = (
    points: Array<[number, number, number]>,
    radius: number,
  ): THREE.Mesh => {
    const curve = new THREE.CatmullRomCurve3(
      points.map(([x, y, z]) => new THREE.Vector3(x, y, z)),
    );
    const mesh = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 48, radius, 8),
      cable,
    );
    mesh.castShadow = true;
    return mesh;
  };
  scene.add(
    cableTube(
      [
        [-0.82, 0.08, 1.1],
        [-1.05, 0.03, 0.9],
        [-1.1, 0.04, 0.2],
        [-0.9, 0.2, -0.3],
        [-0.88, 0.25, -0.5],
      ],
      0.012,
    ),
  );
  // The mouse cable leaves from the far end, under the button.
  scene.add(
    cableTube(
      [
        [1.3, 0.05, 1.21],
        [1.28, 0.03, 0.95],
        [1.12, 0.03, 0.45],
        [0.95, 0.15, -0.2],
        [0.88, 0.22, -0.4],
      ],
      0.01,
    ),
  );

  // Keyboard in front of the computer; its case slopes up to the back.
  const keyboard = buildKeyboard(keys);
  keyboard.position.set(0, 0, 1.5);
  keyboard.rotation.y = 0.02;
  scene.add(keyboard);

  // Mouse on a pad, turned a touch towards the keyboard.
  scene.add(
    box([0.62, 0.008, 0.6], plastic(0x26324a, 0.9), [1.35, 0.004, 1.45], 0.004),
  );
  const mouse = buildMouse(shell, plastic(0x7d7565, 0.8));
  mouse.position.set(1.32, 0.008, 1.42);
  mouse.rotation.y = 0.12;
  scene.add(mouse);

  // Desk lamp on the right, bent over the keyboard.
  const metal = new THREE.MeshStandardMaterial({
    color: 0x2b2b2d,
    roughness: 0.35,
    metalness: 0.6,
  });
  const lampBase = new THREE.Mesh(
    new THREE.CylinderGeometry(0.2, 0.22, 0.05, 32),
    metal,
  );
  lampBase.position.set(2.1, 0.025, -0.6);
  lampBase.castShadow = true;
  scene.add(lampBase);
  const arm = (from: THREE.Vector3, to: THREE.Vector3): void => {
    const length = from.distanceTo(to);
    const rod = new THREE.Mesh(
      new THREE.CylinderGeometry(0.018, 0.018, length, 10),
      metal,
    );
    rod.position.copy(from).add(to).multiplyScalar(0.5);
    rod.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      to.clone().sub(from).normalize(),
    );
    rod.castShadow = true;
    scene.add(rod);
  };
  const joint1 = new THREE.Vector3(2.1, 0.05, -0.6);
  const joint2 = new THREE.Vector3(1.95, 1.55, -0.75);
  const joint3 = new THREE.Vector3(1.45, 2.0, 0.25);
  arm(joint1, joint2);
  arm(joint2, joint3);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 10), metal);
  ball.position.copy(joint2);
  scene.add(ball);
  const shade = new THREE.Mesh(
    new THREE.ConeGeometry(0.2, 0.3, 32, 1, true),
    new THREE.MeshStandardMaterial({
      color: 0x6b2a1e,
      roughness: 0.5,
      side: THREE.DoubleSide,
    }),
  );
  shade.position.copy(joint3);
  shade.lookAt(new THREE.Vector3(1.2, 0, 0.6));
  // The cone's tip is +y; turn it away so the open end faces the desk.
  shade.rotateX(-Math.PI / 2);
  shade.castShadow = true;
  scene.add(shade);
  const bulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.06, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0xffe2b0 }),
  );
  bulb.position.copy(joint3).add(new THREE.Vector3(-0.02, -0.1, 0.02));
  scene.add(bulb);
  const lamp = new THREE.SpotLight(0xffc98a, 16, 8, 0.85, 0.7, 1.6);
  lamp.position.copy(bulb.position);
  lamp.target.position.set(0.3, 0, 1.3);
  lamp.castShadow = true;
  lamp.shadow.mapSize.set(1024, 1024);
  lamp.shadow.bias = -0.0006;
  scene.add(lamp, lamp.target);

  // Mug, a stack of floppies, a notepad and a plant.
  const mug = new THREE.Mesh(
    new THREE.CylinderGeometry(0.1, 0.09, 0.22, 28),
    plastic(0x2b2a27, 0.45),
  );
  mug.position.set(-1.55, 0.11, 1.3);
  mug.castShadow = true;
  scene.add(mug);
  const handle = new THREE.Mesh(
    new THREE.TorusGeometry(0.055, 0.015, 8, 20, Math.PI),
    plastic(0x2b2a27, 0.45),
  );
  handle.position.set(-1.65, 0.12, 1.3);
  handle.rotation.z = Math.PI / 2;
  scene.add(handle);
  const disks = [0x24477a, 0x2b2a27, 0x7a2e26, 0x2b2a27];
  disks.forEach((color, index) => {
    const disk = box(
      [0.3, 0.018, 0.3],
      plastic(color, 0.5),
      [-1.45, 0.009 + index * 0.019, 0.35],
      0.006,
    );
    disk.rotation.y = index * 0.12 - 0.15;
    scene.add(disk);
  });
  const notepad = box(
    [0.42, 0.012, 0.56],
    plastic(0xe8dfb8, 0.9),
    [-2.2, 0.006, 1.15],
    0.004,
  );
  notepad.rotation.y = 0.18;
  scene.add(notepad);
  const pen = new THREE.Mesh(
    new THREE.CylinderGeometry(0.012, 0.012, 0.4, 10),
    plastic(0x205ea6, 0.4),
  );
  pen.rotation.set(Math.PI / 2, 0, -0.5);
  pen.position.set(-2.15, 0.03, 1.15);
  scene.add(pen);
  const plant = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.13, 0.3, 24),
    plastic(0xb5603a, 0.85),
  );
  plant.position.set(-2.6, 0.15, -0.9);
  plant.castShadow = true;
  scene.add(plant);
  for (let i = 0; i < 11; i++) {
    const leaf = new THREE.Mesh(
      new THREE.ConeGeometry(0.045, 0.6, 6),
      plastic(0x3f6b34, 0.8),
    );
    leaf.position.set(
      -2.6 + Math.cos(i * 1.7) * 0.07,
      0.55,
      -0.9 + Math.sin(i * 1.7) * 0.07,
    );
    leaf.rotation.set(Math.sin(i * 1.3) * 0.45, 0, Math.cos(i * 1.9) * 0.45);
    leaf.castShadow = true;
    scene.add(leaf);
  }

  // Light from the screen once it is on.
  const glow = new THREE.PointLight(new THREE.Color(accent), 0, 4.5, 1.6);
  glow.position.set(0, SCREEN_Y, SCREEN_Z + 0.7);
  scene.add(glow);

  return {
    scene,
    powerButton,
    powerLeds: [powerLed],
    diskLed,
    turbo,
    glow,
    keys,
    person,
    dispose() {
      disposeScene(scene);
    },
  };
}
