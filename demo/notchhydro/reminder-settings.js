(() => {
  'use strict';

  const weekdays = ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日'];
  const englishDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const intervals = [30, 45, 60, 90];

  function nextHour(time) {
    const [hour, minute] = time.split(':');
    return String((Number(hour) + 1) % 24).padStart(2, '0') + ':' + minute;
  }

  window.NotchHydroReminderSettings = class ReminderSettings {
    constructor(owner) {
      this.owner = owner;
      this.root = document.createElement('div');
      this.root.className = 'ns-content ns-reminders';
      this.root.addEventListener('click', event => {
        const button = event.target.closest('button');
        if (button && !button.disabled) this.click(button);
      });
      this.root.addEventListener('change', event => {
        const field = event.target;
        if (field.type === 'time') {
          const period = owner.reminderOptions.periods[Number(field.closest('[data-r-period]').dataset.rPeriod)];
          if (field.value) {
            period[field.dataset.rTime] = field.value;
            this.changed('periods');
          }
        } else if (field.dataset.rToggle) {
          owner.reminderOptions[field.dataset.rToggle] = field.checked;
          this.changed(field.dataset.rToggle);
        }
      });
      this.root.addEventListener('focusout', event => {
        const field = event.target;
        if (field.type !== 'time' || field.value) return;
        const period = owner.reminderOptions.periods[Number(field.closest('[data-r-period]').dataset.rPeriod)];
        if (period) field.value = period[field.dataset.rTime];
      });
    }

    changed(key) {
      this.owner.updateReminderSettings(key);
      this.sync();
    }

    click(button) {
      const state = this.owner.reminderOptions;
      const data = button.dataset;
      if (data.rAdd !== undefined) {
        const start = state.periods.at(-1).end;
        state.periods.push({ start, end: nextHour(start) });
        this.changed('periods');
        this.periodList.lastElementChild.querySelector('input').focus();
      } else if (data.rRemove !== undefined) {
        if (state.periods.length === 1) return;
        const index = Number(button.closest('[data-r-period]').dataset.rPeriod);
        state.periods.splice(index, 1);
        this.changed('periods');
        const row = this.periodList.children[Math.min(index, state.periods.length - 1)];
        row.querySelector('input').focus();
      } else if (data.rDay !== undefined) {
        const day = Number(data.rDay);
        state.weekdays = state.weekdays.includes(day) ? state.weekdays.filter(value => value !== day) :
          [...state.weekdays, day].sort((a, b) => a - b);
        this.changed('weekdays');
      } else if (data.rPreset) {
        state.weekdays = data.rPreset === 'weekdays' ? [1, 2, 3, 4, 5] : [1, 2, 3, 4, 5, 6, 7];
        this.changed('weekdays');
      } else if (data.rInterval !== undefined) {
        state.interval = Number(data.rInterval);
        this.changed('interval');
      } else if (data.rTest !== undefined) {
        this.owner.testReminder();
        this.owner.el.announcement.textContent = this.owner.text('该喝水了', 'Time for water');
      }
    }

    renderLabels() {
      const t = (zh, en) => this.owner.text(zh, en);
      const toggle = (key, zh, en) => `<label class="ns-toggle"><span>${t(zh, en)}</span>
        <input name="reminder-${key}" data-r-toggle="${key}" type="checkbox" role="switch"></label>`;
      this.root.innerHTML = `
        <section aria-labelledby="ns-period-title">
          <div class="ns-heading">
            <h2 id="ns-period-title">${t('提醒时段', 'Reminder periods')}</h2>
            <button type="button" class="ns-r-action" data-r-add>${t('+ 添加时段', '+ Add period')}</button>
          </div>
          <div class="ns-r-periods"></div>
        </section>
        <section aria-labelledby="ns-days-title">
          <div class="ns-heading"><h2 id="ns-days-title">${t('提醒日期', 'Reminder days')}</h2>
            <div class="ns-r-presets">
              <button type="button" class="ns-r-action" data-r-preset="weekdays">${t('工作日', 'Weekdays')}</button>
              <span aria-hidden="true">·</span>
              <button type="button" class="ns-r-action" data-r-preset="all">${t('每天', 'Every day')}</button>
            </div>
          </div>
          <div class="ns-r-days" role="group" aria-labelledby="ns-days-title">${window.NotchHydroMemory.orderedWeekdays(this.weekStartsOnMonday).map(day => {
            const name = weekdays[day - 1], en = englishDays[day - 1];
            return `<button type="button" data-r-day="${day}" aria-label="${t(name, en)}">
              ${t(name.slice(-1), en.slice(0, 3))}</button>`;
          }).join('')}</div>
        </section>
        <section aria-labelledby="ns-interval-title">
          <div class="ns-heading">
            <h2 id="ns-interval-title">${t('提醒间隔', 'Reminder interval')}</h2>
            <div class="ns-r-intervals" role="group" aria-labelledby="ns-interval-title">${intervals.map(minutes =>
              `<button type="button" data-r-interval="${minutes}" aria-label="${t(minutes + ' 分钟', minutes + ' minutes')}">${minutes}m</button>`).join('')}</div>
          </div>
          <div class="ns-r-options">
            ${toggle('afterGoal', '达标后继续提醒', 'Continue reminding after goal')}
            ${toggle('sound', '水滴提醒音', 'Water drop sound')}
          </div>
          <div class="ns-r-test-row"><span class="ns-r-next"></span>
            <button type="button" class="ns-r-test" data-r-test>${t('测试提醒', 'Test reminder')}</button></div>
        </section>
        <div class="ns-behavior">
          ${toggle('meetings', '会议与屏幕共享时静默', 'Silence meetings & sharing')}
          ${toggle('focus', '专注模式下静默', 'Silence during Focus')}
          ${toggle('screenAsleep', '息屏或锁屏时暂停提醒', 'Pause when screen sleeps or locks')}
        </div>`;
      this.periodList = this.root.querySelector('.ns-r-periods');
      this.nextLabel = this.root.querySelector('.ns-r-next');
    }

    renderPeriods() {
      const periods = this.owner.reminderOptions.periods;
      const t = (zh, en) => this.owner.text(zh, en);
      if (this.periodList.childElementCount !== periods.length) {
        this.periodList.innerHTML = periods.map((period, index) => {
          const n = index + 1;
          const start = t(`时段 ${n} 开始时间`, `Period ${n} start time`);
          const end = t(`时段 ${n} 结束时间`, `Period ${n} end time`);
          const remove = t(`删除时段 ${n}`, `Remove period ${n}`);
          return `<div class="ns-r-period" data-r-period="${index}">
            <span class="ns-field"><input type="time" step="60" name="reminder-start-${n}" data-r-time="start" aria-label="${start}"></span>
            <span aria-hidden="true">–</span>
            <span class="ns-field"><input type="time" step="60" name="reminder-end-${n}" data-r-time="end" aria-label="${end}">
              <small class="ns-r-tomorrow" hidden>${t('次日', '+1 day')}</small></span>
            <button type="button" data-r-remove aria-label="${remove}" title="${periods.length === 1 ? t('至少保留一个提醒时段', 'Keep at least one period') : remove}"
              ${periods.length === 1 ? 'disabled' : ''}>×</button></div>`;
        }).join('');
      }
      Array.from(this.periodList.children).forEach((row, index) => {
        const period = periods[index];
        row.querySelector('.ns-r-tomorrow').hidden = period.start < period.end;
        for (const field of row.querySelectorAll('input')) {
          if (this.owner.shadowRoot.activeElement !== field) field.value = period[field.dataset.rTime];
        }
      });
    }

    refreshStatus() {
      if (this.nextLabel) this.nextLabel.textContent = this.owner.reminderStatus();
    }

    sync() {
      const weekStartsOnMonday = this.owner.generalOptions?.weekStartsOnMonday !== false;
      if (!this.periodList || this.english !== this.owner.english || this.weekStartsOnMonday !== weekStartsOnMonday) {
        this.english = this.owner.english;
        this.weekStartsOnMonday = weekStartsOnMonday;
        this.renderLabels();
      }
      this.renderPeriods();
      const state = this.owner.reminderOptions;
      for (const day of this.root.querySelectorAll('[data-r-day]')) {
        day.setAttribute('aria-pressed', String(state.weekdays.includes(Number(day.dataset.rDay))));
      }
      for (const button of this.root.querySelectorAll('[data-r-interval]')) {
        button.setAttribute('aria-pressed', String(state.interval === Number(button.dataset.rInterval)));
      }
      for (const field of this.root.querySelectorAll('[data-r-toggle]')) field.checked = state[field.dataset.rToggle];
      this.refreshStatus();
    }
  };
})();
