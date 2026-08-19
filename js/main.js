import { AudioEngine } from './core/AudioEngine.js';
import { PatchManager } from './core/PatchManager.js';
import { Wire } from './core/Wire.js';
import { MidiManager } from './core/MidiManager.js';

const audioEngine = new AudioEngine();
const midi = new MidiManager();
const patch = new PatchManager(audioEngine, midi);

// ========== UI ELEMENTS ==========
const btnStart = document.getElementById('btn-start');
const audioStatus = document.getElementById('audio-status');
const sampleRateSel = document.getElementById('sample-rate');
const btnExport = document.getElementById('btn-export');
const btnImport = document.getElementById('btn-import');
const importFile = document.getElementById('import-file');
const btnClear = document.getElementById('btn-clear');
const btnConnections = document.getElementById('btn-connections');
const connectionsPanel = document.getElementById('connections-panel');
const btnConnectionsClose = document.getElementById('btn-connections-close');

function toggleConnectionsPanel(force) {
  if (!connectionsPanel) return;
  const open = force !== undefined ? force : connectionsPanel.classList.contains('hidden');
  connectionsPanel.classList.toggle('hidden', !open);
  if (open) patch.updateConnectionsTable();
}

if (btnConnections) {
  btnConnections.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleConnectionsPanel();
  });
}
if (btnConnectionsClose) {
  btnConnectionsClose.addEventListener('click', () => toggleConnectionsPanel(false));
}


// ========== AYUDA / GUÍA ==========
const btnHelp = document.getElementById('btn-help');
const helpModal = document.getElementById('help-modal');

function setHelpOpen(open) {
  if (!helpModal) return;
  helpModal.classList.toggle('hidden', !open);
}

if (btnHelp) {
  btnHelp.addEventListener('click', (e) => {
    e.stopPropagation();
    setHelpOpen(true);
  });
}
if (helpModal) {
  helpModal.querySelectorAll('[data-help-close]').forEach((el) => {
    el.addEventListener('click', () => setHelpOpen(false));
  });
  helpModal.querySelectorAll('[data-help-sec]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.helpSec;
      helpModal.querySelectorAll('.help-nav-btn').forEach((b) => {
        b.classList.toggle('active', b.dataset.helpSec === id);
      });
      helpModal.querySelectorAll('.help-sec').forEach((sec) => {
        sec.classList.toggle('active', sec.dataset.sec === id);
      });
    });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !helpModal.classList.contains('hidden')) {
      setHelpOpen(false);
    }
  });
}

// ========== ACERCA DE ==========
const btnAbout = document.getElementById('btn-about');
const aboutModal = document.getElementById('about-modal');

function setAboutOpen(open) {
  if (!aboutModal) return;
  aboutModal.classList.toggle('hidden', !open);
}

if (btnAbout) {
  btnAbout.addEventListener('click', (e) => {
    e.stopPropagation();
    setAboutOpen(true);
  });
}
if (aboutModal) {
  aboutModal.querySelectorAll('[data-about-close]').forEach((el) => {
    el.addEventListener('click', () => setAboutOpen(false));
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !aboutModal.classList.contains('hidden')) {
      setAboutOpen(false);
    }
  });
}



const contextMenu = document.getElementById('context-menu');
const canvasContainer = document.getElementById('canvas-container');
const canvasWorld = document.getElementById('canvas-world');
const wiresSvg = document.getElementById('wires-svg');
const zoomLabel = document.getElementById('zoom-label');

/** Zoom actual (1 = 100%) */
let canvasZoom = 1;

function setZoom(z) {
  canvasZoom = Math.min(2, Math.max(0.25, z));
  if (canvasWorld) {
    canvasWorld.style.transform = `scale(${canvasZoom})`;
  }
  if (zoomLabel) zoomLabel.textContent = Math.round(canvasZoom * 100) + '%';
  if (window.modularSynth) window.modularSynth.zoom = canvasZoom;
  patch.wires.forEach((w) => w.updatePath());
}

function clientToWorld(clientX, clientY) {
  if (!canvasWorld) return { x: clientX, y: clientY };
  const rect = canvasWorld.getBoundingClientRect();
  return {
    x: (clientX - rect.left) / canvasZoom,
    y: (clientY - rect.top) / canvasZoom
  };
}

