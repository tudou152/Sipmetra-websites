/* Carry a jar between its annual shelf position and the monthly calendar. */
(() => {
  'use strict';

  window.NotchHydroAnnualJarTransition = class AnnualJarTransition {
    constructor(insights) {
      this.insights = insights;
    }

    bounds(slot) {
      if (!slot?.isConnected || document.hidden || this.insights.owner.reduced) return null;
      const box = slot.getBoundingClientRect();
      const clip = this.insights.q('.ni-scroll').getBoundingClientRect();
      if (!box.width || !box.height || box.right <= clip.left || box.left >= clip.right ||
          box.bottom <= clip.top || box.top >= clip.bottom) return null;
      return box;
    }

    capture(slot) {
      return { slot, box: this.bounds(slot) };
    }

    play(source, slot, range) {
      this.cancel();
      if (!slot || !source?.slot) return;
      // The month gets larger canvases for its stones. Carry the highlights
      // from the year while the destination's own renderer warms up.
      for (const original of source.slot.querySelectorAll('[data-jar-day][data-renderer=webgl]')) {
        const copy = slot.querySelector(`[data-jar-day="${original.dataset.jarDay}"][data-renderer=fallback]`);
        if (!copy) continue;
        const context = copy.getContext('2d');
        context.clearRect(0, 0, copy.width, copy.height);
        context.drawImage(original, 0, 0, copy.width, copy.height);
        copy.dataset.renderer = 'webgl';
      }
      const from = source.box;
      const to = this.bounds(slot);
      if (!from || !to || typeof slot.animate !== 'function') return;
      // Use the destination's live glass and stones. The outer slot travels
      // independently of the tilt and the positions inside the jar.
      const x = (from.left - to.left) / to.width * 100;
      const y = (from.top - to.top) / to.height * 100;
      const transform = `translate(${x}%, ${y}%) scale(${from.width / to.width}, ${from.height / to.height})`;
      const { root } = this.insights;
      root.dataset.yearJarTravel = range;
      slot.classList.add('ni-jar-in-flight');
      const animation = slot.animate([{ transform }, { transform: 'none' }], {
        duration: range === 'month' ? 460 : 370, easing: 'cubic-bezier(.32,0,.20,1)', fill: 'both'
      });
      const stopped = () => { if (document.hidden || this.insights.owner.reduced) this.cancel(); };
      const media = window.matchMedia('(prefers-reduced-motion: reduce)');
      const observer = new MutationObserver(stopped);
      observer.observe(this.insights.owner, { attributes: true, attributeFilter: ['reduced'] });
      document.addEventListener('visibilitychange', stopped);
      media.addEventListener('change', stopped);
      this.flight = { slot, animation, stopped, media, observer };
      animation.onfinish = () => this.cancel();
    }

    cancel() {
      if (!this.flight) return;
      const { slot, animation, stopped, media, observer } = this.flight;
      this.flight = null;
      animation.onfinish = null;
      animation.cancel();
      observer.disconnect();
      document.removeEventListener('visibilitychange', stopped);
      media.removeEventListener('change', stopped);
      slot.classList.remove('ni-jar-in-flight');
      delete this.insights.root.dataset.yearJarTravel;
      this.insights.amberThumbnails?.resume();
    }
  };
})();
