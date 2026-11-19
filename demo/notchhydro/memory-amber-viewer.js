/* Render and inspect the dated amber collection inside the Insights panel. */
(() => {
  'use strict';

  // Page-lifetime observations; the collection's saved shape and color stay independent.
  const observations = new Map();
  function observationFor(seed, day, shape) {
    const key = JSON.stringify([seed, day.date]);
    let entry = observations.get(key);
    if (!entry) {
      entry = { rotation: new DOMMatrix() };
      observations.set(key, entry);
    }
    const appearance = JSON.stringify([shape, day.color.amber]);
    if (entry.appearance !== appearance) {
      entry.appearance = appearance;
      entry.image = null;
    }
    return entry;
  }

  function copyImage(source, target) {
    const ctx = target.getContext('2d');
    ctx.clearRect(0, 0, target.width, target.height);
    ctx.drawImage(source, 0, 0, target.width, target.height);
  }

  function createMemoryScene(canvas, day, shape, compact, onFirstPaint) {
    let context, scene;
    try {
      const opts = { alpha: true, antialias: true, powerPreference: 'low-power' };
      context = canvas.getContext('webgl2', opts) || canvas.getContext('webgl', opts);
      if (!context) return null;
      scene = window.createAmberScene(canvas, onFirstPaint, { context, day, shape, compact });
      scene.setDark(true);
      return { scene, context };
    } catch {
      if (scene) scene.dispose();
      else context?.getExtension('WEBGL_lose_context')?.loseContext();
      return null;
    }
  }

  window.NotchHydroAmberThumbnails = class AmberThumbnails {
    constructor(root) {
      this.root = root;
      this.tiles = [];
      this.next = 0;
      this.frame = null;
      this.canvas = document.createElement('canvas');
      this.canvas.className = 'ni-week-renderer';
      this.canvas.setAttribute('aria-hidden', 'true');
      root.append(this.canvas);
      this.canvas.addEventListener('webglcontextlost', event => {
        event.preventDefault();
        this.lost = true;
        this.update(this.tiles, this.seed);
      });
      this.canvas.addEventListener('webglcontextrestored', () => {
        this.lost = false;
        this.resume();
      });
    }

    update(tiles, seed) {
      cancelAnimationFrame(this.frame);
      this.frame = null;
      this.tiles = tiles;
      this.seed = seed;
      this.next = 0;
      for (const tile of tiles) {
        const { canvas, day, shape, pose } = tile;
        tile.observation = seed == null ? null : observationFor(seed, day, shape);
        if (tile.observation?.image) {
          copyImage(tile.observation.image, canvas);
          canvas.dataset.renderer = tile.observation.renderer;
          continue;
        }
        window.NotchHydroSilhouette.drawStill(canvas, day.date, shape, day.color.amber, tile.observation?.rotation || pose);
        canvas.dataset.renderer = 'fallback';
      }
      this.resume();
    }

    get visible() {
      return this.root.isConnected && !this.root.hidden && ['day', 'week', 'month', 'year'].includes(this.root.dataset.range) &&
        !this.tiles[this.next]?.canvas.closest('[inert],.ni-jar-in-flight,.ni-jar-viewer[data-preview-transition]') && this.canvas.clientWidth > 0;
    }

    resume() {
      while (this.tiles[this.next]?.observation?.image) this.next++;
      if (this.next >= this.tiles.length || this.frame !== null || this.scene === null || this.lost || !this.visible) return;
      this.frame = requestAnimationFrame(() => this.renderNext());
    }

    renderNext() {
      this.frame = null;
      if (this.next >= this.tiles.length || !this.visible || this.lost) return;
      const { canvas, day, shape, pose, observation } = this.tiles[this.next++];
      if (observation?.image) { this.resume(); return; }
      if (canvas.isConnected && this.root.contains(canvas)) {
        if (this.scene === undefined) {
          const renderer = createMemoryScene(this.canvas, day.date, shape, true);
          this.scene = renderer?.scene || null;
          if (!this.scene) return;
          this.context = renderer.context;
          // Only renderNow() draws; resizing and per-tile setters don't queue extra work.
          this.scene.setPaused(true);
          this.scene.setFormation(window.NotchHydroShape.view.settledTurn, 0, 1);
        }
        this.scene.setDay(day.date, shape);
        this.scene.setRestPose(observation?.rotation || pose);
        this.scene.setMixture(day.color.amber);
        this.scene.renderNow();
        if (!this.context.isContextLost()) {
          copyImage(this.canvas, canvas);
          canvas.dataset.renderer = 'webgl';
        }
      }
      this.resume();
    }

    dispose() {
      cancelAnimationFrame(this.frame);
      this.tiles = [];
      this.scene?.dispose();
      this.scene = null;
      this.canvas.remove();
    }
  };

  window.NotchHydroMemoryAmberViewer = class MemoryAmberViewer {
    constructor(owner) {
      this.owner = owner;
      this.root = document.createElement('section');
      this.root.className = 'ni-amber-viewer';
      this.root.setAttribute('role', 'dialog');
      this.root.setAttribute('aria-modal', 'true');
      this.root.hidden = true;
      this.root.innerHTML = `
        <button type="button" class="ni-amber-view-close cursor-interaction">×</button>
        <div class="ni-amber-view-stage cursor-interaction" tabindex="0" role="group">
          <canvas class="ni-amber-view-canvas" aria-hidden="true"></canvas>
          <canvas class="ni-amber-view-poster" aria-hidden="true"></canvas>
        </div>
        <time class="ni-amber-view-date"></time>`;
      owner.insights.root.append(this.root);
      this.closeButton = this.root.querySelector('button');
      this.stage = this.root.querySelector('.ni-amber-view-stage');
      this.canvas = this.stage.querySelector('.ni-amber-view-canvas');
      this.poster = this.stage.querySelector('.ni-amber-view-poster');
      this.time = this.root.querySelector('time');
      this.transition = new window.NotchHydroMemoryPreviewTransition(this.root, this.stage, () => this.owner.reduced);
      this.closeButton.addEventListener('click', () => this.close());
      this.root.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
          event.preventDefault(); event.stopPropagation(); this.close();
        } else if (event.key === 'Tab') {
          event.preventDefault();
          (event.target === this.stage ? this.closeButton : this.stage).focus({ preventScroll: true });
        }
      });
      this.stage.addEventListener('keydown', event => {
        if (event.altKey || event.metaKey || event.ctrlKey) return;
        const step = Math.PI / 12;
        const delta = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[event.key];
        if (delta) {
          event.preventDefault(); event.stopPropagation(); this.rotate(...delta);
        }
      });
      this.stage.addEventListener('pointerdown', event => {
        if (event.button !== 0 || this.drag || this.transition.phase === 'closing') return;
        this.transition.finishOpening();
        this.stage.focus({ preventScroll: true });
        this.stage.setPointerCapture(event.pointerId);
        this.drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
        this.stage.dataset.dragging = '';
      });
      this.stage.addEventListener('pointermove', event => {
        if (event.pointerId !== this.drag?.id) return;
        const scale = 2 * Math.PI / this.stage.getBoundingClientRect().width;
        this.rotate((event.clientX - this.drag.x) * scale, (event.clientY - this.drag.y) * scale);
        this.drag.x = event.clientX; this.drag.y = event.clientY;
      });
      for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
        this.stage.addEventListener(type, event => {
          if (event.pointerId === this.drag?.id) this.endDrag();
        });
      }
      this.canvas.addEventListener('webglcontextlost', event => {
        event.preventDefault();
        this.contextLost = true;
        if (!this.isOpen || this.transition.phase === 'closing') return;
        this.drawFallback();
        this.root.dataset.renderer = 'fallback';
      });
    }

    get isOpen() { return !this.root.hidden; }

    originButton() {
      const insights = this.owner.insights;
      const selector = insights.range === 'day' ? `.ni-day-amber[data-amber-day="${this.day.date}"]` :
        `.ni-week-days [data-preview-day="${this.day.date}"]`;
      return this.trigger?.isConnected && this.trigger.matches(selector) ? this.trigger : insights.q(selector);
    }

    open(day, shape, trigger) {
      if (!shape || !day?.color?.amber || day.progress < 1) return;
      if (this.isOpen) this.close(false);
      this.day = day; this.shape = shape; this.trigger = trigger;
      this.observation = observationFor(this.owner.collectionProfile.seed, day, shape);
      this.sceneReady = false;
      const mixture = day.color.amber;
      for (const [name, depth] of [['thin', .5], ['body', 1], ['deep', 2]]) {
        const rgb = window.NotchHydroAmber.transmittedRGB(mixture, depth);
        this.root.style.setProperty('--nh-amber-' + name, 'rgb(' + rgb.map(Math.round).join(',') + ')');
      }
      const label = new Intl.DateTimeFormat(this.owner.english ? 'en-US' : 'zh-CN',
        { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }).format(new Date(day.date + 'T12:00:00Z'));
      this.time.dateTime = day.date; this.time.textContent = label;
      this.root.setAttribute('aria-label', this.owner.text(label + '的琥珀', 'Amber for ' + label));
      this.closeButton.setAttribute('aria-label', this.owner.text('关闭琥珀', 'Close amber'));
      this.stage.setAttribute('aria-label', this.owner.text('旋转琥珀，可拖动或使用方向键', 'Rotate amber by dragging or using the arrow keys'));
      this.root.dataset.date = day.date;
      this.root.dataset.renderer = 'fallback';
      const source = this.originButton()?.querySelector('canvas');
      this.poster.width = this.poster.height = Math.ceil(272 * Math.min(window.devicePixelRatio || 1, 2));
      const image = this.observation.image || source;
      if (image) copyImage(image, this.poster);
      else this.drawFallback();
      this.root.hidden = false;
      this.stage.focus({ preventScroll: true });
      this.background ??= [this.owner.el.header, ...this.root.parentElement.children].filter(el => el !== this.root && !el.inert);
      this.background.forEach(el => { el.inert = true; });
      // Carry the thumbnail's own paint and prepare the full-resolution glass at the center.
      this.transition.open(source, () => this.prepareScene());
    }

    prepareScene() {
      this.sceneReady = true;
      if (!this.checkedWebGL) {
        this.checkedWebGL = true;
        this.scene = createMemoryScene(this.canvas, this.day.date, this.shape, false, () => {
          this.contextLost = false;
          if (this.isOpen) {
            this.root.dataset.renderer = 'webgl';
          }
        })?.scene;
      }
      if (this.scene) {
        this.scene.setPaused(true);
        this.scene.setDay(this.day.date, this.shape);
        this.scene.resetPose();
        this.scene.setFormation(window.NotchHydroShape.view.settledTurn, 0, 1);
        this.scene.setRestPose(this.observation.rotation);
        this.scene.setMixture(this.day.color.amber);
        this.scene.setPaused(false);
      }
    }

    drawFallback() {
      window.NotchHydroSilhouette.drawStill(this.poster, this.day.date, this.shape,
        this.day.color.amber, this.observation.rotation);
    }

    rotate(dx, dy) {
      if (!this.isOpen || this.transition.phase === 'closing' || (!dx && !dy)) return;
      this.transition.finishOpening();
      const degrees = 180 / Math.PI;
      const turn = new DOMMatrix().rotateAxisAngle(1, 0, 0, dy * degrees).rotateAxisAngle(0, 1, 0, dx * degrees);
      this.observation.rotation = turn.multiply(this.observation.rotation);
      this.observation.image = null;
      this.scene?.setRestPose(this.observation.rotation);
      if (!this.scene || this.contextLost) this.drawFallback();
    }

    endDrag() {
      if (!this.drag) return;
      const { id } = this.drag;
      this.drag = null;
      delete this.stage.dataset.dragging;
      if (this.stage.hasPointerCapture(id)) this.stage.releasePointerCapture(id);
    }

    close(restoreFocus = true) {
      if (!this.isOpen) return;
      if (restoreFocus && this.transition.phase === 'closing') return;
      this.endDrag();
      const source = this.originButton()?.querySelector('canvas');
      if (this.sceneReady && this.transition.phase !== 'closing') {
        // Read the WebGL drawing buffer in the same turn as the final draw.
        // Browsers may clear the buffer after compositing a frame.
        if (this.scene && !this.contextLost) {
          if (this.scene.renderNow()) copyImage(this.canvas, this.poster);
          else {
            this.drawFallback();
            this.root.dataset.renderer = 'fallback';
          }
        }
        const observation = this.observation;
        if (!observation.image || observation.renderer !== this.root.dataset.renderer) {
          observation.image ||= document.createElement('canvas');
          observation.image.width = observation.image.height = 256;
          copyImage(this.poster, observation.image);
          observation.renderer = this.root.dataset.renderer;
        }
        if (source) {
          copyImage(observation.image, source);
          source.dataset.renderer = observation.renderer;
        }
        // The stage and its destination now carry the same glass and reflections.
        this.root.dataset.renderer = 'still';
      }
      this.scene?.setPaused(true);
      if (restoreFocus) {
        this.transition.close(source, () => this.finishClose(true));
      } else {
        this.transition.cancel();
        this.finishClose(false);
      }
    }

    finishClose(restoreFocus) {
      this.root.hidden = true;
      this.background.forEach(el => { el.inert = false; });
      this.owner.insights.amberThumbnails?.resume();
      this.background = null;
      if (restoreFocus) this.originButton()?.focus({ preventScroll: true });
      this.trigger = this.day = this.shape = this.observation = null;
    }

    dispose() {
      this.close(false);
      this.scene?.dispose();
      this.root.remove();
    }
  };
})();
