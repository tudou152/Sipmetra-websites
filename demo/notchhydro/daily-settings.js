(() => {
  'use strict';
  const panels = { daily: 'ns-content', reminders: 'ns-reminder-content', drinks: 'ns-drink-content', general: 'ns-general-content' };

  function numberField(name, title, unit, min, max, step) {
    return `<span class="ns-field"><input type="number" inputmode="numeric" name="${name}"
      aria-label="${title}" min="${min}" max="${max}" step="${step}">
      <span aria-hidden="true">${unit}</span></span>`;
  }

  function toggle(name, title) {
    return `<label class="ns-toggle"><span>${title}</span>
      <input type="checkbox" role="switch" name="${name}"></label>`;
  }

  window.NotchHydroDailySettings = class DailySettings {
    constructor(owner) {
      this.owner = owner;
      this.section = 'daily';
      this.root = document.createElement('section');
      this.root.className = 'nh-daily-settings';
      this.root.id = 'nh-daily-settings';
      this.root.setAttribute('aria-labelledby', 'nh-page-title');
      this.root.hidden = true;
      owner.shadowRoot.querySelector('.nh-shell').append(this.root);

      this.root.addEventListener('click', event => {
        const button = event.target.closest('button');
        if (!button || button.disabled) return;
        if (button.dataset.section) {
          this.selectSection(button.dataset.section);
          return;
        }
        switch (button.dataset.action) {
          case 'goal': owner.setDailyGoal(Number(button.dataset.goal)); this.sync(); break;
          case 'reset': owner.resetQuickAmounts(); this.sync(); break;
        }
      });
      this.root.addEventListener('input', event => {
        if (event.target.name === 'goal') {
          owner.setDailyGoal(event.target.valueAsNumber);
          this.sync();
        }
      });
      this.root.addEventListener('change', event => {
        const field = event.target;
        if (!field.closest('#ns-content')) return;
        switch (field.name) {
          case 'hold': owner.dailyOptions.holdEnabled = field.checked; break;
          case 'auto-collapse': owner.toggleAttribute('auto-collapse', field.checked); break;
          case 'sound': owner.setSound(field.checked); break;
          default:
            if (field.type !== 'number') return;
            if (Number.isFinite(field.valueAsNumber)) {
              if (field.name.startsWith('cup-')) owner.setQuickAmount(Number(field.name.slice(4)), field.valueAsNumber);
              else owner.setHoldRate(field.name, field.valueAsNumber);
            }
        }
        this.sync(true);
      });
      this.root.addEventListener('keydown', event => {
        const tab = event.target.closest('[role=tab]');
        if (tab && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
          event.preventDefault();
          const tabs = Array.from(this.root.querySelectorAll('[role=tab]:not(:disabled)'));
          let index = tabs.indexOf(tab);
          if (event.key === 'Home') index = 0;
          else if (event.key === 'End') index = tabs.length - 1;
          else index = (index + (event.key === 'ArrowLeft' ? -1 : 1) + tabs.length) % tabs.length;
          this.selectSection(tabs[index].dataset.section);
          tabs[index].focus({ preventScroll: true });
        } else if (event.key === 'Enter' && event.target.type === 'number' && event.target.closest('#ns-content')) {
          event.preventDefault();
          event.target.blur();
        }
      });
      this.onPreferenceChange = () => this.sync();
    }

    show(section = this.section) {
      this.section = Object.hasOwn(panels, section) ? section : 'daily';
      this.root.hidden = false;
      this.sync();
      this.owner.addEventListener('hydro-preferences-change', this.onPreferenceChange);
      this.owner.el['page-title'].focus({ preventScroll: true });
    }

    selectSection(section) {
      if (!Object.hasOwn(panels, section) || this.section === section) return;
      this[this.section]?.hide?.();
      this.section = section;
      this.sync();
      this.owner.dispatch('settings-tab');
    }

    handleEscape() { return this[this.section]?.handleEscape?.() ?? false; }

    hide() {
      this[this.section]?.hide?.();
      const field = this.owner.shadowRoot.activeElement;
      if (field?.type === 'number' && this.root.contains(field)) field.blur();
      this.root.inert = true;
      this.root.hidden = true;
      this.owner.removeEventListener('hydro-preferences-change', this.onPreferenceChange);
    }

    renderLabels() {
      const t = (zh, en) => this.owner.text(zh, en);
      const tabs = [
        ['daily', t('日常', 'Daily')], ['reminders', t('提醒', 'Reminders')],
        ['drinks', t('饮品', 'Drinks')], ['general', t('通用', 'General')]
      ];
      const goal = t('每日饮水目标', 'Daily hydration goal');
      const goalPresets = this.owner.scene === 'website' ? [this.owner.minimumDailyGoal, 1800, 2500] : [1800, 2000, 2500];
      const hold = t('长按注水', 'Hold to pour');
      this.root.innerHTML = `
        <div class="ns-tabs" role="tablist" aria-label="${t('设置分类', 'Settings categories')}">
          ${tabs.map(([key, title]) => `<button type="button" role="tab" data-section="${key}"
            id="ns-${key}-tab" aria-controls="${panels[key]}">${title}</button>`).join('')}
        </div>
        <div class="ns-scroll" id="ns-content" role="tabpanel" aria-labelledby="ns-daily-tab">
          <div class="ns-content">
            <section aria-labelledby="ns-goal-title">
              <div class="ns-heading"><h2 id="ns-goal-title">${goal}</h2>
                <span class="ns-goal-value"><strong></strong><span>ml</span></span></div>
              <div class="ns-goal-controls">
                <input type="range" name="goal" min="${this.owner.minimumDailyGoal}" max="3500" step="100" aria-labelledby="ns-goal-title">
                <div class="ns-goal-presets">${goalPresets.map(value =>
                  `<button type="button" data-action="goal" data-goal="${value}">${(value / 1000).toFixed(1)} L</button>`).join('')}</div>
              </div>
            </section>
            <section aria-labelledby="ns-cups-title">
              <div class="ns-heading"><h2 id="ns-cups-title">${t('快捷杯量', 'Quick amounts')}</h2>
                <button type="button" data-action="reset">${t('恢复默认', 'Reset')}</button></div>
              <div class="ns-cups">${[0, 1, 2].map(i => numberField('cup-' + i,
                t('快捷杯量 ' + (i + 1), 'Quick amount ' + (i + 1)), 'ml', 20, 1500, 10)).join('')}</div>
            </section>
            <section aria-labelledby="ns-hold-title">
              <div class="ns-heading"><h2 id="ns-hold-title"><label for="ns-hold">${hold}</label></h2>
                <input type="checkbox" role="switch" name="hold" id="ns-hold"></div>
              <div class="ns-rates">
                <label>${t('轻按', 'Light press')}${numberField('light', t('轻按注水速度', 'Light press pour speed'), 'ml/s', 1, 100, 1)}</label>
                <label>${t('重按', 'Firm press')}${numberField('firm', t('重按注水速度', 'Firm press pour speed'), 'ml/s', 1, 100, 1)}</label>
              </div>
            </section>
            <div class="ns-behavior">
              ${toggle('auto-collapse', t('记录后自动收起', 'Close after recording'))}
              ${toggle('sound', t('注水音效', 'Pouring sounds'))}
            </div>
          </div>
        </div>
        ${tabs.slice(1).map(([key]) => `<div class="ns-scroll" id="${panels[key]}" role="tabpanel"
          aria-labelledby="ns-${key}-tab" hidden></div>`).join('')}`;
      this.fields = Object.fromEntries(Array.from(this.root.querySelectorAll('input'), field => [field.name, field]));
    }

    sync(commitDraft = false) {
      if (this.root.hidden) return;
      const { owner } = this;
      if (!this.fields || this.english !== owner.english) {
        this.english = owner.english;
        this.renderLabels();
      }
      for (const tab of this.root.querySelectorAll('[role=tab]')) {
        const selected = tab.dataset.section === this.section;
        tab.setAttribute('aria-selected', String(selected));
        tab.tabIndex = selected ? 0 : -1;
        this.root.querySelector('#' + tab.getAttribute('aria-controls')).hidden = !selected;
      }
      if (this.section !== 'daily') {
        const constructors = { reminders: window.NotchHydroReminderSettings, drinks: window.NotchHydroDrinkSettings, general: window.NotchHydroGeneralSettings };
        const pane = this[this.section] ||= new constructors[this.section](owner);
        const panel = this.root.querySelector('#' + panels[this.section]);
        if (pane.root.parentElement !== panel) panel.append(pane.root);
        pane.sync();
        return;
      }
      const { quickAmounts, holdEnabled, lightRate, firmRate } = owner.dailyOptions;
      const fields = this.fields;
      fields.goal.value = owner.goal;
      fields.goal.setAttribute('aria-valuetext', owner.text(owner.goal + ' 毫升', owner.goal + ' milliliters'));
      const progress = (owner.goal - Number(fields.goal.min)) / (Number(fields.goal.max) - Number(fields.goal.min));
      fields.goal.style.setProperty('--ns-progress', progress * 100 + '%');
      this.root.querySelector('.ns-goal-value strong').textContent = owner.goal;
      for (const b of this.root.querySelectorAll('[data-goal]')) b.setAttribute('aria-pressed', String(Number(b.dataset.goal) === owner.goal));
      const setNumber = (field, number) => {
        if (commitDraft || owner.shadowRoot.activeElement !== field) field.value = number;
      };
      quickAmounts.forEach((amount, index) => setNumber(fields['cup-' + index], amount));
      setNumber(fields.light, lightRate);
      setNumber(fields.firm, firmRate);
      fields.hold.checked = holdEnabled;
      this.root.querySelector('.ns-rates').hidden = !holdEnabled;
      fields['auto-collapse'].checked = owner.hasAttribute('auto-collapse');
      fields.sound.checked = owner.audio.enabled;
    }
  };
})();
