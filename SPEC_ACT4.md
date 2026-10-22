# Rascacielos AR — Especificación del proyecto

> Documento para desarrollar con Claude Code. Actividad 4 del curso de Realidad Virtual y Aumentada:
> "Videojuego de Realidad Aumentada sin marcadores con comprensión del entorno".
> **Fecha de entrega: 26 de octubre de 2026.** (Nombre del juego provisional.)

---

## 1. Resumen

Juego de RA **sin marcadores** para celular. El teléfono **detecta una superficie** (mesa o piso), el jugador coloca ahí la **planta baja** de un edificio y, encima, una **grúa** balancea cada piso nuevo de lado a lado. El jugador **toca la pantalla para soltar el piso**:

- Si cae **casi centrado** → **¡Perfecto!**, más puntos y el edificio se estabiliza.
- Si cae **un poco chueco** → se queda, pero el edificio **se mece más**.
- Si cae **muy chueco** → **se cae** y el jugador pierde 1 de 3 vidas.

El edificio crece y pasa de **casa → edificio → rascacielos**, con más velocidad y nuevos colores en cada etapa. La partida dura máximo 2:30 o hasta perder las 3 vidas.

**Estilo visual:** moderno y sencillo, sin complicarse en el diseño. Cajas limpias con ventanas rectangulares y colores neutros.

---

## 2. Stack técnico

- **HTML + CSS + JavaScript (ES modules), sin build.** GitHub Pages (HTTPS, requerido por WebXR).
- **three.js** (CDN con `importmap`) con **WebXR**:
  - Sesión `immersive-ar` con `requiredFeatures: ["hit-test"]`.
  - `optionalFeatures: ["dom-overlay", "anchors", "local-floor"]`. La UI del juego va en **DOM overlay** (HTML encima de la cámara).
  - Si `anchors` está disponible, anclar la planta baja con un **XRAnchor**; si no, usar la pose fija del hit-test.
- **Compatibilidad:** WebXR AR funciona en **Chrome para Android con ARCore**. No funciona en iPhone. Si el dispositivo no es compatible, mostrar un mensaje claro (ver sección 9).
- **GLTFLoader** para los modelos.
- **Web Audio API** para música y efectos.
- **Vibration API** (`navigator.vibrate`): sí aplica, porque el juego es solo para Android.
- **Blender 4.x en modo terminal** (`blender --background --python script.py`) para generar los modelos.
- Sin motor de física: la caída y el balanceo se simulan con reglas y animaciones.

### Pruebas locales en el teléfono
WebXR necesita HTTPS o `localhost`. Para probar sin publicar: conectar el teléfono por USB, activar depuración USB y usar **`chrome://inspect` → Port forwarding** (por ejemplo `8000 → localhost:8000`). Así el teléfono abre `http://localhost:8000` como contexto seguro. Si no, publicar cada fase en GitHub Pages.

---

## 3. Estructura del repositorio

```
/
├── index.html
├── css/style.css
├── js/
│   ├── main.js        # arranque, sesión WebXR, render loop
│   ├── config.js      # TODAS las constantes ajustables
│   ├── xr.js          # sesión AR, hit-test, retícula, anclaje
│   ├── building.js    # pisos, apilado, balanceo del edificio, caída
│   ├── crane.js       # grúa y balanceo del piso colgado
│   ├── game.js        # estados, puntaje, combo, vidas, niveles, tiempo, medallas
│   ├── ui.js          # pantallas y HUD (DOM overlay)
│   └── feedback.js    # música, efectos de sonido, vibración, partículas
├── assets/
│   ├── models/        # ground.glb, floor_a.glb, floor_b.glb, floor_c.glb, roof.glb, hook.glb
│   └── sounds/        # music, drop, land, perfect, crash, levelup, gameover
├── blender/
│   ├── build_models.py    # genera y exporta todas las piezas
│   └── preview/           # renders de vista previa de cada pieza
├── docs/screenshots/
├── README.md
└── SPEC_ACT4.md
```

---

## 4. Modelos (Blender)

Un solo script `blender/build_models.py` genera todas las piezas, las exporta a **GLB** y renderiza una **vista previa** de cada una en `blender/preview/`.

