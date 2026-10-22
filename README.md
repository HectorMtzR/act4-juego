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

## Publicación (Cloudflare)

El sitio se publica como assets estáticos de Cloudflare Workers, con HTTPS incluido (requerido por WebXR). La configuración está en [wrangler.jsonc](wrangler.jsonc). [.assetsignore](.assetsignore) evita que se publiquen archivos que no son del juego, como el spec, los scripts de Blender o `.git`.

```bash
npx wrangler login     # una sola vez
npx wrangler deploy    # publica en https://rascacielos-ar.<tu-subdominio>.workers.dev
```

Para probar igual que en Cloudflare antes de publicar: `npx wrangler dev` (sirve en `http://localhost:8787`).
