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

// Tocar botones o enlaces del overlay no debe generar un 'select' en la sesión XR.
overlayRoot.addEventListener("beforexrselect", (e) => {
  if (e.target.closest("button, a, .ui-block")) e.preventDefault();
});

export function setStartReady() {
  startBtn.disabled = false;
  startBtn.textContent = "Iniciar AR";
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
}

export function showAR() {
  startScreen.hidden = true;
  startError.hidden = true;
  hud.hidden = false;
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
