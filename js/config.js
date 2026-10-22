// Todas las constantes ajustables del juego.
export const CONFIG = {
  PIECE_WIDTH_M: 0.12,
  HANG_HEIGHT: 2.0,            // en alturas de piso sobre el último piso
  GAME_DURATION: 150,
  START_LIVES: 3,
  PERFECT_TOLERANCE: 0.08,     // fracción del ancho
  FALL_TOLERANCE: 0.45,
  // perOffset: cuánto sube por cada unidad de desfase; perfectReduce: fracción que baja con un perfecto;
  // max: desplazamiento máximo de la punta (en anchos de piso); fullAt: pisos para llegar a la amplitud completa.
  SWAY: { perOffset: 0.6, perfectReduce: 0.3, max: 0.35, speed: 1.2, fullAt: 6 },
  LEVELS: [
    { name: "Casa",        minFloors: 0,  craneSpeed: 1.6, amplitude: 0.6,
      walls: ["#f2f2f0", "#d9c7a7", "#c9cdd2"], litWindows: false },
    { name: "Edificio",    minFloors: 6,  craneSpeed: 2.2, amplitude: 0.8,
      walls: ["#8a9099", "#5b6b7f", "#cbbfa8"], litWindows: false },
    { name: "Rascacielos", minFloors: 13, craneSpeed: 2.9, amplitude: 1.0,
      walls: ["#2f4a66", "#3a3f47", "#a7adb5"], litWindows: true },
  ],
  MEDALS: { bronze: 5, silver: 12, gold: 20 },
  MUSIC_VOLUME: 0.3,

  // El juego se calcula en "anchos de piso" (los modelos miden 1 de ancho) y se escala a PIECE_WIDTH_M.
  FLOOR_HEIGHT: 0.45,
  DROP_GRAVITY: 9,             // aceleración del piso soltado, en anchos de piso / s²
  NEXT_FLOOR_DELAY: 0.5,       // s entre que aterriza un piso y se cuelga el siguiente
  SLING_HEIGHT: 0.45,          // del techo del piso colgado al gancho
  LIT_WINDOW: { color: "#ffd27a", intensity: 1.2 },

  // Retícula: radios como fracción del ancho de la pieza.
  RETICLE: { inner: 0.6, outer: 0.75, color: "#ffffff" },
  // Enlace al video demo para dispositivos sin WebXR AR (vacío = no se muestra).
  DEMO_VIDEO_URL: "",
  // Muestra una línea de estado (superficie, anclaje, overlay) para pruebas.
  DEBUG: true,
};
