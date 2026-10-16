/**
 * Coca-Cola — «La Felicidad que se Contagia»
 * Experiencia interactiva tipográfica de arte generativo y animación.
 * JavaScript nativo, CSS y SVG. Sin dependencias externas.
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

  // Estado global de la experiencia
  const gameState = {
    phase: 'DRAWING', // 'DRAWING' | 'EXPLORATION' | 'REVEAL'
    happiness: 0,
    explorationTime: 0,
    activeDragArm: null,
    pointerScreenX: -100,
    pointerScreenY: -100,
    pointerSceneX: -100,
    pointerSceneY: -100,
    facesDrawnCount: 0, // C empieza completa, O, L, A suman 3
    brandRevealed: false,
    timidBubbleSpawnTimer: 7.0,
    totalLaughs: 0,
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

  // Conversión de coordenadas pantalla -> SVG scene
  function screenToSvg(clientX, clientY) {
    const pt = scene.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = scene.getScreenCTM();
    if (!ctm) return { x: clientX, y: clientY };
    return pt.matrixTransform(ctm.inverse());
  }

  /* ==========================================================================
     PUNTOS OBJETIVO PARA LA FORMACIÓN PROGRESIVA DE COCA (CENTRADOS A X=720)
     ========================================================================== */
  function createCocaTargetPoints() {
    const points = [];
    const baseY = 150;
    const centerX = 720; // Centro horizontal exacto del viewport 1440

    // C1: centro en 720 - 315 = 405
    const c1X = centerX - 315;
    for (let a = Math.PI * 0.32; a <= Math.PI * 1.68; a += 0.36) {
      points.push({ x: c1X + Math.cos(a) * 65, y: baseY + Math.sin(a) * 75, filled: false, bubble: null });
    }

    // O: centro en 720 - 105 = 615
    const oX = centerX - 105;
    for (let a = 0; a < Math.PI * 2; a += 0.55) {
      points.push({ x: oX + Math.cos(a) * 66, y: baseY + Math.sin(a) * 75, filled: false, bubble: null });
    }

    // C2: centro en 720 + 105 = 825
    const c2X = centerX + 105;
    for (let a = Math.PI * 0.32; a <= Math.PI * 1.68; a += 0.36) {
      points.push({ x: c2X + Math.cos(a) * 65, y: baseY + Math.sin(a) * 75, filled: false, bubble: null });
    }

    // A: centro en 720 + 315 = 1035
    const aX = centerX + 315;
    for (let t = 0; t <= 1; t += 0.25) {
      points.push({ x: lerp(aX, aX - 60, t), y: lerp(baseY - 75, baseY + 75, t), filled: false, bubble: null });
      points.push({ x: lerp(aX, aX + 60, t), y: lerp(baseY - 75, baseY + 75, t), filled: false, bubble: null });
    }
    // Travesaño de A
    points.push({ x: aX - 25, y: baseY + 15, filled: false, bubble: null });
    points.push({ x: aX, y: baseY + 15, filled: false, bubble: null });
    points.push({ x: aX + 25, y: baseY + 15, filled: false, bubble: null });

    return points;
  }

  const cocaTargetPoints = createCocaTargetPoints();

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
        if (this.growth < 0.95 || gameState.phase === 'REVEAL') return;
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
     CLASE FACE (ROSTROS, COLOCACIÓN TOTALMENTE LIBRE Y PUPILAS MÁS GRANDES)
     ========================================================================== */
  class Face {
    constructor(owner, defaultSpecs) {
      this.owner = owner;
      this.specs = defaultSpecs;
      this.group = createSvgElement('g', { class: 'face-group' });

      // Estado de colocación de rasgos (0 = vacío, 1 = ojo 1, 2 = ojo 2, 3 = cara completa)
      this.placedCount = owner.id === 'C' ? 3 : 0;

      // Ojos ampliados (~20% pupilas más grandes)
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

      this.mouthGroup.append(this.mouthLine, this.mouthLaughGroup);

      this.mouthPos = { ...defaultSpecs.mouth };
      this.mouthGroup.setAttribute('transform', `translate(${this.mouthPos.x} ${this.mouthPos.y})`);

      this.group.append(this.leftEye.group, this.rightEye.group, this.mouthGroup);

      this.updateVisibility();
      this.setMouthMode(owner.id === 'C' ? 'sad' : 'neutral');
    }

    createEye(side, pos) {
      const eyeGroup = createSvgElement('g', {
        class: 'eye',
        transform: `translate(${pos.x} ${pos.y})`,
      });

      // Base ocular proporcionada
      const base = createSvgElement('ellipse', {
        class: 'eye-base',
        cx: 0,
        cy: 0,
        rx: 24,
        ry: 19,
      });

      // Pupila ~20% mayor para mayor expresividad
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

      // Clic directo sobre el ojo para parpadeo independiente
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

    // Colocación completamente libre: los rasgos se sitúan exactamente donde el usuario hace clic
    addFeatureAt(localX, localY) {
      // Si es la O, comprobar que el clic no sea dentro del hueco interior
      if (this.owner.id === 'O') {
        const dx = (localX - 200) / 52;
        const dy = (localY - 265) / 82;
        if (dx * dx + dy * dy < 1.0) return; // داخل el hueco, ignorar
      }

      if (this.placedCount === 0) {
        // Primer clic: Ojo 1 exactamente en la posición elegida
        this.leftEye.pos.x = clamp(localX, 25, this.owner.width - 25);
        this.leftEye.pos.y = clamp(localY, 30, this.owner.height - 30);
        this.leftEye.group.setAttribute('transform', `translate(${this.leftEye.pos.x} ${this.leftEye.pos.y})`);
        this.placedCount = 1;
        this.updateVisibility();
        this.triggerBlink(this.leftEye, 0.16);
      } else if (this.placedCount === 1) {
        // Segundo clic: Ojo 2 exactamente en la posición elegida (sin simetría forzada)
        this.rightEye.pos.x = clamp(localX, 25, this.owner.width - 25);
        this.rightEye.pos.y = clamp(localY, 30, this.owner.height - 30);
        this.rightEye.group.setAttribute('transform', `translate(${this.rightEye.pos.x} ${this.rightEye.pos.y})`);
        this.placedCount = 2;
        this.updateVisibility();
        this.triggerBlink(this.rightEye, 0.16);
      } else if (this.placedCount === 2) {
        // Tercer clic: Boca en la posición elegida
        this.mouthPos.x = clamp(localX, 30, this.owner.width - 30);
        this.mouthPos.y = clamp(localY, 30, this.owner.height - 30);
        this.mouthGroup.setAttribute('transform', `translate(${this.mouthPos.x} ${this.mouthPos.y})`);
        this.placedCount = 3;
        this.updateVisibility();
        this.setMouthMode('smile');
        this.owner.awaken();
      }
    }

    updateVisibility() {
      this.leftEye.group.style.display = this.placedCount >= 1 ? 'block' : 'none';
      this.rightEye.group.style.display = this.placedCount >= 2 ? 'block' : 'none';
      this.mouthGroup.style.display = this.placedCount >= 3 ? 'block' : 'none';
    }

    update(dt, pointerSceneX, pointerSceneY) {
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

        // Si la letra está riendo, ojos entrecerrados en arco feliz
        if (this.owner.isLaughing) {
          eye.pupilGroup.style.display = 'none';
          eye.base.style.display = 'none';
          eye.blinkLid.style.display = 'block';
          return;
        }

        if (eye.isBlinking) return;

        // Seguimiento suave de la pupila hacia el cursor
        const eyeGlobalX = this.owner.x + eye.pos.x * this.owner.scale;
        const eyeGlobalY = this.owner.y + eye.pos.y * this.owner.scale;

        const dx = pointerSceneX - eyeGlobalX;
        const dy = pointerSceneY - eyeGlobalY;
        const d = Math.hypot(dx, dy);

        // Clamping proporcional: la pupila jamás sale de la esclerótica blanca
        const maxRx = 8.5;
        const maxRy = 4.5;

        let targetPx = 0;
        let targetPy = 0;

        if (d > 0.1) {
          const angle = Math.atan2(dy, dx);
          const factor = Math.min(d / 180, 1);
          targetPx = Math.cos(angle) * maxRx * factor;
          targetPy = Math.sin(angle) * maxRy * factor;
        }

        eye.curPupilX = lerp(eye.curPupilX, targetPx, dt * 10);
        eye.curPupilY = lerp(eye.curPupilY, targetPy, dt * 10);

        eye.pupilGroup.setAttribute('transform', `translate(${eye.curPupilX} ${eye.curPupilY})`);
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
      this.bodySvg.appendChild(this.glyphText);

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
      // Gris neutro cálido: rgb(125, 120, 118) -> Rojo Coca-Cola: rgb(191, 8, 17)
      const r = Math.round(lerp(125, 191, this.redProgress));
      const g = Math.round(lerp(120, 8, this.redProgress));
      const b = Math.round(lerp(118, 17, this.redProgress));
      this.glyphText.style.setProperty('--char-fill', `rgb(${r}, ${g}, ${b})`);
    }

    setupDrawingInteraction() {
      this.glyphText.addEventListener('pointerdown', (e) => {
        if (this.awakened && this.face.placedCount >= 3) return;
        if (gameState.phase !== 'DRAWING') return;

        e.preventDefault();
        e.stopPropagation();

        const scenePt = screenToSvg(e.clientX, e.clientY);
        const localX = (scenePt.x - this.x) / this.scale;
        const localY = (scenePt.y - this.y) / this.scale;

        if (localX < 5 || localX > this.width - 5 || localY < 15 || localY > this.height - 15) return;

        this.face.addFeatureAt(localX, localY);
      });
    }

    isPointerOverDrawable(sceneX, sceneY) {
      if (this.awakened && this.face.placedCount >= 3) return false;
      const localX = (sceneX - this.x) / this.scale;
      const localY = (sceneY - this.y) / this.scale;
      if (localX < 10 || localX > this.width - 10 || localY < 20 || localY > this.height - 20) return false;
      if (this.id === 'O') {
        const dx = (localX - 200) / 52;
        const dy = (localY - 265) / 82;
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

      const durations = { C: 2.2, O: 1.8, L: 1.3, A: 1.7 };
      this.laughTimer = durations[this.id] || 1.8;

      this.face.setMouthMode('laugh');
      this.spawnLaughBubbles();
    }

    spawnLaughBubbles() {
      const mouthGlobalX = this.x + this.face.mouthPos.x * this.scale;
      const mouthGlobalY = this.y + this.face.mouthPos.y * this.scale;
      const count = this.id === 'O' ? 9 : 6;

      for (let i = 0; i < count; i++) {
        setTimeout(() => {
          if (bubbles.length < 65) {
            const b = new Bubble(mouthGlobalX, mouthGlobalY, this.id);
            bubbles.push(b);

            // Asignación progresiva a la palabra COCA:
            // 2 de cada 3 burbujas se dirigen a formar letras en la parte superior
            if (i % 2 === 0) {
              const freePoint = cocaTargetPoints.find((pt) => !pt.filled);
              if (freePoint) {
                b.assignToCocaPoint(freePoint);
              }
            }
          }
        }, i * 75);
      }
    }

    stopLaugh() {
      this.isLaughing = false;
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

      // Actualizar cara y brazos
      this.face.update(dt, gameState.pointerSceneX, gameState.pointerSceneY);
      this.leftArm.update(dt);
      this.rightArm.update(dt);
    }

    updateTransform() {
      this.root.setAttribute('transform', `translate(${this.x} ${this.y}) scale(${this.scale})`);
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
      // Curiosa: mira a las vecinas, boca neutra
      charC.cEmotion = 'curious';
      charC.face.setMouthMode('neutral');
      charC.root.classList.remove('sad', 'happy', 'content');
      charC.root.classList.add('curious');
    } else if (completedOthers >= 3) {
      // Contenta: sonríe feliz sin reírse hasta recibir cosquillas
      charC.cEmotion = 'content';
      charC.face.setMouthMode('smile');
      charC.root.classList.remove('sad', 'curious');
      charC.root.classList.add('content');
    }
  }

  /* ==========================================================================
     CLASE BUBBLE (BURBUJAS ORGÁNICAS CON ASIGNACIÓN PROGRESIVA A COCA)
     ========================================================================== */
  class Bubble {
    constructor(startX, startY, sourceId = 'O') {
      this.x = startX + randomBetween(-16, 16);
      this.y = startY + randomBetween(-10, 6);
      this.vx = randomBetween(-0.9, 0.9);
      this.vy = randomBetween(-2.8, -1.2);
      this.radius = randomBetween(9, 21);
      this.life = 0;
      this.maxLife = randomBetween(7, 12);
      this.opacity = 0.95;
      this.phase = Math.random() * Math.PI * 2;
      this.sourceId = sourceId;

      this.assignedTarget = null;
      this.isFormingWord = false;
      this.isSettled = false;

      this.group = createSvgElement('g', { class: 'bubble' });
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
        rx: this.radius * 0.32,
        ry: this.radius * 0.2,
        transform: `rotate(-30 ${-this.radius * 0.32} ${-this.radius * 0.32})`,
      });

      this.group.append(this.circle, this.highlight);
      bubbleLayer.appendChild(this.group);
      this.render();
    }

    assignToCocaPoint(targetPoint) {
      this.assignedTarget = targetPoint;
      targetPoint.filled = true;
      targetPoint.bubble = this;
      this.isFormingWord = true;
    }

    update(dt) {
      this.life += dt;

      if (this.isFormingWord && this.assignedTarget) {
        if (!this.isSettled) {
          // Desplazamiento orgánico hacia su posición asignada en la palabra COCA
          const dx = this.assignedTarget.x - this.x;
          const dy = this.assignedTarget.y - this.y;
          const d = Math.hypot(dx, dy);

          this.x += dx * 0.045;
          this.y += dy * 0.045;

          if (d < 4) {
            this.isSettled = true;
            this.x = this.assignedTarget.x;
            this.y = this.assignedTarget.y;
            this.group.classList.add('coca-fixed');
          }
        } else {
          // Flotación micro-senoidal en reposo una vez posicionada
          const wobble = Math.sin(this.life * 2.5 + this.phase) * 1.5;
          this.x = this.assignedTarget.x + Math.cos(this.life * 2.0 + this.phase) * 1.2;
          this.y = this.assignedTarget.y + wobble;
        }
        this.opacity = 1;
      } else {
        // Flotación ascendente libre con vaivén senoidal
        this.x += (this.vx + Math.sin(this.life * 2.5 + this.phase) * 0.6) * dt * 60;
        this.y += this.vy * dt * 60;
        this.vy -= 0.015 * dt * 60;

        if (this.y < 100) {
          this.opacity = clamp(this.y / 100, 0, 1);
        } else if (this.life > this.maxLife - 2) {
          this.opacity = clamp((this.maxLife - this.life) / 2, 0, 1);
        }
      }

      this.render();
    }

    render() {
      this.group.setAttribute('transform', `translate(${this.x} ${this.y})`);
      this.group.setAttribute('opacity', String(this.opacity));
    }

    isDead() {
      if (this.isFormingWord) return false;
      return this.opacity <= 0.02 || this.y < -50 || this.life >= this.maxLife;
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
      x: 160,
      y: 250,
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
      x: 480,
      y: 250,
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
      x: 800,
      y: 250,
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
      x: 1090,
      y: 250,
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

  /* ==========================================================================
     MOTOR DE COSQUILLAS (DETECCIÓN DE VAIVÉN ENTRE CUALQUIER COMBINACIÓN)
     ========================================================================== */
  function checkTickles() {
    const draggedArm = gameState.activeDragArm;
    if (!draggedArm) return;

    const handGlobal = draggedArm.getGlobalHandPoint();

    // Comprobar cada letra que NO sea el propietario del brazo
    for (const target of characters) {
      if (target.id === draggedArm.owner.id) continue;

      if (target.containsTicklePoint(handGlobal.x, handGlobal.y)) {
        target.registerTickleMove(handGlobal.x, handGlobal.y);
      } else {
        target.resetTickleTracking();
      }
    }
  }

  /* ==========================================================================
     CONTROLADOR GLOBAL Y REVELACIÓN FINAL
     ========================================================================== */
  function updateGameProgression(dt) {
    if (gameState.phase === 'EXPLORATION') {
      gameState.explorationTime += dt;

      // Generar burbuja tímida periódicamente
      gameState.timidBubbleSpawnTimer -= dt;
      if (gameState.timidBubbleSpawnTimer <= 0 && (!timidBubble || !timidBubble.alive)) {
        gameState.timidBubbleSpawnTimer = randomBetween(14, 22);
        timidBubble = new TimidBubble(randomBetween(280, 1160), 840);
      }

      // Condición de finalización de marca:
      // La palabra COCA está suficientemente formada (~75%+ de puntos ocupados),
      // ha habido exploración libre y risas, y el usuario NO está arrastrando ningún brazo ni nadie riendo en pico
      const filledPoints = cocaTargetPoints.filter((pt) => pt.filled).length;
      const isDragging = gameState.activeDragArm !== null;
      const isAnyLaughing = characters.some((c) => c.isLaughing && c.laughTimer > 0.8);

      if (
        filledPoints >= 24 &&
        gameState.explorationTime >= 16 &&
        gameState.totalLaughs >= 3 &&
        !isDragging &&
        !isAnyLaughing &&
        !gameState.brandRevealed
      ) {
        revealFinalBrand();
      }
    }

    // Transición suave del fondo hacia el rojo Coca-Cola (#FE001A) según la felicidad
    const progress = clamp(gameState.happiness / 3.0, 0, 1);
    const r = Math.round(lerp(248, 254, progress));
    const g = Math.round(lerp(244, 0, Math.pow(progress, 1.4)));
    const b = Math.round(lerp(238, 26, Math.pow(progress, 1.4)));

    document.documentElement.style.setProperty('--bg-r', String(r));
    document.documentElement.style.setProperty('--bg-g', String(g));
    document.documentElement.style.setProperty('--bg-b', String(b));
  }

  function revealFinalBrand() {
    gameState.phase = 'REVEAL';
    gameState.brandRevealed = true;

    // Completar cualquier punto restante de COCA suavemente
    for (const pt of cocaTargetPoints) {
      if (!pt.filled) {
        const b = new Bubble(pt.x, pt.y + 40);
        b.assignToCocaPoint(pt);
        bubbles.push(b);
      }
    }

    // Fondo completamente rojo Coca-Cola #FE001A
    document.documentElement.style.setProperty('--bg-r', '254');
    document.documentElement.style.setProperty('--bg-g', '0');
    document.documentElement.style.setProperty('--bg-b', '26');

    // Desvanecer suavemente las letras para que el logo sea el protagonista absoluto
    letterLayer.style.transition = 'opacity 1.2s ease';
    letterLayer.style.opacity = '0';

    // Revelar logo centrado con fundido y escala
    brandReveal.classList.add('visible');

    // Las burbujas de la palabra se disuelven sutilmente hacia el fondo
    for (const b of bubbles) {
      if (b.isFormingWord) {
        b.isFormingWord = false;
        b.vy = -randomBetween(0.8, 1.8);
        b.life = b.maxLife - 1.5;
      }
    }
  }

  /* ==========================================================================
     INICIALIZACIÓN DE LA ESCENA Y EVENTOS GLOBALES
     ========================================================================== */
  function initScene() {
    // Instanciar los cuatro personajes
    for (const spec of specs) {
      characters.push(new LetterCharacter(spec));
    }

    // Cursor de lápiz: seguimiento y orientación milimétrica
    window.addEventListener('pointermove', (e) => {
      gameState.pointerScreenX = e.clientX;
      gameState.pointerScreenY = e.clientY;

      const scenePt = screenToSvg(e.clientX, e.clientY);
      gameState.pointerSceneX = scenePt.x;
      gameState.pointerSceneY = scenePt.y;

      if (gameState.phase === 'DRAWING') {
        pencilCursor.classList.add('visible');
        pencilCursor.style.left = `${e.clientX}px`;
        pencilCursor.style.top = `${e.clientY}px`;

        const isHoveringValid = characters.some((c) => c.isPointerOverDrawable(scenePt.x, scenePt.y));
        pencilCursor.classList.toggle('drawing-hover', isHoveringValid);
      }
    });

    window.addEventListener('pointerleave', () => {
      if (gameState.phase === 'DRAWING') {
        pencilCursor.classList.remove('visible');
      }
    });

    window.addEventListener('resize', () => {
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