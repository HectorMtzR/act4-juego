// Reglas: evaluación de la caída, vidas, pisos construidos, niveles y elección de pisos.
import { CONFIG } from "./config.js";

const FLOOR_TYPES = ["floor_a", "floor_b", "floor_c"];

function pickDifferent(list, previous) {
  const options = list.filter((item) => item !== previous);
  return options[Math.floor(Math.random() * options.length)];
}

export class Game {
  constructor() {
    this.reset();
  }

  reset() {
    this.lives = CONFIG.START_LIVES;
    this.floors = 0;          // pisos construidos, sin contar la planta baja
    this.over = false;
    this.lastType = null;
    this.lastColor = null;
  }

  get levelIndex() {
    let index = 0;
    CONFIG.LEVELS.forEach((level, i) => {
      if (this.floors >= level.minFloors) index = i;
    });
    return index;
  }

  get level() {
    return CONFIG.LEVELS[this.levelIndex];
  }

  groundColor() {
    this.lastColor = pickDifferent(CONFIG.LEVELS[0].walls, null);
    return this.lastColor;
  }

  // Tipo y color del siguiente piso, sin repetir los del anterior.
  nextFloor() {
    const level = this.level;
    this.lastType = pickDifferent(FLOOR_TYPES, this.lastType);
    this.lastColor = pickDifferent(level.walls, this.lastColor);
    return { type: this.lastType, color: this.lastColor, lit: level.litWindows };
  }

  // `offset`: desfase horizontal como fracción del ancho del piso.
  evaluate(offset) {
    const d = Math.abs(offset);
    if (d <= CONFIG.PERFECT_TOLERANCE) return "perfect";
    if (d <= CONFIG.FALL_TOLERANCE) return "stay";
    return "fall";
  }

  apply(result) {
    if (result === "fall") {
      this.lives -= 1;
      this.over = this.lives <= 0;
      return { levelUp: false };
    }
    const before = this.levelIndex;
    this.floors += 1;
    return { levelUp: this.levelIndex > before };
  }
}
