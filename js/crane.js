// Grúa: gancho con el piso colgado que se mece de lado a lado y sube con el edificio.
// Unidades: anchos de piso.
import * as THREE from "three";
import { CONFIG } from "./config.js";

const H = CONFIG.FLOOR_HEIGHT;
const HOOK_Y = H + CONFIG.SLING_HEIGHT;   // gancho, sobre la base del piso colgado
const HOOK_TOP = 0.82;                   // alto de hook.glb (incluye su cable corto)
const CABLE_LENGTH = 8;
const SLING_CORNER = 0.38;
const LINE_COLOR = 0x3a3f47;

export class Crane {
  constructor(stage, hookModel) {
    this.group = new THREE.Group();
    this.group.visible = false;
    stage.add(this.group);

    const hook = hookModel.clone(true);
    hook.position.y = HOOK_Y;
    this.group.add(hook);

    const cable = new THREE.Mesh(
      new THREE.CylinderGeometry(0.014, 0.014, CABLE_LENGTH, 6),
      new THREE.MeshStandardMaterial({ color: LINE_COLOR, roughness: 0.6 }),
    );
    cable.position.y = HOOK_Y + HOOK_TOP + CABLE_LENGTH / 2;
    this.group.add(cable);

    // Eslingas del gancho a las esquinas del techo del piso colgado.
    const points = [];
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      points.push(new THREE.Vector3(0, HOOK_Y + 0.03, 0), new THREE.Vector3(sx * SLING_CORNER, H, sz * SLING_CORNER));
    }
    this.slings = new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints(points),
      new THREE.LineBasicMaterial({ color: LINE_COLOR }),
    );
    this.slings.visible = false;
    this.group.add(this.slings);

    this.load = null;
    this.phase = 0;
    this.speed = 0;
    this.amplitude = 0;
    this.targetAmplitude = 0;
    this.targetY = 0;
  }

  get loaded() {
    return this.load !== null;
  }

  reset(topY) {
    if (this.load) this.load.removeFromParent();
    this.load = null;
    this.slings.visible = false;
    this.phase = 0;
    this.targetY = topY + CONFIG.HANG_HEIGHT * H;
    this.group.position.set(0, this.targetY, 0);
    this.group.visible = true;
  }

  hide() {
    this.group.visible = false;
  }

  setLevel(level) {
    this.speed = level.craneSpeed;
    this.targetAmplitude = level.amplitude;
  }

  // Sube la grúa para colgar el siguiente piso a HANG_HEIGHT sobre el techo.
  setTop(topY) {
    this.targetY = topY + CONFIG.HANG_HEIGHT * H;
  }

  attach(floor) {
    floor.position.set(0, 0, 0);
    floor.rotation.set(0, 0, 0);
    this.group.add(floor);
    this.load = floor;
    this.slings.visible = true;
  }

  // Suelta el piso y devuelve su posición en el escenario.
  release() {
    const obj = this.load;
    const { x, y } = this.group.position;
    obj.removeFromParent();
    this.load = null;
    this.slings.visible = false;
    return { obj, x, y };
  }

  update(dt) {
    // Fase acumulada: cambiar de velocidad al subir de nivel no hace saltar al gancho.
    this.phase += this.speed * dt;
    this.amplitude += (this.targetAmplitude - this.amplitude) * Math.min(1, dt * 2);
    const p = this.group.position;
    p.x = this.amplitude * Math.sin(this.phase);
    p.y += (this.targetY - p.y) * Math.min(1, dt * 3);
  }
}
