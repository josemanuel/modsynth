# Modular Synth – Web Audio

Sintetizador modular estilo SynthEdit / FlowStone / Eurorack construido en **HTML + CSS + JavaScript puro** (sin frameworks).

## Características

- **Módulos clásicos**: VCO, VCF, VCA, ADSR, LFO, Noise, Mixer
- **Efectos**: Delay, Reverb (convolver), Chorus
- **Control**: Keyboard (QWERTY + ratón), Sequencer 8 pasos, Web MIDI
- **Cableado flexible** con SVG (cables curvados)
- **Export / Import** de patches en JSON
- **Audio real** vía Web Audio API (selección de sample rate)
- Interfaz oscura inspirada en entornos modulares

## Cómo usar

1. Abre `index.html` en un navegador moderno (Chrome / Firefox / Edge recomendados).
2. Pulsa **▶ Start** para inicializar el AudioContext (obligatorio por políticas de autoplay).
3. Añade módulos desde la paleta izquierda o con clic derecho en el canvas.
4. Conecta módulos **arrastrando de un socket a otro**.
5. Colores de cables:
   - 🔵 **Audio** (señal de audio)
   - 🟠 **CV** (control voltage / modulación)
   - 🟢 **Gate** (disparo de envelopes)
6. Para eliminar un cable: haz clic sobre él.
7. Exporta / importa el patch completo como JSON.

### Atajos de teclado (módulo Keyboard)

```
A S D F G H J K   →  teclas blancas
W E   T Y U       →  teclas negras
```

### Patch básico recomendado

```
Keyboard.CV  ──► VCO.Freq
Keyboard.Gate ──► ADSR.Gate
VCO.Out       ──► VCA.In
ADSR.Env      ──► VCA.CV
VCA.Out       ──► Output.In
```

## Estructura del proyecto

```
modular-synth/
├── index.html
├── css/
│   ├── style.css
│   └── modules.css
├── js/
│   ├── main.js
│   ├── core/
│   │   ├── AudioEngine.js
│   │   ├── Module.js
│   │   ├── Port.js
│   │   ├── Wire.js
│   │   └── PatchManager.js
│   └── modules/
│       ├── VCO.js, VCF.js, VCA.js, ADSR.js ...
│       └── ...
└── README.md
```

## Extender

Para añadir un nuevo módulo:

1. Crea `js/modules/MiModulo.js` extendiendo `Module`.
2. Define puertos con `addPort(id, name, type, direction)`.
3. Implementa `renderBody()`, `buildAudio()`, `applyParams()`.
4. Regístralo en `MODULE_MAP` dentro de `PatchManager.js`.
5. Añade el botón en la paleta y en el menú contextual.

## Limitaciones actuales (v1)

- El CV de frecuencia del VCO espera Hz (el Keyboard ya envía Hz).
- Polyphony no implementada (monofónico).
- No hay AudioWorklet personalizados todavía (todo corre en el hilo principal).
- Reverb usa impulse response generado procedurally (no IR reales).

## Próximas mejoras posibles

- Polyphony / voice allocator
- Osciloscopio y spectrum analyzer
- Más módulos (Sample & Hold, Quantizer, Ring Mod, etc.)
- Guardar patches en localStorage
- AudioWorklet para DSP pesado
- Drag & drop de archivos de audio

---

Hecho con Web Audio API · 2026