### Reglas obligatorias
- **Mismas medidas para todos los pisos:** ancho 1.0, fondo 1.0, alto 0.45 (unidades de Blender; el juego las escala).
- **Origen abajo al centro** en todas las piezas, para que apilar sea sumar la altura.
- **Ventanas en las 4 caras**: el jugador puede caminar alrededor del edificio.
- **Materiales separados con nombre:**
  - `pared`: el juego le cambia el color.
  - `ventana`: vidrio oscuro; en el nivel rascacielos el juego la ilumina (emisión).
  - `marco`: gris oscuro, fijo.
- **Low poly**, cada GLB **< 1 MB**.

### Piezas
| Archivo | Descripción (estilo moderno y sencillo) |
|---|---|
| `ground.glb` | Planta baja: puerta de vidrio al frente y ventanas grandes en las otras caras |
| `floor_a.glb` | Piso con **2 ventanas** por cara |
| `floor_b.glb` | Piso con **3 ventanas** por cara |
| `floor_c.glb` | Piso con **ventana corrida horizontal** (franja de vidrio) por cara |
| `roof.glb` | Azotea: pretil bajo y un pequeño cuarto o tanque encima |
| `hook.glb` | Gancho de grúa con un cable corto vertical (el cable largo se dibuja en código) |

Ventanas ligeramente **hundidas** en la pared, con marco, para dar relieve sin agregar detalle.

### Revisión visual
Después de generar, **abrir los renders de `blender/preview/`** y revisar proporciones, ventanas y materiales antes de integrarlos.

---

## 5. Flujo del juego

1. **Inicio** (pantalla HTML antes de entrar a AR)
   - Nombre del juego y reglas en 3 líneas con íconos:
     - "Toca para soltar el piso."
     - "Centrado = ¡Perfecto! · Muy chueco = se cae."
     - "Tienes 3 vidas y 2:30 minutos."
   - Consejo: "Usa una superficie con textura (no mesas blancas lisas ni brillantes). Para torres altas, juega en el piso."
   - Botón **"Iniciar AR"** (este toque inicia la sesión WebXR y desbloquea el audio).
2. **Escaneo**
   - Mensaje "Mueve el teléfono lentamente para escanear la superficie" con una animación del teléfono moviéndose.
   - Al detectar superficie: aparece la **retícula** (anillo) sobre ella y el mensaje cambia a "Toca para colocar el edificio".
3. **Colocación**
   - Al tocar, se coloca la **planta baja** en la retícula, se ancla y la retícula desaparece.
   - Aparece la grúa con el primer piso y empieza el juego y el temporizador.
4. **Juego** (sección 6).
5. **Fin**
   - Se coloca la **azotea** encima del edificio con una pequeña celebración.
   - Resumen: pisos construidos, puntos, perfectos, **medalla** obtenida y **récord**.
   - Botones **"Jugar otra vez"** (reinicia en la misma superficie) y **"Salir"**.

---

## 6. Mecánica

### Grúa y piso colgado (`crane.js`)
- El piso nuevo cuelga del gancho a una altura fija sobre el último piso (`HANG_HEIGHT`).
- Se balancea de lado a lado en el eje X del edificio: `x = amplitud · sin(velocidad · t)`.
- La amplitud y la velocidad dependen del nivel.
- La grúa sube automáticamente conforme crece el edificio.

### Soltar el piso
- Usar el evento **`select`** de la sesión XR (un toque en la pantalla).
- Los botones del DOM overlay deben llamar `preventDefault()` en el evento **`beforexrselect`** para que tocarlos no suelte un piso.
- Al soltar, el piso **cae en línea recta** (animación con aceleración) hasta tocar el piso superior.
- Mientras cae un piso, ignorar más toques.

### Evaluación de la caída
Calcular el **desfase horizontal** entre el centro del piso que cae y el centro del piso superior (**incluyendo el balanceo actual del edificio**), medido como fracción del ancho del piso:

| Desfase | Resultado |
|---|---|
| ≤ `PERFECT_TOLERANCE` (0.08) | **Perfecto:** se centra solo sobre el anterior, +2 puntos, combo +1, el balanceo del edificio baja |
| ≤ `FALL_TOLERANCE` (0.45) | **Se queda** con su desfase: +1 punto, combo a 0, el balanceo del edificio sube en proporción al desfase |
| > `FALL_TOLERANCE` | **Se cae:** el piso se inclina, cae hacia la superficie y desaparece. −1 vida, combo a 0 |

### Combo
- Perfectos seguidos dan **+1 extra por cada perfecto en la racha** (2.º perfecto = +3, 3.º = +4…).
- Mostrar "¡Combo x3!" cuando aplica.