document.getElementById('btn-zoom-in')?.addEventListener('click', () => setZoom(canvasZoom + 0.1));
document.getElementById('btn-zoom-out')?.addEventListener('click', () => setZoom(canvasZoom - 0.1));
document.getElementById('btn-zoom-reset')?.addEventListener('click', () => setZoom(1));

// Zoom con Ctrl + rueda
canvasContainer?.addEventListener('wheel', (e) => {
  if (!e.ctrlKey && !e.metaKey) return;
  e.preventDefault();
  const delta = e.deltaY > 0 ? -0.08 : 0.08;
  setZoom(canvasZoom + delta);
}, { passive: false });

// ========== DIAGRAMA DE FLUJO ==========
const diagramModal = document.getElementById('diagram-modal');
const diagramSvg = document.getElementById('diagram-svg');

function setDiagramOpen(open) {
  if (!diagramModal) return;
  diagramModal.classList.toggle('hidden', !open);
  if (open) renderPatchDiagram();
}

document.getElementById('btn-diagram')?.addEventListener('click', () => setDiagramOpen(true));
diagramModal?.querySelectorAll('[data-diagram-close]').forEach((el) => {
  el.addEventListener('click', () => setDiagramOpen(false));
});

function renderPatchDiagram() {
  if (!diagramSvg) return;
  const modules = [...patch.modules.values()];
  const wires = patch.wires;

  if (!modules.length) {
    diagramSvg.setAttribute('viewBox', '0 0 400 120');
    diagramSvg.innerHTML =
      '<text x="20" y="60" fill="#8a93a8" font-size="14">No hay módulos en el patch</text>';
    return;
  }

  // Layout: columnas por tipo aproximado / posición x ordenada
  const sorted = [...modules].sort((a, b) => a.x - b.x || a.y - b.y);
  const colW = 160;
  const rowH = 56;
  const pad = 40;
  const cols = Math.ceil(Math.sqrt(sorted.length));
  const positions = new Map();

  sorted.forEach((mod, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    positions.set(mod.id, {
      x: pad + col * (colW + 80),
      y: pad + row * (rowH + 48),
      mod
    });
  });

  let maxX = 0;
  let maxY = 0;
  positions.forEach((p) => {
    maxX = Math.max(maxX, p.x + colW);
    maxY = Math.max(maxY, p.y + rowH);
  });

  const vbW = maxX + pad;
  const vbH = maxY + pad;
  diagramSvg.setAttribute('viewBox', `0 0 ${vbW} ${vbH}`);
  diagramSvg.setAttribute('width', String(Math.max(400, vbW)));
  diagramSvg.setAttribute('height', String(Math.max(200, vbH)));

  const typeColor = {
    audio: '#4fc3f7',
    cv: '#ffb74d',
    gate: '#81c784'
  };

  let svg = '';
  // Wires first
  wires.forEach((w) => {
    const a = positions.get(w.from.module.id);
    const b = positions.get(w.to.module.id);
    if (!a || !b) return;
    const x1 = a.x + colW;
    const y1 = a.y + rowH / 2;
    const x2 = b.x;
    const y2 = b.y + rowH / 2;
    const dx = Math.max(40, Math.abs(x2 - x1) * 0.4);
    const color = typeColor[w.from.type] || '#8a93a8';
    svg += `<path d="M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}" fill="none" stroke="${color}" stroke-width="2" opacity="0.85"/>`;
  });

  positions.forEach((p) => {
    const title = (p.mod.title || p.mod.type).replace(/[<>&]/g, '');
    const type = (p.mod.type || '').replace(/[<>&]/g, '');
    svg += `<rect x="${p.x}" y="${p.y}" width="${colW}" height="${rowH}" rx="8" fill="#161a22" stroke="#2a3140" stroke-width="1.5"/>`;
    svg += `<text x="${p.x + 12}" y="${p.y + 24}" fill="#4fc3f7" font-size="13" font-family="Segoe UI,sans-serif" font-weight="600">${title}</text>`;
    svg += `<text x="${p.x + 12}" y="${p.y + 42}" fill="#8a93a8" font-size="11" font-family="Segoe UI,sans-serif">${type}</text>`;
  });

  diagramSvg.innerHTML = svg;
}

document.getElementById('btn-diagram-pdf')?.addEventListener('click', () => {
  exportDiagramPdf();
});

