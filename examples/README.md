# Ejemplos de patches

Presets JSON que aparecen en el menú **Ejemplos**.

## Carga dinámica

Al abrir el menú, la app:

1. Lee **`manifest.json`** (orden, nombres y descripciones).
2. Si estás en **GitHub Pages** (`*.github.io`), consulta la API de GitHub y lista todos los `.json` de esta carpeta.
3. **Fusiona** ambas fuentes: el manifiesto manda en metadatos; cualquier JSON nuevo en la carpeta **aparece solo**.

Puedes subir un `nuevo.json` a `examples/` y, tras el deploy, se listará aunque no edites el manifiesto (título generado del nombre de archivo).

## Añadir un ejemplo

### Rápido (solo archivo)

1. Exporta el patch o crea `mi-sonido.json`.
2. Súbelo a `examples/` en el repo.
3. Push → en unos minutos en https://josemanuel.github.io/modsynth/

### Con nombre y descripción

Edita también **`manifest.json`**:

```json
{
  "id": "mi-sonido",
  "name": "Mi sonido",
  "description": "Texto bajo el título en el menú.",
  "file": "mi-sonido.json"
}
```

## Local (sin GitHub)

En localhost solo se usa **manifest.json**. Manténlo actualizado al desarrollar en local.

## Nota

- `manifest.json` no se trata como patch.
- La API pública de GitHub tiene rate limit; para este menú basta.
