// The other level of `inception`: a modern aluminium laptop on a dark table,
// lit like a product shot (after pmndrs' "mixing HTML and WebGL" example; our
// own model, no brand). The desk fills its 16:10 screen: the desk shot is
// rendered at 16:10 with the same camera, so its centre 4:3 crop is exactly
// the photo, and the zoom loop still lines up.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { buildDesk, buildFloor, disposeScene } from "./boot-room";

export interface LaptopScene {
  scene: THREE.Scene;
  /** The 16:10 picture filling the screen; the caller sets its map. */
  picture: THREE.Mesh;
  pictureMaterial: THREE.MeshBasicMaterial;
  /** Height of the picture, for framing the close-up. */
  pictureHeight: number;
  dispose(): void;
}

const LID_TILT = -0.32;

export function buildLaptop(renderer: THREE.WebGLRenderer): LaptopScene {
  const scene = new THREE.Scene();
  // Fog far enough out that the floor shows before it fades.
  scene.fog = new THREE.Fog(0x0e0d0c, 10, 34);

  // Soft reflections for the aluminium.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = environment;
  scene.environmentIntensity = 0.55;
  pmrem.dispose();

  const aluminium = new THREE.MeshStandardMaterial({
    color: 0xc4c7cc,
    metalness: 0.85,
    roughness: 0.32,
  });
  const darkMetal = new THREE.MeshStandardMaterial({
    color: 0x3a3c40,
    metalness: 0.7,
    roughness: 0.4,
  });
  const keyMaterial = new THREE.MeshStandardMaterial({
    color: 0x1b1c1f,
    roughness: 0.7,
  });
  // The thin border around the display: true black, unlit, so the key light
  // never turns it into a grey band.
  const glassBlack = new THREE.MeshBasicMaterial({ color: 0x050505 });

  // A dark table, with a key light from the left and a warm fill.
  // A wooden desk like the one in the boot (units here are about 10cm, so
  // 1.3m by 65cm and 73cm high), on a floor that runs off into the dark.
  const desk = buildDesk({
    width: 13,
    depth: 6.5,
    height: 7.3,
    top: 0.35,
    leg: 0.55,
    grain: [0.72, 0.67],
  });
  desk.position.set(0.6, 0, -0.4);
  scene.add(desk, buildFloor(-7.3, 15));
  scene.add(new THREE.HemisphereLight(0xffe9d2, 0x120d0a, 0.6));
  const key = new THREE.DirectionalLight(0xfff1e0, 2.2);
  key.position.set(-4, 7, 4);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -10;
  key.shadow.camera.right = 10;
  key.shadow.camera.top = 10;
  key.shadow.camera.bottom = -10;
  key.shadow.camera.far = 40;
  key.shadow.bias = -0.0006;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xffb070, 1.1);
  rim.position.set(5, 3, -5);
  scene.add(rim);

  const laptop = new THREE.Group();
  scene.add(laptop);

  // Base, keyboard, trackpad.
  const width = 3.2;
  const depth = 2.2;
  const base = new THREE.Mesh(
    new RoundedBoxGeometry(width, 0.11, depth, 4, 0.05),
    aluminium,
  );
  base.position.y = 0.055;
  base.castShadow = true;
  base.receiveShadow = true;
  laptop.add(base);
  const well = new THREE.Mesh(
    new RoundedBoxGeometry(2.86, 0.02, 1.04, 2, 0.01),
    darkMetal,
  );
  well.position.set(0, 0.105, -0.42);
  laptop.add(well);
  const keys = new THREE.InstancedMesh(
    new RoundedBoxGeometry(0.17, 0.025, 0.17, 2, 0.02),
    keyMaterial,
    6 * 14,
  );
  const matrix = new THREE.Matrix4();
  let index = 0;
  for (let row = 0; row < 6; row++) {
    for (let col = 0; col < 14; col++) {
      matrix.makeTranslation(-1.3 + col * 0.2, 0.12, -0.88 + row * 0.18);
      keys.setMatrixAt(index++, matrix);
    }
  }
  keys.receiveShadow = true;
  laptop.add(keys);
  const trackpad = new THREE.Mesh(
    new RoundedBoxGeometry(1.25, 0.006, 0.78, 2, 0.003),
    new THREE.MeshStandardMaterial({
      color: 0xb5b8bd,
      metalness: 0.8,
      roughness: 0.25,
    }),
  );
  trackpad.position.set(0, 0.11, 0.55);
  laptop.add(trackpad);

  // The lid, hinged at the back and tilted open.
  // The hinge sits behind the lid, so no bar crosses the bottom bezel.
  const hinge = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.035, width * 0.8, 20),
    darkMetal,
  );
  hinge.rotation.z = Math.PI / 2;
  hinge.position.set(0, 0.1, -depth / 2 - 0.02);
  laptop.add(hinge);
  const lid = new THREE.Group();
  lid.position.set(0, 0.11, -depth / 2 + 0.02);
  lid.rotation.x = LID_TILT;
  laptop.add(lid);
  // The display fills the lid up to a thin border: a 16:10 picture as wide as
  // the lid allows, and the lid sized to fit it.
  const border = 0.05;
  const pictureWidth = width - 2 * border;
  const pictureHeight = pictureWidth / 1.6;
  const lidHeight = pictureHeight + 2 * border;
  const shell = new THREE.Mesh(
    new RoundedBoxGeometry(width, lidHeight, 0.06, 4, 0.03),
    aluminium,
  );
  shell.position.set(0, lidHeight / 2, -0.03);
  shell.castShadow = true;
  lid.add(shell);
  const panel = new THREE.Mesh(
    new RoundedBoxGeometry(width - 0.06, lidHeight - 0.06, 0.004, 2, 0.02),
    glassBlack,
  );
  panel.position.set(0, lidHeight / 2, 0.002);
  lid.add(panel);
  const pictureMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const picture = new THREE.Mesh(
    new THREE.PlaneGeometry(pictureWidth, pictureHeight),
    pictureMaterial,
  );
  picture.position.set(0, lidHeight / 2, 0.006);
  lid.add(picture);
  const glow = new THREE.PointLight(0xfff0dc, 0.6, 5, 1.8);
  glow.position.set(0, 1.0, 1.4);
  laptop.add(glow);

  // A mug and a notebook, for scale.
  const mug = new THREE.Mesh(
    new THREE.CylinderGeometry(0.24, 0.22, 0.5, 32),
    new THREE.MeshStandardMaterial({ color: 0xbc5215, roughness: 0.45 }),
  );
  mug.position.set(2.6, 0.25, 0.4);
  mug.castShadow = true;
  scene.add(mug);
  const notebook = new THREE.Mesh(
    new RoundedBoxGeometry(1.4, 0.08, 1.9, 2, 0.02),
    new THREE.MeshStandardMaterial({ color: 0x2b2a27, roughness: 0.8 }),
  );
  notebook.position.set(-2.8, 0.04, 0.5);
  notebook.rotation.y = 0.25;
  notebook.castShadow = true;
  notebook.receiveShadow = true;
  scene.add(notebook);

  scene.updateMatrixWorld(true);
  return {
    scene,
    picture,
    pictureMaterial,
    pictureHeight,
    dispose() {
      environment.dispose();
      disposeScene(scene);
    },
  };
}
