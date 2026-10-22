// Sesión WebXR immersive-ar: hit-test, retícula y anclaje.
import * as THREE from "three";
import { CONFIG } from "./config.js";

export async function checkARSupport() {
  if (!window.isSecureContext) return "insecure";
  if (!navigator.xr) return "unsupported";
  // En algunos navegadores de escritorio isSessionSupported nunca resuelve.
  const timeout = new Promise((resolve) => setTimeout(resolve, 4000, false));
  try {
    const ok = await Promise.race([navigator.xr.isSessionSupported("immersive-ar"), timeout]);
    return ok ? "ok" : "unsupported";
  } catch {
    return "unsupported";
  }
}

function createReticle() {
  const w = CONFIG.PIECE_WIDTH_M;
  const geo = new THREE.RingGeometry(w * CONFIG.RETICLE.inner, w * CONFIG.RETICLE.outer, 40)
    .rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({
    color: CONFIG.RETICLE.color, transparent: true, opacity: 0.9, depthWrite: false,
  });
  const reticle = new THREE.Mesh(geo, mat);
  reticle.matrixAutoUpdate = false;
  reticle.visible = false;
  return reticle;
}

export class ARSession {
  constructor(renderer, scene, overlayRoot) {
    this.renderer = renderer;
    this.overlayRoot = overlayRoot;
    this.session = null;
    this.hitTestSource = null;
    this.lastHit = null;
    this.anchored = new Map();      // XRAnchor -> Object3D
    this.pendingPlacement = null;   // { object, resolve }
    this.showReticle = true;
    this.onSelect = null;
    this.onEnd = null;

    this.reticle = createReticle();
    scene.add(this.reticle);
  }

  get surfaceFound() {
    return this.lastHit !== null;
  }

  get overlayType() {
    return this.session?.domOverlayState?.type ?? "none";
  }

  // Debe llamarse dentro del gesto del usuario (requestSession va primero).
  async start() {
    const session = await navigator.xr.requestSession("immersive-ar", {
      requiredFeatures: ["hit-test"],
      optionalFeatures: ["dom-overlay", "anchors", "local-floor"],
      domOverlay: { root: this.overlayRoot },
    });
    try {
      // 'local' siempre está disponible en immersive-ar; el hit-test no necesita 'local-floor'.
      this.renderer.xr.setReferenceSpaceType("local");
      await this.renderer.xr.setSession(session);
      const viewerSpace = await session.requestReferenceSpace("viewer");
      this.hitTestSource = await session.requestHitTestSource({ space: viewerSpace });
    } catch (err) {
      session.end();
      throw err;
    }
    this.session = session;
    session.addEventListener("select", (e) => this.onSelect?.(e));
    session.addEventListener("end", () => this._handleEnd());
  }

  end() {
    this.session?.end();
  }

  update(frame) {
    const refSpace = this.renderer.xr.getReferenceSpace();

    this.lastHit = null;
    if (this.hitTestSource) {
      const hits = frame.getHitTestResults(this.hitTestSource);
      const pose = hits.length ? hits[0].getPose(refSpace) : null;
      if (pose) {
        this.lastHit = hits[0];
        this.reticle.matrix.fromArray(pose.transform.matrix);
      }
    }
    this.reticle.visible = this.showReticle && this.surfaceFound;

    // Los hit results sólo son válidos en el frame donde se obtuvieron,
    // por eso la colocación se resuelve aquí y no en el evento 'select'.
    if (this.pendingPlacement) this._place(this.pendingPlacement);

    for (const [anchor, object] of this.anchored) {
      if (!frame.trackedAnchors?.has(anchor)) continue;
      const pose = frame.getPose(anchor.anchorSpace, refSpace);
      if (pose) object.matrix.fromArray(pose.transform.matrix);
    }
  }

  // Coloca `object` donde está la retícula y lo ancla si se puede.
  // Resuelve con "anchor", "pose" o null si no había superficie.
  placeAtReticle(object) {
    return new Promise((resolve) => {
      this.pendingPlacement = { object, resolve };
    });
  }

  clearAnchors() {
    for (const anchor of this.anchored.keys()) anchor.delete?.();
    this.anchored.clear();
  }

  _place({ object, resolve }) {
    this.pendingPlacement = null;
    const hit = this.lastHit;
    if (!hit) return resolve(null);

    this.clearAnchors();
    object.matrixAutoUpdate = false;
    object.matrix.copy(this.reticle.matrix);
    object.visible = true;

    if (typeof hit.createAnchor !== "function") return resolve("pose");
    hit.createAnchor().then(
      (anchor) => {
        if (!this.session) {
          anchor.delete?.();
          return resolve("pose");
        }
        this.anchored.set(anchor, object);
        resolve("anchor");
      },
      () => resolve("pose"),
    );
  }

  _handleEnd() {
    this.pendingPlacement?.resolve(null);
    this.pendingPlacement = null;
    this.anchored.clear();
    this.hitTestSource = null;
    this.lastHit = null;
    this.reticle.visible = false;
    this.session = null;
    this.onEnd?.();
  }
}
