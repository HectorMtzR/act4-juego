// Pantallas y HUD en el DOM overlay.
import { CONFIG } from "./config.js";

const $ = (id) => document.getElementById(id);

export const overlayRoot = $("overlay");

const startScreen = $("start-screen");
const startBtn = $("start-btn");
const startError = $("start-error");
const unsupported = $("unsupported");
const hud = $("ar-hud");
const message = $("message");
const messageText = $("message-text");
const phoneAnim = $("phone-anim");
const status = $("status");
const hudStats = $("hud-stats");
const toastEl = $("toast");
const endPanel = $("end-panel");

// Tocar botones o enlaces del overlay no debe generar un 'select' en la sesión XR.
overlayRoot.addEventListener("beforexrselect", (e) => {
  if (e.target.closest("button, a, .ui-block")) e.preventDefault();
});

export function setStartReady(label = "Iniciar AR") {
  startBtn.disabled = false;
  startBtn.textContent = label;
}

export function showUnsupported(reason) {
  startBtn.hidden = true;
  unsupported.hidden = false;
  if (reason === "insecure") {
    unsupported.querySelector(".notice-text").textContent =
      "Abre esta página con HTTPS (o en localhost) para usar la cámara en AR.";
  }
  const link = $("demo-link");
  if (CONFIG.DEMO_VIDEO_URL) link.href = CONFIG.DEMO_VIDEO_URL;
  else link.hidden = true;
}

export function showStartError(text) {
  startError.textContent = text;
  startError.hidden = false;
}

export function onStart(cb) {
  startBtn.addEventListener("click", cb);
}

export function onExit(cb) {
  $("exit-btn").addEventListener("click", cb);
  $("end-exit-btn").addEventListener("click", cb);
}

export function onAgain(cb) {
  $("again-btn").addEventListener("click", cb);
}

export function showAR() {
  startScreen.hidden = true;
  startError.hidden = true;
  hud.hidden = false;
  hudStats.hidden = true;
  endPanel.hidden = true;
  status.hidden = !CONFIG.DEBUG;
}

export function showStart() {
  hud.hidden = true;
  startScreen.hidden = false;
  clearTimeout(messageTimer);
  lastScanning = null;
}

let messageTimer = 0;

export function setMessage(text, { phone = false, duration = 0 } = {}) {
  clearTimeout(messageTimer);
  messageText.textContent = text;
  phoneAnim.hidden = !phone;
  message.hidden = false;
  if (duration) messageTimer = setTimeout(hideMessage, duration);
}

export function hideMessage() {
  message.hidden = true;
}

let lastScanning = null;

// Guía de escaneo: sólo toca el DOM cuando cambia el estado.
export function setScanning(found) {
  if (found === lastScanning) return;
  lastScanning = found;
  if (found) setMessage("Toca para colocar el edificio");
  else setMessage("Mueve el teléfono lentamente para escanear la superficie", { phone: true });
}

export function stopScanning() {
  lastScanning = null;
}

let lastStatus = "";

export function setStatus(text) {
  if (!CONFIG.DEBUG || text === lastStatus) return;
  lastStatus = text;
  status.textContent = text;
}

export function updateHud(game) {
  hudStats.hidden = false;
  $("hud-floors").textContent = `Pisos ${game.floors}`;
  const lost = CONFIG.START_LIVES - game.lives;
  $("hud-lives").innerHTML =
    '<span class="heart">♥</span>'.repeat(game.lives) + '<span class="heart lost">♥</span>'.repeat(lost);
  $("hud-level").textContent = game.level.name;
}

let toastTimer = 0;

// Texto grande y breve al centro: "¡Perfecto!", "¡Se cayó!", "¡Nivel 2!".
export function toast(text, kind = "") {
  clearTimeout(toastTimer);
  toastEl.textContent = text;
  toastEl.className = `toast ${kind}`;
  toastEl.hidden = false;
  void toastEl.offsetWidth; // reinicia la animación
  toastEl.classList.add("show");
  toastTimer = setTimeout(() => { toastEl.hidden = true; }, 1300);
}

export function showEnd(game) {
  $("end-summary").textContent = `Pisos construidos: ${game.floors}`;
  endPanel.hidden = false;
}

export function hideEnd() {
  endPanel.hidden = true;
}
