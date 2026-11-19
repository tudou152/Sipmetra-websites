/* Each demo profile owns its drink list. Records keep the drink object captured at pour time. */
(() => {
  'use strict';
  const { drinks, palette } = window.NotchHydroFluid;
  const milkDrinks = [
    { id: 'milk', name: '牛奶', en: 'Milk', factor: 1, dot: '#E8DFCF', opacity: .80 },
    { id: 'milktea', name: '奶茶', en: 'Milk Tea', factor: 1, dot: '#D5B08A', customColorHex: '#D5B08A', opacity: .84 }
  ];
  const defaults = [...drinks, ...milkDrinks.map(withPalette)].map(drink =>
    Object.freeze({ ...drink, defaultFactor: drink.factor, isCustom: false }));
  let nextCustomId = 1;
  const names = new Intl.Collator(undefined, { sensitivity: 'base', usage: 'search' });
  const characters = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter() : null;

  function withPalette(drink) {
    return { ...drink, ...palette([{ drink, raw: 1 }]) };
  }

  window.NotchHydroDrinkCatalog = class DrinkCatalog {
    static nameLength(name) {
      return Array.from(characters ? characters.segment(name) : name).length;
    }
    constructor() {
      this.items = [...defaults];
      this.enabledIds = new Set(this.items.map(drink => drink.id));
      // Historical records retain their factor and pigment. A custom name keeps
      // following the user's last edit, including after removal from the picker.
      this.customNames = new Map();
      this.current = this.items[0];
      this.defaultId = this.current.id;
    }
    get enabled() { return this.items.filter(drink => this.enabledIds.has(drink.id)); }
    isNameAvailable(value, excludingId) {
      const name = String(value ?? '').trim();
      if (!name || DrinkCatalog.nameLength(name) > 5) return false;
      return !this.items.some(drink => drink.id !== excludingId &&
        [drink.name, drink.en].some(alias => names.compare(name, alias) === 0));
    }
    select(id, asDefault = true) {
      const drink = this.items.find(item => item.id === id);
      if (!drink) return false;
      this.enabledIds.add(id);
      this.current = drink;
      if (asDefault) this.defaultId = id;
      return true;
    }
    toggle(id) {
      if (!this.items.some(drink => drink.id === id)) return false;
      if (this.enabledIds.has(id)) {
        if (this.enabledIds.size === 1) return false;
        this.enabledIds.delete(id);
        if (this.defaultId === id) this.defaultId = this.enabled[0].id;
        if (this.current.id === id) this.select(this.defaultId, false);
      } else this.enabledIds.add(id);
      return true;
    }
    move(id, targetId) {
      const from = this.items.findIndex(drink => drink.id === id);
      const to = this.items.findIndex(drink => drink.id === targetId);
      if (from < 0 || to < 0 || from === to) return false;
      const [drink] = this.items.splice(from, 1);
      this.items.splice(to, 0, drink);
      return true;
    }
    save(id, draft) {
      const index = this.items.findIndex(drink => drink.id === id);
      const original = this.items[index];
      const factor = draft.factor;
      if ((!original && id != null) || !Number.isFinite(factor) || factor < .3 || factor > 1.5) return null;
      let drink;
      if (original && !original.isCustom) {
        drink = { ...original, factor };
      } else {
        if (!this.isNameAvailable(draft.name, id) || !/^#[0-9a-f]{6}$/i.test(draft.dot)) return null;
        const name = draft.name.trim(), dot = draft.dot.toUpperCase();
        const drinkId = original?.id ?? ('custom-' + (window.crypto?.randomUUID?.() ?? nextCustomId++));
        drink = withPalette({ id: drinkId, name, en: name, factor, dot, opacity: .85, isCustom: true, customColorHex: dot });
      }
      Object.freeze(drink);
      if (drink.isCustom) this.customNames.set(drink.id, drink.name);
      if (!original) {
        this.items.push(drink);
        this.select(drink.id);
      } else {
        this.items[index] = drink;
        if (this.current.id === id) this.current = drink;
      }
      return drink;
    }
    remove(id) {
      const index = this.items.findIndex(drink => drink.id === id && drink.isCustom);
      if (index < 0) return false;
      this.items.splice(index, 1);
      this.enabledIds.delete(id);
      if (!this.enabledIds.size) this.enabledIds.add(this.items[0].id);
      if (this.defaultId === id) this.defaultId = this.enabled[0].id;
      if (this.current.id === id) this.select(this.defaultId, false);
      return true;
    }
  };
})();
