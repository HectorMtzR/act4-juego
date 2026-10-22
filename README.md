# Rascacielos AR

Juego de realidad aumentada sin marcadores: detecta una superficie, coloca la planta baja y apila pisos que cuelgan de una grúa. Ver [SPEC_ACT4.md](SPEC_ACT4.md).

> README en construcción (se completa en la fase 6).

## Requisitos

Chrome para Android con ARCore. No funciona en iPhone.

## Ejecución local

No hay build: es HTML + JS con módulos ES.

```bash
python -m http.server 8000
```

WebXR necesita HTTPS o `localhost`. Para probar en el teléfono:

1. Conecta el teléfono por USB y activa la depuración USB.
2. En la computadora abre `chrome://inspect` → **Port forwarding** → `8000` → `localhost:8000`.
3. En el teléfono abre `http://localhost:8000`.
