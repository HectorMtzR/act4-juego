// Arranque, sesión WebXR, flujo de la partida y render loop.
import * as THREE from "three";
import { CONFIG } from "./config.js";
import { ARSession, checkARSupport } from "./xr.js";
import { Building, loadModels } from "./building.js";
import { Crane } from "./crane.js";
import { Game } from "./game.js";
import * as ui from "./ui.js";

// ?sim: juega en la computadora sin AR (clic o espacio para soltar), para probar la mecánica.
const SIM = new URLSearchParams(location.search).has("sim");

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

// Raíz anclada a la superficie.
const site = new THREE.Group();
site.visible = false;
scene.add(site);
// El juego se calcula en anchos de piso; `stage` lo escala a metros y lo orienta hacia el jugador.
const stage = new THREE.Group();
stage.scale.setScalar(CONFIG.PIECE_WIDTH_M);
site.add(stage);

const ar = new ARSession(renderer, scene, ui.overlayRoot);
const game = new Game();
let building = null;
let crane = null;

let state = "idle"; // idle | scanning | placing | playing | over
let anchorMode = "-";
let dropping = false;
let round = 0;      // cambia en cada partida para descartar callbacks de la anterior
let timers = [];

function after(seconds, fn) {
  timers.push({ t: seconds, fn });
}

function runTimers(dt) {
  for (const timer of [...timers]) {
    timer.t -= dt;
    if (timer.t <= 0) {
      timers.splice(timers.indexOf(timer), 1);
      timer.fn();
    }
  }
}

// ------------------------------------------------------------- partida ---
function startGame() {
  round += 1;
  timers = [];
  dropping = false;
  game.reset();
  building.reset(building.createPiece("ground", game.groundColor()));
  crane.reset(building.topY);
  crane.setLevel(game.level);
  hangNextFloor();
  state = "playing";
  ui.hideEnd();
  ui.updateHud(game);
  ui.setMessage("Toca para soltar el piso", { duration: 3000 });
}

function hangNextFloor() {
  const { type, color, lit } = game.nextFloor();
  crane.attach(building.createPiece(type, color, lit));
}

async function dropFloor() {
  if (state !== "playing" || dropping || !crane.loaded) return;
  dropping = true;
  const myRound = round;
  ui.hideMessage();

  const { obj, x, y } = crane.release();
  const offset = await building.drop(obj, x, y);
  if (myRound !== round) return;

  const result = game.evaluate(offset);
  if (result === "fall") {
    building.knockOff(obj, offset);
    ui.toast("¡Se cayó!", "bad");
  } else {
    building.stack(obj, offset, result === "perfect");
    if (result === "perfect") ui.toast("¡Perfecto!", "good");
  }

  const { levelUp } = game.apply(result);
  ui.updateHud(game);

  if (game.over) {
    state = "over";
    after(1.2, () => ui.showEnd(game));
    return;
  }
  if (levelUp) {
    crane.setLevel(game.level);
    after(0.6, () => ui.toast(`¡Nivel ${game.levelIndex + 1}: ${game.level.name}!`, "level"));
  }
  crane.setTop(building.topY);
  after(CONFIG.NEXT_FLOOR_DELAY, () => {
    hangNextFloor();
    dropping = false;
  });
}

function stopGame() {
  state = "idle";
  round += 1;
  timers = [];
  anchorMode = "-";
  site.visible = false;
  building?.clear();
  crane?.hide();
}

// ------------------------------------------------------------------- AR ---
// Gira el escenario para que el frente del edificio (+Z) mire al jugador:
// así la grúa se mece de izquierda a derecha en la pantalla.
function faceViewer() {
  const viewer = renderer.xr.isPresenting ? renderer.xr.getCamera() : camera;
  const viewerPos = new THREE.Vector3().setFromMatrixPosition(viewer.matrixWorld);
  site.updateMatrixWorld(true);
  const local = site.worldToLocal(viewerPos);
  stage.rotation.y = Math.atan2(local.x, local.z);
}

async function placeBuilding() {
  if (!ar.surfaceFound) return;
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
  ui.stopScanning();
  faceViewer();
  startGame();
}

ar.onSelect = () => {
  if (state === "scanning") placeBuilding();
  else if (state === "playing") dropFloor();
};

ar.onEnd = () => {
  stopGame();
  ui.showStart();
};

// ----------------------------------------------------------- simulación ---
let simTable = null;

function startSim() {
  if (!simTable) {
    simTable = new THREE.Mesh(
      new THREE.CircleGeometry(0.6, 48).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0xb9c1ca, roughness: 0.9 }),
    );
    scene.add(simTable);
  }
  scene.background = new THREE.Color(0xdfe4ea);
  site.matrixAutoUpdate = true;
  site.position.set(0, 0, 0);
  site.visible = true;
  anchorMode = "sim";
  ui.showAR();
  startGame();
}

function followSimCamera() {
  const top = (building ? building.topY : 0) * CONFIG.PIECE_WIDTH_M;
  const lookY = Math.max(0.12, top - 0.02);
  camera.position.set(0, lookY + 0.2, 0.7);
  camera.lookAt(0, lookY, 0);
}

if (SIM) {
  renderer.domElement.addEventListener("pointerdown", () => ar.onSelect());
  window.addEventListener("keydown", (e) => {
    if (e.code === "Space") ar.onSelect();
  });
}

// --------------------------------------------------------------- botones ---
ui.onStart(async () => {
  if (SIM) return startSim();
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

ui.onExit(() => {
  if (!SIM) return ar.end();
  stopGame();
  scene.background = null;
  ui.showStart();
});

ui.onAgain(() => {
  if (state === "over") startGame();
});

// ----------------------------------------------------------------- loop ---
const clock = new THREE.Clock();

renderer.setAnimationLoop((time, frame) => {
  const dt = Math.min(clock.getDelta(), 0.05);
  if (frame) {
    ar.update(frame);
    if (state === "scanning") ui.setScanning(ar.surfaceFound);
  }
  if (state === "playing" || state === "over") {
    building.update(dt);
    crane.update(dt);
    runTimers(dt);
  }
  if (SIM) followSimCamera();
  ui.setStatus(
    `Superficie: ${ar.surfaceFound ? "sí" : "no"} · Anclaje: ${anchorMode} · ` +
    `Overlay: ${ar.overlayType} · Balanceo: ${building ? building.sway.toFixed(2) : "-"}`,
  );
  renderer.render(scene, camera);
});

window.addEventListener("resize", () => {
  if (renderer.xr.isPresenting) return;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

Promise.all([SIM ? "sim" : checkARSupport(), loadModels()])
  .then(([support, models]) => {
    building = new Building(stage, models);
    crane = new Crane(stage, models.hook);
    if (SIM) ui.setStartReady("Iniciar simulación");
    else if (support === "ok") ui.setStartReady();
    else ui.showUnsupported(support);
  })
  .catch((err) => {
    console.error(err);
    ui.showStartError("No se pudieron cargar los modelos del edificio.");
  });
