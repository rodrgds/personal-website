// One skinned mesh per arm: the rolled shirt sleeve, then a single skin
// surface from above the elbow through the forearm and wrist into the palm,
// with four fingers and a thumb that bend at their joints. Skinning keeps the
// elbow and the wrist free of seams and the whole arm costs two draw calls.
//
// Proportions follow adult hand and arm references in this scene's scale
// (1 unit is about 23 cm, from the head): upper arm 33 cm, forearm 26 cm,
// palm 10 cm, middle finger 9.6 cm from the knuckle with phalanges in about
// 1 : 0.62 : 0.44, the ring finger a touch shorter than the index's reach,
// the little finger short and set back, and a thumb that starts at the wrist.
import * as THREE from "three";

export const UPPER_ARM = 1.42;
export const FOREARM = 1.12;
/** Where the wrist crease sits along the arm in the bind pose. */
const WRIST = UPPER_ARM + FOREARM;
const SKIN = new THREE.Color(0xd39e81);

type Lengths = readonly [number, number, number];

/** A finger or the thumb: three bones that bend in one plane. */
export interface Digit {
  bones: readonly [THREE.Bone, THREE.Bone, THREE.Bone];
  /** The first bone's resting rotation inside the hand. */
  bind: THREE.Quaternion;
  /** The first joint, in the hand bone's space. */
  base: THREE.Vector3;
  lengths: Lengths;
  /** The last joint follows the middle one by this much, as in real hands. */
  couple: number;
  /** Sideways turn at the first joint. */
  spread: number;
  /** Bend at the first joint. */
  flex: number;
  /** Bend at the middle joint. */
  curl: number;
  /** Limits: spread, flex and curl. */
  limits: readonly [number, number, number, number, number];
}

export interface ArmRig {
  mesh: THREE.SkinnedMesh;
  /** Index, middle, ring, little finger, then the thumb. */
  digits: Digit[];
  /** Place the bones from the shoulder, elbow and wrist and the hand's rotation. */
  pose(
    shoulder: THREE.Vector3,
    elbow: THREE.Vector3,
    wrist: THREE.Vector3,
    hand: THREE.Quaternion,
  ): void;
}

const smooth = THREE.MathUtils.smoothstep;
const X_AXIS = new THREE.Vector3(1, 0, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);
const turn = new THREE.Quaternion();
const IDENTITY = new THREE.Quaternion();

/** Point a digit's bones for its spread, flex and curl. */
export function applyDigit(digit: Digit): void {
  const [first, second, third] = digit.bones;
  first.quaternion
    .copy(digit.bind)
    .multiply(turn.setFromAxisAngle(Z_AXIS, digit.spread))
    .multiply(turn.setFromAxisAngle(X_AXIS, -digit.flex));
  second.quaternion.setFromAxisAngle(X_AXIS, -digit.curl);
  third.quaternion.setFromAxisAngle(X_AXIS, -digit.curl * digit.couple);
}

/** Tip of a digit in its plane: forward along the digit and towards the palm. */
function reachOf(
  lengths: Lengths,
  couple: number,
  flex: number,
  curl: number,
): [number, number] {
  const a = flex;
  const b = flex + curl;
  const c = flex + curl * (1 + couple);
  return [
    lengths[0] * Math.cos(a) +
      lengths[1] * Math.cos(b) +
      lengths[2] * Math.cos(c),
    lengths[0] * Math.sin(a) +
      lengths[1] * Math.sin(b) +
      lengths[2] * Math.sin(c),
  ];
}

/** Where the tip of a digit is, in the hand bone's space, for these angles. */
export function tipOf(
  digit: Digit,
  spread: number,
  flex: number,
  curl: number,
  out: THREE.Vector3,
): THREE.Vector3 {
  const [forward, palmward] = reachOf(digit.lengths, digit.couple, flex, curl);
  out.set(-forward * Math.sin(spread), forward * Math.cos(spread), -palmward);
  return out.applyQuaternion(digit.bind).add(digit.base);
}

