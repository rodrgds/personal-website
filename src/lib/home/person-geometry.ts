// Cross sections run from bottom to top. Each ring has its own centre in Z
// so a profile can describe both the front and the back of the body.
import * as THREE from "three";

type Ring = readonly [
  height: number,
  width: number,
  depth: number,
  centreZ: number,
];

export function profile(
  rings: readonly Ring[],
  sides = 40,
): THREE.BufferGeometry {
  const points: number[] = [];
  const faces: number[] = [];
  for (const [row, [height, width, depth, centreZ]] of rings.entries()) {
    for (let column = 0; column < sides; column++) {
      const a = (2 * Math.PI * column) / sides;
      points.push(Math.sin(a) * width, height, centreZ + depth * Math.cos(a));
      if (row === rings.length - 1) continue;
      const vertex = row * sides + column;
      const next = row * sides + ((column + 1) % sides);
      faces.push(
        vertex,
        next,
        vertex + sides,
        next,
        next + sides,
        vertex + sides,
      );
    }
  }
  for (let i = 1; i < sides - 1; i++) {
    const top = (rings.length - 1) * sides;
    faces.push(0, i + 1, i, top, top + i, top + i + 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(points, 3),
  );
  geometry.setIndex(faces);
  geometry.computeVertexNormals();
  return geometry;
}

// The cropped sides, nape and longer swept crown form one surface. Small
// ridges follow the sweep and flatten towards the natural hairline.
export function sweptHair(): THREE.BufferGeometry {
  const sides = 144;
  const rows = 52;
  const points: number[] = [];
  const faces: number[] = [];
  const colors: number[] = [];
  const dark = new THREE.Color(0x251d19);
  const light = new THREE.Color(0x594535);
  const skin = new THREE.Color(0xd39e81);
  const color = new THREE.Color();
  for (let row = 0; row <= rows; row++) {
    const t = row / rows;
    for (let col = 0; col < sides; col++) {
      const a = (col / sides) * Math.PI * 2;
      const back = Math.cos(a);
      const side = Math.sin(a);
      const sideburn = Math.exp(-(((back + 0.36) / 0.13) ** 2)) * 0.18;
      const edge = 1.56 + 0.6 * back + sideburn + 0.018 * Math.sin(a * 15);
      const b = (1 - t) * edge + t * 0.001;
      const longer = THREE.MathUtils.smoothstep(t, 0.02, 0.66);
      const sweep = a + 0.55 * Math.sin(b * 2 + a) - 0.65 * b;
      const wave = Math.cos(31 * sweep + 2 * Math.sin(4 * a + b * 5));
      const strand = 0.5 + 0.5 * wave;
      const fuzz = Math.sin(col * 7.31 + row * 3.73);
      const bulk = longer * (0.026 + strand * 0.007) + fuzz * 0.0015;
      const s = Math.sin(b);
      points.push(
        (0.399 + bulk) * side * s + 0.048 * longer,
        0.075 + (0.488 + bulk) * Math.cos(b) + longer * 0.035 * (1 - back * s),
        0.022 + (0.447 + bulk) * back * s,
      );
      color.copy(dark).lerp(light, 0.19 + 0.22 * strand * longer + 0.08 * fuzz);
      const fade =
        (1 - THREE.MathUtils.smoothstep(t, 0, 0.24)) * (0.47 + 0.37 * back);
      color.lerp(skin, fade);
      colors.push(color.r, color.g, color.b);
      if (row === rows) continue;
      const v = row * sides + col;
      const next = row * sides + ((col + 1) % sides);
      faces.push(v, next, v + sides, next, next + sides, v + sides);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(points, 3),
  );
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(faces);
  geometry.computeVertexNormals();
  return geometry;
}

// Overlapping curved locks catch the light separately above the short sides.
// Each has a lifted middle and a fine tip that curls back towards the scalp.
export function crownLocks(material: THREE.Material): THREE.InstancedMesh {
  const count = 480;
  const lock = profile(
    [
      [-0.095, 0.003, 0.002, -0.019],
      [-0.062, 0.021, 0.012, 0.004],
      [-0.012, 0.028, 0.016, 0.019],
      [0.039, 0.023, 0.012, 0.022],
      [0.073, 0.014, 0.008, 0.012],
      [0.104, 0.001, 0.001, -0.003],
    ],
    7,
  );
  const vertices = lock.getAttribute("position");
  const shades = [];
  for (let i = 0; i < vertices.count; i++) {
    const shade =
      0.7 + 0.3 * THREE.MathUtils.smoothstep(vertices.getY(i), -0.085, 0.09);
    const t = (vertices.getY(i) + 0.095) / 0.199;
    vertices.setX(i, vertices.getX(i) + 0.018 * Math.sin(t * 5.7));
    shades.push(shade, shade, shade);
  }
  lock.computeVertexNormals();
  lock.setAttribute("color", new THREE.Float32BufferAttribute(shades, 3));
  const locks = new THREE.InstancedMesh(lock, material, count);
  const pose = new THREE.Object3D();
  const normal = new THREE.Vector3();
  const along = new THREE.Vector3();
  const across = new THREE.Vector3();
  const basis = new THREE.Matrix4();
  const dark = new THREE.Color(0x352722);
  const light = new THREE.Color(0x795c47);
  const color = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const a = i * 2.399963;
    const y = 0.15 + ((i + 0.5) / count) * 0.84 + 0.015 * Math.sin(a * 5);
    const r = Math.sqrt(1 - y * y);
    normal.set(r * Math.sin(a), y, r * Math.cos(a));
    const jitter = Math.sin(i * 17.13);
    const length = 0.57 + 0.72 * y + 0.22 * jitter;
    pose.position.set(
      normal.x * 0.415 + y * 0.04,
      normal.y * 0.537 + 0.086 + y * 0.041 * (1 - normal.z) + 0.013 * jitter,
      normal.z * 0.461 + 0.022,
    );
    // Front hair sweeps up and back. At the crown it turns with the part.
    along.set(0.34 + 0.52 * Math.sin(a * 2 + y * 5) + jitter * 0.18, 0.68, 0.9);
    along.addScaledVector(normal, -along.dot(normal)).normalize();
    across.crossVectors(along, normal).normalize();
    pose.quaternion.setFromRotationMatrix(
      basis.makeBasis(across, along, normal),
    );
    pose.scale.set(length, length * (0.78 + y * 0.55), length);
    pose.updateMatrix();
    locks.setMatrixAt(i, pose.matrix);
    locks.setColorAt(
      i,
      color.copy(dark).lerp(light, 0.31 + 0.24 * Math.sin(i * 1.57)),
    );
  }
  locks.castShadow = true;
  return locks;
}
