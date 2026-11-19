/* The calendar and its preview carry the same glass, stones and running motion. */
(() => {
  'use strict';

  const width = 160, height = 132;
  function reportImpact(insights, impact) {
    const viewer = insights.jarViewer;
    if (viewer?.isOpen && viewer.transition.phase !== 'closing') {
      insights.owner.audio.jarImpact(impact, !insights.owner.reduced);
    }
  }

  window.NotchHydroMonthJarViewer = class MonthJarViewer {
    constructor(insights) {
      this.insights = insights;
      this.root = document.createElement('section');
      this.root.className = 'ni-jar-viewer';
      this.root.dataset.range = 'month';
      this.root.hidden = true;
      this.root.setAttribute('role', 'dialog');
      this.root.setAttribute('aria-modal', 'true');
      this.root.innerHTML = `
        <button type="button" class="ni-amber-view-close ni-jar-view-close cursor-interaction">×</button>
        <div class="ni-jar-view-stage cursor-interaction" role="group" tabindex="0">
          <div class="ni-jar-view-vessel"></div>
        </div>
        <div class="ni-jar-caption"></div>
        <button type="button" class="ni-jar-shake cursor-interaction"></button>`;
      insights.root.append(this.root);
      this.closeButton = this.root.querySelector('.ni-jar-view-close');
      this.stage = this.root.querySelector('.ni-jar-view-stage');
      this.transition = new window.NotchHydroMemoryPreviewTransition(this.root, this.stage, () => insights.owner.reduced);
      this.vessel = this.root.querySelector('.ni-jar-view-vessel');
      this.caption = this.root.querySelector('.ni-jar-caption');
      this.shakeButton = this.root.querySelector('.ni-jar-shake');
      this.sessions = insights.jarSessions ||= new Map();
      this.reportImpact = reportImpact.bind(null, insights);
      this.targetX = this.targetY = 0;
      this.frame = null;
      this.closeButton.addEventListener('click', () => this.close());
      this.shakeButton.addEventListener('click', () => this.shake());
      this.root.addEventListener('keydown', event => this.onKey(event));
      this.root.addEventListener('click', event => {
        // The fading dialog still owns pointer input. Only a click over the
        // calendar's actual back arrow can queue the next leg of the return.
        if (event.detail > 0 && this.transition.phase === 'closing' && this.insights.yearOrigin) {
          const back = this.insights.owner.el.back.getBoundingClientRect();
          if (event.clientX >= back.left && event.clientX < back.right &&
              event.clientY >= back.top && event.clientY < back.bottom) {
            this.goBack();
            return;
          }
        }
        if (event.target === this.root) this.close();
      });
      this.stage.addEventListener('pointerdown', event => this.grab(event));
      this.stage.addEventListener('pointermove', event => this.dragTo(event));
      for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
        this.stage.addEventListener(type, event => {
          if (this.drag?.id === event.pointerId) this.release();
        });
      }
      this.onVisibility = () => {
        if (document.hidden) {
          this.release();
          this.autoShake = null;
          this.targetX = this.targetY = 0;
          this.pause();
          this.insights.owner.audio.stopJar();
        } else this.resume();
      };
      document.addEventListener('visibilitychange', this.onVisibility);
    }

    get isOpen() { return !this.root.hidden; }

    bindMonth(key, jar, tiles) {
      this.pause();
      this.surfaceRange = this.insights.range;
      this.key = key;
      this.jar = jar;
      this.tiles = tiles;
      this.state = this.sessions.get(key);
      if (this.state) {
        const previous = this.state.motion.bodies;
        if (previous.length !== tiles.length || tiles.some((tile, i) => tile.day.date !== previous[i].date)) {
          this.state.motion = this.createMotion(previous);
        }
        this.paint();
        this.resume();
      } else jar.artwork.style.transform = '';
    }

    createMotion(previous) {
      return window.NotchHydroJarMotion.create(this.tiles.map(tile => tile.body), this.reportImpact, previous);
    }

    open(label, trigger) {
      if (this.isOpen) return;
      if (!this.state) {
        this.state = { x: 0, y: 0, vx: 0, vy: 0, motion: this.createMotion() };
        this.sessions.set(this.key, this.state);
      }
      const count = this.tiles.length, text = (zh, en) => this.insights.text(zh, en);
      this.trigger = trigger;
      this.root.setAttribute('aria-label', label);
      this.stage.setAttribute('aria-label', text('摇动玻璃罐，可拖动或按方向键',
        'Shake the jar by dragging or using the arrow keys'));
      this.closeButton.setAttribute('aria-label', text('关闭玻璃罐', 'Close jar'));
      this.shakeButton.textContent = text('摇一摇', 'Shake');
      this.caption.textContent = this.insights.periodLabel() + ' · ' +
        text(count + ' 颗琥珀', count + (count === 1 ? ' amber stone' : ' amber stones'));
      this.root.hidden = false;
      this.background = [this.insights.owner.el.header, ...this.root.parentElement.children].filter(el => el !== this.root && !el.inert);
      this.background.forEach(el => { el.inert = true; });
      this.vessel.append(this.jar.artwork);
      this.stage.focus({ preventScroll: true });
      this.transition.open(this.jar.container, () => this.insights.amberThumbnails?.resume());
      this.resume();
    }

    onKey(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        if (!event.repeat) this.goBack();
      } else if (event.key === 'Tab') {
        const controls = [this.closeButton, this.stage, this.shakeButton];
        const next = controls.indexOf(event.target) + (event.shiftKey ? -1 : 1);
        event.preventDefault();
        controls[(next + controls.length) % controls.length].focus({ preventScroll: true });
      } else if (event.target === this.stage && !event.altKey && !event.ctrlKey && !event.metaKey &&
          ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' ', 'Enter'].includes(event.key)) {
        event.preventDefault();
        event.stopPropagation();
        if (!event.repeat) this.shake(event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1);
      }
    }

    unlockAudio() {
      const audio = this.insights.owner.audio;
      if (audio.enabled && audio.context?.state === 'suspended') audio.activate(true);
    }

    grab(event) {
      if (event.button !== 0 || this.drag || !event.isPrimary || this.transition.phase === 'closing') return;
      this.transition.finishOpening();
      this.unlockAudio();
      this.autoShake = null;
      this.stage.focus({ preventScroll: true });
      this.stage.setPointerCapture(event.pointerId);
      this.drag = { id: event.pointerId, x: event.clientX, y: event.clientY,
        originX: this.state.x, originY: this.state.y, unit: width / this.stage.getBoundingClientRect().width };
      this.targetX = this.state.x;
      this.targetY = this.state.y;
      this.stage.dataset.dragging = '';
    }

    dragTo(event) {
      if (this.drag?.id !== event.pointerId) return;
      const d = this.drag;
      this.targetX = 16 * Math.tanh((d.originX + (event.clientX - d.x) * d.unit) / 16);
      this.targetY = 9 * Math.tanh((d.originY + (event.clientY - d.y) * d.unit) / 9);
      this.wake();
    }

    release() {
      if (!this.drag) return;
      const { id } = this.drag;
      this.drag = null;
      delete this.stage.dataset.dragging;
      if (this.stage.hasPointerCapture(id)) this.stage.releasePointerCapture(id);
      this.targetX = this.targetY = 0;
      this.resume();
    }

    shake(direction = 1) {
      if (this.transition.phase === 'closing') return;
      this.transition.finishOpening();
      this.unlockAudio();
      this.release();
      this.autoShake = { elapsed: 0, direction };
      this.wake();
    }

    get visible() {
      return !document.hidden && (this.isOpen || (this.insights.active && this.insights.range === this.surfaceRange &&
        this.insights.owner.open && this.insights.owner.opening?.open !== false && this.jar?.container.isConnected));
    }

    resume() {
      const s = this.state;
      if (s && (!s.motion.sleeping || s.x || s.y || s.vx || s.vy || this.autoShake)) this.wake();
    }

    pause() {
      cancelAnimationFrame(this.frame);
      this.frame = null;
    }

    wake() {
      if (this.frame !== null || !this.visible) return;
      delete this.root.dataset.resting;
      this.lastFrame = performance.now();
      this.frame = requestAnimationFrame(time => this.tick(time));
    }

    tick(time) {
      this.frame = null;
      if (!this.visible) return;
      const s = this.state;
      const dt = Math.max(0, Math.min((time - this.lastFrame) / 1000, 1 / 30));
      this.lastFrame = time;
      const reduced = this.insights.owner.reduced;
      if (this.autoShake) {
        this.autoShake.elapsed += dt;
        const t = Math.min(1, this.autoShake.elapsed / (reduced ? .48 : .78));
        const wave = Math.sin(Math.PI * t) * Math.sin(4 * Math.PI * t);
        this.targetX = this.autoShake.direction * 16 * wave;
        this.targetY = -4 * Math.abs(wave);
        if (t === 1) {
          this.autoShake = null;
          this.targetX = this.targetY = 0;
        }
      }
      // The hand moves the glass. Stones feel the opposite acceleration at
      // each change of direction, including the spring back after release.
      const returning = !this.isOpen || this.transition.phase === 'closing';
      const stiffness = returning ? 96 : 220, damping = returning ? 19 : 23;
      const ax = stiffness * (this.targetX - s.x) - damping * s.vx;
      const ay = stiffness * (this.targetY - s.y) - damping * s.vy;
      s.vx += ax * dt; s.vy += ay * dt;
      s.x += s.vx * dt; s.y += s.vy * dt;
      const gain = reduced ? .5 : 1;
      const tilt = reduced ? 0 : s.x * .65 * Math.PI / 180;
      const cos = Math.cos(tilt), sin = Math.sin(tilt);
      // Resolve acceleration in jar space at either display size.
      s.motion.step(dt, -(ax * cos + ay * sin) * gain, (ax * sin - ay * cos) * gain, tilt);
      const moving = Math.abs(s.x - this.targetX) + Math.abs(s.y - this.targetY) > .015 ||
        Math.abs(s.vx) + Math.abs(s.vy) > .24;
      if (this.autoShake || moving || !s.motion.sleeping) {
        this.frame = requestAnimationFrame(next => this.tick(next));
      } else {
        this.root.dataset.resting = '';
        s.x = this.targetX; s.y = this.targetY; s.vx = s.vy = 0;
      }
      this.paint();
      if (this.frame === null) this.releaseAnnualSurface();
    }

    paint() {
      this.jar.paintMotion(this.state, this.insights.owner.reduced);
    }

    releaseAnnualSurface() {
      if (this.surfaceRange === 'year') this.surfaceRange = this.state = this.jar = this.tiles = null;
    }

    goBack() {
      if (this.transition.phase === 'closing') {
        if (this.insights.yearOrigin) this.returnAfterClose = true;
      } else this.close();
    }

    close(restoreFocus = true) {
      if (!this.isOpen) {
        if (!restoreFocus) {
          this.pause();
          this.releaseAnnualSurface();
        }
        return;
      }
      if (restoreFocus && this.transition.phase === 'closing') return;
      this.release();
      this.autoShake = null;
      this.targetX = this.targetY = 0;
      this.insights.owner.audio.stopJar();
      if (restoreFocus) {
        this.transition.close(this.jar.container, () => this.finishClose(true));
        this.resume();
      } else {
        this.transition.cancel();
        this.finishClose(false);
        this.pause();
      }
    }

    finishClose(restoreFocus) {
      const returnToYear = restoreFocus && this.returnAfterClose;
      this.returnAfterClose = false;
      this.jar.container.append(this.jar.artwork);
      this.root.hidden = true;
      this.background.forEach(el => { el.inert = false; });
      this.insights.amberThumbnails?.resume();
      if (restoreFocus && !returnToYear && this.trigger?.isConnected) this.trigger.focus({ preventScroll: true });
      this.background = this.trigger = null;
      if (returnToYear) this.insights.returnToYear();
    }

    dispose() {
      this.close(false);
      document.removeEventListener('visibilitychange', this.onVisibility);
      this.root.remove();
    }
  };
})();
