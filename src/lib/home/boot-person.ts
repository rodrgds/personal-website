import * as THREE from "three";
import faceMap from "../../assets/models/rodrigo-face.jpg?url";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

import {
  aimDigit,
  buildArm,
  FOREARM,
  tipOf,
  UPPER_ARM,
  type ArmRig,
} from "./person-arm";
import { crownLocks, profile, sweptHair } from "./person-geometry";

export interface Person {
  group: THREE.Group;
  /** Advance the pose; call once per frame. */
  update(now: number): void;
  /** Tap the key at this world position with the nearer hand. */
  tap(key: THREE.Vector3, now: number): void;
  /** Reach the nearer hand to a point, or bring it back to the keys. */
  reach(target: THREE.Vector3 | null): void;
  /** Lean towards the desk (0) or further (1), for the reach. */
  lean(amount: number): void;
  /** Fade the figure out while the camera flies past. */
  setOpacity(value: number): void;
}

/** The floor the desk, his feet and the chair stand on (the desk top is 0). */
export const FLOOR_Y = -2.9;

const SKIN = 0xd39e81;
const SHIRT = 0xd9dce3;
const FRAME = 0x343a40;
const TROUSERS = 0x283349;

// The room's keyboard, in world space: the home row's key centres and the
// space bar. Taps arrive with their own positions; these only set where the
// hands rest and which finger types which key, as a touch typist would.
const KEY_PITCH = 0.1;
const A_KEY_X = -0.527;
const HOME_ROW_Y = 0.147;
const HOME_ROW_Z = 1.407;
/** The board is turned a touch, so rows move back towards the left. */
const ROW_TURN = -0.02;
/** From a key's centre to the top of its cap. */
const CAP_TOP = 0.034;
const SPACE_Y = 0.122;
const SPACE_Z = 1.605;
/** Each row sits this far right of the home row, from the number row down. */
const ROW_STAGGER = [-0.075, -0.025, 0, 0.05];

/** A keystroke: reach, strike, hold the key down and let go. */
const PRESS_MS = 150;
/** The tip lifts this far before it strikes, and pushes the cap this far. */
const HOVER = 0.022;
const TRAVEL = 0.016;
/** How much of a reach the hand makes; the finger makes the rest. */
const HAND_FOLLOW = 0.6;
/** Resting fingers: bent at the knuckle, curled at the middle joint. */
const REST_FLEX = 0.36;
const REST_CURL = 0.95;

/**
 * Transparent from the start (at full opacity), so fading the figure out
 * later only changes a uniform and never rebuilds a shader mid-flight.
 */
function material(
  color: number,
  roughness: number,
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness: 0,
    transparent: true,
  });
}

/** Two-bone IK: where the elbow goes for a shoulder, a wrist and a pole. */
function elbowFor(
  shoulder: THREE.Vector3,
  wrist: THREE.Vector3,
  pole: THREE.Vector3,
): THREE.Vector3 {
  const toWrist = wrist.clone().sub(shoulder);
  const reach = THREE.MathUtils.clamp(
    toWrist.length(),
    Math.abs(UPPER_ARM - FOREARM) + 0.01,
    (UPPER_ARM + FOREARM) * 0.995,
  );
  const along = toWrist.normalize();
  const cos =
    (UPPER_ARM ** 2 + reach ** 2 - FOREARM ** 2) / (2 * UPPER_ARM * reach);
  const sin = Math.sqrt(Math.max(0, 1 - cos ** 2));
  const side = pole
    .clone()
    .sub(along.clone().multiplyScalar(pole.dot(along)))
    .normalize();
  return shoulder
    .clone()
    .addScaledVector(along, UPPER_ARM * cos)
    .addScaledVector(side, UPPER_ARM * sin);
}

