/* Move the preview stage between the thumbnail's bounds and the center. */
(() => {
  'use strict';
  const openTime = 500, closeTime = 380;

  function fade(start, end, from, to) {
    return [{ opacity:from, offset:0 }, { opacity:from, offset:start, easing:'ease-in-out' },
      { opacity:to, offset:end }, { opacity:to, offset:1 }];
  }

  window.NotchHydroMemoryPreviewTransition = class MemoryPreviewTransition {
    constructor(root, stage, reduced) {
      this.root = root;
      this.stage = stage;
      this.reduced = reduced;
      this.phase = 'idle';
    }

    prepare(source, phase) {
      if (!source?.isConnected || !this.stage.isConnected || document.hidden ||
          this.reduced() || typeof this.stage.animate !== 'function') return false;
      const from = source.getBoundingClientRect(), to = this.stage.getBoundingClientRect();
      if (!from.width || !from.height || !to.width || !to.height) return false;
      const clip = (source.closest('.ni-scroll') || this.root).getBoundingClientRect();
      if (from.right <= clip.left || from.left >= clip.right || from.bottom <= clip.top || from.top >= clip.bottom) return false;

      const controls = Array.from(this.root.children).filter(el => el !== this.stage && !el.matches('.ni-week-renderer'));
      const backdrop = document.createElement('div');
      backdrop.className = 'ni-preview-backdrop';
      backdrop.setAttribute('aria-hidden', 'true');
      backdrop.style.background = getComputedStyle(this.root).background;
      this.root.prepend(backdrop);
      source.classList.add('ni-preview-source-hidden');
      this.root.dataset.previewTransition = this.phase = phase;

      // Percent translations use the stage's own box, so the viewport rects
      // remain exact under the prototype's scaled ancestor and browser zoom.
      const dx = (from.left - to.left) / to.width * 100, dy = (from.top - to.top) / to.height * 100;
      const small = `translate(${dx}%, ${dy}%) scale(${from.width / to.width}, ${from.height / to.height})`;
      const timing = { duration:openTime, fill:'both' };
      const travel = this.stage.animate([{transform:small}, {transform:'none'}],
        { ...timing, easing:'cubic-bezier(.32,0,.20,1)' });
      const animations = [travel, backdrop.animate(fade(.24,.92,0,1), timing),
        ...controls.map(control => control.animate(fade(.71,.98,0,1), timing))];
      const flight = this.flight = { source, backdrop, animations, travel };
      for (const animation of animations) {
        animation.pause();
        animation.currentTime = phase === 'opening' ? 0 : openTime;
        animation.playbackRate = phase === 'opening' ? 1 : -openTime / closeTime;
        animation.play();
      }
      travel.onfinish = () => { if (this.flight === flight) this.complete(); };
      // An interrupted or hidden animation may never get a presentation frame.
      flight.checkMotion = () => { if (document.hidden || this.reduced()) this.complete(); };
      document.addEventListener('visibilitychange', flight.checkMotion);
      flight.media = window.matchMedia('(prefers-reduced-motion: reduce)');
      flight.media.addEventListener('change', flight.checkMotion);
      const host = this.root.getRootNode().host;
      if (host) {
        flight.observer = new MutationObserver(flight.checkMotion);
        flight.observer.observe(host, { attributes:true, attributeFilter:['reduced'] });
      }
      return true;
    }

    open(source, onOpened) {
      this.cancel();
      if (this.prepare(source, 'opening')) this.onComplete = onOpened;
      else onOpened?.();
    }

    close(source, onClosed) {
      if (this.phase === 'closing') return;
      const flight = this.flight;
      if (this.phase === 'opening' && flight.source === source && source.isConnected && !this.reduced() && !document.hidden) {
        this.onComplete = onClosed;
        this.root.dataset.previewTransition = this.phase = 'closing';
        if (!(flight.travel.currentTime > 0)) { this.complete(); return; }
        for (const animation of flight.animations) animation.updatePlaybackRate(-openTime / closeTime);
        return;
      }
      this.cancel();
      if (this.prepare(source, 'closing')) this.onComplete = onClosed;
      else onClosed();
    }

    finishOpening() {
      if (this.phase === 'opening') this.complete();
    }

    complete() {
      const callback = this.onComplete;
      this.cancel();
      callback?.();
    }

    cancel() {
      const flight = this.flight;
      if (!flight) return;
      this.flight = this.onComplete = null;
      flight.travel.onfinish = null;
      for (const animation of flight.animations) animation.cancel();
      document.removeEventListener('visibilitychange', flight.checkMotion);
      flight.media.removeEventListener('change', flight.checkMotion);
      flight.observer?.disconnect();
      flight.source.classList.remove('ni-preview-source-hidden');
      flight.backdrop.remove();
      delete this.root.dataset.previewTransition;
      this.phase = 'idle';
    }
  };
})();