### Balanceo del edificio (`building.js`)
- El edificio completo oscila suavemente sobre su base: `x_superior = balanceo · sin(velocidad_b · t)`.
- El desplazamiento es mayor en los pisos altos (proporcional a la altura de cada piso), para que se vea que el edificio se mece desde abajo.
- `balanceo` aumenta con cada caída chueca, baja con cada perfecto y tiene un **máximo** (`SWAY_MAX`).

### Escala
- Escala del edificio configurable (`PIECE_WIDTH_M`, en metros reales; por defecto **0.12 m** de ancho por piso).

---

## 7. Gamificación

### Niveles (por pisos construidos)
| Nivel | Pisos | Velocidad de la grúa | Amplitud | Paleta de paredes | Ventanas |
|---|---|---|---|---|---|
| 1. Casa | 1–5 | Lenta | Baja | Blanco `#f2f2f0`, arena `#d9c7a7`, gris claro `#c9cdd2` | Vidrio oscuro |
| 2. Edificio | 6–12 | Media | Media | Gris `#8a9099`, azul pizarra `#5b6b7f`, beige `#cbbfa8` | Vidrio oscuro |
| 3. Rascacielos | 13+ | Rápida | Alta | Azul vidrio `#2f4a66`, grafito `#3a3f47`, plata `#a7adb5` | **Iluminadas** (emisión cálida) |

- El tipo de piso (A, B o C) se elige al azar **sin repetir el anterior**.
- El color de la pared se elige de la paleta del nivel **sin repetir el anterior**.
- Al subir de nivel: aviso "¡Nivel 2: Edificio!" con sonido y vibración.

### Tiempo y fin de partida
- Duración máxima: **150 s**.
- La partida termina al perder **3 vidas** o al acabarse el tiempo.

### Recompensas
| Medalla | Requisito |
|---|---|
| 🥉 Bronce | 5 pisos |
| 🥈 Plata | 12 pisos |
| 🥇 Oro | 20 pisos |

- **Récord** de pisos y de puntos en `localStorage` (dentro de `try/catch`).

---

## 8. Audio y retroalimentación

### Música
- Música de fondo en loop (licencia libre: Pixabay o similar), volumen bajo.
- Opcional: subir un poco el volumen o la velocidad en el nivel rascacielos.

### Efectos
| Evento | Visual | Sonido | Vibración |
|---|---|---|---|
| Colocar planta baja | Pequeño rebote de la pieza | `land` | 30 ms |
| Soltar piso | El gancho se abre | `drop` | 15 ms |
| Piso se queda | Rebote y polvo pequeño | `land` | 30 ms |
| **Perfecto** | Destello blanco en el borde + texto "¡Perfecto!" (+ "Combo xN") | `perfect` | 60 ms |
| Piso se cae | Inclinación y caída + texto "¡Se cayó!" + corazón del HUD desaparece | `crash` | 250 ms |
| Subir de nivel | Texto grande del nivel | `levelup` | patrón 80-50-80 |
| Fin | Azotea + pantalla de fin | `gameover` | 150 ms |

Cada acción del jugador debe tener al menos respuesta visual y sonora.

### Sombra
- Plano con `ShadowMaterial` bajo el edificio y una luz direccional con sombras, para que el edificio "pise" la superficie.
- Luz ambiental / hemisférica suave.

---

## 9. UI (DOM overlay)

- **HUD arriba:** pisos, puntos, corazones (vidas), tiempo restante y nivel.
- **Mensajes centrales temporales:** "¡Perfecto!", "¡Se cayó!", "¡Nivel 2!".
- Botón pequeño **pausa** (detiene grúa y tiempo) con opciones "Continuar" y "Reiniciar".
- **Sin compatibilidad WebXR AR:** en la pantalla de inicio, reemplazar el botón por el mensaje "Este juego necesita Chrome en un Android compatible con ARCore" y un enlace al video demo.
- Diseño para celular en vertical, con textos legibles sobre la cámara (fondo semitransparente).

---

## 10. Constantes (`config.js`)

```js
export const CONFIG = {
  PIECE_WIDTH_M: 0.12,
  HANG_HEIGHT: 2.0,            // en alturas de piso sobre el último piso
  GAME_DURATION: 150,
  START_LIVES: 3,
  PERFECT_TOLERANCE: 0.08,     // fracción del ancho
  FALL_TOLERANCE: 0.45,
  SWAY: { perOffset: 0.6, perfectReduce: 0.3, max: 0.35, speed: 1.2 },
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
};
```