/** Which hand and digit (index, middle, ring, little, thumb) types a key. */
function fingerFor(key: THREE.Vector3): [hand: 0 | 1, digit: number] | null {
  const row = Math.round((key.z - (HOME_ROW_Z + ROW_TURN * key.x)) / KEY_PITCH);
  if (row >= 2) return null;
  const stagger = ROW_STAGGER[THREE.MathUtils.clamp(row + 2, 0, 3)] ?? 0;
  const column = Math.round((key.x - stagger - A_KEY_X) / KEY_PITCH);
  if (column <= 4) return [0, [3, 2, 1, 0, 0][Math.max(0, column)] ?? 3];
  return [1, [0, 0, 1, 2][column - 5] ?? 3];
}

/** Where a key's cap is on the home row, for column `column` from A. */
function homeKey(column: number, out: THREE.Vector3): THREE.Vector3 {
  const x = A_KEY_X + column * KEY_PITCH;
  return out.set(x, HOME_ROW_Y + CAP_TOP, HOME_ROW_Z + ROW_TURN * x);
}
/** Rounded rectangular rims curve back towards the temples. */
function buildGlasses(frame: THREE.Material): THREE.Group {
  const glasses = new THREE.Group();
  const wire = (
    points: THREE.Vector3[],
    radius: number,
    closed = false,
  ): void => {
    const curve = new THREE.CatmullRomCurve3(points, closed);
    glasses.add(
      new THREE.Mesh(
        new THREE.TubeGeometry(curve, closed ? 52 : 20, radius, 6, closed),
        frame,
      ),
    );
  };
  for (const side of [-1, 1]) {
    const rim = [];
    for (let i = 0; i < 36; i++) {
      const a = (2 * Math.PI * i) / 36;
      const sx = Math.cos(a),
        sy = Math.sin(a);
      const x = side * (0.164 + 0.136 * Math.sign(sx) * Math.abs(sx) ** 0.52);
      const y = 0.065 + 0.075 * Math.sign(sy) * Math.abs(sy) ** 0.55;
      rim.push(
        new THREE.Vector3(x, y, -0.451 + 0.94 * x * x + (0.06 - y) * 0.085),
      );
    }
    wire(rim, 0.008, true);
    wire(
      [
        new THREE.Vector3(side * 0.299, 0.092, -0.367),
        new THREE.Vector3(side * 0.356, 0.083, -0.253),
        new THREE.Vector3(side * 0.39, 0.073, -0.08),
        new THREE.Vector3(side * 0.398, 0.06, 0.051),
        new THREE.Vector3(side * 0.389, -0.012, 0.112),
      ],
      0.009,
    );
  }
  wire(
    [
      new THREE.Vector3(-0.032, 0.087, -0.451),
      new THREE.Vector3(0, 0.097, -0.456),
      new THREE.Vector3(0.032, 0.087, -0.451),
    ],
    0.007,
  );
  return glasses;
}