const local = new THREE.Vector3();
const inverse = new THREE.Quaternion();

/**
 * Bend a digit so its tip reaches a point in the hand bone's space, starting
 * from its current angles: a few damped Gauss-Newton steps on flex and curl.
 */
export function aimDigit(digit: Digit, target: THREE.Vector3): void {
  const [spreadMax, flexMin, flexMax, curlMin, curlMax] = digit.limits;
  local
    .copy(target)
    .sub(digit.base)
    .applyQuaternion(inverse.copy(digit.bind).invert());
  digit.spread = THREE.MathUtils.clamp(
    Math.atan2(-local.x, Math.max(0.05, local.y)),
    -spreadMax,
    spreadMax,
  );
  const goalForward =
    -local.x * Math.sin(digit.spread) + local.y * Math.cos(digit.spread);
  const goalPalmward = -local.z;
  const [, l1, l2] = digit.lengths;
  const k = 1 + digit.couple;
  let { flex, curl } = digit;
  for (let step = 0; step < 4; step++) {
    const [forward, palmward] = reachOf(
      digit.lengths,
      digit.couple,
      flex,
      curl,
    );
    const errorF = goalForward - forward;
    const errorP = goalPalmward - palmward;
    const b = flex + curl;
    const c = flex + curl * k;
    // Partial derivatives of (forward, palmward) by flex and by curl.
    const fFlex = -palmward;
    const pFlex = forward;
    const fCurl = -(l1 * Math.sin(b) + l2 * k * Math.sin(c));
    const pCurl = l1 * Math.cos(b) + l2 * k * Math.cos(c);
    const damping = 0.002;
    const m00 = fFlex * fFlex + pFlex * pFlex + damping;
    const m01 = fFlex * fCurl + pFlex * pCurl;
    const m11 = fCurl * fCurl + pCurl * pCurl + damping;
    const r0 = fFlex * errorF + pFlex * errorP;
    const r1 = fCurl * errorF + pCurl * errorP;
    const det = m00 * m11 - m01 * m01;
    if (Math.abs(det) < 1e-9) break;
    flex = THREE.MathUtils.clamp(
      flex + (m11 * r0 - m01 * r1) / det,
      flexMin,
      flexMax,
    );
    curl = THREE.MathUtils.clamp(
      curl + (m00 * r1 - m01 * r0) / det,
      curlMin,
      curlMax,
    );
  }
  digit.flex = flex;
  digit.curl = curl;
}

/** A cross section: distance along, half width, depth above, depth below, centre. */
type Ring = readonly [
  along: number,
  half: number,
  top: number,
  bottom: number,
  x?: number,
  z?: number,
];

/** Which two bones a point follows and how far it has moved to the second. */
type Weights = readonly [first: number, second: number, blend: number];

class SkinBuilder {
  readonly positions: number[] = [];
  readonly colors: number[] = [];
  readonly joints: number[] = [];
  readonly weights: number[] = [];
  readonly parts: [number[], number[]] = [[], []];
  private readonly point = new THREE.Vector3();
  private readonly color = new THREE.Color();

