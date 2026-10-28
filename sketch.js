/**
 * Coca-Cola — «La Felicidad que se Contagia»
 * Experiencia interactiva tipográfica de arte generativo y animación.
 * JavaScript nativo, CSS y SVG. Sin dependencias externas
 */

(function () {
  'use strict';

  const svgNS = 'http://www.w3.org/2000/svg';

  // Elementos DOM
  const scene = document.getElementById('scene');
  const letterLayer = document.getElementById('letterLayer');
  const bubbleLayer = document.getElementById('bubbleLayer');
  const wordFormationLayer = document.getElementById('wordFormationLayer');
  const pencilCursor = document.getElementById('pencilCursor');
  const brandReveal = document.getElementById('brandReveal');
  const wordBackLayer = document.getElementById('wordBackLayer');
  const shadowLayer = document.getElementById('shadowLayer');
  const fizzCanvas = document.getElementById('fizzCanvas');
  const rootStyle = document.documentElement.style;

  // Estado global de la experiencia
  const gameState = {
    phase: 'DRAWING', // 'DRAWING' | 'EXPLORATION' | 'COLA_HOLD' | 'REVEAL'
    happiness: 0,
    explorationTime: 0,
    activeDragArm: null,
    pointerScreenX: -100,
    pointerScreenY: -100,
    pointerSceneX: -100,
    pointerSceneY: -100,
    lastPointerSceneX: -100,
    lastPointerSceneY: -100,
    facesDrawnCount: 0, // C empieza completa, O, L, A suman 3
    brandRevealed: false,
    colaCompleted: false,
    colaHoldTimer: 0,
    timidBubbleSpawnTimer: 7.0,
    totalLaughs: 0,
    heat: 0, // valor visual suavizado (0 crema → 1 rojo)
  };

  window.__gameState = gameState;

  // Utilidades matemáticas
  function clamp(val, min, max) {
    return Math.min(Math.max(val, min), max);
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function dist(x1, y1, x2, y2) {
    return Math.hypot(x2 - x1, y2 - y1);
  }

  function randomBetween(min, max) {
    return min + Math.random() * (max - min);
  }

  function createSvgElement(tag, attrs = {}) {
    const el = document.createElementNS(svgNS, tag);
    for (const [key, val] of Object.entries(attrs)) {
      el.setAttribute(key, val);
    }
    return el;
  }

  // Conversión milimétrica de coordenadas pantalla -> elemento SVG local mediante getScreenCTM inversa
  function screenToElement(el, clientX, clientY) {
    const pt = scene.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = el.getScreenCTM();
    if (!ctm) return { x: clientX, y: clientY };
    return pt.matrixTransform(ctm.inverse());
  }

  // Conversión de coordenadas pantalla -> SVG scene principal
  function screenToSvg(clientX, clientY) {
    return screenToElement(scene, clientX, clientY);
  }

  /* ==========================================================================
     SISTEMA DE AUDIO: IDENTIDAD SYNTH / OMNICHORD (WEB AUDIO API NATIVA)
     Atmósfera suave, etérea, brillante y ligeramente nostálgica
     ========================================================================== */
  class SoundEngine {
    constructor() {
      this.ctx = null;
      this.masterGain = null;
      this.compressor = null;
      this.isMuted = false;
      this.initialized = false;
      this.lastBubbleToneTime = 0;
    }

    init() {
      if (this.initialized) return;
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        this.ctx = new AudioCtx();

        // Compresor suave para redondear picos y mantener un clima cálido
        this.compressor = this.ctx.createDynamicsCompressor();
        this.compressor.threshold.setValueAtTime(-16, this.ctx.currentTime);
        this.compressor.knee.setValueAtTime(10, this.ctx.currentTime);
        this.compressor.ratio.setValueAtTime(3.5, this.ctx.currentTime);
        this.compressor.attack.setValueAtTime(0.01, this.ctx.currentTime);
        this.compressor.release.setValueAtTime(0.18, this.ctx.currentTime);

        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : 0.32, this.ctx.currentTime);

        this.compressor.connect(this.masterGain);
        this.masterGain.connect(this.ctx.destination);
        this.initialized = true;
      } catch (_) {}
    }

    resume() {
      this.init();
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
    }

    toggleMute() {
      this.isMuted = !this.isMuted;
      if (this.masterGain && this.ctx) {
        this.masterGain.gain.setTargetAtTime(this.isMuted ? 0 : 0.32, this.ctx.currentTime, 0.04);
      }
      return this.isMuted;
    }

    // Tono synth redondeado tipo Omnichord / mazo analógico filtrado
    playSynthNote(freq, startTime, duration = 0.4, volume = 0.28, type = 'sine') {
      if (!this.ctx || this.isMuted) return;
      try {
        const now = startTime || this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const filter = this.ctx.createBiquadFilter();

        osc.type = type;
        osc.frequency.setValueAtTime(freq, now);

        // Filtro paso bajo para timbre cálido y redondo
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1900, now);
        filter.frequency.exponentialRampToValueAtTime(650, now + duration);

        // Envolvente suave y cristalina
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(volume, now + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.compressor);

        osc.start(now);
        osc.stop(now + duration + 0.05);

        setTimeout(() => {
          try {
            osc.disconnect();
            filter.disconnect();
            gain.disconnect();
          } catch (_) {}
        }, (duration + 0.1) * 1000);
      } catch (_) {}
    }

    // Rasgo facial colocado: campanita cristalina ascendente
    playFeaturePlaced(index) {
      this.resume();
      const notes = [261.63, 349.23, 440.0, 523.25]; // C4, F4, A4, C5 (escala armónica)
      const f = notes[clamp(index - 1, 0, notes.length - 1)];
      this.playSynthNote(f, 0, 0.48, 0.3, 'triangle');
    }

    // Contacto con una burbuja: tono corto cristalino
    playBubblePop() {
      this.resume();
      if (!this.ctx) return;
      const freqs = [784.0, 880.0, 1046.5, 1174.7];
      const f = freqs[Math.floor(Math.random() * freqs.length)];
      this.playSynthNote(f, 0, 0.16, 0.15, 'sine');
    }

    // Deriva sutil de burbuja (muy discreto y espaciado)
    playBubbleDrift() {
      const now = performance.now();
      if (now - this.lastBubbleToneTime < 3400) return;
      this.lastBubbleToneTime = now;
      this.resume();
      const freqs = [523.25, 587.33, 659.25, 783.99];
      const f = freqs[Math.floor(Math.random() * freqs.length)];
      this.playSynthNote(f, 0, 0.28, 0.06, 'sine');
    }

    // Risa: secuencia melódica juguetona por personaje
    playLaughSequence(charId) {
      this.resume();
      if (!this.ctx || this.isMuted) return;
      const now = this.ctx.currentTime;
      const melodies = {
        C: [174.61, 220.0, 261.63, 349.23], // F3, A3, C4, F4
        O: [220.0, 261.63, 293.66, 392.0],  // A3, C4, D4, G4
        L: [261.63, 293.66, 349.23, 440.0], // C4, D4, F4, A4
        A: [293.66, 349.23, 392.0, 523.25], // D4, F4, G4, C5
      };
      const notes = melodies[charId] || melodies.O;
      notes.forEach((freq, i) => {
        this.playSynthNote(freq, now + i * 0.11, 0.35, 0.2, 'triangle');
      });
    }

    // Formación completa de COCA: progresión armónica brillante y cálida
    playColaCompleted() {
      this.resume();
      if (!this.ctx || this.isMuted) return;
      const now = this.ctx.currentTime;
      const chord = [261.63, 349.23, 440.0, 523.25, 698.46]; // C4, F4, A4, C5, F5
      chord.forEach((freq, i) => {
        this.playSynthNote(freq, now + i * 0.12, 1.5, 0.22, 'sine');
      });
    }

    // Revelación final del logo: acorde final cálido, amplio y delicado
    playLogoReveal() {
      this.resume();
      if (!this.ctx || this.isMuted) return;
      const now = this.ctx.currentTime;
      const finalChord = [174.61, 261.63, 349.23, 440.0, 523.25]; // F3, C4, F4, A4, C5
      finalChord.forEach((freq) => {
        this.playSynthNote(freq, now, 2.4, 0.18, 'sine');
      });
    }

    // Brillo en cadena de la palabra: arpegio cristalino ascendente (estilo Omnichord strum)
    playWordShimmer() {
      this.resume();
      if (!this.ctx || this.isMuted) return;
      const now = this.ctx.currentTime + 0.05;
      const strum = [523.25, 587.33, 698.46, 783.99, 880.0, 1046.5, 1174.66, 1396.91];
      strum.forEach((freq, i) => {
        this.playSynthNote(freq, now + i * 0.13, 0.9, 0.09, 'triangle');
      });
    }

    // Estallido en ola de la palabra antes del logo
    playRevealPop(step) {
      if (!this.ctx || this.isMuted) return;
      const scale = [698.46, 783.99, 880.0, 1046.5, 1174.66, 1396.91, 1567.98];
      const f = scale[step % scale.length];
      this.playSynthNote(f, 0, 0.14, 0.07, 'sine');
    }
  }

  const soundEngine = new SoundEngine();

  /* ==========================================================================
     PALABRA «Coca» EN BURBUJAS — EMPAQUETADO DE CÍRCULOS SOBRE TIPOGRAFÍA SCRIPT
     La palabra se rasteriza con Lobster en un canvas oculto, se calcula un
     mapa de distancias al borde y se colocan burbujas de mayor a menor radio
     para que rellenen el trazo como un letrero de efervescencia.
     ========================================================================== */
  const WORD_CONFIG = {
    text: 'Coca',
    font: 'Lobster',
    width: 780,        // ancho de la palabra en unidades de escena
    centerX: 720,
    centerY: 228,
    minR: 4.4,
    maxR: 19,
    gap: 1.6,
    maxCount: 240,
  };

  const colaTargetPoints = []; // se llena cuando la tipografía está cargada
  const wordBounds = { minX: 520, maxX: 920, minY: 120, maxY: 340, ready: false };

  function buildWordTargets() {
    const cfg = WORD_CONFIG;
    const cvs = document.createElement('canvas');
    const ctx = cvs.getContext('2d', { willReadFrequently: true });

    ctx.font = `200px ${cfg.font}`;
    const probe = ctx.measureText(cfg.text);
    const fontSize = (200 * cfg.width) / probe.width;
    const font = `${fontSize.toFixed(1)}px ${cfg.font}`;
    ctx.font = font;
    const m = ctx.measureText(cfg.text);

    const asc = m.actualBoundingBoxAscent;
    const desc = m.actualBoundingBoxDescent;
    const left = m.actualBoundingBoxLeft;
    const right = m.actualBoundingBoxRight;
    const pad = 8;
    const w = Math.ceil(left + right + pad * 2);
    const h = Math.ceil(asc + desc + pad * 2);
    cvs.width = w;
    cvs.height = h;
    ctx.font = font;
    ctx.fillStyle = '#000';
    ctx.fillText(cfg.text, pad + left, pad + asc);

    // Origen del canvas en coordenadas de escena
    const ox = cfg.centerX - w / 2;
    const oy = cfg.centerY - h / 2;

    // Máscara de tinta
    const data = ctx.getImageData(0, 0, w, h).data;
    const n = w * h;
    const dt = new Float32Array(n);
    const INF = 1e6;
    for (let i = 0; i < n; i++) dt[i] = data[i * 4 + 3] > 127 ? INF : 0;

    // Transformada de distancia (chaflán 3-4) en dos pasadas
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (dt[i] === 0) continue;
        let v = dt[i];
        if (x > 0) v = Math.min(v, dt[i - 1] + 3);
        if (y > 0) {
          v = Math.min(v, dt[i - w] + 3);
          if (x > 0) v = Math.min(v, dt[i - w - 1] + 4);
          if (x < w - 1) v = Math.min(v, dt[i - w + 1] + 4);
        }
        dt[i] = v;
      }
    }
    for (let y = h - 1; y >= 0; y--) {
      for (let x = w - 1; x >= 0; x--) {
        const i = y * w + x;
        if (dt[i] === 0) continue;
        let v = dt[i];
        if (x < w - 1) v = Math.min(v, dt[i + 1] + 3);
        if (y < h - 1) {
          v = Math.min(v, dt[i + w] + 3);
          if (x < w - 1) v = Math.min(v, dt[i + w + 1] + 4);
          if (x > 0) v = Math.min(v, dt[i + w - 1] + 4);
        }
        dt[i] = v;
      }
    }

    // Candidatos ordenados por profundidad (los centros del trazo primero)
    const candidates = [];
    for (let y = 1; y < h - 1; y += 2) {
      for (let x = 1; x < w - 1; x += 2) {
        const d = dt[y * w + x] / 3;
        if (d >= cfg.minR + 0.8) candidates.push({ x, y, d: d + Math.random() * 0.6 });
      }
    }
    candidates.sort((a, b) => b.d - a.d);

    // Empaquetado voraz con rejilla espacial
    const cell = cfg.maxR * 2 + cfg.gap;
    const grid = new Map();
    const placed = [];
    const key = (gx, gy) => gx * 10007 + gy;
    for (const c of candidates) {
      if (placed.length >= cfg.maxCount) break;
      const r = Math.min(c.d - 0.8, cfg.maxR) * randomBetween(0.86, 1);
      if (r < cfg.minR) continue;
      const gx = Math.floor(c.x / cell);
      const gy = Math.floor(c.y / cell);
      let ok = true;
      for (let ix = gx - 1; ix <= gx + 1 && ok; ix++) {
        for (let iy = gy - 1; iy <= gy + 1 && ok; iy++) {
          const list = grid.get(key(ix, iy));
          if (!list) continue;
          for (const p of list) {
            if (Math.hypot(p.x - c.x, p.y - c.y) < p.r + r + cfg.gap) {
              ok = false;
              break;
            }
          }
        }
      }
      if (!ok) continue;
      const p = { x: c.x, y: c.y, r };
      placed.push(p);
      const k = key(gx, gy);
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k).push(p);
    }

    // Puntos objetivo en escena, ordenados de izquierda a derecha (la palabra se "escribe")
    placed.sort((a, b) => a.x - b.x);
    colaTargetPoints.length = 0;
    for (const p of placed) {
      colaTargetPoints.push({ x: ox + p.x, y: oy + p.y, r: p.r, filled: false, bubble: null });
    }

    wordBounds.minX = ox + pad;
    wordBounds.maxX = ox + w - pad;
    wordBounds.minY = oy + pad;
    wordBounds.maxY = oy + h - pad;
    wordBounds.ready = true;

    // Guía tenue + resplandor (detrás de las burbujas)
    const textX = ox + pad + left;
    const textY = oy + pad + asc;
    const makeWordText = (cls) => {
      const t = createSvgElement('text', { class: cls, x: textX.toFixed(1), y: textY.toFixed(1), 'font-size': fontSize.toFixed(1) });
      t.textContent = cfg.text;
      return t;
    };
    wordBackLayer.replaceChildren(makeWordText('word-glow'), makeWordText('word-ghost'));

    // Floritura tipo cinta bajo la palabra + destellos (delante)
    const x0 = wordBounds.minX + 70;
    const x1 = wordBounds.maxX + 30;
    const yb = wordBounds.maxY + 6;
    const span = x1 - x0;
    const swash = createSvgElement('path', {
      class: 'word-swash',
      pathLength: 1,
      d: `M ${x0} ${yb + 6} C ${x0 + span * 0.28} ${yb + 40}, ${x0 + span * 0.55} ${yb - 4}, ${x0 + span * 0.78} ${yb - 14} S ${x1} ${yb - 46}, ${x1 + 12} ${yb - 70}`,
    });
    wordFormationLayer.replaceChildren(swash);

    const sparkles = [
      { x: wordBounds.minX + 12, y: wordBounds.minY + 10, s: 34, d: 0.9 },
      { x: wordBounds.maxX - 6, y: wordBounds.minY + 52, s: 26, d: 1.15 },
      { x: x1 + 14, y: yb - 92, s: 20, d: 1.5 },
      { x: (wordBounds.minX + wordBounds.maxX) * 0.5 + 40, y: wordBounds.minY - 4, s: 18, d: 1.3 },
    ];
    for (const sp of sparkles) {
      const use = createSvgElement('use', {
        href: '#sparkle',
        class: 'word-sparkle',
        x: sp.x - sp.s / 2,
        y: sp.y - sp.s / 2,
        width: sp.s,
        height: sp.s,
        style: `--d: ${sp.d}s`,
      });
      wordFormationLayer.appendChild(use);
    }
  }

  function initWordTargets() {
    const run = () => {
      try {
        buildWordTargets();
      } catch (err) {
        console.error('No se pudo construir la palabra de burbujas', err);
      }
    };
    if (document.fonts && document.fonts.load) {
      document.fonts
        .load(`200px ${WORD_CONFIG.font}`, WORD_CONFIG.text)
        .then(run, run);
    } else {
      run();
    }
  }

  /* ==========================================================================
     CLASE ARM (BRAZOS ORGÁNICOS CON GRAB OFFSET Y CINEMÁTICA ELÁSTICA)
     ========================================================================== */
  class Arm {
    constructor(owner, side, shoulderLocal, restLocal) {
      this.owner = owner;
      this.side = side; // 'left' | 'right'
      this.shoulder = { ...shoulderLocal };
      this.rest = { ...restLocal };
      this.hand = { ...restLocal };
      this.vx = 0;
      this.vy = 0;
      this.isDragging = false;
      this.grabOffsetX = 0;
      this.grabOffsetY = 0;
      this.growth = owner.id === 'C' ? 1 : 0;
      this.maxReach = 650; // Alcance generoso para tocar con comodidad a los vecinos

      // Elementos SVG
      this.group = createSvgElement('g', {
        class: 'arm-group',
        style: `opacity: ${this.growth};`,
      });
      this.stroke = createSvgElement('path', { class: 'arm-stroke' });
      this.shoulderCircle = createSvgElement('circle', {
        class: 'arm-shoulder',
        cx: this.shoulder.x,
        cy: this.shoulder.y,
        r: 13,
      });

      // Mano estilizada tipo guante de caricatura con pulgar orgánico
      this.handGroup = createSvgElement('g', { class: 'hand-group' });
      this.handGlove = createSvgElement('path', {
        class: 'hand-glove',
        d:
          this.side === 'left'
            ? 'M -6 -18 C 4 -18, 14 -10, 14 2 C 14 14, 4 20, -6 20 C -16 20, -22 12, -22 2 C -22 -4, -18 -10, -12 -12 C -20 -15, -20 -6, -14 0 Z'
            : 'M 6 -18 C -4 -18, -14 -10, -14 2 C -14 14, -4 20, 6 20 C 16 20, 22 12, 22 2 C 22 -4, 18 -10, 12 -12 C 20 -15, 20 -6, 14 0 Z',
      });
      this.handGroup.appendChild(this.handGlove);

      // Hitboxes amplias para agarre fluido y accesible
      this.hitbox = createSvgElement('path', { class: 'arm-hitbox' });
      this.handHitbox = createSvgElement('circle', {
        class: 'hand-hitbox',
        cx: this.rest.x,
        cy: this.rest.y,
        r: 38,
      });

      this.group.append(this.shoulderCircle, this.stroke, this.handGroup, this.hitbox, this.handHitbox);

      this.setupEvents();
      this.render();
    }

    setupEvents() {
      const onPointerDown = (e) => {
        if (this.growth < 0.95 || this.owner.face.placedCount < 3 || gameState.phase === 'REVEAL') return;
        e.preventDefault();
        e.stopPropagation();

        this.isDragging = true;
        gameState.activeDragArm = this;

        // Calcular grab offset para que la mano NO salte al hacer clic
        const scenePt = screenToSvg(e.clientX, e.clientY);
        const localPointerX = (scenePt.x - this.owner.x) / this.owner.scale;
        const localPointerY = (scenePt.y - this.owner.y) / this.owner.scale;

        this.grabOffsetX = this.hand.x - localPointerX;
        this.grabOffsetY = this.hand.y - localPointerY;

        try {
          this.handHitbox.setPointerCapture(e.pointerId);
        } catch (_) {}

        this.dragPointerId = e.pointerId;
        this.updateDragPosition(e.clientX, e.clientY);
      };

      const onPointerMove = (e) => {
        if (!this.isDragging || e.pointerId !== this.dragPointerId) return;
        e.preventDefault();
        if (this.owner.face.placedCount < 3) {
          this.endDrag();
          return;
        }
        this.updateDragPosition(e.clientX, e.clientY);
      };

      const onPointerUp = (e) => {
        if (!this.isDragging || (this.dragPointerId !== undefined && e.pointerId !== this.dragPointerId)) return;
        this.endDrag();
      };

      this.handHitbox.addEventListener('pointerdown', onPointerDown);
      this.hitbox.addEventListener('pointerdown', onPointerDown);

      window.addEventListener('pointermove', onPointerMove, { passive: false });
      window.addEventListener('pointerup', onPointerUp);
      window.addEventListener('pointercancel', onPointerUp);
    }

    updateDragPosition(clientX, clientY) {
      const scenePt = screenToSvg(clientX, clientY);
      // Aplicar grab offset para estabilidad absoluta
      const rawTargetX = (scenePt.x - this.owner.x) / this.owner.scale + (this.grabOffsetX || 0);
      const rawTargetY = (scenePt.y - this.owner.y) / this.owner.scale + (this.grabOffsetY || 0);

      // Calcular distancia y limitar con tensión elástica suave tipo goma
      const d = dist(this.shoulder.x, this.shoulder.y, rawTargetX, rawTargetY);
      if (d > this.maxReach) {
        const excess = d - this.maxReach;
        const dampedExcess = excess * 0.18; // Resistencia elástica
        const finalD = this.maxReach + dampedExcess;
        const angle = Math.atan2(rawTargetY - this.shoulder.y, rawTargetX - this.shoulder.x);
        this.hand.x = this.shoulder.x + Math.cos(angle) * finalD;
        this.hand.y = this.shoulder.y + Math.sin(angle) * finalD;
      } else {
        this.hand.x = rawTargetX;
        this.hand.y = rawTargetY;
      }

      this.render();
      checkTickles(); // Notificación inmediata de movimiento para cosquillas
    }

    endDrag() {
      if (!this.isDragging) return;
      this.isDragging = false;
      if (gameState.activeDragArm === this) {
        gameState.activeDragArm = null;
      }
      try {
        if (this.dragPointerId !== undefined) {
          this.handHitbox.releasePointerCapture(this.dragPointerId);
        }
      } catch (_) {}
      this.dragPointerId = undefined;

      // Impulso inicial de retorno elástico con muelle
      this.vx = (this.rest.x - this.hand.x) * 4.5;
      this.vy = (this.rest.y - this.hand.y) * 4.5;

      // Reset de tracking de cosquillas en los personajes
      for (const char of characters) {
        char.resetTickleTracking();
      }
    }

    getGlobalHandPoint() {
      return {
        x: this.owner.x + this.hand.x * this.owner.scale,
        y: this.owner.y + this.hand.y * this.owner.scale,
      };
    }

    update(dt) {
      // Crecimiento animado desde los hombros al despertar
      if (this.growth < 1 && this.owner.awakened) {
        this.growth = clamp(this.growth + dt * 2.4, 0, 1);
        this.group.style.opacity = String(this.growth);
      }

      // Física de muelle oscilante al soltar el brazo
      if (!this.isDragging) {
        const k = 175; // Rigidez del resorte
        const damping = 13; // Amortiguamiento
        const ax = (this.rest.x - this.hand.x) * k - this.vx * damping;
        const ay = (this.rest.y - this.hand.y) * k - this.vy * damping;

        this.vx += ax * dt;
        this.vy += ay * dt;

        this.hand.x += this.vx * dt;
        this.hand.y += this.vy * dt;

        if (dist(this.hand.x, this.hand.y, this.rest.x, this.rest.y) < 0.25 && Math.hypot(this.vx, this.vy) < 0.5) {
          this.hand.x = this.rest.x;
          this.hand.y = this.rest.y;
          this.vx = 0;
          this.vy = 0;
        }
      }

      this.render();
    }

    render() {
      const curHandX = lerp(this.shoulder.x, this.hand.x, this.growth);
      const curHandY = lerp(this.shoulder.y, this.hand.y, this.growth);

      // Curva Bézier orgánica con relajación natural y codo sutil
      const midX = (this.shoulder.x + curHandX) * 0.5;
      const midY = (this.shoulder.y + curHandY) * 0.5;
      const d = dist(this.shoulder.x, this.shoulder.y, curHandX, curHandY);
      const sag = Math.max(10, 42 - d * 0.1);
      const sideOffset = this.side === 'left' ? -28 : 28;

      const ctrlX = midX + sideOffset * (1 - clamp(d / this.maxReach, 0, 0.75));
      const ctrlY = midY + sag;

      const pathData = `M ${this.shoulder.x} ${this.shoulder.y} Q ${ctrlX} ${ctrlY} ${curHandX} ${curHandY}`;
      this.stroke.setAttribute('d', pathData);
      this.hitbox.setAttribute('d', pathData);

      // Orientación y posición de la mano
      const angleRad = Math.atan2(curHandY - ctrlY, curHandX - ctrlX);
      const angleDeg = (angleRad * 180) / Math.PI;

      this.handGroup.setAttribute(
        'transform',
        `translate(${curHandX} ${curHandY}) rotate(${angleDeg + (this.side === 'left' ? 24 : -24)}) scale(${this.growth})`
      );

      this.handHitbox.setAttribute('cx', curHandX);
      this.handHitbox.setAttribute('cy', curHandY);
    }
  }

  /* ==========================================================================
     CLASE FACE (ROSTROS, COLOCACIÓN EXACTA Y MIRADAS ENTRE PERSONAJES)
     ========================================================================== */
  class Face {
    constructor(owner, defaultSpecs) {
      this.owner = owner;
      this.specs = defaultSpecs;
      this.group = createSvgElement('g', { class: 'face-group' });

      // Estado de colocación de rasgos (0 = vacío, 1 = ojo 1, 2 = ojo 2, 3 = cara completa)
      this.placedCount = owner.id === 'C' ? 3 : 0;

      // Ojos con pupilas expresivas
      this.leftEye = this.createEye('left', defaultSpecs.leftEye);
      this.rightEye = this.createEye('right', defaultSpecs.rightEye);

      // Boca
      this.mouthGroup = createSvgElement('g', { class: 'mouth' });
      this.mouthLine = createSvgElement('path', { class: 'mouth-line' });

      // Boca de risa abierta con lengua contrastada
      this.mouthLaughGroup = createSvgElement('g', { class: 'mouth-laugh-group', style: 'display: none;' });
      this.mouthLaughBg = createSvgElement('path', {
        class: 'mouth-laugh-bg',
        d: 'M -28 -6 Q 0 44 28 -6 Z',
      });
      this.mouthTongue = createSvgElement('path', {
        class: 'mouth-tongue',
        d: 'M -16 18 Q 0 8 16 18 Q 0 34 -16 18 Z',
      });
      this.mouthLaughGroup.append(this.mouthLaughBg, this.mouthTongue);

      // Mejillas sonrojadas que aparecen al reír
      const cheekL = createSvgElement('ellipse', { class: 'cheek', cx: -46, cy: -14, rx: 15, ry: 9 });
      const cheekR = createSvgElement('ellipse', { class: 'cheek', cx: 46, cy: -14, rx: 15, ry: 9 });

      this.mouthGroup.append(cheekL, cheekR, this.mouthLine, this.mouthLaughGroup);

      this.mouthPos = { ...defaultSpecs.mouth };
      this.mouthGroup.setAttribute('transform', `translate(${this.mouthPos.x} ${this.mouthPos.y})`);

      this.group.append(this.leftEye.group, this.rightEye.group, this.mouthGroup);

      // Sistema de atención y miradas intencionales entre personajes
      this.lookTarget = null; // { x, y, priority, timer }

      this.updateVisibility();
      this.setMouthMode(owner.id === 'C' ? 'sad' : 'neutral');
    }

    createEye(side, pos) {
      const eyeGroup = createSvgElement('g', {
        class: 'eye',
        transform: `translate(${pos.x} ${pos.y})`,
      });

      // Base ocular blanca
      const base = createSvgElement('ellipse', {
        class: 'eye-base',
        cx: 0,
        cy: 0,
        rx: 24,
        ry: 19,
      });

      // Pupila ampliada para mayor expresividad
      const pupilGroup = createSvgElement('g', { class: 'pupil-group' });
      const pupil = createSvgElement('ellipse', {
        class: 'eye-pupil',
        cx: 0,
        cy: 0,
        rx: 10.5,
        ry: 13.5,
      });
      const glint = createSvgElement('circle', {
        class: 'eye-glint',
        cx: -3.2,
        cy: -3.8,
        r: 3.2,
      });
      pupilGroup.append(pupil, glint);

      const blinkLid = createSvgElement('path', {
        class: 'eye-closed-lid',
        d: 'M -22 0 Q 0 -11 22 0',
        style: 'display: none;',
      });

      const hitbox = createSvgElement('circle', {
        class: 'eye-hitbox',
        cx: 0,
        cy: 0,
        r: 28,
      });

      eyeGroup.append(base, pupilGroup, blinkLid, hitbox);

      const eyeObj = {
        side,
        group: eyeGroup,
        base,
        pupilGroup,
        pupil,
        blinkLid,
        hitbox,
        pos: { ...pos },
        curPupilX: 0,
        curPupilY: 0,
        isBlinking: false,
        blinkTimer: 0,
      };

      // Clic directo sobre el ojo para parpadeo interactivo
      hitbox.addEventListener('pointerdown', (e) => {
        if (this.placedCount < (side === 'left' ? 1 : 2)) return;
        e.stopPropagation();
        this.triggerBlink(eyeObj, 0.22);
      });

      return eyeObj;
    }

    triggerBlink(eye, duration = 0.2) {
      eye.isBlinking = true;
      eye.blinkTimer = duration;
      eye.pupilGroup.style.display = 'none';
      eye.base.style.display = 'none';
      eye.blinkLid.style.display = 'block';
    }

    setMouthMode(mode) {
      this.mouthMode = mode;
      if (mode === 'laugh') {
        this.mouthLine.style.display = 'none';
        this.mouthLaughGroup.style.display = 'block';
      } else {
        this.mouthLaughGroup.style.display = 'none';
        this.mouthLine.style.display = 'block';
        const presets = {
          sad: 'M -24 10 Q 0 -10 24 10',
          neutral: 'M -22 2 Q 0 6 22 2',
          smile: 'M -24 -2 Q 0 24 24 -2',
        };
        this.mouthLine.setAttribute('d', presets[mode] || presets.smile);
      }
    }

    // Mirada dirigida hacia un objetivo en coordenadas de escena SVG
    setLookTarget(targetX, targetY, priority = 1, duration = 1.4) {
      if (this.owner.isLaughing) return; // La animación de risa propia tiene máxima prioridad
      if (!this.lookTarget || priority >= this.lookTarget.priority) {
        this.lookTarget = { x: targetX, y: targetY, priority, timer: duration };
      }
    }

    // Colocación milimétrica: el rasgo aparece exactamente donde señala la punta visible del lápiz
    addFeatureAt(localX, localY) {
      // Si es la O, comprobar que el clic no sea dentro del hueco interior
      if (this.owner.id === 'O') {
        const dx = (localX - 200) / 55;
        const dy = (localY - 265) / 85;
        if (dx * dx + dy * dy < 1.0) return; // Dentro del hueco, ignorar
      }

      if (this.placedCount === 0) {
        // Primer clic: Ojo 1 exactamente en la posición de la punta del lápiz
        this.leftEye.pos.x = localX;
        this.leftEye.pos.y = localY;
        this.leftEye.group.setAttribute('transform', `translate(${localX} ${localY})`);
        this.placedCount = 1;
        this.updateVisibility();
        this.triggerBlink(this.leftEye, 0.16);
        soundEngine.playFeaturePlaced(1);
      } else if (this.placedCount === 1) {
        // Segundo clic: Ojo 2 exactamente en la posición elegida
        this.rightEye.pos.x = localX;
        this.rightEye.pos.y = localY;
        this.rightEye.group.setAttribute('transform', `translate(${localX} ${localY})`);
        this.placedCount = 2;
        this.updateVisibility();
        this.triggerBlink(this.rightEye, 0.16);
        soundEngine.playFeaturePlaced(2);
      } else if (this.placedCount === 2) {
        // Tercer clic: Boca centrada en la posición elegida
        this.mouthPos.x = localX;
        this.mouthPos.y = localY - 10;
        this.mouthGroup.setAttribute('transform', `translate(${this.mouthPos.x} ${this.mouthPos.y})`);
        this.placedCount = 3;
        this.updateVisibility();
        this.setMouthMode('smile');
        soundEngine.playFeaturePlaced(3);
        this.owner.awaken();
      }
    }

    updateVisibility() {
      this.leftEye.group.style.display = this.placedCount >= 1 ? 'block' : 'none';
      this.rightEye.group.style.display = this.placedCount >= 2 ? 'block' : 'none';
      this.mouthGroup.style.display = this.placedCount >= 3 ? 'block' : 'none';
    }

    update(dt) {
      // Actualizar temporizador de mirada intencional
      if (this.lookTarget) {
        this.lookTarget.timer -= dt;
        if (this.lookTarget.timer <= 0) {
          this.lookTarget = null;
        }
      }

      const updateSingleEye = (eye) => {
        if (eye.isBlinking) {
          eye.blinkTimer -= dt;
          if (eye.blinkTimer <= 0) {
            eye.isBlinking = false;
            eye.pupilGroup.style.display = 'block';
            eye.base.style.display = 'block';
            eye.blinkLid.style.display = 'none';
          }
        }

        // Si la letra está riendo, ojos entrecerrados en arco feliz (máxima prioridad)
        if (this.owner.isLaughing) {
          eye.pupilGroup.style.display = 'none';
          eye.base.style.display = 'none';
          eye.blinkLid.style.display = 'block';
          return;
        }

        if (eye.isBlinking) return;

        // Posición global actual del ojo en coordenadas de escena SVG
        const eyePt = scene.createSVGPoint();
        eyePt.x = 0;
        eyePt.y = 0;
        const eyeScreen = eyePt.matrixTransform(eye.group.getScreenCTM());
        const eyeScene = eyeScreen.matrixTransform(scene.getScreenCTM().inverse());

        const maxRx = 8.5;
        const maxRy = 4.5;
        let targetPx = 0;
        let targetPy = 0;

        if (this.lookTarget) {
          const dx = this.lookTarget.x - eyeScene.x;
          const dy = this.lookTarget.y - eyeScene.y;
          const d = Math.hypot(dx, dy);
          if (d > 1) {
            const angle = Math.atan2(dy, dx);
            const factor = Math.min(d / 200, 1);
            targetPx = Math.cos(angle) * maxRx * factor;
            targetPy = Math.sin(angle) * maxRy * factor;
          }
        } else {
          // Mirada de reposo natural con sutil micro-respiración orgánica (no clavada al ratón)
          targetPx = Math.sin(this.owner.animTime * 0.7 + this.owner.id.charCodeAt(0)) * 2.2;
          targetPy = Math.cos(this.owner.animTime * 0.5) * 1.0;
        }

        // Clamping estricto: la pupila jamás sale del contorno blanco
        targetPx = clamp(targetPx, -maxRx, maxRx);
        targetPy = clamp(targetPy, -maxRy, maxRy);

        eye.curPupilX = lerp(eye.curPupilX, targetPx, dt * 7);
        eye.curPupilY = lerp(eye.curPupilY, targetPy, dt * 7);

        eye.pupilGroup.setAttribute('transform', `translate(${eye.curPupilX.toFixed(2)} ${eye.curPupilY.toFixed(2)})`);
      };

      if (this.placedCount >= 1) updateSingleEye(this.leftEye);
      if (this.placedCount >= 2) updateSingleEye(this.rightEye);
    }
  }

  /* ==========================================================================
     CLASE LETTERCHARACTER (COLOR PROGRESIVO GRIS -> ROJO, COSQUILLAS Y RISAS)
     ========================================================================== */
  class LetterCharacter {
    constructor(spec) {
      this.id = spec.id;
      this.baseX = spec.x;
      this.baseY = spec.y;
      this.x = spec.x;
      this.y = spec.y;
      this.baseScale = spec.scale;
      this.scale = spec.scale;
      this.viewBox = spec.viewBox;
      this.width = spec.viewBox.w;
      this.height = spec.viewBox.h;
      this.awakened = spec.id === 'C';
      this.isLaughing = false;
      this.laughTimer = 0;
      this.animTime = Math.random() * 10;

      // Color individual: inicia en 0 (gris) y transiciona al rojo Coca-Cola al reír
      this.redProgress = 0;
      this.targetRedProgress = 0;

      // Estado emocional específico de C ('sad' | 'curious' | 'content' | 'laughing')
      this.cEmotion = spec.id === 'C' ? 'sad' : 'neutral';

      // Tracking robusto de cosquillas basado en vaivén (strokes de ida y vuelta)
      this.lastTickleHandX = null;
      this.lastTickleHandY = null;
      this.strokeDistance = 0;
      this.strokeDir = 0; // -1 = izquierda, +1 = derecha
      this.tickleStimulus = 0;
      this.lastTickleTime = 0;

      // Grupo raíz del personaje
      this.root = createSvgElement('g', {
        class: `character ${this.awakened ? (this.id === 'C' ? 'sad' : 'happy') : ''}`,
        id: `char-${this.id}`,
      });

      // Contenedor del SVG original de la letra
      this.bodySvg = createSvgElement('svg', {
        class: 'letter-body',
        viewBox: `0 0 ${spec.viewBox.w} ${spec.viewBox.h}`,
        width: spec.viewBox.w,
        height: spec.viewBox.h,
      });

      // Elemento de texto con la tipografía original Cooper Black
      this.glyphText = createSvgElement('text', {
        class: 'cls-1',
        transform: `translate(${spec.textTransform.x} ${spec.textTransform.y})`,
      });
      const tspan = createSvgElement('tspan', { x: 0, y: 0 });
      tspan.textContent = this.id;
      this.glyphText.appendChild(tspan);

      // Capa de brillo tipo vidrio de botella (aparece a medida que la letra se pone roja)
      this.glossText = createSvgElement('text', {
        class: 'glyph-gloss',
        transform: `translate(${spec.textTransform.x} ${spec.textTransform.y})`,
        opacity: 0,
      });
      const glossSpan = createSvgElement('tspan', { x: 0, y: 0 });
      glossSpan.textContent = this.id;
      this.glossText.appendChild(glossSpan);

      this.bodySvg.append(this.glyphText, this.glossText);

      // Sombra de contacto en el suelo
      this.shadow = createSvgElement('ellipse', { class: 'char-shadow', rx: 100, ry: 11 });
      shadowLayer.appendChild(this.shadow);

      // Rostro
      this.face = new Face(this, spec.faceSpecs);

      // Brazos (izquierdo y derecho)
      this.leftArm = new Arm(this, 'left', spec.armSpecs.leftShoulder, spec.armSpecs.leftRest);
      this.rightArm = new Arm(this, 'right', spec.armSpecs.rightShoulder, spec.armSpecs.rightRest);

      // Jerarquía visual ordenada
      this.root.append(this.bodySvg, this.leftArm.group, this.rightArm.group, this.face.group);
      letterLayer.appendChild(this.root);

      this.updateTransform();
      this.setupDrawingInteraction();

      // Aplicar color gris neutro inicial
      this.applyColor();
    }

    applyColor() {
      // Gris neutro cálido: rgb(125, 120, 118) -> Rojo Coca-Cola: rgb(244, 0, 9)
      const t = this.redProgress;
      const r = Math.round(lerp(125, 244, t));
      const g = Math.round(lerp(120, 0, Math.pow(t, 0.8)));
      const b = Math.round(lerp(118, 9, Math.pow(t, 0.8)));
      this.glyphText.style.setProperty('--char-fill', `rgb(${r}, ${g}, ${b})`);
      this.glossText.setAttribute('opacity', (0.25 + t * 0.75).toFixed(2));
    }

    setupDrawingInteraction() {
      const handleDraw = (e) => {
        if (this.awakened && this.face.placedCount >= 3) return;
        if (gameState.phase !== 'DRAWING') return;

        e.preventDefault();
        e.stopPropagation();

        const localPt = screenToElement(this.face.group, e.clientX, e.clientY);
        const localX = localPt.x;
        const localY = localPt.y;

        if (localX < 15 || localX > this.width - 15 || localY < 20 || localY > this.height - 20) return;

        this.face.addFeatureAt(localX, localY);
      };

      this.glyphText.addEventListener('pointerdown', handleDraw);
      this.bodySvg.addEventListener('pointerdown', handleDraw);
    }

    isPointerOverDrawable(screenX, screenY) {
      if (this.awakened && this.face.placedCount >= 3) return false;
      const localPt = screenToElement(this.face.group, screenX, screenY);
      const localX = localPt.x;
      const localY = localPt.y;
      if (localX < 15 || localX > this.width - 15 || localY < 20 || localY > this.height - 20) return false;
      if (this.id === 'O') {
        const dx = (localX - 200) / 55;
        const dy = (localY - 265) / 85;
        if (dx * dx + dy * dy < 1.0) return false;
      }
      return true;
    }

    awaken() {
      this.awakened = true;
      this.root.classList.remove('sad');
      this.root.classList.add('happy');
      gameState.facesDrawnCount += 1;
      gameState.happiness = clamp(gameState.happiness + 0.35, 0, 3.0);

      this.face.triggerBlink(this.face.leftEye, 0.25);
      this.face.triggerBlink(this.face.rightEye, 0.25);

      // Actualizar contagio emocional hacia C según progreso de otras letras
      updateCEmotionState();

      // Si todas las caras están completas, pasar a exploración libre
      const allDone = characters.every((c) => c.face.placedCount >= 3);
      if (allDone) {
        setTimeout(() => {
          if (gameState.phase === 'DRAWING') {
            gameState.phase = 'EXPLORATION';
            pencilCursor.classList.remove('visible');
            pencilCursor.classList.add('hidden');
          }
        }, 1200);
      }
    }

    // Zona de cosquillas: silueta completa visible con margen generoso
    containsTicklePoint(globalX, globalY) {
      const localX = (globalX - this.x) / this.scale;
      const localY = (globalY - this.y) / this.scale;
      return (
        localX >= -25 &&
        localX <= this.width + 25 &&
        localY >= 20 &&
        localY <= this.height + 25
      );
    }

    // Detector de cosquillas por vaivén (strokes de ida y vuelta con ratón humano)
    registerTickleMove(handX, handY) {
      const now = performance.now();
      if (this.lastTickleHandX === null || this.lastTickleHandX === undefined) {
        this.lastTickleHandX = handX;
        this.lastTickleHandY = handY;
        this.strokeDistance = 0;
        this.strokeDir = 0;
        return;
      }

      const dx = handX - this.lastTickleHandX;
      const dy = handY - this.lastTickleHandY;
      const stepDist = Math.hypot(dx, dy);

      if (stepDist < 2) return; // Filtrar micro-ruido de ratón

      const dir = dx > 0 ? 1 : -1;

      if (this.strokeDir === 0) {
        this.strokeDir = dir;
        this.strokeDistance = stepDist;
      } else if (dir === this.strokeDir) {
        this.strokeDistance += stepDist;
      } else {
        // ¡Cambio de sentido (inversión de vaivén)!
        // Si el recorrido anterior fue de al menos 14px, computar un ciclo válido
        if (this.strokeDistance >= 14) {
          this.tickleStimulus += 1.0;
          this.lastTickleTime = now;
        }
        this.strokeDir = dir;
        this.strokeDistance = stepDist;
      }

      this.lastTickleHandX = handX;
      this.lastTickleHandY = handY;

      // Umbral accesible: tras 2 vaivenes (ida y vuelta), ¡la letra objetivo empieza a reír!
      if (this.tickleStimulus >= 1.8 && !this.isLaughing) {
        this.startLaugh();
      }
    }

    resetTickleTracking() {
      this.lastTickleHandX = null;
      this.strokeDir = 0;
      this.strokeDistance = 0;
    }

    startLaugh() {
      this.isLaughing = true;
      this.tickleStimulus = 1.2; // Mantener tibio mientras continúa el vaivén
      gameState.totalLaughs += 1;
      gameState.happiness = clamp(gameState.happiness + 0.35, 0, 3.2);

      // Transición individual hacia el rojo Coca-Cola
      this.targetRedProgress = 1.0;

      // Si es C, pasa a risa activa
      if (this.id === 'C') {
        this.cEmotion = 'laughing';
        this.root.classList.remove('sad');
        this.root.classList.add('happy');
      }

      const durations = { C: 2.2, O: 1.8, L: 1.4, A: 1.8 };
      this.laughTimer = durations[this.id] || 1.8;

      this.face.setMouthMode('laugh');
      this.root.classList.add('laughing');
      document.body.classList.add('word-started');
      this.spawnLaughBubbles();

      // Reproducir melodía synth Omnichord característica de la letra
      soundEngine.playLaughSequence(this.id);

      // Las demás letras giran la mirada hacia el personaje que está riéndose
      notifyNeighborLaughing(this);
    }

    spawnLaughBubbles() {
      // Posición global exacta de la boca mediante CTM
      const mouthPt = scene.createSVGPoint();
      mouthPt.x = 0;
      mouthPt.y = 14;
      const mouthScreen = mouthPt.matrixTransform(this.face.mouthGroup.getScreenCTM());
      const mouthScene = mouthScreen.matrixTransform(scene.getScreenCTM().inverse());
      const mouthGlobalX = mouthScene.x;
      const mouthGlobalY = mouthScene.y;

      const count = this.id === 'O' ? 16 : 14;

      for (let i = 0; i < count; i++) {
        setTimeout(() => {
          if (bubbles.length < 280) {
            const b = new Bubble(mouthGlobalX, mouthGlobalY, this.id);
            bubbles.push(b);

            // Asignación progresiva a la palabra COCA:
            // Llena ordenadamente los puntos libres para formar C - O - L - A
            const freePoint = colaTargetPoints.find((pt) => !pt.filled);
            if (freePoint) {
              b.assignToColaPoint(freePoint);
            }
          }
        }, i * 60);
      }
    }

    stopLaugh() {
      this.isLaughing = false;
      this.root.classList.remove('laughing');
      this.face.setMouthMode('smile');
      this.tickleStimulus = 0;
      if (this.id === 'C') {
        this.cEmotion = 'content';
      }
    }

    update(dt) {
      this.animTime += dt;

      // Decaimiento del color suave hacia targetRedProgress
      if (this.redProgress < this.targetRedProgress) {
        this.redProgress = Math.min(this.targetRedProgress, this.redProgress + dt * 0.85);
        this.applyColor();
      }

      // Decaimiento suave del estímulo de cosquillas al cesar el movimiento
      if (performance.now() - this.lastTickleTime > 350 && this.tickleStimulus > 0) {
        this.tickleStimulus = Math.max(0, this.tickleStimulus - dt * 1.8);
      }

      // Actualizar temporizador de risa
      if (this.isLaughing) {
        this.laughTimer -= dt;
        if (this.laughTimer <= 0) {
          this.stopLaugh();
        }
      }

      // Animaciones de personalidad individual (sin acumulación de transformaciones)
      let animTranslateX = 0;
      let animTranslateY = 0;
      let animScaleX = 1;
      let animScaleY = 1;
      let animRotate = 0;

      if (this.isLaughing) {
        const t = this.animTime;
        if (this.id === 'C') {
          // C: Inclinación cálida hacia atrás y risa abierta
          animRotate = -7 + Math.sin(t * 14) * 2.5;
          animTranslateY = Math.sin(t * 12) * 6;
        } else if (this.id === 'O') {
          // O: Compresión elástica de pelota y rebote
          const bounce = Math.sin(t * 22);
          animScaleX = 1 + bounce * 0.12;
          animScaleY = 1 - bounce * 0.12;
          animTranslateY = -Math.abs(Math.sin(t * 11)) * 22;
        } else if (this.id === 'L') {
          // L: Temblores rápidos y vivos con inclinación lateral
          animRotate = 5 + Math.sin(t * 36) * 3;
          animTranslateX = Math.sin(t * 40) * 4;
        } else if (this.id === 'A') {
          // A: Saltos enérgicos y júbilo
          animTranslateY = -Math.abs(Math.sin(t * 14)) * 26;
          animRotate = Math.sin(t * 14) * 4;
        }
      } else {
        // Respiración suave y sutil en reposo
        const breathe = Math.sin(this.animTime * 1.8 + this.id.charCodeAt(0)) * 0.015;
        animScaleX = 1 + breathe;
        animScaleY = 1 + breathe;
      }

      const curX = this.baseX + animTranslateX;
      const curY = this.baseY + animTranslateY;
      const curScaleX = this.baseScale * animScaleX;
      const curScaleY = this.baseScale * animScaleY;

      this.x = curX;
      this.y = curY;

      this.root.setAttribute(
        'transform',
        `translate(${curX} ${curY}) scale(${curScaleX} ${curScaleY}) rotate(${animRotate})`
      );

      // Sombra de contacto: se encoge y aclara cuando la letra salta
      const lift = Math.max(0, -animTranslateY);
      const shadowK = 1 - clamp(lift / 90, 0, 0.6);
      this.shadow.setAttribute('cx', (this.baseX + this.width * 0.5 * this.baseScale + animTranslateX).toFixed(1));
      this.shadow.setAttribute('cy', (this.baseY + 430 * this.baseScale).toFixed(1));
      this.shadow.setAttribute('rx', (this.width * 0.42 * this.baseScale * shadowK * animScaleX).toFixed(1));
      this.shadow.setAttribute('ry', (11 * shadowK).toFixed(1));
      this.shadow.style.opacity = String(0.16 * shadowK);

      // Actualizar cara y brazos
      this.face.update(dt);
      this.leftArm.update(dt);
      this.rightArm.update(dt);
    }

    updateTransform() {
      this.root.setAttribute('transform', `translate(${this.x} ${this.y}) scale(${this.scale})`);
    }
  }

  // Notificación de risa para que los demás personajes dirijan su mirada intencional
  function notifyNeighborLaughing(laughingChar) {
    for (const c of characters) {
      if (c.id !== laughingChar.id && !c.isLaughing) {
        c.face.setLookTarget(
          laughingChar.x + laughingChar.width * 0.5 * laughingChar.scale,
          laughingChar.y + 190 * laughingChar.scale,
          3,
          1.8
        );
      }
    }
  }

  // Actualización del contagio emocional hacia C (triste -> curiosa -> contenta -> risa directa)
  function updateCEmotionState() {
    const charC = characters.find((c) => c.id === 'C');
    if (!charC || charC.isLaughing) return;

    const completedOthers = characters.filter((c) => c.id !== 'C' && c.awakened).length;

    if (completedOthers === 0) {
      charC.cEmotion = 'sad';
      charC.face.setMouthMode('sad');
      charC.root.classList.remove('happy', 'curious', 'content');
      charC.root.classList.add('sad');
    } else if (completedOthers === 1 || completedOthers === 2) {
      // Curiosa: mira a las letras vecinas, boca neutra
      charC.cEmotion = 'curious';
      charC.face.setMouthMode('neutral');
      charC.root.classList.remove('sad', 'happy', 'content');
      charC.root.classList.add('curious');
      const targetNeighbor = characters.find((c) => c.id !== 'C' && c.awakened);
      if (targetNeighbor) {
        charC.face.setLookTarget(
          targetNeighbor.x + targetNeighbor.width * 0.5 * targetNeighbor.scale,
          targetNeighbor.y + 190 * targetNeighbor.scale,
          2,
          2.5
        );
      }
    } else if (completedOthers >= 3) {
      // Contenta: sonríe feliz sin reírse hasta recibir cosquillas directamente
      charC.cEmotion = 'content';
      charC.face.setMouthMode('smile');
      charC.root.classList.remove('sad', 'curious');
      charC.root.classList.add('content');
    }
  }

  /* ==========================================================================
    CLASE BUBBLE (BURBUJAS ORGÁNICAS, INTERACCIÓN CON CURSOR Y FORMACIÓN DE COCA)
     ========================================================================== */
  class Bubble {
    constructor(startX, startY, sourceId = 'O') {
      this.x = startX + randomBetween(-14, 14);
      this.y = startY + randomBetween(-8, 6);
      this.vx = randomBetween(-0.7, 0.7);
      this.vy = randomBetween(-2.6, -1.3);
      this.radius = randomBetween(10, 20);
      this.baseRadius = this.radius;
      this.life = 0;
      this.maxLife = randomBetween(7, 12);
      this.opacity = randomBetween(0.86, 0.98);
      this.phase = Math.random() * Math.PI * 2;
      this.sourceId = sourceId;

      this.assignedTarget = null;
      this.isFormingWord = false;
      this.isSettled = false;
      this.isPopped = false;

      // Respuesta suave y temporal al cursor
      this.deflectVx = 0;
      this.deflectVy = 0;
      this.canDeflect = Math.random() < 0.52; // Solo un subconjunto reacciona para mantener serenidad

      this.group = createSvgElement('g', { class: 'bubble' });
      this.group.style.pointerEvents = 'all';
      this.group.style.cursor = 'pointer';

      this.targetRadius = this.radius;
      this.displayRadius = this.radius;

      // Geometría en radio unitario: el grupo se escala con el radio real
      this.inner = createSvgElement('g', { class: 'bubble-inner' });
      this.circle = createSvgElement('circle', {
        class: 'bubble-circle',
        cx: 0,
        cy: 0,
        r: 1,
      });
      this.highlight = createSvgElement('ellipse', {
        class: 'bubble-highlight',
        cx: -0.34,
        cy: -0.36,
        rx: 0.3,
        ry: 0.17,
        transform: 'rotate(-35 -0.34 -0.36)',
      });

      this.inner.append(this.circle, this.highlight);
      this.group.append(this.inner);
      bubbleLayer.appendChild(this.group);

      // Contacto y explosión suave al tocar
      this.group.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        this.pop();
      });

      this.render();
    }

    assignToColaPoint(targetPoint) {
      this.assignedTarget = targetPoint;
      targetPoint.filled = true;
      targetPoint.bubble = this;
      this.isFormingWord = true;
      this.targetRadius = targetPoint.r || this.baseRadius;
      this.group.classList.add('coca-forming');
    }

    // Estallido final (revelación): sin reponer el punto de la palabra
    burst(step) {
      if (this.isPopped) return;
      this.isPopped = true;
      if (this.assignedTarget) {
        this.assignedTarget.filled = false;
        this.assignedTarget.bubble = null;
        this.assignedTarget = null;
      }
      this.isFormingWord = false;
      for (let i = 0; i < 2; i++) {
        if (microBubbles.length < 140) {
          const angle = Math.random() * Math.PI * 2;
          const spd = randomBetween(1.5, 3.4);
          microBubbles.push(new MicroBubble(this.x, this.y, Math.cos(angle) * spd, Math.sin(angle) * spd - 1));
        }
      }
      if (step % 9 === 0) soundEngine.playRevealPop(step / 9);
      this.group.remove();
    }

    pop() {
      if (this.isPopped) return;
      this.isPopped = true;

      soundEngine.playBubblePop();

      // Efecto ligero de estallido con micropartículas brillantes
      const particleCount = Math.floor(randomBetween(4, 7));
      for (let i = 0; i < particleCount; i++) {
        const angle = (i / particleCount) * Math.PI * 2 + Math.random() * 0.4;
        const spd = randomBetween(2, 4.2);
        if (microBubbles.length < 24) {
          microBubbles.push(new MicroBubble(this.x, this.y, Math.cos(angle) * spd, Math.sin(angle) * spd));
        }
      }

      // Si estaba asignada a formar COCA, sustituir su contribución inmediatamente para no romper la palabra
      if (this.assignedTarget) {
        const target = this.assignedTarget;
        this.assignedTarget = null;
        target.filled = false;
        target.bubble = null;

        const candidate = bubbles.find((b) => !b.isFormingWord && !b.isPopped && b.y > target.y + 40);
        if (candidate) {
          candidate.assignToColaPoint(target);
        } else {
          setTimeout(() => {
            if (!target.filled && gameState.phase !== 'REVEAL') {
              const nb = new Bubble(target.x + randomBetween(-30, 30), 750);
              nb.assignToColaPoint(target);
              bubbles.push(nb);
            }
          }, 240);
        }
      }

      this.destroy();
    }

    update(dt) {
      this.life += dt;

      // Respiración sutil de tamaño orgánico (y crecimiento hacia el radio de la palabra)
      if (this.isFormingWord) {
        this.baseRadius = lerp(this.baseRadius, this.targetRadius, 0.06);
      }
      const breath = this.isFormingWord && this.isSettled ? 0.03 : 0.05;
      this.displayRadius = this.baseRadius * (1 + Math.sin(this.life * 2.6 + this.phase) * breath);

      if (this.isFormingWord && this.assignedTarget) {
        if (!this.isSettled) {
          // Desplazamiento orgánico hacia su posición asignada en la palabra COCA
          const dx = this.assignedTarget.x - this.x;
          const dy = this.assignedTarget.y - this.y;
          const d = Math.hypot(dx, dy);

          this.x += dx * 0.052;
          this.y += dy * 0.052;

          if (d < 4.5) {
            this.isSettled = true;
            this.x = this.assignedTarget.x;
            this.y = this.assignedTarget.y;
            this.group.classList.add('coca-fixed');
          }
        } else {
          // Micro-flotación y vibración sutil mientras está formada la composición
          const wobble = Math.sin(this.life * 2.2 + this.phase) * 0.9;
          const lateral = Math.cos(this.life * 1.8 + this.phase) * 0.7;
          this.x = this.assignedTarget.x + lateral;
          this.y = this.assignedTarget.y + wobble;
        }
        this.opacity = 1;
      } else {
        // Desvío suave al aproximarse el cursor
        if (this.canDeflect && gameState.pointerSceneX > 0) {
          const dx = this.x - gameState.pointerSceneX;
          const dy = this.y - gameState.pointerSceneY;
          const d = Math.hypot(dx, dy);
          if (d < 85 && d > 1) {
            const factor = Math.min((85 - d) / 85, 1);
            const angle = Math.atan2(dy, dx);
            this.deflectVx += Math.cos(angle) * factor * 1.2;
            this.deflectVy += Math.sin(angle) * factor * 1.2;
          }
        }

        // Amortiguamiento gradual del desvío
        this.deflectVx *= 0.91;
        this.deflectVy *= 0.91;

        // Flotación ascendente orgánica con vaivén senoidal
        this.x += (this.vx + Math.sin(this.life * 2.2 + this.phase) * 0.65 + this.deflectVx) * dt * 60;
        this.y += (this.vy + this.deflectVy) * dt * 60;
        this.vy -= 0.012 * dt * 60;

        if (this.y < 100) {
          this.opacity = clamp(this.y / 100, 0, 1);
        } else if (this.life > this.maxLife - 2) {
          this.opacity = clamp((this.maxLife - this.life) / 2, 0, 1);
        }

        // Tono muy tenue y discreto de vez en cuando
        if (Math.random() < 0.0012) {
          soundEngine.playBubbleDrift();
        }

        // Si pasa cerca de los ojos de un personaje, éste puede mirarla brevemente
        for (const char of characters) {
          if (char.awakened && !char.isLaughing) {
            const eyeX = char.x + 180 * char.scale;
            const eyeY = char.y + 190 * char.scale;
            if (dist(this.x, this.y, eyeX, eyeY) < 95) {
              char.face.setLookTarget(this.x, this.y, 1, 0.6);
            }
          }
        }
      }

      this.render();
    }

    render() {
      const r = this.displayRadius || this.baseRadius;
      this.group.setAttribute('transform', `translate(${this.x.toFixed(1)} ${this.y.toFixed(1)}) scale(${r.toFixed(2)})`);
      this.group.setAttribute('opacity', this.opacity.toFixed(2));
    }

    isDead() {
      if (this.isFormingWord) return false;
      return this.isPopped || this.opacity <= 0.02 || this.y < -50 || this.life >= this.maxLife;
    }

    destroy() {
      if (this.assignedTarget) {
        this.assignedTarget.filled = false;
        this.assignedTarget.bubble = null;
      }
      this.group.remove();
    }
  }

  /* ==========================================================================
     CLASE TIMIDBUBBLE (BURBUJA TÍMIDA QUE ESQUIVA Y ESTALLA A LOS 3 TOQUES)
     ========================================================================== */
  class TimidBubble {
    constructor(startX, startY) {
      this.x = startX;
      this.y = startY;
      this.vx = 0;
      this.vy = -0.55;
      this.radius = 24;
      this.touches = 0;
      this.lastTouchTime = 0;
      this.opacity = 1;
      this.alive = true;

      this.group = createSvgElement('g', { class: 'bubble timid-bubble' });
      this.circle = createSvgElement('circle', {
        class: 'bubble-circle',
        cx: 0,
        cy: 0,
        r: this.radius,
      });
      this.highlight = createSvgElement('ellipse', {
        class: 'bubble-highlight',
        cx: -this.radius * 0.32,
        cy: -this.radius * 0.32,
        rx: this.radius * 0.35,
        ry: this.radius * 0.22,
        transform: `rotate(-30 ${-this.radius * 0.32} ${-this.radius * 0.32})`,
      });

      this.group.append(this.circle, this.highlight);
      bubbleLayer.appendChild(this.group);

      this.setupTouch();
      this.render();
    }

    setupTouch() {
      this.group.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        this.registerTouch();
      });
    }

    registerTouch() {
      const now = performance.now();
      if (now - this.lastTouchTime < 320) return;
      this.lastTouchTime = now;
      this.touches += 1;

      gameState.happiness = clamp(gameState.happiness + 0.25, 0, 3.2);

      if (this.touches === 1) {
        this.vx += randomBetween(-2.8, 2.8);
        this.vy -= 2.2;
        this.pulseEffect(1.2);
      } else if (this.touches === 2) {
        this.vx += randomBetween(-4.2, 4.2);
        this.vy -= 3.0;
        this.pulseEffect(1.35);
      } else if (this.touches >= 3) {
        this.pop();
      }
    }

    pulseEffect(scale) {
      this.circle.setAttribute('r', String(this.radius * scale));
      setTimeout(() => {
        if (this.alive) this.circle.setAttribute('r', String(this.radius));
      }, 160);
    }

    pop() {
      this.alive = false;
      for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2;
        const speed = randomBetween(2, 5);
        microBubbles.push(new MicroBubble(this.x, this.y, Math.cos(angle) * speed, Math.sin(angle) * speed));
      }
      this.destroy();
    }

    update(dt, pointerX, pointerY) {
      if (!this.alive) return;

      const d = dist(this.x, this.y, pointerX, pointerY);
      const evasionRadius = 135;

      if (d < evasionRadius && d > 1) {
        const factor = (evasionRadius - d) / evasionRadius;
        const fleeAngle = Math.atan2(this.y - pointerY, this.x - pointerX);
        this.vx += Math.cos(fleeAngle) * factor * 1.6;
        this.vy += Math.sin(fleeAngle) * factor * 1.6;

        if (d < this.radius + 12) {
          this.registerTouch();
        }
      }

      this.vx *= 0.94;
      this.vy = clamp(this.vy - 0.03, -4, -0.4);

      this.x += this.vx * dt * 60;
      this.y += this.vy * dt * 60;

      if (this.x < 60) this.vx += 0.8;
      if (this.x > 1380) this.vx -= 0.8;

      if (this.y < 80) {
        this.opacity = clamp(this.y / 80, 0, 1);
        if (this.opacity <= 0.05) {
          this.alive = false;
          this.destroy();
        }
      }

      this.render();
    }

    render() {
      this.group.setAttribute('transform', `translate(${this.x} ${this.y})`);
      this.group.setAttribute('opacity', String(this.opacity));
    }

    destroy() {
      this.group.remove();
    }
  }

  /* ==========================================================================
     MICROBUBBLES (PARTÍCULAS AL ESTALLAR LA BURBUJA TÍMIDA)
     ========================================================================== */
  class MicroBubble {
    constructor(x, y, vx, vy) {
      this.x = x;
      this.y = y;
      this.vx = vx;
      this.vy = vy;
      this.r = randomBetween(3, 6);
      this.life = 0;
      this.maxLife = 0.55;
      this.opacity = 1;

      this.circle = createSvgElement('circle', {
        class: 'micro-bubble',
        cx: 0,
        cy: 0,
        r: this.r,
      });
      bubbleLayer.appendChild(this.circle);
      this.render();
    }

    update(dt) {
      this.life += dt;
      this.x += this.vx * dt * 60;
      this.y += this.vy * dt * 60;
      this.vx *= 0.92;
      this.vy *= 0.92;
      this.opacity = Math.max(0, 1 - this.life / this.maxLife);
      this.render();
    }

    render() {
      this.circle.setAttribute('cx', this.x);
      this.circle.setAttribute('cy', this.y);
      this.circle.setAttribute('opacity', String(this.opacity));
    }

    isDead() {
      return this.life >= this.maxLife;
    }

    destroy() {
      this.circle.remove();
    }
  }

  /* ==========================================================================
     ESPECIFICACIONES DE PERSONAJES SEGÚN LOS ASSETS ORIGINALES
     ========================================================================== */
  const specs = [
    {
      id: 'C',
      x: 1440 * 0.111,
      y: 900 * 0.5,
      scale: 0.63,
      viewBox: { w: 369.86, h: 554.8 },
      textTransform: { x: 5, y: 424.31 },
      faceSpecs: {
        leftEye: { x: 140, y: 190 },
        rightEye: { x: 220, y: 190 },
        mouth: { x: 175, y: 260 },
      },
      armSpecs: {
        leftShoulder: { x: 65, y: 290 },
        leftRest: { x: 15, y: 420 },
        rightShoulder: { x: 280, y: 310 },
        rightRest: { x: 340, y: 420 },
      },
    },
    {
      id: 'O',
      x: 1440 * 0.333,
      y: 900 * 0.5,
      scale: 0.63,
      viewBox: { w: 399.16, h: 554.8 },
      textTransform: { x: 5, y: 424.31 },
      faceSpecs: {
        leftEye: { x: 95, y: 210 },
        rightEye: { x: 305, y: 210 },
        mouth: { x: 200, y: 375 },
      },
      armSpecs: {
        leftShoulder: { x: 45, y: 280 },
        leftRest: { x: 10, y: 420 },
        rightShoulder: { x: 355, y: 280 },
        rightRest: { x: 390, y: 420 },
      },
    },
    {
      id: 'L',
      x: 1440 * 0.556,
      y: 900 * 0.5,
      scale: 0.63,
      viewBox: { w: 329.57, h: 554.8 },
      textTransform: { x: 5, y: 424.31 },
      faceSpecs: {
        leftEye: { x: 75, y: 190 },
        rightEye: { x: 135, y: 190 },
        mouth: { x: 105, y: 270 },
      },
      armSpecs: {
        leftShoulder: { x: 35, y: 260 },
        leftRest: { x: -5, y: 400 },
        rightShoulder: { x: 170, y: 260 },
        rightRest: { x: 225, y: 380 },
      },
    },
    {
      id: 'A',
      x: 1440 * 0.757,
      y: 900 * 0.5,
      scale: 0.63,
      viewBox: { w: 423.33, h: 554.8 },
      textTransform: { x: 5, y: 424.31 },
      faceSpecs: {
        leftEye: { x: 160, y: 170 },
        rightEye: { x: 260, y: 170 },
        mouth: { x: 210, y: 230 },
      },
      armSpecs: {
        leftShoulder: { x: 75, y: 300 },
        leftRest: { x: 25, y: 440 },
        rightShoulder: { x: 350, y: 300 },
        rightRest: { x: 400, y: 440 },
      },
    },
  ];

  const characters = [];
  const bubbles = [];
  const microBubbles = [];
  let timidBubble = null;

  window.__characters = characters;
  window.__colaTargetPoints = colaTargetPoints;
  window.__bubbles = bubbles;
  window.__microBubbles = microBubbles;
  window.__soundEngine = soundEngine;
  window.__updateGameProgression = updateGameProgression;
  window.__revealFinalBrand = revealFinalBrand;
  window.__Bubble = Bubble;

  /* ==========================================================================
     MOTOR DE COSQUILLAS (DETECCIÓN DE VAIVÉN ENTRE CUALQUIER COMBINACIÓN)
     ========================================================================== */
  function checkTickles() {
    const draggedArm = gameState.activeDragArm;
    if (!draggedArm) return;

    if (draggedArm.owner.face.placedCount < 3) {
      for (const target of characters) target.resetTickleTracking();
      return;
    }

    const handGlobal = draggedArm.getGlobalHandPoint();

    // Comprobar cada letra que NO sea el propietario del brazo
    for (const target of characters) {
      if (target.id === draggedArm.owner.id) continue;
      if (target.face.placedCount < 3) {
        target.resetTickleTracking();
        continue;
      }

      // La letra mira atentamente a la mano que se aproxima
      const targetCenterX = target.x + target.width * 0.5 * target.scale;
      const targetCenterY = target.y + 200 * target.scale;
      const d = dist(handGlobal.x, handGlobal.y, targetCenterX, targetCenterY);

      if (d < 360 && target.awakened && !target.isLaughing) {
        target.face.setLookTarget(handGlobal.x, handGlobal.y, 2, 0.45);
      }

      if (target.containsTicklePoint(handGlobal.x, handGlobal.y)) {
        target.registerTickleMove(handGlobal.x, handGlobal.y);
      } else {
        target.resetTickleTracking();
      }
    }
  }

  /* ==========================================================================
    CONTROLADOR GLOBAL, FORMACIÓN DE COCA Y REVELACIÓN FINAL
     ========================================================================== */
  /* --------------------------------------------------------------------------
     Temperatura visual: crema → rojo Coca-Cola
     -------------------------------------------------------------------------- */
  function applyHeat(target, dt) {
    gameState.heat = lerp(gameState.heat, target, clamp(dt * 2.2, 0, 1));
    const h = gameState.heat;
    rootStyle.setProperty('--heat', h.toFixed(3));
    const rim = `rgb(${Math.round(lerp(150, 255, h))}, ${Math.round(lerp(14, 255, h))}, ${Math.round(lerp(28, 255, h))})`;
    rootStyle.setProperty('--bubble-rim', rim);
    document.body.classList.toggle('is-hot', h > 0.55);
  }

  function updateGameProgression(dt) {
    if (gameState.phase === 'EXPLORATION') {
      gameState.explorationTime += dt;

      // Generar burbuja tímida periódicamente
      gameState.timidBubbleSpawnTimer -= dt;
      if (gameState.timidBubbleSpawnTimer <= 0 && (!timidBubble || !timidBubble.alive)) {
        gameState.timidBubbleSpawnTimer = randomBetween(14, 22);
        timidBubble = new TimidBubble(randomBetween(280, 1160), 840);
      }

      // Efervescencia continua: mientras alguien ríe, la palabra se escribe más rápido
      const anyLaughing = characters.some((c) => c.isLaughing);
      const fillChance = gameState.totalLaughs >= 2 ? (anyLaughing ? 0.16 : 0.045) : 0;
      if (fillChance > 0 && bubbles.length < 260 && Math.random() < fillChance) {
        const freePoint = colaTargetPoints.find((pt) => !pt.filled);
        if (freePoint) {
          const pool = anyLaughing ? characters.filter((c) => c.isLaughing) : characters;
          const char = pool[Math.floor(Math.random() * pool.length)];
          const mouthPt = scene.createSVGPoint();
          mouthPt.x = 0;
          mouthPt.y = 14;
          const mouthScreen = mouthPt.matrixTransform(char.face.mouthGroup.getScreenCTM());
          const mouthScene = mouthScreen.matrixTransform(scene.getScreenCTM().inverse());
          const b = new Bubble(mouthScene.x, mouthScene.y, char.id);
          b.assignToColaPoint(freePoint);
          bubbles.push(b);
        }
      }

      // Condición de finalización:
      // 1. Todas las letras estén rojas y felices
      // 2. La palabra esté completa
      const totalPoints = colaTargetPoints.length;
      const settledCount = colaTargetPoints.filter((pt) => pt.filled && pt.bubble && pt.bubble.isSettled).length;
      const isWordComplete = totalPoints > 0 && settledCount >= Math.floor(totalPoints * 0.94);

      const allLettersRedAndHappy =
        characters.length === 4 &&
        characters.every((c) => {
          return (
            c.awakened &&
            c.face.placedCount >= 3 &&
            c.targetRedProgress >= 1.0 &&
            c.redProgress >= 0.65 &&
            c.root.classList.contains('happy') &&
            (c.id !== 'C' || c.cEmotion !== 'sad')
          );
        });

      if (isWordComplete && allLettersRedAndHappy && !gameState.colaCompleted) {
        startWordCelebration();
      }
    }

    if (gameState.phase === 'COLA_HOLD') {
      gameState.colaHoldTimer -= dt;

      // Mantener miradas hacia la palabra formada
      for (const c of characters) {
        c.face.setLookTarget(720, 230, 2, 0.5);
      }

      const isDragging = gameState.activeDragArm !== null;
      if (gameState.colaHoldTimer <= 0 && !isDragging && !gameState.brandRevealed) {
        revealFinalBrand();
      }
    }

    // Transición del fondo hacia el rojo Coca-Cola según la felicidad global
    const progress =
      gameState.phase === 'REVEAL' || gameState.phase === 'COLA_HOLD' ? 1 : Math.pow(clamp(gameState.happiness / 3.0, 0, 1), 1.6);
    applyHeat(progress, dt);
  }

  // La palabra se completa: rellena huecos, brilla en cadena y aparece la floritura
  function startWordCelebration() {
    gameState.colaCompleted = true;
    gameState.phase = 'COLA_HOLD';
    gameState.colaHoldTimer = 4.6;

    // Completar los últimos huecos para que la palabra quede perfecta
    for (const pt of colaTargetPoints) {
      if (!pt.filled) {
        const b = new Bubble(pt.x + randomBetween(-20, 20), pt.y + 60);
        b.assignToColaPoint(pt);
        bubbles.push(b);
      }
    }

    soundEngine.playColaCompleted();
    setTimeout(() => soundEngine.playWordShimmer(), 450);

    document.body.classList.add('word-complete');
    const spanX = Math.max(1, wordBounds.maxX - wordBounds.minX);
    setTimeout(() => {
      for (const pt of colaTargetPoints) {
        const b = pt.bubble;
        if (!b) continue;
        const delay = clamp((pt.x - wordBounds.minX) / spanX, 0, 1) * 1.1;
        b.group.style.setProperty('--shine-delay', `${delay.toFixed(2)}s`);
        b.group.classList.add('shine');
      }
    }, 350);

    for (const c of characters) {
      c.face.setLookTarget(720, 230, 2, 4.0);
    }
  }

  function revealFinalBrand() {
    gameState.phase = 'REVEAL';
    gameState.brandRevealed = true;

    soundEngine.playLogoReveal();

    // Fondo completamente rojo Coca-Cola
    gameState.heat = 1;
    applyHeat(1, 1);
    document.body.classList.add('is-revealed');

    // Desvanecer suavemente las letras para que el logo sea el protagonista
    letterLayer.style.transition = 'opacity 1.4s cubic-bezier(0.25, 1, 0.5, 1)';
    letterLayer.style.opacity = '0';

    // Las burbujas de la palabra estallan en ola de izquierda a derecha
    const wordBubbles = bubbles.filter((b) => b.isFormingWord && !b.isPopped).sort((a, b) => a.x - b.x);
    const total = wordBubbles.length;
    wordBubbles.forEach((b, i) => {
      setTimeout(() => b.burst(i), (i / Math.max(1, total)) * 850);
    });

    // Las burbujas libres suben y se desvanecen
    for (const b of bubbles) {
      if (!b.isFormingWord) {
        b.vy = -randomBetween(1.1, 2.2);
        b.life = Math.max(b.life, b.maxLife - 1.6);
      }
    }

    // Cinta blanca + logo con destello
    setTimeout(() => brandReveal.classList.add('visible'), 380);
  }

  /* ==========================================================================
     INICIALIZACIÓN DE LA ESCENA Y EVENTOS GLOBALES
     ========================================================================== */
  /* --------------------------------------------------------------------------
     Efervescencia ambiental (canvas detrás de la escena)
     Pocas burbujas finas al inicio; se multiplican con la felicidad.
     -------------------------------------------------------------------------- */
  const fizz = {
    ctx: fizzCanvas ? fizzCanvas.getContext('2d') : null,
    parts: [],
    w: 0,
    h: 0,
    dpr: 1,
  };

  function resizeFizz() {
    if (!fizz.ctx) return;
    fizz.dpr = Math.min(window.devicePixelRatio || 1, 2);
    fizz.w = fizzCanvas.clientWidth;
    fizz.h = fizzCanvas.clientHeight;
    fizzCanvas.width = Math.round(fizz.w * fizz.dpr);
    fizzCanvas.height = Math.round(fizz.h * fizz.dpr);
  }

  function spawnFizz(anywhere) {
    fizz.parts.push({
      x: Math.random() * fizz.w,
      y: anywhere ? Math.random() * fizz.h : fizz.h + 10,
      r: randomBetween(1.2, 4.2),
      vy: randomBetween(18, 62),
      ph: Math.random() * Math.PI * 2,
      amp: randomBetween(4, 14),
    });
  }

  function updateFizz(dt) {
    if (!fizz.ctx || !fizz.w) return;
    const h = gameState.heat;
    const target = Math.round(14 + h * 70 + (gameState.phase === 'REVEAL' ? 50 : 0));
    if (fizz.parts.length < target && Math.random() < 0.5) spawnFizz(false);

    const ctx = fizz.ctx;
    ctx.setTransform(fizz.dpr, 0, 0, fizz.dpr, 0, 0);
    ctx.clearRect(0, 0, fizz.w, fizz.h);
    const cr = Math.round(lerp(244, 255, h));
    const cg = Math.round(lerp(0, 255, h));
    const cb = Math.round(lerp(9, 255, h));
    const alpha = lerp(0.26, 0.6, h);
    ctx.strokeStyle = `rgba(${cr}, ${cg}, ${cb}, ${alpha.toFixed(3)})`;
    ctx.fillStyle = `rgba(${cr}, ${cg}, ${cb}, ${(alpha * 0.25).toFixed(3)})`;
    ctx.lineWidth = 1.2;

    for (let i = fizz.parts.length - 1; i >= 0; i--) {
      const p = fizz.parts[i];
      p.y -= p.vy * dt * (1 + h * 0.6);
      p.ph += dt * 2;
      const x = p.x + Math.sin(p.ph) * p.amp;
      if (p.y < -12) {
        fizz.parts.splice(i, 1);
        continue;
      }
      ctx.beginPath();
      ctx.arc(x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  function initScene() {
    // Instanciar los cuatro personajes
    for (const spec of specs) {
      characters.push(new LetterCharacter(spec));
    }

    // Palabra «Coca» de burbujas (espera a que cargue la tipografía script)
    initWordTargets();

    // Efervescencia ambiental
    resizeFizz();
    for (let i = 0; i < 12; i++) spawnFizz(true);

    // Volver a jugar
    const replayBtn = document.getElementById('replayBtn');
    if (replayBtn) {
      replayBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
      replayBtn.addEventListener('click', () => window.location.reload());
    }

    // Botón discreto de control de audio (mute / unmute)
    const soundToggle = document.getElementById('soundToggle');
    const soundIconOn = document.getElementById('soundIconOn');
    const soundIconOff = document.getElementById('soundIconOff');

    if (soundToggle) {
      soundToggle.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        const muted = soundEngine.toggleMute();
        soundToggle.classList.toggle('muted', muted);
        if (soundIconOn) soundIconOn.style.display = muted ? 'none' : 'block';
        if (soundIconOff) soundIconOff.style.display = muted ? 'block' : 'none';
      });
    }

    // Desbloqueo inicial del AudioContext con la primera interacción del usuario
    window.addEventListener('pointerdown', () => {
      soundEngine.resume();
    }, { once: false });

    // Cursor de lápiz: seguimiento y orientación milimétrica
    window.addEventListener('pointermove', (e) => {
      gameState.lastPointerSceneX = gameState.pointerSceneX;
      gameState.lastPointerSceneY = gameState.pointerSceneY;
      gameState.pointerScreenX = e.clientX;
      gameState.pointerScreenY = e.clientY;

      const scenePt = screenToSvg(e.clientX, e.clientY);
      gameState.pointerSceneX = scenePt.x;
      gameState.pointerSceneY = scenePt.y;

      if (gameState.phase === 'DRAWING') {
        pencilCursor.classList.add('visible');
        pencilCursor.style.left = `${e.clientX}px`;
        pencilCursor.style.top = `${e.clientY}px`;

        const isHoveringValid = characters.some((c) => c.isPointerOverDrawable(e.clientX, e.clientY));
        pencilCursor.classList.toggle('drawing-hover', isHoveringValid);
      }
    });

    window.addEventListener('pointerleave', () => {
      if (gameState.phase === 'DRAWING') {
        pencilCursor.classList.remove('visible');
      }
    });

    window.addEventListener('resize', () => {
      resizeFizz();
      if (gameState.pointerScreenX > 0) {
        const scenePt = screenToSvg(gameState.pointerScreenX, gameState.pointerScreenY);
        gameState.pointerSceneX = scenePt.x;
        gameState.pointerSceneY = scenePt.y;
      }
    });

    // Bucle principal continuo a 60 FPS con delta time
    let lastTime = performance.now();

    function loop(now) {
      const dt = Math.min(0.045, (now - lastTime) / 1000);
      lastTime = now;

      // Actualizar progresión global
      updateGameProgression(dt);
      updateFizz(dt);

      // Actualizar personajes
      for (const char of characters) {
        char.update(dt);
      }

      // Comprobar interacción de cosquillas por arrastre
      checkTickles();

      // Actualizar burbujas
      for (let i = bubbles.length - 1; i >= 0; i--) {
        const b = bubbles[i];
        b.update(dt);
        if (b.isDead()) {
          b.destroy();
          bubbles.splice(i, 1);
        }
      }

      // Actualizar burbuja tímida
      if (timidBubble && timidBubble.alive) {
        timidBubble.update(dt, gameState.pointerSceneX, gameState.pointerSceneY);
      }

      // Actualizar microburbujas
      for (let i = microBubbles.length - 1; i >= 0; i--) {
        const mb = microBubbles[i];
        mb.update(dt);
        if (mb.isDead()) {
          mb.destroy();
          microBubbles.splice(i, 1);
        }
      }

      requestAnimationFrame(loop);
    }

    requestAnimationFrame(loop);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initScene);
  } else {
    initScene();
  }
})();
