(() => {
  'use strict';

  window.NotchHydroInsightsMenu = class InsightsMenu {
    constructor(anchor, onAction) {
      this.anchor = anchor;
      this.button = anchor.querySelector('.ni-more');
      this.menu = anchor.querySelector('[role=menu]');
      this.onOutside = event => {
        if (!event.composedPath().includes(anchor)) this.close();
      };
      this.button.addEventListener('click', () => {
        if (this.menu.hidden) this.open();
        else this.close(true);
      });
      anchor.addEventListener('focusout', event => {
        if (!anchor.contains(event.relatedTarget)) this.close();
      });
      this.menu.addEventListener('click', event => {
        const item = event.target.closest('[data-action]');
        if (!item || item.disabled) return;
        const action = item.dataset.action;
        this.close(action !== 'preferences');
        onAction(action);
      });
      anchor.addEventListener('keydown', event => this.onKey(event));
    }

    get items() { return Array.from(this.menu.querySelectorAll('button:enabled')); }

    open(last = false) {
      this.menu.hidden = false;
      this.button.setAttribute('aria-expanded', 'true');
      document.addEventListener('pointerdown', this.onOutside, true);
      this.items.at(last ? -1 : 0)?.focus({ preventScroll: true });
    }

    close(restoreFocus = false) {
      if (this.menu.hidden) return;
      this.button.setAttribute('aria-expanded', 'false');
      this.menu.hidden = true;
      document.removeEventListener('pointerdown', this.onOutside, true);
      if (restoreFocus) this.button.focus({ preventScroll: true });
    }

    onKey(event) {
      const { key } = event;
      if (this.menu.hidden) {
        if (key !== 'ArrowDown' && key !== 'ArrowUp') return;
        this.open(key === 'ArrowUp');
      } else if (key === 'Escape') {
        this.close(true);
      } else if (key === 'Tab') {
        this.close(true);
        return;
      } else {
        const items = this.items;
        const index = items.indexOf(event.target);
        let next;
        switch (key) {
          case 'Home': next = 0; break;
          case 'End': next = items.length - 1; break;
          case 'ArrowDown': next = (index + 1) % items.length; break;
          case 'ArrowUp': next = (index + items.length - 1) % items.length; break;
          default: return;
        }
        items[next]?.focus({ preventScroll: true });
      }
      event.preventDefault();
      event.stopPropagation();
    }
  };
})();