  /**
   * Sweep rings along a straight axis: the frame's Y is the axis and its Z
   * the top. `round` below 1 squares the section off (palm, fingers).
   */
  sweep(
    part: 0 | 1,
    rings: readonly Ring[],
    sides: number,
    frame: THREE.Matrix4,
    round: (along: number) => number,
    weigh: (along: number) => Weights,
    tint: (along: number, angle: number, color: THREE.Color) => void,
    bend: (point: THREE.Vector3, along: number) => void = () => {},
  ): void {
    const start = this.positions.length / 3;
    const add = (
      x: number,
      y: number,
      z: number,
      along: number,
      angle: number,
    ): void => {
      this.point.set(x, y, z);
      bend(this.point, along);
      this.point.applyMatrix4(frame);
      this.positions.push(this.point.x, this.point.y, this.point.z);
      this.color.copy(SKIN);
      tint(along, angle, this.color);
      this.colors.push(this.color.r, this.color.g, this.color.b);
      const [first, second, blend] = weigh(along);
      this.joints.push(first, second, 0, 0);
      this.weights.push(1 - blend, blend, 0, 0);
    };
    for (const [along, half, top, bottom, x = 0, z = 0] of rings) {
      const power = round(along);
      for (let side = 0; side < sides; side++) {
        const angle = (2 * Math.PI * side) / sides;
        const s = Math.sin(angle);
        const c = Math.cos(angle);
        add(
          x + half * Math.sign(s) * Math.abs(s) ** power,
          along,
          z + (c >= 0 ? top : bottom) * Math.sign(c) * Math.abs(c) ** power,
          along,
          angle,
        );
      }
    }
    const faces = this.parts[part];
    for (let row = 0; row < rings.length - 1; row++) {
      for (let side = 0; side < sides; side++) {
        const v = start + row * sides + side;
        const next = start + row * sides + ((side + 1) % sides);
        faces.push(v, next, v + sides, next, next + sides, v + sides);
      }
    }
    // Close both ends around a centre point.
    const first = rings[0];
    const last = rings[rings.length - 1];
    if (!first || !last) return;
    const bottomCentre = this.positions.length / 3;
    add(first[4] ?? 0, first[0], first[5] ?? 0, first[0], 0);
    const topCentre = bottomCentre + 1;
    add(last[4] ?? 0, last[0], last[5] ?? 0, last[0], 0);
    const lastRow = start + (rings.length - 1) * sides;
    for (let side = 0; side < sides; side++) {
      const next = (side + 1) % sides;
      faces.push(bottomCentre, start + next, start + side);
      faces.push(topCentre, lastRow + side, lastRow + next);
    }
  }

  build(): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(this.positions, 3),
    );
    geometry.setAttribute(
      "color",
      new THREE.Float32BufferAttribute(this.colors, 3),
    );
    geometry.setAttribute(
      "skinIndex",
      new THREE.Uint16BufferAttribute(this.joints, 4),
    );
    geometry.setAttribute(
      "skinWeight",
      new THREE.Float32BufferAttribute(this.weights, 4),
    );
    const [sleeve, skin] = this.parts;
    geometry.setIndex([...sleeve, ...skin]);
    geometry.addGroup(0, sleeve.length, 0);
    geometry.addGroup(sleeve.length, skin.length, 1);
    geometry.computeVertexNormals();
    return geometry;
  }
}

const PALM_TONE = new THREE.Color(0xe7b8a2);
const KNUCKLE_TONE = new THREE.Color(0xbf7f68);
const NAIL_TONE = new THREE.Color(0xf1cbbd);

interface DigitSpec {
  base: THREE.Vector3;
  direction: THREE.Vector3;
  top: THREE.Vector3;
  lengths: Lengths;
  radius: number;
  couple: number;
  limits: readonly [number, number, number, number, number];
  thumb: boolean;
}

/**
 * Build one arm. `side` is +1 for his right arm and -1 for his left; the
 * thumb sits on the inner side of each hand.
 */