---

## 11. Recursos y créditos

| Recurso | Fuente | Licencia |
|---|---|---|
| Modelos del edificio y grúa | Propios, generados en Blender | Propia |
| three.js | threejs.org | MIT |
| Música | Pixabay u otra fuente libre | Registrar |
| Efectos de sonido | Freesound, Pixabay o Kenney | Registrar la de cada archivo |

---

## 12. README.md

1. Nombre, concepto y cómo se juega.
2. **Requisitos del dispositivo:** Chrome para Android con ARCore (no funciona en iPhone).
3. Herramientas: three.js, WebXR (hit-test, anchors, DOM overlay), Blender con scripts de Python, Claude Code.
4. Enlace para jugar (GitHub Pages).
5. Instalación y ejecución local (incluyendo `chrome://inspect` y cómo regenerar los modelos).
6. Capturas y renders de las piezas.
7. Créditos con licencia.
8. Autor.

---

## 13. Fases de desarrollo

Commit con mensaje claro al cerrar cada fase.

| Fase | Objetivo | Listo cuando… |
|---|---|---|
| 1. Base AR | Botón "Iniciar AR", hit-test, retícula, tocar para colocar un cubo anclado. Publicado en GitHub Pages | El cubo se queda quieto en la mesa al caminar alrededor |
| 2. Modelos | `build_models.py` genera las 6 piezas y sus vistas previas | Renders revisados y aprobados |
| 3. Mecánica | Grúa, balanceo, soltar, evaluación de la caída, apilado, caída de pisos, vidas | Se puede apilar y perder pisos |
| 4. Gamificación | Puntos, combo, niveles con paletas, tiempo, medallas, récord, azotea final | Partida completa de principio a fin |
| 5. Audio y feedback | Música, efectos, vibración, textos, partículas, sombra | Cada acción tiene respuesta visual, sonora y háptica |
| 6. Pulido | Pantalla de inicio, escaneo, mensaje de compatibilidad, pausa, pruebas, README | Lista la entrega |

---

## 14. Pruebas

- [ ] Probar en **al menos 2 teléfonos Android con ARCore**.
- [ ] Probar en mesa con textura y en piso; revisar qué pasa en una superficie lisa (el mensaje de escaneo debe guiar).
- [ ] Caminar alrededor del edificio: debe quedarse anclado, sin desplazarse.
- [ ] Una partida completa en 2–3 min sin errores en consola.
- [ ] Los botones del HUD no sueltan pisos por accidente.
- [ ] Revisar temperatura y batería después de 3 partidas seguidas.
- [ ] En un iPhone o navegador sin WebXR aparece el mensaje de compatibilidad (sin errores).
- [ ] El enlace abre en ventana de incógnito.

---

## 15. Rúbrica y cómo se cubre

| Criterio | Pts | Cómo se cubre |
|---|---|---|
| Mapeo del entorno | 2 | Hit-test de WebXR con retícula; planta baja anclada (XRAnchor), estable al caminar alrededor |
| Lógica e interacción | 2 | Reglas claras (perfecto / se queda / se cae), toque para soltar sobre el edificio anclado |
| Gamificación | 1.5 | Puntos, combo, 3 niveles con cambios visibles, tiempo, vidas, medallas y récord |
| Música y audio | 1 | Música de fondo + efectos de sonido con licencia libre |
| Retroalimentación | 1 | Respuesta visual, sonora y háptica en cada acción |
| Propuesta y experiencia de usuario | 0.5 | Concepto propio con pantalla de instrucciones y guía de escaneo |
| Repositorio GitHub | 1 | Código modular, script de Blender incluido y README completo |
| Artículo LinkedIn | 1 | Proceso, retos, video y enlace (fuera del código) |

---

## 16. Tareas manuales (las hace el equipo, no Claude Code)

- [ ] Confirmar **ya** que hay 2 teléfonos Android compatibles con ARCore (lista oficial de Google).
- [ ] Revisar los renders de las piezas y aprobarlos.
- [ ] Descargar música y efectos, y anotar sus créditos.
- [ ] Probar sobre distintas superficies.
- [ ] Grabar el video demo (30–60 s) con buena luz, mostrando el escaneo, la colocación, un perfecto, una caída y el cambio de nivel.
- [ ] Escribir el artículo de LinkedIn, mencionando con honestidad el uso de Claude Code y Blender por scripts.
- [ ] Subir los 3 enlaces al formulario.