function buildHead(
  skin: THREE.Material,
  hair: THREE.Material,
  complexion: THREE.Material,
  lips: THREE.Material,
  frame: THREE.Material,
): THREE.Group {
  const head = new THREE.Group();
  const face = new THREE.Mesh(
    profile([
      [-0.5, 0.09, 0.09, -0.19],
      [-0.46, 0.18, 0.2, -0.14],
      [-0.36, 0.285, 0.29, -0.08],
      [-0.22, 0.34, 0.36, -0.024],
      [-0.08, 0.365, 0.394, 0.006],
      [0.065, 0.374, 0.418, 0.015],
      [0.21, 0.377, 0.41, 0.021],
      [0.36, 0.33, 0.36, 0.035],
      [0.48, 0.19, 0.215, 0.03],
      [0.52, 0.025, 0.03, 0.025],
    ]),
    skin,
  );
  face.castShadow = true;
  head.add(face);
  const oval = new THREE.SphereGeometry(1, 16, 12);
  const feature = (
    mat: THREE.Material,
    x: number,
    y: number,
    z: number,
    rx: number,
    ry: number,
    rz: number,
  ): THREE.Mesh => {
    const mesh = new THREE.Mesh(oval, mat);
    mesh.position.set(x, y, z);
    mesh.scale.set(rx, ry, rz);
    head.add(mesh);
    return mesh;
  };
  for (const side of [-1, 1]) {
    feature(skin, side * 0.365, -0.015, 0.025, 0.056, 0.113, 0.069).rotation.x =
      -0.18;
    feature(lips, side * 0.413, -0.009, 0.027, 0.009, 0.055, 0.035);
  }
  const nose = new THREE.Mesh(
    profile([
      [-0.126, 0.055, 0.034, -0.402],
      [-0.09, 0.087, 0.07, -0.42],
      [-0.045, 0.062, 0.075, -0.437],
      [0.04, 0.041, 0.042, -0.42],
      [0.12, 0.034, 0.025, -0.396],
    ]),
    skin,
  );
  head.add(nose);

  const position = face.geometry.getAttribute("position");
  const colors: number[] = [];
  const color = new THREE.Color();
  const white = new THREE.Color(0xffffff);
  const stubble = new THREE.Color(0x8a827e);
  const uv: number[] = [];
  for (let i = 0; i < position.count; i++) {
    const cheek = Math.abs(position.getX(i)) / 0.38;
    const line = -0.29 + 0.22 * cheek;
    const density =
      (1 -
        THREE.MathUtils.smoothstep(
          position.getY(i),
          line - 0.07,
          line + 0.09,
        )) *
      (1 - THREE.MathUtils.smoothstep(position.getZ(i), 0, 0.13));
    const u = (0.47 - position.getX(i)) / 0.94;
    const v = position.getZ(i) < -0.1 ? (0.55 + position.getY(i)) / 1.1 : 1;
    uv.push(u, v);
    color.copy(white).lerp(stubble, density);
    colors.push(color.r, color.g, color.b);
  }
  face.geometry.setAttribute(
    "color",
    new THREE.Float32BufferAttribute(colors, 3),
  );
  face.geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  face.material = complexion;
  const brushed = new THREE.Mesh(sweptHair(), hair);
  brushed.castShadow = true;
  head.add(brushed, crownLocks(hair), buildGlasses(frame));
  return head;
}

