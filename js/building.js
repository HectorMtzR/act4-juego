// Pisos, apilado, balanceo del edificio y caída de pisos.
// Unidades: anchos de piso (los modelos miden 1 de ancho y FLOOR_HEIGHT de alto).
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { CONFIG } from "./config.js";

const MODEL_NAMES = ["ground", "floor_a", "floor_b", "floor_c", "roof", "hook"];
const H = CONFIG.FLOOR_HEIGHT;
const SHRINK_TIME = 0.35;   // s que tarda en desaparecer un piso caído al tocar la superficie

export async function loadModels() {
  const loader = new GLTFLoader();
  const entries = await Promise.all(MODEL_NAMES.map(async (name) => {
    const gltf = await loader.loadAsync(`assets/models/${name}.glb`);
    return [name, gltf.scene];
  }));
  return Object.fromEntries(entries);
}

function findMaterial(object, name) {
  let found = null;
  object.traverse((o) => {
    if (!found && o.isMesh && o.material.name === name) found = o.material;
  });
  return found;
}

function disposePiece(obj) {
  obj.removeFromParent();
  for (const m of obj.userData.ownMaterials ?? []) m.dispose();
}

export class Building {
  constructor(stage, models) {
    this.stage = stage;
    this.models = models;
    // El edificio gira sobre su base para mecerse: el desplazamiento crece con la altura.
    this.root = new THREE.Group();
    stage.add(this.root);

    this.floors = [];      // { obj, x }: x es el desfase acumulado respecto a la planta baja
    this.falling = null;   // piso soltado que va cayendo hacia el edificio
    this.debris = [];      // pisos que se cayeron del edificio
    this.sway = 0;
    this.swayShown = 0;
    this.swayPhase = 0;

    this.litWindow = findMaterial(models.floor_a, "ventana").clone();
    this.litWindow.emissive.set(CONFIG.LIT_WINDOW.color);
    this.litWindow.emissiveIntensity = CONFIG.LIT_WINDOW.intensity;

    this._top = new THREE.Vector3();
  }

  // Copia de un modelo con su propio color de pared.
  createPiece(name, wallColor, lit = false) {
    const obj = this.models[name].clone(true);
    const own = [];
    obj.traverse((o) => {
      if (!o.isMesh) return;
      if (o.material.name === "pared") {
        o.material = o.material.clone();
        o.material.color.set(wallColor);
        own.push(o.material);
      } else if (o.material.name === "ventana" && lit) {
        o.material = this.litWindow;
      }
    });
    obj.userData.ownMaterials = own;
    return obj;
  }

  clear() {
    for (const f of this.floors) disposePiece(f.obj);
    for (const d of this.debris) disposePiece(d.obj);
    if (this.falling) disposePiece(this.falling.obj);
    this.floors = [];
    this.debris = [];
    this.falling = null;
    this.sway = this.swayShown = this.swayPhase = 0;
    this.root.rotation.set(0, 0, 0);
  }

  reset(ground) {
    this.clear();
    this.root.add(ground);
    this.floors.push({ obj: ground, x: 0 });
  }

  // Pisos construidos, sin contar la planta baja.
  get floorCount() {
    return Math.max(0, this.floors.length - 1);
  }

  // Altura del techo del último piso, sin balanceo.
  get topY() {
    return this.floors.length * H;
  }

  // Centro del techo del último piso en coordenadas del escenario, con el balanceo actual.
  topPoint() {
    const top = this.floors[this.floors.length - 1];
    this.root.updateMatrix();
    return this._top.set(top.x, this.topY, 0).applyMatrix4(this.root.matrix);
  }

  // Deja caer `obj` en línea recta desde (x, y). Resuelve con el desfase al tocar el techo.
  drop(obj, x, y) {
    this.stage.add(obj);
    obj.position.set(x, y, 0);
    obj.rotation.set(0, 0, 0);
    return new Promise((resolve) => {
      this.falling = { obj, vy: 0, resolve };
    });
  }

  // El piso se queda: centrado si fue perfecto, o con su desfase.
  stack(obj, offset, perfect) {
    const below = this.floors[this.floors.length - 1];
    const x = below.x + (perfect ? 0 : offset);
    this.root.add(obj);
    obj.position.set(x, this.topY, 0);
    obj.rotation.set(0, 0, 0);
    this.floors.push({ obj, x });

    const s = CONFIG.SWAY;
    this.sway = perfect
      ? this.sway * (1 - s.perfectReduce)
      : Math.min(s.max, this.sway + s.perOffset * Math.abs(offset));
  }

  // El piso se cae: se inclina hacia el lado del desfase y cae a la superficie.
  knockOff(obj, offset) {
    const dir = Math.sign(offset) || 1;
    this.debris.push({ obj, vx: dir * 0.8, vy: 0.3, spin: -dir * 3, life: null });
  }

  update(dt) {
    const s = CONFIG.SWAY;
    this.swayShown += (this.sway - this.swayShown) * Math.min(1, dt * 2);
    this.swayPhase += s.speed * dt;
    const xTop = this.swayShown * Math.sin(this.swayPhase) * Math.min(1, this.floorCount / s.fullAt);
    this.root.rotation.z = -Math.atan2(xTop, this.topY);

    if (this.falling) {
      const f = this.falling;
      f.vy += CONFIG.DROP_GRAVITY * dt;
      f.obj.position.y -= f.vy * dt;
      const top = this.topPoint();
      if (f.obj.position.y <= top.y) {
        f.obj.position.y = top.y;
        this.falling = null;
        f.resolve(f.obj.position.x - top.x);
      }
    }

    for (const d of [...this.debris]) {
      const p = d.obj.position;
      if (d.life === null) {
        d.vy -= CONFIG.DROP_GRAVITY * dt;
        p.x += d.vx * dt;
        p.y += d.vy * dt;
        d.obj.rotation.z += d.spin * dt;
        if (p.y <= 0) {
          p.y = 0;
          d.life = SHRINK_TIME;
        }
      } else {
        d.life -= dt;
        d.obj.scale.setScalar(Math.max(0.001, d.life / SHRINK_TIME));
        if (d.life <= 0) {
          disposePiece(d.obj);
          this.debris.splice(this.debris.indexOf(d), 1);
        }
      }
    }
  }
}
