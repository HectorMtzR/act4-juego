// Arranque, sesión WebXR y render loop.
import * as THREE from "three";
import { CONFIG } from "./config.js";
import { ARSession, checkARSupport } from "./xr.js";
import * as ui from "./ui.js";

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 50);

scene.add(new THREE.HemisphereLight(0xffffff, 0x80868f, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 1.8);
sun.position.set(0.6, 1.5, 0.4);
scene.add(sun);

// Raíz anclada a la superficie: aquí vivirá el edificio. En la fase 1 sólo tiene un cubo.
const site = new THREE.Group();
site.visible = false;
site.add(createTestCube());
scene.add(site);

const ar = new ARSession(renderer, scene, ui.overlayRoot);

let state = "idle"; // idle | scanning | placing | placed
let anchorMode = "-";

function createTestCube() {
  const s = CONFIG.PIECE_WIDTH_M;
  const geo = new THREE.BoxGeometry(s, s, s).translate(0, s / 2, 0); // origen abajo al centro
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ color: CONFIG.LEVELS[0].walls[1], roughness: 0.8 }),
  );
  mesh.add(new THREE.LineSegments(
    new THREE.EdgesGeometry(geo),
    new THREE.LineBasicMaterial({ color: 0x3a3f47 }),
  ));
  return mesh;
}

ar.onSelect = async () => {
  if (state !== "scanning" || !ar.surfaceFound) return;
  state = "placing";
  ar.showReticle = false;
  const mode = await ar.placeAtReticle(site);
  if (state !== "placing") return; // la sesión terminó mientras se colocaba
  if (!mode) {
    ar.showReticle = true;
    state = "scanning";
    return;
  }
  anchorMode = mode === "anchor" ? "XRAnchor" : "pose fija";
  state = "placed";
  ui.stopScanning();
  ui.setMessage("Camina alrededor: el cubo debe quedarse quieto.", { duration: 4000 });
};

ar.onEnd = () => {
  state = "idle";
  anchorMode = "-";
  site.visible = false;
  ui.showStart();
};

ui.onStart(async () => {
  try {
    await ar.start();
  } catch (err) {
    console.error(err);
    ui.showStartError(`No se pudo iniciar AR: ${err.message || err}`);
    return;
  }
  state = "scanning";
  ar.showReticle = true;
  ui.showAR();
});

ui.onExit(() => ar.end());

renderer.setAnimationLoop((time, frame) => {
  if (frame) {
    ar.update(frame);
    if (state === "scanning") ui.setScanning(ar.surfaceFound);
    ui.setStatus(
      `Superficie: ${ar.surfaceFound ? "sí" : "no"} · Anclaje: ${anchorMode} · Overlay: ${ar.overlayType}`,
    );
  }
  renderer.render(scene, camera);
});

window.addEventListener("resize", () => {
  if (renderer.xr.isPresenting) return;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

checkARSupport().then((support) => {
  if (support === "ok") ui.setStartReady();
  else ui.showUnsupported(support);
});