function exportDiagramPdf() {
  renderPatchDiagram();
  const svgEl = document.getElementById('diagram-svg');
  if (!svgEl) return;

  const clone = svgEl.cloneNode(true);
  const vb = clone.getAttribute('viewBox') || '0 0 800 600';
  const parts = vb.split(/[\s,]+/).map(Number);
  const w = parts[2] || 800;
  const h = parts[3] || 600;

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"/>
<title>Modular Synth – Diagrama</title>
<style>
  @page { margin: 12mm; size: auto; }
  body { margin: 0; font-family: system-ui, sans-serif; color: #111; }
  h1 { font-size: 16px; margin: 0 0 8px; }
  .meta { font-size: 11px; color: #444; margin-bottom: 12px; }
  svg { max-width: 100%; height: auto; border: 1px solid #ccc; }
</style></head><body>
<div id="diagram-print-root">
  <h1>Modular Synth – Diagrama de flujo</h1>
  <div class="meta">Módulos: ${patch.modules.size} · Conexiones: ${patch.wires.length} · ${new Date().toLocaleString()}</div>
  ${clone.outerHTML}
</div>
<script>window.onload=function(){window.print();}</script>
</body></html>`;

  const win = window.open('', '_blank');
  if (!win) {
    alert('Permite ventanas emergentes para exportar el PDF');
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
}


// ========== START / STOP AUDIO ==========
function setAudioUI(running) {
  if (running) {
    audioStatus.textContent = `Audio ON (${audioEngine.sampleRate} Hz)`;
    audioStatus.classList.remove('off');
    audioStatus.classList.add('on');
    btnStart.textContent = '■ Stop';
    btnStart.classList.add('danger');
    btnStart.classList.remove('primary');
    btnStart.disabled = false;
  } else {
    audioStatus.textContent = 'Audio OFF';
    audioStatus.classList.add('off');
    audioStatus.classList.remove('on');
    btnStart.textContent = '▶ Start';
    btnStart.classList.add('primary');
    btnStart.classList.remove('danger');
    btnStart.disabled = false;
  }
}

btnStart.addEventListener('click', async () => {
  if (audioEngine.isRunning) {
    await audioEngine.stop();
    setAudioUI(false);
    return;
  }
  const sr = parseInt(sampleRateSel.value, 10);
  await audioEngine.start(sr);
  patch.buildAllAudio();
  setAudioUI(true);
  if (midi.supported && !midi.access) midi.init();
});

// ========== PALETTE ==========
document.querySelectorAll('.palette-item').forEach(btn => {
  btn.addEventListener('click', () => {
    const type = btn.dataset.type;
    // Centro del área visible del canvas (coords world)
    const p = clientToWorld(
      canvasContainer.getBoundingClientRect().left + canvasContainer.clientWidth / 2,
      canvasContainer.getBoundingClientRect().top + canvasContainer.clientHeight / 2
    );
    const x = Math.max(20, p.x - 90 + (Math.random() * 80 - 40));
    const y = Math.max(20, p.y - 40 + (Math.random() * 80 - 40));
    patch.createModule(type, x, y);
  });
});

// ========== CONTEXT MENU ==========
canvasContainer.addEventListener('contextmenu', e => {
  e.preventDefault();
  contextMenu.style.left = e.clientX + 'px';
  contextMenu.style.top = e.clientY + 'px';
  contextMenu.classList.remove('hidden');
  const p = clientToWorld(e.clientX, e.clientY);
  contextMenu.dataset.x = p.x;
  contextMenu.dataset.y = p.y;
});

document.addEventListener('click', () => {
  contextMenu.classList.add('hidden');
});

contextMenu.querySelectorAll('button[data-type]').forEach(btn => {
  btn.addEventListener('click', e => {
    e.stopPropagation();
    const type = btn.dataset.type;
    const x = parseFloat(contextMenu.dataset.x) || 100;
    const y = parseFloat(contextMenu.dataset.y) || 100;
    patch.createModule(type, x, y);
    contextMenu.classList.add('hidden');
  });
});

// ========== WIRING ==========
let wiringFrom = null; // Port
let previewPath = null;

canvasContainer.addEventListener('mousedown', e => {
  const socket = e.target.closest('.port-socket');
  if (!socket) return;

  e.stopPropagation();
  e.preventDefault();

  const modId = socket.dataset.moduleId;
  const portId = socket.dataset.portId;
  const mod = patch.modules.get(modId);
  if (!mod) return;
  const port = mod.getPort(portId);
  if (!port) return;

  wiringFrom = port;

  // Preview line
  previewPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  previewPath.classList.add(port.type, 'preview');
  wiresSvg.appendChild(previewPath);

  const onMove = ev => {
    if (!wiringFrom || !previewPath) return;
    const p1 = wiringFrom.module.getPortPosition(wiringFrom.id);
    const p2 = clientToWorld(ev.clientX, ev.clientY);
    previewPath.setAttribute('d', Wire.makePath(p1.x, p1.y, p2.x, p2.y));
  };

  const onUp = ev => {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);

    if (previewPath) {
      previewPath.remove();
      previewPath = null;
    }

    const targetSocket = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.port-socket');
    if (targetSocket && wiringFrom) {
      const tModId = targetSocket.dataset.moduleId;
      const tPortId = targetSocket.dataset.portId;
      const tMod = patch.modules.get(tModId);
      if (tMod) {
        const tPort = tMod.getPort(tPortId);
        if (tPort && tPort !== wiringFrom) {
          patch.connect(wiringFrom, tPort);
        }
      }
    }
    wiringFrom = null;
  };

  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
});

// ========== EXPORT / IMPORT ==========
btnExport?.addEventListener('click', () => {
  const data = patch.toJSON();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'patch-' + Date.now() + '.json';
  a.click();
  URL.revokeObjectURL(url);
});

btnImport?.addEventListener('click', () => importFile.click());
importFile.addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file) return;
  const text = await file.text();
  try {
    const data = JSON.parse(text);
    patch.fromJSON(data);
  } catch (err) {
    alert('Invalid JSON patch file');
  }
  importFile.value = '';
});

document.getElementById('btn-make-block')?.addEventListener('click', () => {
  const name = prompt('Nombre del bloque:', 'Custom Block');
  if (name === null) return;
  patch.createBlockFromSelection(name || 'Custom Block');
});

btnClear.addEventListener('click', () => {
  if (confirm('¿Borrar todo el patch?')) patch.clear();
});

// ========== CONFIG + ARCHIVOS (dropdowns) ==========
const configDropdown = document.getElementById('config-dropdown');
const btnConfig = document.getElementById('btn-config');
const configMenu = document.getElementById('config-menu');
const filesDropdown = document.getElementById('files-dropdown');
const btnFiles = document.getElementById('btn-files');
const filesMenu = document.getElementById('files-menu');
const examplesMenu = document.getElementById('examples-menu');
const EXAMPLES_BASE = 'examples/';

function closeAllToolbarMenus() {
  [configDropdown, filesDropdown].forEach((d) => d && d.classList.remove('open'));
  [configMenu, filesMenu].forEach((m) => m && m.classList.add('hidden'));
  if (btnConfig) btnConfig.setAttribute('aria-expanded', 'false');
  if (btnFiles) btnFiles.setAttribute('aria-expanded', 'false');
}

function setExamplesMenuOpen(open) {
  if (open) {
    closeAllToolbarMenus();
    if (filesDropdown && filesMenu) {
      filesDropdown.classList.add('open');
      filesMenu.classList.remove('hidden');
      if (btnFiles) btnFiles.setAttribute('aria-expanded', 'true');
      loadExamplesMenu();
    }
  } else {
    closeAllToolbarMenus();
  }
}

btnConfig?.addEventListener('click', (e) => {
  e.preventDefault();
  e.stopPropagation();
  const open = !configDropdown.classList.contains('open');
  closeAllToolbarMenus();
  if (open) {
    configDropdown.classList.add('open');
    configMenu.classList.remove('hidden');
    btnConfig.setAttribute('aria-expanded', 'true');
  }
});

btnFiles?.addEventListener('click', (e) => {
  e.preventDefault();
  e.stopPropagation();
  const open = !filesDropdown.classList.contains('open');
  closeAllToolbarMenus();
  if (open) {
    filesDropdown.classList.add('open');
    filesMenu.classList.remove('hidden');
    btnFiles.setAttribute('aria-expanded', 'true');
    loadExamplesMenu();
  }
});

document.addEventListener('click', () => closeAllToolbarMenus());
configMenu?.addEventListener('click', (e) => e.stopPropagation());
filesMenu?.addEventListener('click', (e) => e.stopPropagation());
closeAllToolbarMenus();

/**
 * Detecta repo público en GitHub Pages para listar /examples vía API.
 * https://USER.github.io/REPO/ → api.github.com/repos/USER/REPO/contents/examples
 */
function getGitHubContentsUrl(folder = 'examples') {
  const host = location.hostname || '';
  if (!host.endsWith('github.io')) return null;
  const user = host.replace('.github.io', '');
  const parts = location.pathname.split('/').filter(Boolean);
  // Proyecto tipo user.github.io/repo/  → parts[0] = repo
  // Proyecto tipo user.github.io/       → repo = user.github.io
  const repo = parts.length ? parts[0] : `${user}.github.io`;
  if (!user || !repo) return null;
  return `https://api.github.com/repos/${user}/${repo}/contents/${folder}`;
}

/** Título legible a partir del nombre de archivo */
function titleFromFilename(filename) {
  return filename
    .replace(/\.json$/i, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Lista archivos .json del directorio examples/ usando la API de GitHub.
 * Devuelve [{ file, name, description, download_url }] o [] si no aplica / falla.
 */
async function fetchExamplesFromGitHubApi() {
  const url = getGitHubContentsUrl('examples');
  if (!url) return [];

  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/vnd.github+json' },
      cache: 'no-cache'
    });
    if (!res.ok) {
      console.warn('[Ejemplos] GitHub API:', res.status, res.statusText);
      return [];
    }
    const items = await res.json();
    if (!Array.isArray(items)) return [];

    return items
      .filter(
        (it) =>
          it.type === 'file' &&
          typeof it.name === 'string' &&
          it.name.toLowerCase().endsWith('.json') &&
          it.name.toLowerCase() !== 'manifest.json'
      )
      .map((it) => ({
        file: it.name,
        name: titleFromFilename(it.name),
        description: it.name,
        // Preferir ruta relativa (mismo origin en Pages); API da download_url raw
        url: EXAMPLES_BASE + it.name,
        download_url: it.download_url
      }))
      .sort((a, b) => a.file.localeCompare(b.file));
  } catch (err) {
    console.warn('[Ejemplos] GitHub API no disponible:', err);
    return [];
  }
}

/** Carga manifest.json local (orden + nombres + descripciones). */
async function fetchExamplesFromManifest() {
  try {
    const res = await fetch(EXAMPLES_BASE + 'manifest.json', { cache: 'no-cache' });
    if (!res.ok) return [];
    const data = await res.json();
    const list = data.examples || [];
    return list.map((ex) => ({
      file: ex.file,
      name: ex.name || titleFromFilename(ex.file),
      description: ex.description || ex.file,
      url: EXAMPLES_BASE + ex.file
    }));
  } catch {
    return [];
  }
}

/**
 * Fusiona manifiesto + descubrimiento dinámico.
 * - El manifiesto define orden y metadatos si existe.
 * - Cualquier JSON nuevo en la carpeta (visto por la API) se añade solo.
 */
function mergeExampleLists(fromManifest, fromApi) {
  const byFile = new Map();

  fromManifest.forEach((ex) => {
    byFile.set(ex.file, { ...ex });
  });

  fromApi.forEach((ex) => {
    if (byFile.has(ex.file)) {
      // Conservar nombre/descripcion del manifiesto; asegurar url
      const prev = byFile.get(ex.file);
      byFile.set(ex.file, {
        ...ex,
        ...prev,
        url: prev.url || ex.url
      });
    } else {
      byFile.set(ex.file, {
        ...ex,
        description: ex.description || 'Detectado automáticamente'
      });
    }
  });

  // Orden: primero el del manifiesto; luego el resto alfabético
  const ordered = [];
  const seen = new Set();
  fromManifest.forEach((ex) => {
    if (byFile.has(ex.file)) {
      ordered.push(byFile.get(ex.file));
      seen.add(ex.file);
    }
  });
  [...byFile.keys()]
    .filter((f) => !seen.has(f))
    .sort()
    .forEach((f) => ordered.push(byFile.get(f)));

  return ordered;
}

function renderExamplesMenu(list) {
  if (!list.length) {
    examplesMenu.innerHTML =
      '<div class="dropdown-empty">No hay ejemplos JSON en <code>examples/</code>.</div>';
    return;
  }

  examplesMenu.innerHTML = '';
  list.forEach((ex) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'dropdown-item';
    btn.innerHTML =
      `<span class="ex-name">${escapeHtml(ex.name)}</span>` +
      `<span class="ex-desc">${escapeHtml(ex.description || ex.file)}</span>`;
    btn.addEventListener('click', async () => {
      setExamplesMenuOpen(false);
      await loadExampleFile(ex);
    });
    examplesMenu.appendChild(btn);
  });
}

async function loadExamplesMenu() {
  examplesMenu.innerHTML = '<div class="dropdown-loading">Cargando ejemplos…</div>';

  const [fromManifest, fromApi] = await Promise.all([
    fetchExamplesFromManifest(),
    fetchExamplesFromGitHubApi()
  ]);

  const list = mergeExampleLists(fromManifest, fromApi);

  if (!list.length) {
    examplesMenu.innerHTML =
      '<div class="dropdown-error">No se encontraron ejemplos. ' +
      'Añade archivos .json en <code>examples/</code> ' +
      '(y opcionalmente regístralos en manifest.json).</div>';
    return;
  }

  renderExamplesMenu(list);
  console.log(
    `[Ejemplos] ${list.length} patch(es) ` +
      `(manifest: ${fromManifest.length}, API: ${fromApi.length})`
  );
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Carga dinámica de un patch JSON.
 * @param {{ file: string, name?: string, url?: string, download_url?: string }} ex
 */
async function loadExampleFile(ex) {
  const label = (ex && ex.name) || (ex && ex.file) || 'ejemplo';
  const candidates = [];
  if (ex.url) candidates.push(ex.url);
  if (ex.file) candidates.push(EXAMPLES_BASE + ex.file);
  if (ex.download_url) candidates.push(ex.download_url);

  let data = null;
  let lastErr = null;

  for (const url of candidates) {
    try {
      const res = await fetch(url, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status} (${url})`);
      data = await res.json();
      break;
    } catch (err) {
      lastErr = err;
    }
  }

  if (!data) {
    console.error(lastErr);
    alert('Error al cargar el ejemplo: ' + ((lastErr && lastErr.message) || 'desconocido'));
    return;
  }

  try {
    if (!audioEngine.isRunning) {
      const sr = parseInt(sampleRateSel.value);
      await audioEngine.start(sr);
      audioStatus.textContent = `Audio ON (${audioEngine.sampleRate} Hz)`;
      audioStatus.classList.remove('off');
      audioStatus.classList.add('on');
      setAudioUI(true);
    }
    patch.fromJSON(data);
    console.log('[Ejemplos] Cargado:', label);
  } catch (err) {
    console.error(err);
    alert('Error al aplicar el patch: ' + (err.message || err));
  }
}

loadExamplesMenu();

// ========== WEB MIDI ==========
const midiStatusEl = document.getElementById('midi-status');
const midiInputSel = document.getElementById('midi-input');
const midiLed = document.getElementById('midi-activity');
const btnMidiRefresh = document.getElementById('btn-midi-refresh');

function flashMidiLed() {
  if (!midiLed) return;
  midiLed.classList.add('active');
  clearTimeout(flashMidiLed._t);
  flashMidiLed._t = setTimeout(() => midiLed.classList.remove('active'), 80);
}

function updateMidiUI(data) {
  if (data.error) {
    midiStatusEl.textContent = `MIDI: ${data.error}`;
    midiInputSel.innerHTML = '<option value="">—</option>';
    return;
  }

  const { inputs, activeInputId } = data;
  midiInputSel.innerHTML = '<option value="">— ninguno —</option>';
  inputs.forEach(dev => {
    const opt = document.createElement('option');
    opt.value = dev.id;
    opt.textContent = dev.name + (dev.state !== 'connected' ? ` (${dev.state})` : '');
    if (dev.id === activeInputId) opt.selected = true;
    midiInputSel.appendChild(opt);
  });

  if (activeInputId) {
    const active = inputs.find(d => d.id === activeInputId);
    midiStatusEl.textContent = `MIDI: ${active ? active.name : 'conectado'}`;
  } else if (inputs.length === 0) {
    midiStatusEl.textContent = 'MIDI: sin dispositivos';
  } else {
    midiStatusEl.textContent = 'MIDI: selecciona dispositivo';
  }
}

midiInputSel.addEventListener('change', () => {
  midi.setActiveInput(midiInputSel.value || null);
});

btnMidiRefresh.addEventListener('click', async () => {
  await midi.init();
});

// Routing de eventos MIDI → módulos Keyboard
midi.on((type, data) => {
  if (type === 'devices') {
    updateMidiUI(data);
    return;
  }

  flashMidiLed();

  if (type === 'noteon') {
    patch.modules.forEach(mod => {
      if (mod.type === 'keyboard') {
        mod.noteOn(data.note, data.velocity, { absolute: true });
      } else if (mod.type === 'arp') {
        mod.noteOn(data.note, data.velocity);
      }
    });
  } else if (type === 'noteoff') {
    patch.modules.forEach(mod => {
      if (mod.type === 'keyboard') {
        mod.noteOff(data.note, { absolute: true });
      } else if (mod.type === 'arp') {
        mod.noteOff(data.note);
      }
    });
  }
  // CC y pitchbend quedan disponibles vía midi.on() / midi.mapCC()
  // Ejemplo de mapeo manual desde consola:
  //   midi.mapCC(1, miModuloVCF, 'frequency', 20, 12000)
});

// Inicializar MIDI (puede requerir gesto de usuario en algunos navegadores)
async function initMIDI() {
  if (!midi.supported) {
    midiStatusEl.textContent = 'MIDI: no soportado';
    return;
  }
  // Intentamos al cargar; si falla por permisos, el botón ↻ MIDI lo reintenta
  await midi.init();
}
initMIDI();

// También reintentar al pulsar Start (gesto de usuario garantizado)
btnStart.addEventListener('click', () => {
  if (midi.supported && !midi.access) midi.init();
}, { once: false });


// ========== TEMA CLARO / OSCURO ==========
const btnTheme = document.getElementById('btn-theme');
const THEME_KEY = 'modsynth-theme';

function applyTheme(mode) {
  const light = mode === 'light';
  document.body.classList.toggle('theme-light', light);
  if (btnTheme) btnTheme.textContent = light ? '☀' : '☾';
  try { localStorage.setItem(THEME_KEY, light ? 'light' : 'dark'); } catch (e) {}
}

(function initTheme() {
  let mode = 'dark';
  try { mode = localStorage.getItem(THEME_KEY) || 'dark'; } catch (e) {}
  applyTheme(mode === 'light' ? 'light' : 'dark');
})();

btnTheme?.addEventListener('click', () => {
  const next = document.body.classList.contains('theme-light') ? 'dark' : 'light';
  applyTheme(next);
});

// Tutorial desde Acerca de
document.getElementById('btn-tutorial')?.addEventListener('click', () => {
  setAboutOpen(false);
  setHelpOpen(true);
});

// ========== DEMO PATCH (opcional) ==========
function loadDemo() {
  const kb = patch.createModule('keyboard', 40, 80);
  const vco = patch.createModule('vco', 320, 60);
  const adsr = patch.createModule('adsr', 320, 280);
  const vca = patch.createModule('vca', 560, 140);
  const out = patch.createModule('output', 780, 160);

  setTimeout(() => {
    if (!audioEngine.isRunning) return;
    patch.connect(kb.getPort('cv'), vco.getPort('freq'));
    patch.connect(kb.getPort('gate'), adsr.getPort('gate'));
    patch.connect(vco.getPort('out'), vca.getPort('in'));
    patch.connect(adsr.getPort('out'), vca.getPort('cv'));
    patch.connect(vca.getPort('out'), out.getPort('in'));
  }, 300);
}

// Mensaje inicial
console.log('%c Modular Synth listo ', 'background:#4fc3f7;color:#000;padding:4px 8px;border-radius:4px');
console.log('1. Pulsa START para iniciar el AudioContext');
console.log('2. Arrastra módulos desde la izquierda o clic derecho');
console.log('3. Conecta arrastrando de un socket a otro');
console.log('4. Teclas A-S-D-F-G-H-J / W-E-T-Y-U para el Keyboard');
console.log('5. MIDI: conecta un teclado y elige el dispositivo en la barra superior');
console.log('   Mapear CC desde consola: midi.mapCC(1, modulo, "frequency", 20, 12000)');

// Exponer para depuración / mapeo CC desde consola
document.getElementById('canvas-container')?.addEventListener('click', (e) => {
  if (e.target.id === 'canvas-container' || e.target.id === 'canvas-world' || e.target.id === 'wires-svg') {
    patch.clearSelection();
  }
});

window.modularSynth = { audioEngine, patch, midi, zoom: 1, setZoom };
