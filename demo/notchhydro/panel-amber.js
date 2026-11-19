/* The water animation positions the emerging amber; the panel handles its collection. */
(() => {
  'use strict';

  window.NotchHydroPanelAmber = class PanelAmber {
    constructor(body, target) {
      this.host = body.getRootNode().host;
      this.presentationAngle = 0;
      this.body = body;
      this.target = target;
      this.layer = document.createElement('div');
      this.layer.className = 'nh-panel-amber';
      this.layer.dataset.ready = 'fallback';
      this.layer.innerHTML = '<span class="nh-panel-amber-fallback"></span><canvas class="nh-panel-amber-canvas" width="104" height="104" tabindex="-1"></canvas>';
      this.canvas = this.layer.querySelector('canvas');
      this.layer.setAttribute('aria-hidden', 'true');
      body.append(this.layer);
      this.bindInteraction();
    }

    prepare(mixture, day, shape) {
      if (this.disposed || !mixture) return;
      this.setDay(day, shape);
      if (!this.frame) this.setMixture(mixture);
      if (!this.deferred && !this.software) this.scheduleScene(false);
    }

    scheduleScene(allowSoftware, fromGesture = false) {
      if (this.disposed || this.unavailable || this.scene || this.pending != null) return;
      const start = () => {
        this.pending = null;
        if (!this.context) {
          const options = { alpha: true, antialias: true, powerPreference: 'low-power', failIfMajorPerformanceCaveat: !allowSoftware };
          this.context = this.canvas.getContext('webgl2', options) || this.canvas.getContext('webgl', options);
          if (!this.context) {
            this.unavailable = allowSoftware;
            this.deferred = !allowSoftware;
            this.syncInteraction();
            return;
          }
          const info = this.context.getExtension('WEBGL_debug_renderer_info');
          this.software = !!info && /swiftshader|llvmpipe|softpipe|software renderer|basic render driver/i.test(this.context.getParameter(info.UNMASKED_RENDERER_WEBGL));
        }
        if (this.software && !allowSoftware) {
          this.deferred = true;
          this.syncInteraction();
          return;
        }
        this.startScene();
      };
      if (fromGesture) start();
      else this.pending = window.requestIdleCallback ? window.requestIdleCallback(start, { timeout: 160 }) : window.setTimeout(start, 0);
    }

    startScene() {
      try {
        this.scene = window.createAmberScene(this.canvas, () => {
          this.layer.dataset.ready = 'webgl';
          this.syncInteraction();
        }, { compact: true, context: this.context, day: this.day, shape: this.shape });
        this.scene.setDark(true);
        this.scene.setMixture(this.mixture);
        if (this.frame) this.scene.setFormation(this.frame.turn, this.frame.glint, this.frame.crystallization);
        this.scene.setPresentationTurn(this.presentationAngle);
      } catch {
        this.scene?.dispose();
        this.scene = null;
        this.unavailable = true;
        this.syncInteraction();
      }
    }

    cancelPending() {
      if (this.pending == null) return;
      if (window.cancelIdleCallback) window.cancelIdleCallback(this.pending);
      else window.clearTimeout(this.pending);
      this.pending = null;
    }

    beginCelebration(mixture) {
      this.stored = false;
      this.target.removeAttribute('data-amber-stored');
      if (this.layer.dataset.ready !== 'webgl' || this.software) {
        this.cancelPending();
        this.deferred = true;
        this.scene?.setPaused(true);
        this.layer.dataset.ready = 'fallback';
      } else this.scene?.setPaused(false);
      this.setMixture(mixture);
    }

    activate(fromGesture = false) {
      this.deferred = false;
      if (this.scene) this.scene.setPaused(false);
      else {
        if (fromGesture) this.cancelPending();
        this.scheduleScene(true, fromGesture);
      }
    }

    setDay(day, shape) {
      if (this.day === day && this.shape === shape) return;
      this.day = day; this.shape = shape;
      this.still = window.NotchHydroSilhouette.applyToPanel(this.layer.firstElementChild, day, shape);
      this.scene?.setDay(day, shape);
    }

    setMixture(mixture) {
      if (mixture === this.mixture) return;
      this.mixture = mixture;
      const rgb = values => 'rgb(' + values.map(Math.round).join(',') + ')';
      for (const [name, depth] of [['thin', .5], ['body', 1], ['deep', 2]]) {
        const color = rgb(window.NotchHydroAmber.transmittedRGB(mixture, depth));
        this.layer.style.setProperty('--nh-amber-' + name, color);
        if (name === 'body') this.target.style.setProperty('--nh-stored-color', color);
      }
      this.scene?.setMixture(mixture);
    }

    update(frame, mixture, day = this.day, shape = this.shape, mode = 'celebrate') {
      if (mode === 'hidden' || !mixture) {
        if (this.frame || this.stored) this.hide();
        return;
      }
      this.setMixture(mixture);
      if (mode === 'stored') { this.store(); return; }
      if (this.stored) return;
      if (!frame) { this.hide(false); return; }
      this.setDay(day, shape);
      const previous = this.frame;
      this.frame = frame;
      if (frame.settled && !previous?.settled && !this.unavailable && !this.contextLost) this.activate();
      if (!previous || previous.x !== frame.x || previous.y !== frame.y ||
          previous.scaleX !== frame.scaleX || previous.scaleY !== frame.scaleY) {
        this.layer.style.transform = 'translate(' + frame.x + 'px,' + frame.y + 'px) scale(' +
          frame.scaleX + ',' + frame.scaleY + ') translate(-50%,-50%)';
      }
      if (!previous || previous.opacity !== frame.opacity) this.layer.style.opacity = frame.opacity;
      if (previous?.crystallization !== frame.crystallization) {
        this.layer.style.setProperty('--nh-amber-solid', frame.crystallization);
      }
      if (previous?.phase !== frame.phase) {
        this.layer.dataset.phase = frame.phase;
        this.layer.removeAttribute('aria-hidden');
      }
      this.scene?.setFormation(frame.turn, frame.glint, frame.crystallization);
      if (previous?.settled !== frame.settled || this.language !== this.host.getAttribute('language')) this.syncInteraction();
      if (frame.settled) this.updatePresentation(frame, this.host.time());
    }

    setPresentationTurn(angle) {
      if (this.presentationAngle === angle) return;
      this.presentationAngle = angle;
      this.scene?.setPresentationTurn(angle);
      this.still.setPresentationTurn(angle, this.layer.dataset.ready !== 'webgl');
    }

    updatePresentation(frame, now) {
      if (this.drag || this.keyboardInspecting) return;
      if (this.collectAfter != null) {
        if (now >= this.collectAfter) this.flyToInsights(frame, now);
        return;
      }
      this.turnStartsAt ??= now + .2;
      const progress = Math.min(1, (now - this.turnStartsAt) / 1.6);
      if (progress <= 0) return;
      const eased = progress * progress * (3 - 2 * progress);
      this.setPresentationTurn(2 * Math.PI * eased);
      if (progress === 1) this.flyToInsights(frame, now);
      else if (this.layer.dataset.phase !== 'turning') this.layer.dataset.phase = 'turning';
    }

    flyToInsights(frame, now) {
      if (!this.flight || this.flight.width !== this.host.width) {
        const body = this.body.getBoundingClientRect(), target = this.target.getBoundingClientRect();
        const zoom = body.width / this.host.width;
        if (!zoom || !target.width) { this.store(); return; }
        const x = (target.left + target.width / 2 - body.left) / zoom;
        // Aim at the six o'clock stroke of the ring surrounding the chart.
        const y = (target.bottom - body.top) / zoom - .75;
        this.flight = { at: now, width: this.host.width, x, y, halfTile: this.layer.offsetWidth / 2 };
        this.layer.dataset.phase = 'docking';
        this.syncInteraction();
      }
      const { at, x, y, halfTile } = this.flight;
      const t = Math.min(1, (now - at) / .42);
      if (t >= 1) { this.store(true); return; }
      const eased = t * t * (3 - 2 * t);
      // A quadratic curve with its control point under the destination leaves
      // horizontally from the water and meets the ring from directly below.
      const across = 1 - (1 - eased) ** 2;
      const up = eased * eased;
      const scale = 1 - .87 * eased;
      const px = frame.x + (x - frame.x) * across;
      let py = frame.y + (y - frame.y) * up;
      const housingRight = (this.host.width + this.host.cameraHousingWidth) / 2;
      if (this.host.safeAreaTop && px - halfTile * frame.scaleX * scale < housingRight) {
        py = Math.max(py, this.host.safeAreaTop + halfTile * frame.scaleY * scale + 1);
      }
      this.layer.style.transform = 'translate(' + px + 'px,' + py + 'px) scale(' +
        frame.scaleX * scale + ',' + frame.scaleY * scale + ') translate(-50%,-50%)';
      this.layer.style.opacity = 1 - up * .45;
    }

    store(landed = false) {
      if (this.stored) {
        if (this.target.dataset.amberStored === 'landed') this.target.dataset.amberStored = '';
        return;
      }
      this.stored = true;
      this.cancelPending();
      this.scene?.setPaused(true);
      if (this.body.getRootNode().activeElement === this.canvas) this.target.focus({ preventScroll: true });
      this.hide(false);
      this.target.dataset.amberStored = landed && !this.host.reduced ? 'landed' : '';
    }

    syncInteraction() {
      const interactive = Boolean(this.frame?.settled && !this.flight);
      this.language = this.host.getAttribute('language');
      const english = this.language === 'en', name = english ? "Today's amber" : '今日琥珀';
      this.canvas.tabIndex = interactive ? 0 : -1;
      this.layer.setAttribute('role', interactive ? 'group' : 'img');
      if (interactive) this.layer.removeAttribute('aria-label');
      else this.layer.setAttribute('aria-label', name);
      this.canvas.setAttribute('aria-hidden', String(!interactive));
      this.canvas.setAttribute('aria-label', interactive ? name + (english ? '. Drag or use arrow keys to rotate.' : '，可拖动或用方向键转动') : name);
      this.layer.toggleAttribute('data-interactive', interactive);
    }

    takeOver() {
      this.layer.dataset.phase = 'inspecting';
      if (this.layer.dataset.ready !== 'webgl' && !this.contextLost && !this.unavailable) this.activate(true);
    }

    rotate(dx, dy) {
      this.scene?.rotate(dx, dy);
      this.still.rotate(dx, dy, this.layer.dataset.ready !== 'webgl');
    }

    bindInteraction() {
      const canvas = this.canvas;
      canvas.addEventListener('focus', () => {
        this.keyboardInspecting = !this.drag && canvas.matches(':focus-visible');
        if (this.keyboardInspecting) this.takeOver();
      });
      canvas.addEventListener('blur', () => {
        if (this.keyboardInspecting) this.collectAfter = this.host.time() + .18;
        this.keyboardInspecting = false;
      });
      canvas.addEventListener('pointerdown', event => {
        if (!this.layer.hasAttribute('data-interactive') || this.drag || event.button !== 0) return;
        event.stopPropagation();
        this.takeOver();
        canvas.setPointerCapture(event.pointerId);
        this.keyboardInspecting = false;
        this.drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
        canvas.dataset.dragging = '';
      });
      canvas.addEventListener('pointermove', event => {
        if (event.pointerId !== this.drag?.id) return;
        event.stopPropagation();
        const radians = 2 * Math.PI / canvas.getBoundingClientRect().width;
        this.rotate((event.clientX - this.drag.x) * radians, (event.clientY - this.drag.y) * radians);
        this.drag.x = event.clientX;
        this.drag.y = event.clientY;
      });
      for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(type, event => {
        if (event.pointerId !== this.drag?.id) return;
        event.stopPropagation();
        this.endDrag();
      });
      canvas.addEventListener('keydown', event => {
        if (!this.layer.hasAttribute('data-interactive') || event.altKey || event.metaKey || event.ctrlKey) return;
        const step = Math.PI / 12;
        const delta = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[event.key];
        if (delta) {
          event.preventDefault(); event.stopPropagation();
          this.keyboardInspecting = true;
          this.takeOver(); this.rotate(...delta);
        }
      });
      canvas.addEventListener('webglcontextlost', event => {
        event.preventDefault();
        if (this.disposed) return;
        this.still?.setPresentationTurn(this.presentationAngle);
        this.layer.dataset.ready = 'fallback';
        this.contextLost = true;
        this.syncInteraction();
      });
      canvas.addEventListener('webglcontextrestored', () => {
        if (this.disposed) return;
        this.contextLost = false;
        this.syncInteraction();
      });
    }

    endDrag() {
      if (!this.drag) return;
      const { id } = this.drag;
      this.drag = null;
      this.collectAfter = this.host.time() + .18;
      delete this.canvas.dataset.dragging;
      if (this.canvas.hasPointerCapture(id)) this.canvas.releasePointerCapture(id);
    }

    hide(cancelCelebration = true) {
      if (cancelCelebration) {
        this.stored = false;
        this.target.removeAttribute('data-amber-stored');
        this.cancelPending();
        this.deferred = this.software;
        if (this.software) {
          this.scene?.setPaused(true);
          this.layer.dataset.ready = 'fallback';
        }
      }
      if (!this.frame) return;
      this.endDrag();
      this.frame = null;
      this.flight = null;
      this.turnStartsAt = null;
      this.presentationAngle = 0;
      this.collectAfter = null;
      this.keyboardInspecting = false;
      delete this.layer.dataset.phase;
      this.layer.setAttribute('aria-hidden', 'true');
      this.syncInteraction();
      this.scene?.resetPose();
      this.still?.resetPose();
    }

    dispose() {
      this.disposed = true;
      this.cancelPending();
      this.endDrag();
      if (this.scene) this.scene.dispose();
      else this.context?.getExtension('WEBGL_lose_context')?.loseContext();
      this.layer.remove();
    }
  };
})();
