(() => {
  'use strict';

  const colors = [
    ['#38bdf8', '青蓝', 'Cyan'], ['#34d399', '翠绿', 'Emerald'],
    ['#a3e635', '茶绿', 'Lime'], ['#facc15', '芒果黄', 'Mango'],
    ['#fb923c', '珊瑚橙', 'Coral'], ['#fb7185', '玫红', 'Rose'],
    ['#f9a8d4', '樱花粉', 'Sakura'], ['#a78bfa', '紫罗兰', 'Violet'],
    ['#3b82f6', '海盐蓝', 'Cobalt'], ['#c27830', '琥珀', 'Amber']
  ];
  const factorLabel = value => Number.isInteger(value) ? value.toFixed(1) : String(value);

  window.NotchHydroDrinkSettings = class DrinkSettings {
    constructor(owner) {
      this.owner = owner;
      this.root = document.createElement('div');
      this.root.className = 'ns-drinks';
      this.root.innerHTML = `
        <div class="nd-scroll"><section class="ns-content nd-content" aria-labelledby="nd-title">
          <div class="ns-heading"><h2 id="nd-title"></h2><button type="button" class="nd-link" data-add></button></div>
          <div class="nd-list" role="list" aria-labelledby="nd-title"></div>
          <button type="button" class="nd-reveal nd-link" data-reveal hidden></button>
        </section></div>
        <div class="nd-editor" role="region" aria-labelledby="nd-editor-title" hidden></div>`;
      this.list = this.root.querySelector('.nd-list');
      this.scroller = this.root.querySelector('.nd-scroll');
      this.editor = this.root.querySelector('.nd-editor');
      this.rows = new Map();
      this.showAll = false;
      this.root.addEventListener('click', event => this.click(event));
      this.root.addEventListener('change', event => this.change(event));
      this.editor.addEventListener('input', () => this.validate());
      this.editor.addEventListener('submit', event => { event.preventDefault(); this.save(); });
      this.root.addEventListener('keydown', event => this.keyDown(event));
      this.list.addEventListener('pointerdown', event => this.beginDrag(event));
      this.list.addEventListener('pointermove', event => {
        if (this.drag?.id !== event.pointerId) return;
        this.drag.y = event.clientY;
        this.positionDrag();
      });
      this.list.addEventListener('pointerup', event => {
        if (this.drag?.id === event.pointerId) this.endDrag(true);
      });
      for (const type of ['pointercancel', 'lostpointercapture']) {
        this.list.addEventListener(type, event => {
          if (this.drag?.id === event.pointerId) this.endDrag(false);
        });
      }
    }

    t(zh, en) { return this.owner.text(zh, en); }
    name(drink) { return this.owner.english ? drink.en : drink.name; }
    drink(id) { return this.owner.drinkCatalog.find(drink => drink.id === id); }

    makeRow(drink) {
      const row = document.createElement('div');
      row.className = 'nd-row';
      row.dataset.id = drink.id;
      row.setAttribute('role', 'listitem');
      row.innerHTML = `
        <button type="button" class="nd-grip" data-drag aria-keyshortcuts="ArrowUp ArrowDown"><i aria-hidden="true"></i></button>
        <label class="nd-enable"><input type="checkbox" data-enable></label>
        <button type="button" class="nd-edit" data-edit><i class="nd-dot" aria-hidden="true"></i><span class="nd-name"></span>
          <span class="nd-factor"></span></button>
        <button type="button" class="nd-select" data-select></button>`;
      return row;
    }

    sync() {
      const languageChanged = this.english !== this.owner.english;
      this.english = this.owner.english;
      this.root.querySelector('h2').textContent = this.t('饮品与补水系数', 'Drinks & hydration factors');
      const add = this.root.querySelector('[data-add]');
      add.textContent = this.t('+ 自定义饮品', '+ Add drink');
      add.setAttribute('aria-label', this.t('添加自定义饮品', 'Add custom drink'));
      const enabled = new Set(this.owner.enabledDrinks.map(drink => drink.id));
      const ordered = this.owner.drinkCatalog.filter(drink => this.showAll || enabled.has(drink.id));
      const visible = new Set(ordered.map(drink => drink.id));
      for (const [id, row] of this.rows) if (!visible.has(id)) { row.remove(); this.rows.delete(id); }
      ordered.forEach((drink, index) => {
        const row = this.rows.get(drink.id) || this.makeRow(drink);
        this.rows.set(drink.id, row);
        if (this.list.children[index] !== row) this.list.insertBefore(row, this.list.children[index] || null);
        const name = this.name(drink);
        const active = drink.id === this.owner.currentDrink.id;
        row.dataset.current = String(active);
        const box = row.querySelector('[data-enable]');
        box.checked = enabled.has(drink.id);
        box.disabled = box.checked && enabled.size === 1;
        row.dataset.enabled = String(box.checked);
        box.setAttribute('aria-label', this.t('启用' + name, 'Enable ' + name));
        box.parentElement.title = box.disabled ? this.t('至少启用一款饮品', 'Keep one drink enabled') : box.getAttribute('aria-label');
        row.querySelector('.nd-name').textContent = name;
        row.querySelector('.nd-dot').style.backgroundColor = drink.dot;
        row.querySelector('.nd-factor').textContent = factorLabel(drink.factor) + '×';
        const edit = row.querySelector('[data-edit]');
        edit.title = this.t('编辑' + name, 'Edit ' + name);
        edit.setAttribute('aria-label', edit.title + this.t('，补水系数 ', ', hydration factor ') + factorLabel(drink.factor));
        const handle = row.querySelector('[data-drag]');
        handle.setAttribute('aria-label', this.t('调整' + name + '的顺序', 'Reorder ' + name));
        handle.title = this.t('拖动或按上下方向键排序', 'Drag or use the up and down arrow keys to reorder');
        const select = row.querySelector('[data-select]');
        select.textContent = active ? this.t('当前使用', 'Current') : this.t('设为当前', 'Select');
        select.setAttribute('aria-pressed', String(active));
        select.setAttribute('aria-label', this.t('选择' + name, 'Select ' + name));
      });
      const reveal = this.root.querySelector('[data-reveal]');
      const count = this.owner.drinkCatalog.length - enabled.size;
      reveal.hidden = count === 0;
      reveal.setAttribute('aria-expanded', String(this.showAll));
      reveal.textContent = this.showAll ? this.t('收起未启用饮品', 'Hide disabled drinks') :
        this.t('展开 ' + count + ' 款未启用饮品', 'Show ' + count + ' disabled drinks');
      if (this.draft && languageChanged) this.renderEditor();
    }

    change(event) {
      const field = event.target;
      if (field.hasAttribute('data-enable')) {
        const id = field.closest('.nd-row').dataset.id;
        this.owner.toggleDrink(id);
        this.sync();
        (this.rows.get(id)?.querySelector('[data-enable]') || this.root.querySelector('[data-reveal]')).focus({ preventScroll: true });
      } else if (this.editor.contains(field)) this.validate();
    }

    click(event) {
      const button = event.target.closest('button');
      if (!button || button.disabled) return;
      const data = button.dataset;
      const id = button.closest('.nd-row')?.dataset.id;
      if ('edit' in data || 'add' in data) {
        const original = this.drink(id);
        this.draft = { original, name: original ? this.name(original) : '', factor: String(original?.factor ?? 1),
          dot: (original?.dot ?? colors[0][0]).toLowerCase() };
        this.confirming = false;
        this.renderEditor();
        this.editor.querySelector('input:not([type=color])')?.focus({ preventScroll: true });
      } else if ('select' in data) {
        this.owner.selectDrink(id);
        this.sync();
      } else if ('reveal' in data) {
        this.showAll = !this.showAll;
        this.sync();
      } else if ('cancel' in data) this.dismiss();
      else if ('color' in data) {
        this.editor.querySelector('[name=dot]').value = data.color;
        this.validate();
      } else if ('resetFactor' in data) {
        this.editor.querySelector('[name=factor]').value = this.draft.original.defaultFactor;
        this.validate();
      } else if ('delete' in data) {
        this.confirming = true;
        this.renderEditor();
        this.editor.querySelector('[data-cancel]').focus();
      } else if ('confirmDelete' in data) {
        this.owner.deleteDrink(this.draft.original.id);
        this.closeEditor();
      }
    }

    renderEditor() {
      const { original } = this.draft;
      this.editor.hidden = false;
      if (this.confirming) {
        this.editor.innerHTML = `<h3 id="nd-editor-title"></h3><p></p><div class="nd-actions">
          <button type="button" data-cancel></button><button type="button" class="nd-danger" data-confirm-delete></button></div>`;
        this.editor.querySelector('h3').textContent = this.t('删除“' + this.name(original) + '”？', 'Delete “' + this.name(original) + '”?');
        this.editor.querySelector('p').textContent = this.t('历史饮水记录会保留。', 'Past drink records will be kept.');
        this.editor.querySelector('[data-cancel]').textContent = this.t('取消', 'Cancel');
        this.editor.querySelector('[data-confirm-delete]').textContent = this.t('删除', 'Delete');
        return;
      }
      const customizable = !original || original.isCustom;
      const t = (zh, en) => this.t(zh, en);
      this.editor.innerHTML = `<form novalidate>
        <h3 id="nd-editor-title"></h3>
        <div class="nd-fields">
          ${customizable ? `<label>${t('名称', 'Name')}<span class="ns-field"><input type="text" name="name" autocomplete="off" placeholder="${t('饮品名称','Drink name')}"></span></label>` : ''}
          <label>${t('补水系数', 'Hydration factor')}<span class="ns-field">
            <input name="factor" type="number" min="0.3" max="1.5" step="0.05" inputmode="decimal" aria-label="${t('补水系数','Hydration factor')}">
            <span aria-hidden="true">×</span></span></label>
          ${!customizable ? `<button type="button" class="nd-link" data-reset-factor>${t('恢复默认系数','Reset factor')}</button>` : ''}
        </div>
        ${customizable ? `<fieldset class="nd-colors"><legend>${t('颜色','Color')}</legend>
          ${colors.map(([color, zh, en]) => `<button type="button" style="--nd-color:${color}" data-color="${color}" title="${t(zh,en)}" aria-label="${t(zh,en)}"></button>`).join('')}
          <label title="${t('自定义颜色','Custom color')}"><span aria-hidden="true">＋</span><input type="color" name="dot" aria-label="${t('自定义颜色','Custom color')}"></label></fieldset>` : ''}
        <p class="nd-error" role="status" hidden></p>
        <div class="nd-actions">${original?.isCustom ? `<button type="button" class="nd-delete" data-delete>${t('删除','Delete')}</button>` : ''}
          <button type="button" data-cancel>${t('取消','Cancel')}</button>
          <button type="submit" class="nd-primary" data-save>${original ? t('保存','Save') : t('添加','Add')}</button></div></form>`;
      this.editor.querySelector('h3').textContent = customizable ? (original ? t('编辑饮品','Edit drink') : t('自定义饮品','Add drink')) : this.name(original);
      const form = this.editor.querySelector('form');
      if (customizable) {
        form.elements.name.value = this.draft.name;
        form.elements.dot.value = this.draft.dot;
      }
      form.elements.factor.value = this.draft.factor;
      this.validate();
    }

    validate() {
      const form = this.editor.querySelector('form');
      if (!this.draft || !form) return false;
      const { original } = this.draft;
      const nameField = form.elements.namedItem('name');
      if (nameField) this.draft.name = nameField.value;
      const name = this.draft.name.trim();
      this.draft.factor = form.elements.factor.value;
      const factor = form.elements.factor.valueAsNumber;
      if (form.elements.dot) this.draft.dot = form.elements.dot.value;
      let error = '';
      if (nameField && window.NotchHydroDrinkCatalog.nameLength(name) > 5) error = this.t('名称最多 5 个字符', 'Use up to 5 characters');
      else if (name && nameField && !this.owner.drinkNameAvailable(name, original?.id)) error = this.t('名称已存在', 'This name is already in use');
      else if (this.draft.factor && !(factor >= .3 && factor <= 1.5)) error = this.t('补水系数需为 0.3–1.5', 'Use a factor from 0.3 to 1.5');
      const label = form.querySelector('.nd-error');
      label.textContent = error;
      label.hidden = !error;
      const changed = !original || original.factor !== factor || (nameField && (name !== this.name(original) || this.draft.dot !== original.dot.toLowerCase()));
      const valid = Boolean(name && Number.isFinite(factor) && !error && changed);
      form.querySelector('[data-save]').disabled = !valid;
      const reset = form.querySelector('[data-reset-factor]');
      if (reset) reset.hidden = original.defaultFactor === factor;
      for (const swatch of form.querySelectorAll('[data-color]')) swatch.setAttribute('aria-pressed', String(swatch.dataset.color === this.draft.dot));
      const picker = form.elements.dot?.parentElement;
      if (picker) {
        picker.style.setProperty('--nd-custom', this.draft.dot);
        picker.classList.toggle('nd-custom-selected', !colors.some(([color]) => color === this.draft.dot));
      }
      return valid;
    }

    save() {
      if (!this.validate()) return;
      const d = this.draft;
      const result = this.owner.saveDrink(d.original?.id ?? null, { name: d.name.trim(), factor: Number(d.factor), dot: d.dot });
      if (result) this.closeEditor(result.id);
      else {
        const error = this.editor.querySelector('.nd-error');
        error.textContent = this.t('保存失败，请检查名称和系数', 'Check the name and hydration factor');
        error.hidden = false;
      }
    }

    closeEditor(focusId = this.draft?.original?.id, restoreFocus = true) {
      this.draft = null;
      this.confirming = false;
      this.editor.hidden = true;
      this.editor.replaceChildren();
      if (!restoreFocus) return;
      this.sync();
      (this.rows.get(focusId)?.querySelector('[data-edit]') || this.root.querySelector('[data-add]')).focus();
    }

    dismiss() {
      if (this.confirming) {
        this.confirming = false;
        this.renderEditor();
        this.editor.querySelector('[data-delete]').focus();
      } else this.closeEditor();
    }

    handleEscape() {
      if (this.drag) { this.endDrag(false); return true; }
      if (this.draft) { this.dismiss(); return true; }
      return false;
    }

    hide() {
      this.endDrag(false);
      this.closeEditor(null, false);
    }

    keyDown(event) {
      if (event.key === 'Escape' && this.handleEscape()) {
        event.stopPropagation(); event.preventDefault(); return;
      }
      const handle = event.target.closest('[data-drag]');
      if (!handle || !['ArrowUp', 'ArrowDown'].includes(event.key)) return;
      event.preventDefault();
      const row = handle.closest('.nd-row');
      const other = event.key === 'ArrowUp' ? row.previousElementSibling : row.nextElementSibling;
      if (other) {
        this.owner.moveDrink(row.dataset.id, other.dataset.id);
        this.sync();
        handle.focus({ preventScroll: true });
        handle.scrollIntoView({ block: 'nearest' });
      }
    }

    beginDrag(event) {
      const handle = event.target.closest('[data-drag]');
      if (!handle || event.button !== 0 || !event.isPrimary || this.drag) return;
      const row = handle.closest('.nd-row');
      const rows = Array.from(this.list.children);
      this.drag = { handle, rows, source: rows.indexOf(row), target: rows.indexOf(row), id: event.pointerId,
        start: event.clientY, y: event.clientY, scroll: this.scroller.scrollTop };
      handle.setPointerCapture(event.pointerId);
      handle.focus({ preventScroll: true });
    }

    positionDrag() {
      const drag = this.drag;
      if (!drag) return;
      const bounds = this.scroller.getBoundingClientRect();
      const scale = bounds.height / this.scroller.offsetHeight;
      const height = drag.rows[drag.source].offsetHeight;
      const offset = (drag.y - drag.start) / scale + this.scroller.scrollTop - drag.scroll;
      if (!drag.moved && Math.abs(offset) < 3) return;
      drag.moved = true;
      const limit = (value, low, high) => Math.max(low, Math.min(high, value));
      const distance = limit(offset, -height * drag.source, height * (drag.rows.length - 1 - drag.source));
      drag.target = drag.source + Math.round(distance / height);
      this.list.classList.add('nd-dragging');
      drag.rows.forEach((row, i) => {
        row.classList.toggle('nd-lifted', i === drag.source);
        const down = i > drag.source && i <= drag.target, up = i < drag.source && i >= drag.target;
        row.style.transform = 'translateY(' + (i === drag.source ? distance : down ? -height : up ? height : 0) + 'px)';
      });
      if (this.scroller.scrollHeight <= this.scroller.clientHeight) return;
      const speed = drag.y < bounds.top + 24 ? -5 : drag.y > bounds.bottom - 24 ? 5 : 0;
      if (speed && !drag.frame) drag.frame = requestAnimationFrame(() => {
        drag.frame = 0;
        if (this.drag !== drag) return;
        const old = this.scroller.scrollTop;
        this.scroller.scrollTop += speed;
        if (this.scroller.scrollTop !== old) this.positionDrag();
      });
    }

    endDrag(commit) {
      const drag = this.drag;
      if (!drag) return;
      this.drag = null;
      cancelAnimationFrame(drag.frame || 0);
      if (drag.handle.hasPointerCapture(drag.id)) drag.handle.releasePointerCapture(drag.id);
      this.list.classList.remove('nd-dragging');
      drag.rows.forEach(row => { row.classList.remove('nd-lifted'); row.style.removeProperty('transform'); });
      if (commit && drag.target !== drag.source) {
        this.owner.moveDrink(drag.rows[drag.source].dataset.id, drag.rows[drag.target].dataset.id);
        this.sync();
        drag.handle.focus({ preventScroll: true });
      }
    }
  };
})();
