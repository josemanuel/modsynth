# Guía de Modular Synth

Sintetizador modular en el navegador (HTML + JS + Web Audio), inspirado en SynthEdit / Eurorack.

La misma guía está disponible en la app: botón **Ayuda**.

## Barra de herramientas

- **Start / Stop** — audio on/off
- **Config** — engine, sample rate, MIDI
- **Archivos** — export/import JSON y ejemplos
- **Conexiones** / **Diagrama**
- **Tema** ☾/☀ (se recuerda en localStorage)
- **Acerca de…** — incluye botón **Tutorial**

## Inicio rápido

1. **Start** — activa el AudioContext.
2. Añade módulos desde la paleta (categorías) o clic derecho.
3. Conecta salida → entrada arrastrando sockets.
4. Patch básico: Keyboard → VCO/ADSR/VCA → Output.
5. Menú **Ejemplos** para presets.

## Categorías de módulos

### Generadores
VCO, Noise, Additive, FM, DX7 FM, Wavetable, LA, Sample, Granular.

### Procesadores
VCF, VCA, Mixer, Delay, Chorus, Reverb.

### Moduladores
ADSR, LFO.

### Control / secuencia
Keyboard, Sequencer, Arp, Voices, MIDI CC.

### Salida
Output.

## Tipos de cable

| Tipo | Uso |
|------|-----|
| **audio** | Señal sonora |
| **cv** | Control continuo (Hz, cutoff…) |
| **gate** | Disparo (notas, EG) |

## Notas importantes

- **VCA + CV**: el Level es el tope; el ADSR abre el VCA. Sin tecla no debe oírse el oscilador.
- **Polifonía**: usar módulo **Voices** + una cadena por voz.
- **DX7 FM**: 32 algoritmos, EG y level 0–99 por operador.
- **Wavetable**: morph + carga WAV multi-ciclo o JSON.
- **MIDI**: selector de dispositivo + módulo MIDI CC para knobs.

## Canvas

- Scroll en ambas direcciones.
- Zoom: botones o Ctrl+rueda.
- **Diagrama** → vista de flujo y exportación PDF (imprimir).

## Patches

- Export / Import JSON.
- Carpeta `examples/` + `manifest.json` (GitHub Pages).

## Autor

José Manuel Fernández Carreira  
https://soundcloud.com/jmfcarreira


## Bloques reutilizables

1. **Ctrl+clic** (o Shift+clic) en varios módulos para seleccionarlos.
2. Botón **📦 Bloque** en la barra → nombre → se encapsulan.
3. Los cables hacia fuera se convierten en **puertos expuestos**.
4. **Doble clic** o **Editar** en el bloque → vista interna + JSON.
5. **Export / Import** de archivos `.block.json`.
6. Ejemplo: `examples/minimoog-ish.block.json` y MultiFX por defecto.