export function buildArm(
  side: 1 | -1,
  shirt: THREE.Material,
  skin: THREE.Material,
): ArmRig {
  // In the bind pose the arm hangs straight along +Y with the back of the
  // hand towards +Z, so +X is the outer side of the right hand.
  const thumbSide = -side;
  const t = thumbSide;
  const upper = new THREE.Bone();
  const elbow = new THREE.Bone();
  elbow.position.y = UPPER_ARM;
  const twist = new THREE.Bone();
  twist.position.y = FOREARM / 2;
  const hand = new THREE.Bone();
  hand.position.y = FOREARM / 2;
  upper.add(elbow);
  elbow.add(twist);
  twist.add(hand);
  const bones: THREE.Bone[] = [upper, elbow, twist, hand];

  const fingerLimits = [0.32, -0.35, 1.55, 0, 1.75] as const;
  const finger = (
    x: number,
    y: number,
    splay: number,
    lengths: Lengths,
    radius: number,
  ): DigitSpec => ({
    base: new THREE.Vector3(x, y, 0),
    direction: new THREE.Vector3(splay, 1, 0).normalize(),
    top: new THREE.Vector3(0, 0, 1),
    lengths,
    radius,
    couple: 0.68,
    limits: fingerLimits,
    thumb: false,
  });
  const thumbDirection = new THREE.Vector3(t * 0.4, 0.64, -0.66).normalize();
  const thumbTop = new THREE.Vector3(t * 0.8, 0, 0.6);
  thumbTop.addScaledVector(thumbDirection, -thumbTop.dot(thumbDirection));
  const specs: DigitSpec[] = [
    finger(t * 0.122, 0.425, t * 0.07, [0.19, 0.11, 0.085], 0.042),
    finger(t * 0.04, 0.443, t * 0.01, [0.205, 0.125, 0.09], 0.044),
    finger(-t * 0.045, 0.428, -t * 0.05, [0.192, 0.118, 0.087], 0.041),
    finger(-t * 0.123, 0.39, -t * 0.13, [0.15, 0.088, 0.078], 0.035),
    {
      base: new THREE.Vector3(t * 0.085, 0.09, -0.045),
      direction: thumbDirection,
      top: thumbTop.normalize(),
      lengths: [0.19, 0.135, 0.105],
      radius: 0.05,
      couple: 0.8,
      limits: [0.55, -0.45, 0.95, 0, 1.2],
      thumb: true,
    },
  ];

  const builder = new SkinBuilder();
  const identity = new THREE.Matrix4();
  // The sleeve, rolled up above the elbow, with soft folds.
  const U = UPPER_ARM;
  const sleeve: Ring[] = (
    [
      [-0.22, 0.075],
      [-0.1, 0.17],
      [0.0, 0.214],
      [0.14, 0.233],
      [0.4, 0.224],
      [0.72, 0.205],
      [U - 0.4, 0.186],
      [U - 0.37, 0.2],
      [U - 0.29, 0.206],
      [U - 0.21, 0.203],
      [U - 0.17, 0.196],
      [U - 0.16, 0.15],
    ] as const
  ).map(([along, r]) => [along, r, r * 0.97, r * 0.97]);
  builder.sweep(
    0,
    sleeve,
    28,
    identity,
    () => 1,
    () => [0, 0, 0],
    () => {},
    (point, along) => {
      const folds =
        smooth(along, 0.5, U - 0.45) * (1 - smooth(along, U - 0.42, U - 0.38));
      const a = Math.atan2(point.x, point.z);
      const ridge = 1 + 0.03 * folds * Math.sin(3 * a + along * 13);
      point.x *= ridge;
      point.z *= ridge;
    },
  );

  // Skin from inside the sleeve to the knuckles. The olecranon is behind
  // (-Z), the muscle belly of the forearm sits just below the elbow, and the
  // palm squares off with pads at its heel.
  const W = WRIST;
  const arm: Ring[] = [
    [U - 0.38, 0.158, 0.158, 0.158],
    [U - 0.2, 0.164, 0.156, 0.162],
    [U - 0.05, 0.168, 0.14, 0.176],
    [U + 0.08, 0.18, 0.15, 0.166],
    [U + 0.25, 0.188, 0.156, 0.15],
    [U + 0.46, 0.176, 0.138, 0.13],
    [U + 0.72, 0.153, 0.11, 0.104],
    [W - 0.13, 0.136, 0.09, 0.089],
    [W - 0.04, 0.128, 0.082, 0.084],
    [W + 0.04, 0.146, 0.077, 0.097, t * 0.008, -0.004],
    [W + 0.13, 0.172, 0.072, 0.104, t * 0.012, -0.01],
    [W + 0.23, 0.184, 0.066, 0.086, t * 0.006, -0.006],
    [W + 0.32, 0.19, 0.06, 0.068],
    [W + 0.385, 0.188, 0.056, 0.058],
    [W + 0.42, 0.174, 0.05, 0.05],
    [W + 0.445, 0.134, 0.036, 0.036],
    [W + 0.46, 0.06, 0.016, 0.016],
  ];
  builder.sweep(
    1,
    arm,
    30,
    identity,
    (along) => 1 - 0.3 * smooth(along, W - 0.1, W + 0.1),
    (along) => {
      if (along < U + 0.1) return [0, 1, smooth(along, U - 0.13, U + 0.1)];
      if (along < W - 0.08) return [1, 2, smooth(along, U + 0.1, W - 0.08)];
      return [2, 3, smooth(along, W - 0.08, W + 0.05)];
    },
    (along, angle, color) => {
      const palm = smooth(along, W - 0.02, W + 0.08);
      color.lerp(PALM_TONE, 0.4 * palm * Math.max(0, -Math.cos(angle)));
    },
    (point, along) => {
      // The knuckle line is an arc: middle furthest, little finger set back.
      const knuckles = smooth(along, W + 0.18, W + 0.42);
      const across = point.x / 0.19;
      point.y -=
        knuckles * (0.05 * across * across + 0.032 * Math.max(0, -t * across));
    },
  );

  const digits: Digit[] = specs.map((spec) => {
    const across = new THREE.Vector3().crossVectors(spec.direction, spec.top);
    const bind = new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(across, spec.direction, spec.top),
    );
    const first = new THREE.Bone();
    first.position.copy(spec.base);
    first.quaternion.copy(bind);
    const second = new THREE.Bone();
    second.position.y = spec.lengths[0];
    const third = new THREE.Bone();
    third.position.y = spec.lengths[1];
    hand.add(first);
    first.add(second);
    second.add(third);
    const at = bones.length;
    bones.push(first, second, third);

    const [l0, l1, l2] = spec.lengths;
    const total = l0 + l1 + l2;
    const joint1 = l0;
    const joint2 = l0 + l1;
    const r = spec.radius;
    const bump = (d: number): number => Math.exp(-((d / 0.022) ** 2));
    const radius = (along: number): number => {
      const taper = spec.thumb
        ? 1.3 - 0.45 * smooth(along, 0.02, joint1) - 0.1 * (along / total)
        : 1 - 0.22 * (along / total);
      return (
        r *
        taper *
        (1 +
          0.1 * bump(along) +
          0.07 * bump(along - joint1) +
          0.05 * bump(along - joint2))
      );
    };
    const tipRadius = radius(total) * 0.98;
    const cap = tipRadius * 0.95;
    const rings: Ring[] = [];
    const startAt = spec.thumb ? -0.02 : -0.045;
    const steps = spec.thumb ? 20 : 18;
    for (let i = 0; i <= steps; i++) {
      const along = startAt + ((total - cap - startAt) * i) / steps;
      const rr = radius(along);
      const nail = smooth(along, joint2 + 0.2 * l2, joint2 + 0.45 * l2);
      // Pads under the last phalanx; the nail flattens the top.
      rings.push([
        along,
        rr,
        rr * (0.84 - 0.1 * nail),
        rr * (0.92 + 0.05 * nail),
        0,
        -0.004 * nail,
      ]);
    }
    for (let i = 1; i <= 6; i++) {
      const a = (i / 6) * (Math.PI / 2) * 0.97;
      const f = Math.cos(a);
      rings.push([
        total - cap + cap * Math.sin(a),
        tipRadius * f,
        tipRadius * f * 0.72,
        tipRadius * f * 1.03,
        0,
        -0.006 * f,
      ]);
    }
    const frame = new THREE.Matrix4().compose(
      new THREE.Vector3(spec.base.x, spec.base.y + WRIST, spec.base.z),
      bind,
      new THREE.Vector3(1, 1, 1),
    );
    builder.sweep(
      1,
      rings,
      spec.thumb ? 14 : 12,
      frame,
      () => 0.85,
      (along) => {
        if (along < joint1 * 0.5)
          return spec.thumb
            ? [3, at, smooth(along, 0.02, 0.12)]
            : [3, at, smooth(along, -0.03, 0.03)];
        if (along < (joint1 + joint2) / 2)
          return [at, at + 1, smooth(along, joint1 - 0.022, joint1 + 0.022)];
        return [at + 1, at + 2, smooth(along, joint2 - 0.018, joint2 + 0.018)];
      },
      (along, angle, color) => {
        const top = Math.cos(angle);
        color.lerp(PALM_TONE, 0.3 * Math.max(0, -top));
        const knuckle = Math.max(bump(along), bump(along - joint1));
        color.lerp(KNUCKLE_TONE, 0.3 * knuckle * Math.max(0, top));
        const nail =
          smooth(along, joint2 + 0.3 * l2, joint2 + 0.4 * l2) *
          (1 - smooth(along, total - 0.012, total - 0.004)) *
          smooth(top, 0.4, 0.6);
        color.lerp(NAIL_TONE, 0.65 * nail);
      },
    );
    return {
      bones: [first, second, third],
      bind,
      base: spec.base.clone(),
      lengths: spec.lengths,
      couple: spec.couple,
      spread: 0,
      flex: 0,
      curl: 0,
      limits: spec.limits,
    };
  });

  const mesh = new THREE.SkinnedMesh(builder.build(), [shirt, skin]);
  mesh.add(upper);
  mesh.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(bones));
  // The bounds of the bind pose say nothing about where the arm is now.
  mesh.frustumCulled = false;
  mesh.castShadow = true;

  const upperRotation = new THREE.Quaternion();
  const foreRotation = new THREE.Quaternion();
  const relative = new THREE.Quaternion();
  const half = new THREE.Quaternion();
  const basis = new THREE.Matrix4();
  const hinge = new THREE.Vector3(1, 0, 0);
  const upperDir = new THREE.Vector3();
  const foreDir = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const back = new THREE.Vector3();
  const frameFor = (along: THREE.Vector3, out: THREE.Quaternion): void => {
    back.crossVectors(hinge, along);
    out.setFromRotationMatrix(basis.makeBasis(hinge, along, back));
  };

  return {
    mesh,
    digits,
    pose(shoulder, elbowAt, wrist, handRotation) {
      upperDir.copy(elbowAt).sub(shoulder).normalize();
      foreDir.copy(wrist).sub(elbowAt).normalize();
      // The elbow is a hinge; keep the last axis while the arm is straight.
      normal.crossVectors(upperDir, foreDir);
      if (normal.lengthSq() > 1e-4) {
        normal.normalize();
        if (normal.dot(hinge) < 0) normal.negate();
        hinge.copy(normal);
      }
      hinge.addScaledVector(upperDir, -hinge.dot(upperDir)).normalize();
      frameFor(upperDir, upperRotation);
      hinge.addScaledVector(foreDir, -hinge.dot(foreDir)).normalize();
      frameFor(foreDir, foreRotation);
      upper.position.copy(shoulder);
      upper.quaternion.copy(upperRotation);
      elbow.quaternion.copy(upperRotation).invert().multiply(foreRotation);
      // Half the forearm's roll happens along it, half at the wrist.
      relative.copy(foreRotation).invert().multiply(handRotation);
      half.set(0, relative.y, 0, relative.w);
      if (half.lengthSq() < 1e-8) half.identity();
      else half.normalize();
      half.slerp(IDENTITY, 0.5);
      twist.quaternion.copy(half);
      hand.quaternion.copy(half).invert().multiply(relative);
      for (const digit of digits) applyDigit(digit);
    },
  };
}