export function buildPerson(): Person {
  const group = new THREE.Group();
  const skin = material(SKIN, 0.62);
  const shirt = material(SHIRT, 0.91);
  const hair = material(0xffffff, 0.76);
  hair.vertexColors = true;
  const complexion = material(0xffffff, 0.82);
  // The eyes, nose and smile come from the supplied white-shirt portrait.
  complexion.map = new THREE.TextureLoader().load(faceMap);
  complexion.map.colorSpace = THREE.SRGBColorSpace;
  complexion.vertexColors = true;
  const lips = material(0xb47c69, 0.72);
  const frame = material(FRAME, 0.35);
  const trousers = material(TROUSERS, 0.9);
  const shoeLeather = material(0x1d1b1a, 0.55);
  const materials = [
    skin,
    shirt,
    hair,
    complexion,
    lips,
    frame,
    trousers,
    shoeLeather,
  ];

  // The body pivots at the hips, so leaning forward moves the shoulders.
  const hips = new THREE.Vector3(0, -0.9, 3.45);
  const body = new THREE.Group();
  body.position.copy(hips);
  group.add(body);

  // A seated waist, rib cage and sloping trapezius in one continuous shirt.
  const torso = new THREE.Mesh(
    profile([
      [-0.05, 0.58, 0.37, 0.03],
      [0.12, 0.7, 0.43, 0.06],
      [0.35, 0.68, 0.39, 0.04],
      [0.58, 0.64, 0.39, 0.04],
      [0.91, 0.68, 0.41, 0.025],
      [1.3, 0.78, 0.445, 0.006],
      [1.65, 0.9, 0.49, -0.02],
      [1.94, 0.97, 0.47, -0.045],
      [2.09, 0.96, 0.415, -0.055],
      [2.2, 0.86, 0.365, -0.065],
      [2.26, 0.66, 0.32, -0.07],
      [2.34, 0.41, 0.26, -0.09],
      [2.41, 0.235, 0.22, -0.12],
    ]),
    shirt,
  );
  // The yoke seam follows the shoulders. A shallow box pleat opens below it.
  const cloth = torso.geometry.getAttribute("position");
  for (let i = 0; i < cloth.count; i++) {
    const x = cloth.getX(i);
    const y = cloth.getY(i);
    const z = cloth.getZ(i);
    if (z < 0.03) continue;
    const pleat = Math.exp(-(((Math.abs(x) - 0.072) / 0.055) ** 2));
    cloth.setZ(
      i,
      z + 0.035 * pleat * (1 - THREE.MathUtils.smoothstep(y, 1.6, 1.95)),
    );
  }
  torso.geometry.computeVertexNormals();
  const seamPoints = [];
  for (let i = 0; i <= 26; i++) {
    const a = (i / 26 - 0.5) * 2.56;
    seamPoints.push(
      new THREE.Vector3(
        0.972 * Math.sin(a),
        1.94,
        -0.045 + 0.473 * Math.cos(a),
      ),
    );
  }
  const seam = new THREE.Mesh(
    new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3(seamPoints),
      30,
      0.009,
      5,
      false,
    ),
    shirt,
  );
  body.add(seam);
  torso.castShadow = true;
  torso.receiveShadow = true;
  body.add(torso);
  const neck = new THREE.Mesh(
    profile([
      [2.3, 0.26, 0.23, -0.11],
      [2.44, 0.207, 0.2, -0.12],
      [2.58, 0.19, 0.185, -0.15],
      [2.73, 0.21, 0.197, -0.17],
    ]),
    skin,
  );
  const collar = new THREE.Mesh(
    profile([
      [2.325, 0.34, 0.3, -0.1],
      [2.35, 0.345, 0.305, -0.1],
      [2.49, 0.241, 0.23, -0.12],
      [2.5, 0.221, 0.211, -0.12],
    ]),
    shirt,
  );
  body.add(neck, collar);
  // Thighs in dark trousers, along the seat towards the desk (in world
  // space, so they stay put when he leans).
  for (const side of [-1, 1]) {
    const thigh = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.26, 1.2, 4, 10),
      trousers,
    );
    thigh.rotation.x = Math.PI / 2;
    thigh.position.set(side * 0.42, -0.7, 2.7);
    group.add(thigh);
    // A knee where the thigh ends, a calf down to the floor and a shoe.
    const knee = new THREE.Vector3(side * 0.42, -0.7, 2.1);
    const ankle = new THREE.Vector3(side * 0.46, FLOOR_Y + 0.24, 1.86);
    const kneeCap = new THREE.Mesh(
      new THREE.SphereGeometry(0.26, 16, 12),
      trousers,
    );
    kneeCap.position.copy(knee);
    const shin = new THREE.Mesh(
      new THREE.CylinderGeometry(0.17, 0.24, 1, 14, 1, true),
      trousers,
    );
    // A unit cylinder stood between the ankle and the knee.
    const along = knee.clone().sub(ankle);
    shin.position.copy(ankle).addScaledVector(along, 0.5);
    shin.scale.set(1, along.length(), 1);
    shin.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      along.normalize(),
    );
    const shoe = new THREE.Mesh(
      new RoundedBoxGeometry(0.36, 0.24, 0.82, 3, 0.1),
      shoeLeather,
    );
    shoe.position.set(side * 0.47, FLOOR_Y + 0.12, 1.66);
    shoe.rotation.y = side * -0.08;
    for (const part of [kneeCap, shin, shoe]) {
      part.castShadow = true;
      group.add(part);
    }
  }
  const head = buildHead(skin, hair, complexion, lips, frame);
  head.position.set(0, 2.94, -0.2);
  head.rotation.x = 0.12;
  body.add(head);

  // Arms live in world space. Each frame the hands float to where their
  // fingertips should be, the elbows follow by IK and the fingers bend to
  // touch their keys.
  const handSkin = material(0xffffff, 0.6);
  handSkin.vertexColors = true;
  materials.push(handSkin);
  interface Hand {
    side: 1 | -1;
    rig: ArmRig;
    shoulderLocal: THREE.Vector3;
    /** Where each digit rests: the home-row caps, then the space bar. */
    homes: THREE.Vector3[];
    /** Middle of the four resting fingertips, at home and in the hand. */
    anchorHome: THREE.Vector3;
    anchorLocal: THREE.Vector3;
    anchorGoal: THREE.Vector3;
    anchor: THREE.Vector3;
    velocity: THREE.Vector3;
    rotation: THREE.Quaternion;
    /** Per digit: when its last keystroke began, its cap and its eased aim. */
    pressAt: number[];
    keys: THREE.Vector3[];
    aims: THREE.Vector3[];
    busyUntil: number;
  }
  const tip = new THREE.Vector3();
  const hands: Hand[] = ([-1, 1] as const).map((side) => {
    const rig = buildArm(side, shirt, handSkin);
    group.add(rig.mesh);
    const homes = (side < 0 ? [3, 2, 1, 0] : [6, 7, 8, 9]).map((column) =>
      homeKey(column, new THREE.Vector3()),
    );
    const thumbX = side < 0 ? -0.2 : 0.02;
    homes.push(
      new THREE.Vector3(thumbX, SPACE_Y + CAP_TOP, SPACE_Z + ROW_TURN * thumbX),
    );
    const anchorHome = new THREE.Vector3();
    const anchorLocal = new THREE.Vector3();
    for (const [i, digit] of rig.digits.entries()) {
      const thumb = i === 4;
      digit.flex = thumb ? 0.2 : REST_FLEX;
      digit.curl = thumb ? 0.3 : REST_CURL;
      if (thumb) continue;
      anchorLocal.addScaledVector(
        tipOf(digit, 0, REST_FLEX, REST_CURL, tip),
        0.25,
      );
      anchorHome.addScaledVector(homes[i] ?? tip, 0.25);
    }
    return {
      side,
      rig,
      shoulderLocal: new THREE.Vector3(side * 0.82, 2.035, -0.06),
      homes,
      anchorHome,
      anchorLocal,
      anchorGoal: anchorHome.clone(),
      anchor: anchorHome.clone(),
      velocity: new THREE.Vector3(),
      rotation: new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(1, 0, 0),
        -Math.PI / 2,
      ),
      pressAt: [-1e9, -1e9, -1e9, -1e9, -1e9],
      keys: homes.map((home) => home.clone()),
      aims: homes.map((home) => home.clone()),
      busyUntil: 0,
    };
  });

  // A mid-back office chair hides where the body meets the seat.
  const fabric = material(0x2a2a2e, 0.95);
  const seatBack = new THREE.Mesh(
    new RoundedBoxGeometry(1.8, 1.7, 0.24, 4, 0.1),
    fabric,
  );
  seatBack.position.set(0, -0.25, 4.15);
  seatBack.rotation.x = 0.1;
  seatBack.castShadow = true;
  group.add(seatBack);
  const seat = new THREE.Mesh(
    new RoundedBoxGeometry(2, 0.28, 1.8, 4, 0.1),
    fabric,
  );
  seat.position.set(0, -1.1, 3.4);
  group.add(seat);
  // Under the seat: a gas lift and a five-star base on casters.
  const steel = material(0x3b3d42, 0.4);
  steel.metalness = 0.6;
  materials.push(steel);
  const baseY = FLOOR_Y + 0.32;
  const lift = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.1, -1.24 - baseY, 16),
    steel,
  );
  lift.position.set(0, (-1.24 + baseY) / 2, 3.4);
  const hub = new THREE.Mesh(
    new THREE.CylinderGeometry(0.17, 0.2, 0.16, 16),
    fabric,
  );
  hub.position.set(0, baseY, 3.4);
  group.add(lift, hub);
  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * Math.PI * 2 + 0.3;
    const out = new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle));
    const spoke = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.1, 1.05),
      fabric,
    );
    spoke.position.set(out.x * 0.55, baseY - 0.02, 3.4 + out.z * 0.55);
    spoke.rotation.y = angle;
    const caster = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.09, 0.1, 14),
      fabric,
    );
    caster.rotation.z = Math.PI / 2;
    caster.rotation.y = angle;
    caster.position.set(out.x * 1.05, FLOOR_Y + 0.09, 3.4 + out.z * 1.05);
    for (const part of [spoke, caster]) {
      part.castShadow = true;
      group.add(part);
    }
  }

  let pressingPower = false;
  let reachHand: Hand | undefined;
  let lastHand: 0 | 1 = 0;
  let leanGoal = 0;
  let leanNow = 0;
  let last = 0;
  let reachPhase = 0;
  let typing = 0;
  let gaze = 0;
  const reachPoint = new THREE.Vector3();
  /** Exponential ease that reaches ~95% in 3/rate seconds, at any frame rate. */
  const ease = (rate: number, dt: number): number => 1 - Math.exp(-rate * dt);
  const smooth = THREE.MathUtils.smoothstep;
  const up = new THREE.Vector3(0, 1, 0);
  const xAxis = new THREE.Vector3(1, 0, 0);
  const shoulder = new THREE.Vector3();
  const wrist = new THREE.Vector3();
  const pole = new THREE.Vector3();
  const forearm = new THREE.Vector3();
  const drift = new THREE.Vector3();
  const offset = new THREE.Vector3();
  const aim = new THREE.Vector3();
  const press = new THREE.Vector3();
  const local = new THREE.Vector3();
  const pointing = new THREE.Vector3();
  const across = new THREE.Vector3();
  const dorsal = new THREE.Vector3();
  const typed = new THREE.Quaternion();
  const reachRotation = new THREE.Quaternion();
  const inverse = new THREE.Quaternion();
  const part = new THREE.Quaternion();
  const basis = new THREE.Matrix4();
  const strikes = [0, 0, 0, 0, 0];

  /** A critically damped spring: quick to a key, no overshoot, any frame rate. */
  const follow = (hand: Hand, rate: number, dt: number): void => {
    for (let left = Math.min(dt, 0.1); left > 0; left -= 1 / 240) {
      const h = Math.min(left, 1 / 240);
      offset
        .copy(hand.anchorGoal)
        .sub(hand.anchor)
        .multiplyScalar(rate * rate)
        .addScaledVector(hand.velocity, -2 * rate);
      hand.velocity.addScaledVector(offset, h);
      hand.anchor.addScaledVector(hand.velocity, h);
    }
  };

  /**
   * Palm down, tilted so the thumb side is a little higher, knuckles above
   * the wrist, and turned only partly with the forearm: the wrist bends
   * towards the little finger so the fingers point at the keys.
   */
  const typingRotation = (hand: Hand, out: THREE.Quaternion): void => {
    const yaw = Math.atan2(-forearm.x, -forearm.z);
    out
      .setFromAxisAngle(up, 0.42 * yaw)
      .multiply(part.setFromAxisAngle(xAxis, -Math.PI / 2 + 0.14))
      .multiply(part.setFromAxisAngle(up, hand.side * 0.2));
  };

  return {
    group,
    update(now) {
      const dt = last ? Math.max(0, (now - last) / 1000) : 0.016;
      last = now;
      leanNow += (leanGoal - leanNow) * ease(5, dt);
      // The eyes lead a reach. The shoulder comes forward as the hips turn,
      // and the reader settles back a little between bursts of typing.
      reachPhase = THREE.MathUtils.clamp(
        reachPhase + (pressingPower ? dt / 0.65 : -dt / 0.54),
        0,
        1,
      );
      const reachingWeight = THREE.MathUtils.smootherstep(reachPhase, 0, 1);
      const active = hands.some((hand) => now < hand.busyUntil);
      typing += (Number(active) - typing) * ease(active ? 6 : 1.5, dt);
      gaze += ((pressingPower ? 1 : 0) - gaze) * ease(7, dt);
      const breath = Math.sin(now / 735) + 0.2 * Math.sin(now / 1433);
      // Now and then a typist glances down at the keys.
      const glance =
        typing *
        smooth(Math.sin(now / 2300) * Math.sin(now / 1370 + 1), 0.45, 0.75);
      const side = reachHand?.side ?? -1;
      const typingSide = lastHand === 0 ? -1 : 1;
      body.rotation.x =
        -0.105 - 0.24 * leanNow - 0.035 * typing + 0.012 * breath;
      body.rotation.y =
        side * 0.19 * leanNow +
        0.022 * Math.sin(now / 2300) +
        0.012 * typingSide * typing;
      body.rotation.z = -side * 0.055 * leanNow + 0.012 * Math.sin(now / 1960);
      torso.scale.z = 1 + 0.008 * breath;
      head.rotation.x =
        -0.045 -
        0.17 * gaze -
        0.095 * typing -
        0.13 * glance +
        0.014 * breath +
        0.008 * typing * Math.sin(now / 170);
      head.rotation.y =
        -side * 0.49 * gaze +
        0.05 * Math.sin(now / 1120) +
        0.022 * Math.sin(now / 313) +
        0.04 * typingSide * glance;
      head.rotation.z = 0.023 * Math.sin(now / 1470) + side * 0.03 * gaze;
      body.updateMatrixWorld();
      for (const hand of hands) {
        const reaching = hand === reachHand && reachPhase > 0;
        const w = reaching ? reachingWeight : 0;
        const busy = now < hand.busyUntil;
        if (!busy) hand.anchorGoal.copy(hand.anchorHome);
        follow(hand, busy ? 30 : 8, dt);
        // Resting hands drift a little; typing hands are held still.
        drift
          .set(
            Math.sin(now / 1900 + hand.side),
            0.6 * Math.sin(now / 1300 + 2 * hand.side),
            Math.sin(now / 2500 + hand.side),
          )
          .multiplyScalar(0.006 * (1 - typing));
        wrist
          .copy(hand.anchorLocal)
          .applyQuaternion(hand.rotation)
          .negate()
          .add(hand.anchor)
          .add(drift);
        // The shoulder rises with each breath and comes forward to reach.
        shoulder
          .copy(hand.shoulderLocal)
          .add(
            offset.set(
              0,
              0.006 * breath + 0.03 * w,
              -0.12 * w - 0.015 * Number(busy),
            ),
          );
        body.localToWorld(shoulder);
        if (reaching) {
          // Point the hand at the button, thumb side up, index straight.
          pointing.copy(reachPoint).sub(shoulder).normalize();
          dorsal.copy(up).addScaledVector(pointing, -pointing.y).normalize();
          across.crossVectors(pointing, dorsal);
          reachRotation
            .setFromRotationMatrix(basis.makeBasis(across, pointing, dorsal))
            .multiply(part.setFromAxisAngle(up, hand.side * 0.6));
          const index = hand.rig.digits[0];
          if (index) tipOf(index, 0, 0.12, 0.12, tip);
          aim.copy(tip).applyQuaternion(reachRotation).negate().add(reachPoint);
          wrist.lerp(aim, w);
          wrist.y += 0.22 * Math.sin(Math.PI * reachPhase);
          wrist.x += hand.side * 0.09 * Math.sin(Math.PI * reachPhase);
        }
        // Elbows out and back, so the forearms come in towards the keys.
        pole.set(hand.side * 0.35, -1, 0.4);
        const elbow = elbowFor(shoulder, wrist, pole);
        forearm.copy(wrist).sub(elbow).normalize();
        wrist.copy(elbow).addScaledVector(forearm, FOREARM);
        typingRotation(hand, typed);
        hand.rotation.copy(typed);
        if (reaching) hand.rotation.slerp(reachRotation, w);
        inverse.copy(hand.rotation).invert();

        // Each digit aims at its home key, moved with the hand and a little
        // above it, or at the key it is striking.
        offset.copy(hand.anchor).sub(hand.anchorHome);
        const lift = 0.012 + 0.3 * Math.min(0.08, offset.length());
        for (let i = 0; i < 5; i++) {
          const p = (now - (hand.pressAt[i] ?? -1e9)) / PRESS_MS;
          strikes[i] =
            p >= 0 && p < 1
              ? smooth(p, 0.16, 0.36) * (1 - smooth(p, 0.55, 0.9))
              : 0;
        }
        for (const [i, digit] of hand.rig.digits.entries()) {
          const home = hand.homes[i];
          const key = hand.keys[i];
          const eased = hand.aims[i];
          if (!home || !key || !eased) continue;
          aim.copy(home).add(offset);
          aim.y += i === 4 ? 0.006 : lift;
          // Neighbouring fingers share tendons and dip along a little.
          if (i < 4)
            aim.y -=
              0.007 *
              Math.max(strikes[i - 1] ?? 0, i < 3 ? (strikes[i + 1] ?? 0) : 0);
          const p = (now - (hand.pressAt[i] ?? -1e9)) / PRESS_MS;
          if (p >= 0 && p < 1) {
            const strike = strikes[i] ?? 0;
            press
              .copy(key)
              .addScaledVector(up, HOVER * (1 - strike) - TRAVEL * strike);
            aim.lerp(press, smooth(p, 0, 0.3) * (1 - smooth(p, 0.62, 1)));
          }
          if (reaching && i === 0) aim.lerp(reachPoint, w);
          eased.lerp(aim, ease(45, dt));
          local.copy(eased).sub(wrist).applyQuaternion(inverse);
          aimDigit(digit, local);
          if (reaching && i > 0) {
            // The other fingers close into a loose fist, thumb along them.
            digit.flex += ((i === 4 ? 0.55 : 1.25) - digit.flex) * w;
            digit.curl += ((i === 4 ? 0.5 : 1.45) - digit.curl) * w;
            digit.spread += ((i === 4 ? 0.15 : 0) - digit.spread) * w;
          }
        }
        hand.rig.pose(shoulder, elbow, wrist, hand.rotation);
      }
    },
    tap(key, now) {
      const finger = fingerFor(key);
      // The space bar takes the thumb of the hand that did not type last.
      const index = finger ? finger[0] : lastHand === 0 ? 1 : 0;
      const digit = finger ? finger[1] : 4;
      const hand = hands[index];
      if (!hand || (hand === reachHand && pressingPower)) return;
      const cap = hand.keys[digit];
      const home = hand.homes[digit];
      if (!cap || !home) return;
      if (finger) {
        cap.copy(key);
        cap.y += CAP_TOP;
        hand.anchorGoal
          .copy(hand.anchorHome)
          .addScaledVector(offset.copy(cap).sub(home), HAND_FOLLOW);
        lastHand = index;
      } else {
        cap.copy(home);
        cap.y = key.y + CAP_TOP;
      }
      hand.pressAt[digit] = now;
      hand.busyUntil = now + 450;
    },
    reach(target) {
      pressingPower = target !== null;
      // The nearer hand reaches.
      if (target) {
        reachPoint.copy(target);
        reachHand = target.x < 0 ? hands[0] : hands[1];
      }
    },
    lean(amount) {
      leanGoal = amount;
    },
    setOpacity(value) {
      for (const mat of [...materials, fabric]) {
        mat.opacity = value;
        mat.depthWrite = value >= 1;
      }
      group.visible = value > 0.01;
    },
  };
}
