/* Native Insights layout/data adapter for the saved prototype only.
 * Source: StatsView.swift, HydrationStatistics, NotchPagesView. No app storage access.
 */
(() => {
  'use strict';
  const M = window.NotchHydroMemory, { drinks, rgba } = window.NotchHydroFluid;
  const escapeHTML = text => String(text).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const key = d => d.toISOString().slice(0, 10), parse = d => new Date(d + 'T12:00:00Z');
  const monthShift = (date, n) => { const d = parse(date); return key(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1, 12))); };
  function period(range, anchor, weekStartsOnMonday = true) {
    if (range === 'day') return { start: anchor, end: M.addDays(anchor, 1) };
    if (range === 'week') { const start = M.addDays(anchor, -M.weekdayColumn(anchor, weekStartsOnMonday)); return { start, end: M.addDays(start, 7) }; }
    if (range === 'month') return { start: anchor.slice(0, 7) + '-01', end: monthShift(anchor, 1) };
    return { start: anchor.slice(0, 4) + '-01-01', end: String(Number(anchor.slice(0, 4)) + 1) + '-01-01' };
  }
  function shift(range, anchor, n) {
    return range === 'day' || range === 'week' ? M.addDays(anchor, n * (range === 'week' ? 7 : 1)) : monthShift(anchor, n * (range === 'year' ? 12 : 1));
  }
  function aggregate(days, range, anchor, today = M.today, weekStartsOnMonday = true) {
    const p = period(range, anchor, weekStartsOnMonday), included = days.filter(d => d.date >= p.start && d.date < p.end && d.date <= today);
    const first = p.start < M.earliest ? M.earliest : p.start, last = M.addDays(p.end, -1) < today ? M.addDays(p.end, -1) : today;
    const elapsed = last < first ? 0 : Math.round((parse(last) - parse(first)) / 86400000) + 1;
    const total = included.reduce((s, d) => s + d.total, 0);
    return { ...p, total, average: elapsed ? Math.round(total / elapsed) : 0,
      goalDays: included.filter(d => d.total >= d.goal).length, count: Math.round((parse(p.end) - parse(p.start)) / 86400000) };
  }
  function chartPoints(days, range, anchor, records = [], weekStartsOnMonday = true) {
    const p = period(range, anchor, weekStartsOnMonday), map = new Map(days.map(d => [d.date, d]));
    if (range === 'day') return Array.from({ length: 24 }, (_, hour) => ({ date: p.start, hour,
      amount: records.filter(r => Number(r.time.slice(0, 2)) === hour).reduce((s, r) => s + r.effective, 0), future: p.start === M.today && hour > 14 }));
    if (range === 'year') return Array.from({ length: 12 }, (_, i) => {
      const date = p.start.slice(0, 4) + '-' + String(i + 1).padStart(2, '0') + '-01';
      const v = aggregate(days, 'month', date);
      // The native chart shows ml/day. The memory calendar retains each day's capped progress.
      const last = M.addDays(v.end, -1) < M.today ? M.addDays(v.end, -1) : M.today;
      const count = last < v.start ? 0 : Math.round((parse(last) - parse(v.start)) / 86400000) + 1;
      return { date, amount: count ? v.total / count : 0, future: date > M.today };
    });
    const result = [];
    for (let date = p.start; date < p.end; date = M.addDays(date, 1)) result.push({ date, amount: map.get(date)?.total || 0, future: date > M.today });
    return result;
  }
  function position(i, count, width, range) {
    if (range === 'month') return i / Math.max(1, count - 1) * width;
    if (range === 'day') return (i + .5) / count * width;
    const column = Math.max(0, (width - (count - 1) * 8) / count);
    return column / 2 + i * (column + 8);
  }
  window.NotchHydroInsightsModel = { period, shift, aggregate, chartPoints, position };
  const symbol = name => {
    const s = window.NotchHydroInsightsSymbols[name];
    return `<img src="${s.src}" width="${s.width}" height="${s.height}" alt="" aria-hidden="true">`;
  };
  class Insights {
    constructor(owner) {
      this.owner = owner; this.range = 'week'; this.anchor = M.today; this.selected = M.today; this.overrides = new Map();
      const menuAnchor = document.createElement('div');
      menuAnchor.className = 'ni-menu-anchor';
      menuAnchor.inert = true;
      menuAnchor.innerHTML = `<button class="nh-tool ni-more cursor-interaction" id="ni-more" type="button" aria-label="更多操作" aria-haspopup="menu" aria-controls="ni-actions" aria-expanded="false"><i aria-hidden="true"></i></button>
        <div class="ni-action-menu" id="ni-actions" role="menu" aria-labelledby="ni-more" hidden>
          <button type="button" role="menuitem" tabindex="-1" data-action="add">补录饮水</button>
          <button type="button" role="menuitem" tabindex="-1" data-action="export">导出全部记录</button>
          <div role="separator"></div>
          <button type="button" role="menuitem" tabindex="-1" data-action="preferences">偏好设置</button>
        </div>`;
      owner.el.collapse.before(menuAnchor);
      this.root = document.createElement('section'); this.root.className = 'nh-insights'; this.root.id = 'nh-insights'; this.root.hidden = true;
      this.root.setAttribute('aria-labelledby', 'nh-page-title');
      this.root.innerHTML = `<div class="ni-page"><div class="ni-scroll" role="region" aria-label="洞察内容"><div class="ni-content">
          <div class="ni-header"><div class="ni-period"><button type="button" class="ni-prev cursor-interaction">${symbol('previous')}</button><span class="ni-period-label"></span><button type="button" class="ni-next cursor-interaction">${symbol('next')}</button></div><div class="ni-ranges" role="group" aria-label="洞察时间范围">${['day','week','month','year'].map(r => `<button type="button" class="cursor-interaction" data-stats-range="${r}"></button>`).join('')}</div></div>
          <section class="ni-day-overview" aria-labelledby="ni-day-title" hidden>
            <div class="ni-day-intake"><h2 class="ni-day-heading" id="ni-day-title"></h2>
              <div class="ni-day-amount"><strong class="ni-day-volume"></strong><span class="ni-day-unit">ml</span></div>
              <div class="ni-day-note"><i class="ni-day-waterline" aria-hidden="true" hidden></i><span class="ni-day-goal"></span></div>
            </div>
            <button type="button" class="ni-day-amber cursor-interaction" aria-haspopup="dialog" hidden><canvas width="192" height="192" aria-hidden="true"></canvas></button>
          </section>
          <section class="ni-week-collection" aria-labelledby="ni-week-title" hidden>
            <div class="ni-week-heading"><h2 id="ni-week-title"></h2><span class="ni-week-goals"></span></div>
            <div class="ni-week-days" role="group"></div>
          </section>
          <section class="ni-month-collection" aria-labelledby="ni-month-title" hidden>
            <h2 id="ni-month-title"></h2>
            <div class="ni-month-layout">
              <div class="ni-month-calendar">
                <div class="ni-month-weekdays" aria-hidden="true"></div>
                <div class="ni-month-grid" role="group"></div>
              </div>
              <div class="ni-month-display"><button type="button" class="ni-month-jar-open cursor-interaction" aria-haspopup="dialog"><span class="ni-month-jar-slot"></span></button><span class="ni-month-goals"></span></div>
            </div>
          </section>
          <section class="ni-year-collection" aria-labelledby="ni-year-title" hidden>
            <h2 id="ni-year-title"></h2>
            <div class="ni-year-jars" role="group"></div>
          </section>
          <div class="ni-metrics"></div>
          <section class="ni-card ni-chart">
            <div class="ni-chart-heading"><h2 class="ni-chart-title"></h2><span class="ni-chart-average" hidden></span></div>
            <div class="ni-chart-body"><div class="ni-plot" role="group"></div><div class="ni-axis" aria-hidden="true"></div></div></section>
          <section class="ni-card ni-breakdown"></section><section class="ni-card ni-timeline"></section>
        </div></div><div class="ni-scrollbar" aria-hidden="true"><span></span></div>
        <form class="ni-editor" hidden></form></div>`;
      owner.el.shell.append(this.root); this.q = s => this.root.querySelector(s);
      this.yearJarTransition = new window.NotchHydroAnnualJarTransition(this);
      this.root.addEventListener('click', event => {
        const button = event.target.closest('[data-year-month]');
        if (button && !button.disabled) this.openYearMonth(button.dataset.yearMonth);
      });
      const monthGrid = this.q('.ni-month-grid');
      const highlightDay = button => this.monthJar?.highlight(button?.dataset.monthDay || null);
      for (const type of ['pointerover', 'focusin']) {
        monthGrid.addEventListener(type, event => highlightDay(event.target.closest('[data-month-day]')));
      }
      monthGrid.addEventListener('pointerleave', () => highlightDay(monthGrid.querySelector('button:focus-visible')));
      monthGrid.addEventListener('focusout', event => highlightDay(event.relatedTarget?.closest?.('[data-month-day]') || monthGrid.querySelector('button:hover')));
      monthGrid.addEventListener('click', event => {
        const button = event.target.closest('[data-month-day]');
        if (button && !button.disabled) this.openMonthDay(button.dataset.monthDay);
      });
      this.q('.ni-day-amber').addEventListener('click', event => {
        const button = event.currentTarget;
        if (button.dataset.amberDay) owner.openMemoryAmber(button.dataset.amberDay, button);
      });
      this.q('.ni-week-days').addEventListener('click', event => {
        const button = event.target.closest('[data-preview-day]');
        if (!button || button.disabled) return;
        const date = button.dataset.previewDay;
        this.selectDay(date);
        if (button.dataset.memoryState === 'amber') owner.openMemoryAmber(date, button);
      });
      this.q('.ni-prev').addEventListener('click', () => this.move(-1)); this.q('.ni-next').addEventListener('click', () => this.move(1));
      this.q('.ni-ranges').addEventListener('click', e => { const b = e.target.closest('[data-stats-range]'); if (b) this.selectRange(b.dataset.statsRange); });
      this.actions = new window.NotchHydroInsightsMenu(menuAnchor, action => {
        if (action === 'add') this.edit();
        else if (action === 'export') this.export();
        else if (action === 'preferences') owner.openDailySettings();
      });
      this.q('.ni-content').addEventListener('click', event => {
        const row = event.target.closest('[data-record]');
        if (!row) return;
        if (event.target.closest('[data-remove]')) this.remove(row.dataset.record);
        else this.edit(row.dataset.record);
      });
      this.q('.ni-plot').addEventListener('pointermove', e => this.hover(e));
      this.q('.ni-plot').addEventListener('pointerleave', () => this.clearHover());
      this.q('.ni-plot').addEventListener('focusin', e => { const b = e.target.closest('[data-index]'); if (b) this.hoverIndex(Number(b.dataset.index)); });
      this.q('.ni-plot').addEventListener('focusout', () => this.clearHover());
      this.q('.ni-plot').addEventListener('click', e => { const b = e.target.closest('[data-index]'); if (b && this.range === 'week') this.selectDay(this.points[Number(b.dataset.index)].date); });
      this.q('.ni-scroll').addEventListener('scroll', () => this.scrollbar());
      this.q('.ni-scrollbar').addEventListener('pointerdown', e => {
        const scroll = this.q('.ni-scroll'), start = scroll.scrollTop, y = e.clientY, target = e.currentTarget;
        target.setPointerCapture(e.pointerId);
        const move = event => { scroll.scrollTop = start + (event.clientY - y) / this.owner.zoom * scroll.scrollHeight / scroll.clientHeight; };
        const end = () => { target.removeEventListener('pointermove', move); target.removeEventListener('pointerup', end); };
        target.addEventListener('pointermove', move); target.addEventListener('pointerup', end);
      });
    }
    get active() { return this.owner.page === 'stats'; }
    text(zh, en) { return this.owner.text(zh, en); }
    drinkLabel(drink) { return this.owner.drinkLabel?.(drink) ?? (this.owner.english ? drink.en : drink.name); }
    get weekStartsOnMonday() { return this.owner.generalOptions?.weekStartsOnMonday !== false; }
    periodAt(date) { return period(this.range, date, this.weekStartsOnMonday); }
    get interval() { return this.periodAt(this.anchor); }
    get days() { return this.owner.memoryDays || []; }
    records(date) {
      const records = date === M.today ? this.owner.records : this.overrides.get(date) || this.days.find(d => d.date === date)?.records || [];
      return records.map((r, i) => ({ ...r, effective: r.effective ?? Math.round(r.raw * r.drink.factor), date,
        time: r.time || ['13:15', '13:45', '14:15'][Math.max(0, 3 - records.length + i)] || '14:15', id: date + ':' + i }));
    }
    get detailDay() { const p = this.interval; return this.range === 'day' ? p.start : this.selected >= p.start && this.selected < p.end ? this.selected : M.addDays(p.end, -1) < M.today ? M.addDays(p.end, -1) : M.today; }
    get detailRecords() {
      const dates = this.range === 'day' || this.range === 'week' ? [this.detailDay] : this.days.filter(d => d.date >= this.interval.start && d.date < this.interval.end).map(d => d.date);
      return dates.flatMap(date => this.records(date)).sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
    }
    showStats() {
      const o = this.owner;
      if (o.motion?.pouring || o.hold) return;
      const fromSettings = o.page === 'settings';
      if (fromSettings) o.dailySettings.hide();
      if (o.page !== 'stats') this.transition();
      if (o.memorable) { o.goalAt = null; o.audio.stopFormation(); }
      o.panelAmber?.hide(o.total >= o.goal);
      o.page = 'stats'; o.memoryVisible = o.memorable; this.syncMemory();
      o.setPreview(null); o.el.body.setAttribute('inert', ''); o.el.body.setAttribute('aria-hidden', 'true');
      // A collapse can leave this page faded out if another page is opened next.
      this.root.style.opacity = o.opening ? o.el.body.style.opacity : '';
      this.root.style.filter = o.opening ? o.el.body.style.filter : '';
      this.root.inert = false;
      this.root.hidden = false; o.dataset.page = 'stats'; o.layout(); o.renderMemory(); this.render(); o.dispatch('insights');
      if (fromSettings) this.actions.button.focus({ preventScroll: true });
    }
    showRecord() {
      const o = this.owner;
      const fromSettings = o.page === 'settings';
      if (fromSettings) o.dailySettings.hide();
      this.clearCollectionNavigation();
      this.jarViewer?.close(false);
      o.memoryAmberViewer?.close(false);
      if (o.page !== 'record') this.transition(); o.page = 'record'; o.memoryVisible = false;
      this.root.inert = true;
      this.root.hidden = true; o.el.body.removeAttribute('inert'); o.el.body.removeAttribute('aria-hidden');
      o.dataset.page = 'record'; o.layout(); o.renderMemory(); o.dispatch('record-page');
      if (fromSettings) o.el.settings.focus({ preventScroll: true });
    }
    transition() {
      if (this.owner.reduced) return;
      this.owner.setAttribute('data-page-transition', this.owner.page);
      clearTimeout(this.transitionTimer); this.transitionTimer=setTimeout(()=>this.owner.removeAttribute('data-page-transition'),450);
    }
    closeTools() {
      this.actions?.close();
    }
    clearCollectionNavigation() {
      this.closeTools();
      this.yearJarTransition?.cancel();
      this.yearOrigin = this.monthOrigin = null;
    }
    openYearMonth(month) {
      const date = month + '-01';
      if (!this.owner.memorable || this.range !== 'year' || !M.validDate(date) ||
          date < this.interval.start || date >= this.interval.end || date < M.earliest || date > M.today) return;
      const button = this.q(`[data-year-month="${month}"]`);
      if (!button || button.disabled) return;
      const from = this.yearJarTransition?.capture(button.querySelector('.ni-year-jar-slot'));
      const origin = { month, scrollTop: this.q('.ni-scroll').scrollTop };
      this.selectRange('month', date, null, origin);
      this.owner.el.back.focus({ preventScroll: true });
      this.yearJarTransition?.play(from, this.q('.ni-month-jar-slot'), 'month');
    }
    openMonthDay(date) {
      if (!this.owner.memorable || this.range !== 'month' || !M.validDate(date) || date > M.today ||
          date < M.earliest || date < this.interval.start || date >= this.interval.end) return;
      const origin = { date, scrollTop: this.q('.ni-scroll').scrollTop };
      this.selectRange('day', date, origin, this.yearOrigin);
      this.owner.el.back.focus({ preventScroll: true });
    }
    returnToMonth() {
      const origin = this.monthOrigin;
      if (!this.owner.memorable || this.range !== 'day' || !origin) return false;
      this.selectRange('month', origin.date, null, this.yearOrigin);
      this.q('.ni-scroll').scrollTop = origin.scrollTop;
      this.q(`[data-month-day="${origin.date}"]`).focus({ preventScroll: true });
      return true;
    }
    returnToYear() {
      const origin = this.yearOrigin;
      if (!this.owner.memorable || this.range !== 'month' || !origin) return false;
      const date = this.interval.start, month = date.slice(0, 7);
      const from = this.yearJarTransition?.capture(this.q('.ni-month-jar-slot'));
      this.selectRange('year', date);
      this.annualJars?.resumeMonth(month);
      const scroll = this.q('.ni-scroll');
      scroll.scrollTop = month.slice(0, 4) === origin.month.slice(0, 4) ? origin.scrollTop : 0;
      const button = this.q(`[data-year-month="${month}"]`);
      if (button) {
        // An adjacent month might be on a different row or even in another year.
        if (month !== origin.month) {
          const target = button.getBoundingClientRect(), clip = scroll.getBoundingClientRect();
          const delta = Math.min(0, target.top - clip.top) + Math.max(0, target.bottom - clip.bottom);
          if (clip.height) scroll.scrollTop += delta * scroll.clientHeight / clip.height;
        }
        button.focus({ preventScroll: true });
        this.yearJarTransition?.play(from, button.querySelector('.ni-year-jar-slot'), 'year');
      }
      return true;
    }
    returnToCollection() {
      return this.returnToMonth() || this.returnToYear();
    }
    selectRange(range, cursor = null, monthOrigin = null, yearOrigin = null) {
      if (!['day','week','month','year'].includes(range)) return;
      if (!cursor && range === this.range && (this.monthOrigin || this.yearOrigin)) return;
      if (range === 'month' && !cursor && this.returnToMonth()) return;
      if (range === 'year' && !cursor && this.returnToYear()) return;
      this.yearJarTransition?.cancel();
      this.monthOrigin = monthOrigin;
      this.yearOrigin = yearOrigin;
      this.jarViewer?.close(false);
      this.owner.memoryAmberViewer?.close(false);
      if (!cursor && this.owner.memorable && ((this.range === 'week' && range === 'day') || (this.range === 'day' && range === 'week'))) {
        cursor = this.detailDay;
      }
      if (!cursor && this.owner.getAttribute?.('scene') === 'water-habit') {
        cursor = this.range === 'week' ? this.detailDay : this.anchor;
      }
      this.range = range; this.anchor = cursor || M.today; this.selected = cursor && cursor < M.today ? cursor : M.today;
      this.closeEditor(); this.syncMemory(); this.owner.renderMemory(); this.render(); this.q('.ni-scroll').scrollTop = 0; this.owner.dispatch('insights-range');
    }
    move(n) {
      const next = shift(this.range, this.interval.start, n);
      const nextPeriod = this.periodAt(next);
      if (nextPeriod.start > this.periodAt(M.today).start || nextPeriod.end <= M.earliest) return;
      this.yearJarTransition?.cancel();
      this.jarViewer?.close(false);
      this.owner.memoryAmberViewer?.close(false);
      this.anchor = next; this.selected = ''; this.closeEditor(); this.syncMemory(); this.owner.renderMemory(); this.render(); this.owner.dispatch('insights-period');
    }
    selectDay(date) {
      if (!M.validDate(date) || date > M.today || date < M.earliest) return;
      if (date !== this.selected) this.owner.memoryAmberViewer?.close(false);
      this.selected = date; this.owner.memorySelection = date; this.closeEditor();
      this.owner.renderMemory(); this.render(); this.owner.dispatch('insights-day');
    }
    syncMemory() {
      const o = this.owner, p = this.interval;
      o.memoryRange = this.range; o.memoryCursor = this.range === 'week' ? M.addDays(p.end, -1) : p.start;
      if (this.range !== 'year') o.memorySelection = this.range === 'week' || this.range === 'day' ? this.detailDay : (this.selected.startsWith(p.start.slice(0, 7)) ? this.selected : (M.addDays(p.end, -1) < M.today ? M.addDays(p.end, -1) : M.today));
      if (this.range === 'month') o.memoryMonthSelection = p.start.slice(0, 7);
      if (this.range === 'year' && !o.memoryMonthSelection?.startsWith(p.start.slice(0, 4))) o.memoryMonthSelection = p.start.slice(0, 4) === M.today.slice(0, 4) ? M.today.slice(0, 7) : p.start.slice(0, 4) + '-12';
    }
    memoryItems() {
      if (this.range === 'day') return [{ ...(this.days.find(d => d.date === this.interval.start) || M.snapshot(this.interval.start, [], this.owner.goal)), kind: 'day', future: false }];
      return M.entries(this.days, this.range, this.owner.memoryCursor, this.weekStartsOnMonday);
    }
    updateAmberThumbnails(tiles) {
      if (tiles.length) this.amberThumbnails ||= new window.NotchHydroAmberThumbnails(this.root);
      const seed = ['day', 'week'].includes(this.range) ? this.owner.collectionProfile.seed : null;
      this.amberThumbnails?.update(tiles, seed);
    }
    renderDayOverview(day) {
      const owner = this.owner, state = day.progress >= 1 ? 'amber' : day.records.length ? 'partial' : 'empty';
      this.q('.ni-day-overview').dataset.memoryState = state;
      this.q('.ni-day-heading').textContent = day.date === M.today ?
        this.text('今日有效摄入', "Today's effective intake") : this.text('当日有效摄入', 'Daily effective intake');
      this.q('.ni-day-volume').textContent = String(day.total);
      const line = this.q('.ni-day-waterline'), partial = state === 'partial';
      line.hidden = !partial;
      line.style.backgroundColor = partial ? rgba(day.color.reference) : '';
      const remaining = day.goal - day.total;
      this.q('.ni-day-goal').textContent = partial ? this.text(`还差 ${remaining} ml`, `${remaining} ml to go`) :
        this.text(`目标 ${day.goal} ml`, `Goal ${day.goal} ml`);
      const button = this.q('.ni-day-amber');
      button.hidden = state !== 'amber';
      if (state === 'amber') {
        button.dataset.amberDay = day.date;
        const date = M.dateLabel(day.date, owner.english);
        button.setAttribute('aria-label', this.text(`查看${date}的琥珀`, `View amber for ${date}`));
      } else {
        delete button.dataset.amberDay;
        button.removeAttribute('aria-label');
      }
      const signature = JSON.stringify(['day', owner.collectionProfile.seed, day.date, state, day.color?.amber, day.shape]);
      if (signature === this.previewKey) {
        this.amberThumbnails?.resume();
        return;
      }
      const tiles = state === 'amber' ? [{ canvas: button.querySelector('canvas'), day, shape: owner.collectionRecord(day.date) }] : [];
      this.updateAmberThumbnails(tiles);
      this.previewKey = signature;
    }
    renderWeekCollection(preview, days) {
      const owner = this.owner;
      const signature = JSON.stringify([owner.collectionProfile.seed, owner.english,
        days.map(day => [day.date, day.total, day.goal, day.records.length, day.color?.reference, day.color?.amber, day.shape])]);
      if (signature === this.previewKey) {
        this.amberThumbnails?.resume();
        return;
      }

      const tiles = [];
      const buttons = days.map(day => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'ni-week-day cursor-interaction';
        button.dataset.previewDay = day.date;
        button.disabled = day.future || day.date < M.earliest;
        const date = document.createElement('span');
        date.className = 'ni-week-date';
        date.textContent = String(Number(day.date.slice(-2)));
        button.append(date);

        const status = [];
        if (day.progress >= 1) {
          button.dataset.memoryState = 'amber';
          button.setAttribute('aria-haspopup', 'dialog');
          status.push(this.text('已达标，查看琥珀', 'Goal reached, view amber'));
          const stone = document.createElement('canvas');
          stone.className = 'ni-week-amber';
          stone.width = stone.height = 128;
          stone.setAttribute('aria-hidden', 'true');
          tiles.push({ canvas: stone, day, shape: owner.collectionRecord(day.date) });
          button.append(stone);
        } else if (day.records.length) {
          button.dataset.memoryState = 'partial';
          status.push(this.text('未达标', 'Below goal'));
          const line = document.createElement('span');
          line.className = 'ni-week-waterline';
          line.style.backgroundColor = rgba(day.color.reference);
          line.setAttribute('aria-hidden', 'true');
          button.append(line);
        } else {
          button.dataset.memoryState = 'empty';
          status.push(day.future ? this.text('尚未到来', 'Upcoming') : this.text('暂无记录', 'No records'));
        }
        if (day.records.length) status.unshift(this.text(`有效 ${day.total} / ${day.goal} 毫升`, `${day.total} of ${day.goal} ml effective`));
        button.setAttribute('aria-label', [M.dateLabel(day.date, owner.english), ...status].join(this.text('，', ', ')));
        if (day.date === M.today) button.setAttribute('aria-current', 'date');
        return button;
      });
      preview.replaceChildren(...buttons);
      this.updateAmberThumbnails(tiles);
      this.previewKey = signature;
    }
    renderMonthCollection() {
      const owner = this.owner, cells = this.memoryItems();
      const days = cells.filter(Boolean);
      const signature = JSON.stringify(['month', owner.collectionProfile.seed, owner.english, this.weekStartsOnMonday,
        days.map(day => [day.date, day.total, day.goal, day.records.length, day.color?.reference, day.color?.amber])]);
      if (signature === this.previewKey) {
        this.amberThumbnails?.resume();
        this.jarViewer?.resume();
        return;
      }
      this.q('#ni-month-title').textContent = this.text('琥珀收藏', 'Amber collection');
      const weekdays = M.weekdayHeadings(owner.english, this.weekStartsOnMonday);
      this.q('.ni-month-weekdays').innerHTML = weekdays.map(label => `<span>${label}</span>`).join('');
      const grid = this.q('.ni-month-grid');
      grid.setAttribute('aria-label', this.periodLabel());
      const earned = [];
      grid.innerHTML = cells.map(day => {
        if (!day) return '<span aria-hidden="true"></span>';
        const disabled = day.future || day.date < M.earliest;
        const state = disabled ? 'future' : day.progress >= 1 ? 'amber' : day.records.length ? 'partial' : 'empty';
        if (state === 'amber') earned.push({ day, shape: owner.collectionRecord(day.date) });
        const color = day.color && !disabled ? rgba(day.color.reference) : null;
        const status = {
          amber: this.text('已达标', 'Goal reached'), partial: this.text('未达标', 'Below goal'),
          empty: this.text('暂无记录', 'No records'), future: this.text('尚未到来', 'Upcoming')
        }[state];
        const label = M.dateLabel(day.date, owner.english) + this.text('，', ', ') +
          (color ? this.text(`有效 ${day.total} 毫升，`, `${day.total} ml effective, `) : '') + status;
        return `<button type="button" class="ni-month-day cursor-interaction" data-month-day="${day.date}" data-memory-state="${state}"
          aria-label="${label}"${disabled ? ' disabled' : ''}${day.date === M.today ? ' aria-current="date"' : ''}>
          <span>${Number(day.date.slice(-2))}</span>${color ? `<i class="ni-month-mark" style="background:${color}" aria-hidden="true"></i>` : ''}</button>`;
      }).join('');
      const count = earned.length;
      this.q('.ni-month-goals').textContent = this.text(`${count} 天达标`, `${count} goal ${count === 1 ? 'day' : 'days'}`);
      const label = this.periodLabel() + this.text(`的玻璃罐，${count} 颗琥珀`, ` amber jar, ${count} ${count === 1 ? 'stone' : 'stones'}`);
      this.jarViewer?.close(false);
      const trigger = this.q('.ni-month-jar-open');
      trigger.setAttribute('aria-label', this.text('放大查看', 'View ') + label);
      this.monthJar ||= new window.NotchHydroMonthJar(this.q('.ni-month-jar-slot'));
      const tiles = this.monthJar.update(earned, label, owner.collectionProfile.seed);
      this.updateAmberThumbnails(tiles);
      this.jarViewer ||= new window.NotchHydroMonthJarViewer(this);
      this.jarViewer.bindMonth(owner.collectionProfile.seed + ':' + this.interval.start, this.monthJar, tiles);
      trigger.onclick = () => this.jarViewer.open(label, trigger);
      this.previewKey = signature;
    }
    renderCollection() {
      const { owner, range } = this;
      const sections = ['day', 'week', 'month', 'year'];
      for (const name of sections) {
        const selector = name === 'day' ? '.ni-day-overview' : '.ni-' + name + '-collection';
        this.q(selector).hidden = !owner.memorable || range !== name;
      }
      if (!owner.memorable) return;
      if (range === 'day') {
        this.renderDayOverview(this.memoryItems()[0]);
      } else if (range === 'week') {
        const grid = this.q('.ni-week-days');
        grid.setAttribute('aria-label', this.periodLabel() + this.text('的琥珀', ' amber collection'));
        this.renderWeekCollection(grid, this.memoryItems());
        for (const button of grid.children) button.setAttribute('aria-pressed', String(button.dataset.previewDay === owner.memorySelection));
      } else if (range === 'month') {
        this.renderMonthCollection();
      } else {
        this.annualJars ||= new window.NotchHydroAnnualJars(this, this.q('.ni-year-jars'));
        this.q('#ni-year-title').textContent = this.text('琥珀收藏', 'Amber collection');
        this.annualJars.update();
      }
    }
    periodLabel() {
      const p = this.interval, en = this.owner.english;
      if (this.range === 'year') return p.start.slice(0, 4) + (en ? '' : '年');
      if (this.range === 'month') return M.monthLabel(p.start.slice(0, 7), en);
      const last = M.addDays(p.end, -1), year = p.start.slice(0,4);
      const yearLabel = (date,include) => (include ? date.slice(0,4) + (en ? ' ' : '年') : '') + M.dateLabel(date,en);
      const first = yearLabel(p.start,year !== M.today.slice(0,4));
      if (this.range === 'week') return first + ' – ' + yearLabel(last,year !== last.slice(0,4));
      const day = parse(p.start).getUTCDay();
      return first + this.text('周' + ['日','一','二','三','四','五','六'][day], ' ' + ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][day]);
    }
    render() {
      if (!this.active || !this.days.length) return;
      const o = this.owner, t = (a, b) => this.text(a, b), range = this.range;
      this.root.dataset.range = range;
      const dayFromMonth = range === 'day' && o.memorable && this.monthOrigin;
      const monthFromYear = range === 'month' && o.memorable && this.yearOrigin;
      const backLabel = dayFromMonth ? t('返回月历', 'Back to calendar') : monthFromYear ?
        t('返回年视图', 'Back to year') : t('返回饮水记录', 'Back to recording');
      o.el.back.setAttribute('aria-label', backLabel);
      o.el.collapse.setAttribute('aria-label', dayFromMonth || monthFromYear ? t('收起面板', 'Close panel') : t('收起面板 · Esc', 'Close panel · Esc'));
      this.q('.ni-period-label').textContent = this.periodLabel();
      this.q('.ni-prev').setAttribute('aria-label', range === 'day' ? t('查看上一天', 'Previous day') : t('查看上一周期', 'Previous period'));
      this.q('.ni-next').setAttribute('aria-label', range === 'day' ? t('查看下一天', 'Next day') : t('查看下一周期', 'Next period'));
      this.q('.ni-next').disabled = this.interval.start === this.periodAt(M.today).start;
      this.q('.ni-prev').disabled = shift(range, this.interval.start, -1) < this.periodAt(M.earliest).start;
      for (const b of this.root.querySelectorAll('[data-stats-range]')) { b.textContent = (o.english ? { day:'Day',week:'Week',month:'Month',year:'Year' } : { day:'天',week:'周',month:'月',year:'年' })[b.dataset.statsRange]; b.setAttribute('aria-pressed', String(b.dataset.statsRange === range)); }
      const weekly = o.memorable && range === 'week', daily = o.memorable && range === 'day', monthly = o.memorable && range === 'month';
      const annual = o.memorable && range === 'year';
      const hasCollection = o.memorable;
      const metrics = [], a = aggregate(this.days, range, this.anchor, M.today, this.weekStartsOnMonday), total = range==='day' && !daily ? this.detailRecords.reduce((s,r) => s + r.effective, 0) : 0, current = this.interval.start === this.periodAt(M.today).start;
      const metric = (title, value, detail, reached) => metrics.push(`<div class="ni-metric"><span>${title}</span><strong>${value}</strong><small${reached ? ' class="ni-reached"' : ''}>${detail}</small></div>`);
      if (!o.memorable) {
        const intake = range === 'day' ? total : o.total, remaining = Math.max(0, o.goal - intake);
        metric(range === 'day' && !current ? t('当日有效摄入','Daily intake') : t('今日有效摄入','Today'), `${intake} ml`, remaining ? t(`距目标还差 ${remaining}`,`${remaining} ml to go`) : range === 'day' ? t('目标已达成 ✨','Goal reached ✨') : t('今日目标已达成 ✨','Goal reached ✨'), !remaining);
      }
      if (range === 'day' && !daily) {
        metric(t('目标完成','Goal progress'), Math.round(total / o.goal * 100) + '%', t(`每日目标 ${o.goal} ml`,`Goal ${o.goal} ml`));
        metric(t('饮水次数','Drink entries'), t(`${this.detailRecords.length} 次`,String(this.detailRecords.length)), this.detailRecords[0] ? t('最近 ','Last ') + this.detailRecords[0].time : t('尚未记录','No entries yet'));
      } else if (!hasCollection) {
        const nowStart=this.periodAt(M.today).start, start=this.interval.start;
        const offset=range==='week'?Math.round((parse(nowStart)-parse(start))/604800000):range==='month'?(Number(nowStart.slice(0,4))-Number(start.slice(0,4)))*12+Number(nowStart.slice(5,7))-Number(start.slice(5,7)):Number(nowStart.slice(0,4))-Number(start.slice(0,4));
        const periodName = range === 'week' ? (current ? '本周' : offset===1?'上周':`${offset} 周前`) : range === 'month' ? (current ? '本月' : offset===1?'上月':`${offset} 个月前`) : (current ? '本年度' : offset===1?'去年':`${offset} 年前`);
        metric(t(periodName + '日均','Daily average'), a.average + ' ml', range === 'month' ? t(`达标 ${a.goalDays} / ${a.count} 天`,`${a.goalDays} / ${a.count} goal days`) : t(`目标达成率 ${Math.round(a.average / o.goal * 100)}%`,`${Math.round(a.average / o.goal * 100)}% of goal`));
        let streak = 0, date = o.total < o.goal ? M.addDays(M.today,-1) : M.today;
        while (this.days.find(d => d.date === date)?.progress >= 1) { streak++; date = M.addDays(date,-1); }
        metric(range === 'week' ? current ? t('连续达标','Goal streak') : t('周期达标','Goal days') : t('周期累计','Period total'), range === 'week' ? current ? t(`${streak} 天`,`${streak} days`) : `${a.goalDays} / ${a.count}` : (a.total / 1000).toFixed(1) + ' L', range === 'week' ? t('非提醒日自动豁免','Rest days exempt') : t('有效水合总量','Effective hydration'));
      }
      const cards = this.q('.ni-metrics'), average = this.q('.ni-chart-average');
      cards.hidden = hasCollection;
      cards.innerHTML = metrics.join('');
      average.hidden = !weekly && !monthly && !annual;
      if (!average.hidden) average.textContent = t(`日均 ${a.average} ml`, `Daily average ${a.average} ml`);
      if (weekly) {
        this.q('#ni-week-title').textContent = t('琥珀收藏', 'Amber collection');
        this.q('.ni-week-goals').textContent = t(`${a.goalDays} 天达标`, `${a.goalDays} goal ${a.goalDays === 1 ? 'day' : 'days'}`);
      }
      this.points = chartPoints(this.days, range, this.anchor, range === 'day' ? this.records(this.detailDay) : [], this.weekStartsOnMonday); this.renderChart(); this.renderDetail();
      this.renderCollection();
      const moreLabel = t('更多操作', 'More actions');
      this.actions.button.setAttribute('aria-label', moreLabel);
      this.actions.button.title = moreLabel;
      const menu = this.actions.menu;
      menu.querySelector('[data-action=add]').textContent = t('补录饮水', 'Add a drink');
      menu.querySelector('[data-action=export]').textContent = t('导出全部记录', 'Export all records');
      menu.querySelector('[data-action=preferences]').textContent = t('偏好设置', 'Preferences');
      o.dataset.statsRange = range; o.dataset.statsPeriod = this.interval.start; o.dataset.statsDay = this.detailDay; o.dataset.statsAverage = a.average; o.dataset.statsTotal = a.total;
      requestAnimationFrame(() => this.scrollbar());
    }
    renderChart() {
      const range = this.range, t = (a,b) => this.text(a,b), pts = this.points, goal = this.owner.goal;
      const title = {
        day: this.owner.memorable ? t('每小时饮水趋势', 'Hourly hydration trend') : t('每小时有效补水 (ml)', 'Hourly hydration (ml)'),
        week: this.owner.memorable ? t('饮水趋势', 'Hydration trend') : t('每日有效补水 (ml)', 'Daily hydration (ml)'),
        month: this.owner.memorable ? t('饮水趋势', 'Hydration trend') : t('月度补水趋势曲线 (ml)', 'Daily hydration (ml)'),
        year: this.owner.memorable ? t('饮水趋势', 'Hydration trend') : t('各月日均补水对比 (ml)', 'Monthly daily average (ml)')
      }[range];
      this.q('.ni-chart-title').textContent = title; this.q('.ni-plot').setAttribute('aria-label', range === 'year' ? t('各月日均有效摄入量，毫升', 'Average daily intake by month, in milliliters') : title);
      const maximum = Math.max(range === 'day' ? 500 : Math.max(2400,goal * 1.2), ...pts.map(p => p.amount)), plot = this.q('.ni-plot');
      this.maximum = maximum; const goalY = (1 - goal / maximum) * 84;
      const width = (this.owner.insightsWidth || 445) - 36 - 26; this.plotWidth = width;
      let html = range === 'day' ? '' : `<div class="ni-goal-line" style="top:${goalY}px"></div>`;
      if (range === 'month') {
        const positions = pts.flatMap((p,i) => p.future ? [] : [[position(i,pts.length,width,range),(1 - Math.min(1,p.amount / maximum)) * 84]]);
        const path = positions.map(([x,y],i) => `${i ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`).join(' '), last = positions.at(-1);
        html += `<svg class="ni-month-curve" width="${width}" height="84" viewBox="0 0 ${width} 84" aria-hidden="true"><defs><linearGradient id="ni-area" x2="0" y2="1"><stop stop-color="white" stop-opacity=".28"/><stop offset="1" stop-color="white" stop-opacity="0"/></linearGradient></defs>${last ? `<path d="${path} L${last[0]},84 L${positions[0][0]},84 Z" fill="url(#ni-area)"/><path d="${path}" fill="none" stroke="white" stroke-opacity=".85" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>${this.interval.start === this.periodAt(M.today).start ? `<circle cx="${last[0]}" cy="${last[1]}" r="3.5" fill="white" stroke="#0b0d13" stroke-width="1.5"/>` : ''}` : ''}</svg>`;
      }
      const currentHour = range==='day'?Number(this.detailRecords[0]?.time.slice(0,2)):null;
      html += pts.map((p,i) => {
        const current = range === 'week' ? p.date === this.detailDay : range === 'year' ? p.date.slice(0,7) === M.today.slice(0,7) : range === 'day' ? p.hour === currentHour : false;
        const minimum = range === 'day' || (range === 'year' && this.owner.memorable) ? 0 : range === 'year' ? .06 : .04;
        const fraction = Math.max(minimum, Math.min(1,p.amount / maximum));
        const label = this.pointLabel(p) + '，' + (p.future ? t('尚未到来','Upcoming') : `${Math.round(p.amount)} ml`);
        return `<button type="button" class="ni-mark cursor-interaction${current ? ' current' : ''}${p.amount >= goal ? ' reached' : ''}${p.future ? ' future' : ''}" data-index="${i}"${range === 'year' && this.owner.memorable && p.future ? ' disabled' : ''} aria-label="${label}" style="left:${position(i,pts.length,width,range)}px;--ni-bar-height:${84 * fraction}px"><span class="ni-bar"${range === 'month' ? ' hidden' : ''}></span></button>`;
      }).join('');
      html += `<span class="ni-goal-label" style="top:${range === 'day' ? 0 : goalY - 14}px">${range === 'day' ? Math.round(maximum) : goal}</span><div class="ni-hover" hidden><span class="ni-crosshair"></span><span class="ni-tooltip"><span></span><strong></strong></span><span class="ni-hover-dot"></span></div>`;
      plot.innerHTML = html;
      const axis = this.q('.ni-axis');
      if (range === 'day') {
        axis.innerHTML = ['00:00','06:00','12:00','18:00','24:00'].map(s => `<span>${s}</span>`).join('');
      } else if (range === 'month') {
        axis.innerHTML = [1,15,pts.length].map(n => `<span>${n}${t(' 日','')}</span>`).join('');
      } else {
        const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        axis.innerHTML = pts.map(point => {
          let current, label;
          if (range === 'year') {
            const month = Number(point.date.slice(5,7));
            current = point.date.slice(0,7) === M.today.slice(0,7);
            label = this.owner.memorable ? t(month + '月', monthNames[month - 1]) : month;
          } else {
            const weekday = parse(point.date).getUTCDay();
            current = point.date === this.detailDay;
            label = t('周' + ['日','一','二','三','四','五','六'][weekday], ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][weekday]);
          }
          return `<span${current ? ' class="current"' : ''}>${label}</span>`;
        }).join('');
      }
    }
    pointLabel(p) {
      return this.range === 'day' ? String(p.hour).padStart(2,'0') + ':00 – ' + String(p.hour+1).padStart(2,'0') + ':00' : this.range === 'year' ? M.monthLabel(p.date.slice(0,7),this.owner.english) : M.dateLabel(p.date,this.owner.english) + this.text('周'+['日','一','二','三','四','五','六'][parse(p.date).getUTCDay()],' '+['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][parse(p.date).getUTCDay()]);
    }
    hover(e) {
      const rect = e.currentTarget.getBoundingClientRect(), x = (e.clientX - rect.left) / this.owner.zoom, first = position(0,this.points.length,this.plotWidth,this.range), last = position(this.points.length-1,this.points.length,this.plotWidth,this.range);
      this.hoverIndex(Math.round(Math.min(1,Math.max(0,(x-first)/(last-first))) * (this.points.length-1)));
    }
    hoverIndex(i) {
      const p = this.points[i]; if (!p) return;
      const x = position(i,this.points.length,this.plotWidth,this.range), w = this.owner.english && this.range === 'year' ? 142 : 116;
      const tooltipX = Math.max(0,Math.min(this.plotWidth-w,x+10+w <= this.plotWidth ? x+10 : x-w-10)), overlay = this.q('.ni-hover');
      overlay.hidden = false; overlay.querySelector('.ni-crosshair').style.left = x+'px'; const tip = overlay.querySelector('.ni-tooltip'); tip.style.left = tooltipX+'px'; tip.style.width = w+'px';
      tip.querySelector('span').textContent = this.pointLabel(p); tip.querySelector('strong').textContent = p.future ? this.text('尚未到来','Upcoming') : this.range === 'year' ? this.text('日均 ','Daily avg ') + Math.round(p.amount).toLocaleString() + ' ml' : Math.round(p.amount).toLocaleString()+' ml';
      const dot = overlay.querySelector('.ni-hover-dot'); dot.hidden = this.range !== 'month' || p.future; dot.style.left = x+'px'; dot.style.top = (1-Math.min(1,p.amount/this.maximum))*84+'px';
      for (const b of this.root.querySelectorAll('.ni-mark')) b.classList.toggle('hovered',Number(b.dataset.index)===i);
      this.q('.ni-plot').classList.add('hovering');
    }
    clearHover() { this.q('.ni-hover')?.setAttribute('hidden',''); this.q('.ni-plot').classList.remove('hovering'); }
    renderDetail() {
      const annual = this.range === 'year';
      const combined = this.owner.memorable === true && !annual;
      const records = annual ? [] : this.detailRecords;
      const t = (zh, en) => this.text(zh, en);
      const totals = new Map();
      const recordedDrinks = new Map();
      let count = 0, total = 0;
      const add = record => {
        const amount = record.effective ?? Math.round(record.raw * record.drink.factor);
        totals.set(record.drink.id, (totals.get(record.drink.id) || 0) + amount);
        if (!recordedDrinks.has(record.drink.id)) recordedDrinks.set(record.drink.id, record.drink);
        total += amount;
        count++;
      };
      if (annual) {
        const { start, end } = this.interval;
        for (const day of this.days) {
          if (day.date >= start && day.date < end) day.records.forEach(add);
        }
      } else records.forEach(add);

      const order = new Set([...(this.owner.drinkCatalog || drinks).map(d => d.id), ...recordedDrinks.keys()]);
      const groups = Array.from(order).filter(id => totals.get(id) > 0).map(id => recordedDrinks.get(id));
      const date = M.dateLabel(this.detailDay, this.owner.english);
      const prefix = this.range === 'month' ? t('整月', 'Monthly ') : annual ? t('全年', 'Yearly ') :
        this.detailDay === M.today ? t('今日', "Today's ") : date + ' · ';
      const month = this.range === 'month';
      const detailPeriod = month ? this.periodLabel() : date;
      const title = combined ? detailPeriod + ' · ' + t('饮水明细', 'Drink details') : prefix + t('饮品占比', 'drink breakdown');
      const recordCount = t(count + ' 次记录', count + (count === 1 ? ' record' : ' records'));
      const heading = `<div class="ni-section-heading"><h2>${title}</h2>${this.range === 'day' && !combined ? '' : `<span>${recordCount}</span>`}</div>`;
      let composition = '';
      if (groups.length || !combined) {
        const segments = groups.map(drink => `<span style="background:${drink.dot};flex:${totals.get(drink.id)}"></span>`).join('');
        const legend = groups.map(drink => {
          const amount = totals.get(drink.id);
          return `<span><i style="background:${drink.dot}"></i><b>${escapeHTML(this.drinkLabel(drink))}</b><span>${amount} ml (${Math.round(amount / total * 100)}%)</span></span>`;
        }).join('');
        composition = `<div class="ni-composition">${segments}</div><div class="ni-legend">${legend || t('暂无饮水记录', 'No drinks recorded')}</div>`;
      }

      const breakdown = this.q('.ni-breakdown'), timeline = this.q('.ni-timeline');
      timeline.hidden = annual || combined;
      if (timeline.hidden) timeline.innerHTML = '';
      if (annual) {
        breakdown.innerHTML = heading + composition;
        return;
      }

      let list;
      if (records.length) {
        const rows = records.map(record => {
          const { id, drink, raw, effective, time } = record;
          const name = escapeHTML(this.drinkLabel(drink));
          const timeLabel = this.range === 'month' ? record.date.slice(5).replace('-', '/') + ' ' + time : time;
          const label = `${name} ${raw} ml`;
          return `<div class="ni-record" data-record="${id}"><button type="button" class="ni-edit cursor-interaction" aria-label="${t('修改记录：', 'Edit entry: ')}${label} ${time}"><time>${timeLabel}</time><i style="background:${drink.dot}"></i><span>${name}</span><strong>+${effective} ml</strong>${effective !== raw ? `<small>(${raw})</small>` : ''}</button><button type="button" class="ni-remove cursor-interaction" data-remove aria-label="${t('撤销此条记录：', 'Undo entry: ')}${label}">×</button></div>`;
        }).join('');
        list = `<div class="ni-records">${rows}</div>`;
      } else {
        const empty = !combined ? t('暂无饮水记录', 'No drinks recorded') : month ?
          t('当月暂无饮水记录', 'No drinks recorded that month') : t('当天暂无饮水记录', 'No drinks recorded that day');
        list = `<p class="ni-empty">${empty}</p>`;
      }
      breakdown.innerHTML = heading + composition + (combined ? list : '');
      if (!combined) timeline.innerHTML = `<h2>${prefix + t('饮水记录', 'drink records')}</h2>${list}`;
    }
    scrollbar() {
      const s = this.q('.ni-scroll'), thumb = this.q('.ni-scrollbar span'), height = s.clientHeight;
      this.q('.ni-scrollbar').style.height = height + 'px';
      const h = Math.max(20,height*height/s.scrollHeight); this.q('.ni-scrollbar').hidden = s.scrollHeight <= height;
      thumb.style.height = h+'px'; thumb.style.transform = `translateY(${(height-h)*s.scrollTop/Math.max(1,s.scrollHeight-height)}px)`;
    }
    edit(id = null) {
      this.editing = id ? this.detailRecords.find(r=>r.id===id) : null;
      const r = this.editing, t = (a,b)=>this.text(a,b), form = this.q('.ni-editor');
      const choices = [...(this.owner.enabledDrinks || drinks)];
      if (r) {
        const index = choices.findIndex(drink => drink.id === r.drink.id);
        if (index < 0) choices.push(r.drink);
        else choices[index] = r.drink;
      }
      const selectedID = r?.drink.id || this.owner.currentDrink?.id || choices[0].id;
      const drinkOptions = choices.map(drink => `<option value="${escapeHTML(drink.id)}"${drink.id === selectedID ? ' selected' : ''}>${escapeHTML(this.drinkLabel(drink))}</option>`).join('');
      this.volumeMin=r?Math.min(5,r.raw):10; this.volumeMax=r?Math.max(2000,r.raw):2000;
      form.innerHTML = `<h2>${r?t('修改饮水记录','Edit drink'):t('补录饮水','Add a drink')}</h2><div class="ni-fields"><label>${t('日期','Date')}<input type="date" name="date" aria-label="${t('选择饮水日期','Choose drink date')}" max="${M.today}" min="${M.earliest}" value="${r?.date||this.detailDay}" required></label><label>${t('时间','Time')}<input type="time" name="time" aria-label="${t('饮水时间','Time of drink')}" ${(r?.date||this.detailDay)===M.today?'max="14:15"':''} value="${r?.time||'14:15'}" required></label><label>${t('饮品','Drink')}<select name="drink" aria-label="${t('饮品','Drink')}">${drinkOptions}</select></label><label>${t('饮用量','Volume')}<span class="ni-volume"><input name="volume" type="number" min="${r?Math.min(5,r.raw):10}" max="${r?Math.max(2000,r.raw):2000}" step="1" aria-label="${t('饮用量（毫升）','Volume in milliliters')}" value="${r?.raw||250}" required><span>ml</span></span></label></div><div class="ni-editor-actions"><button type="button" class="ni-cancel cursor-interaction">${t('取消','Cancel')}</button><button type="submit" class="ni-save cursor-interaction">${t('保存','Save')}</button></div>`;
      form.hidden = false;
      this.actions.menu.querySelector('[data-action=add]').disabled = true;
      form.querySelector('[name=date]').focus({ preventScroll: true });
      form.querySelector('.ni-cancel').addEventListener('click',()=>this.closeEditor(true));
      form.oninput = () => { form.querySelector('[name=time]').max=form.querySelector('[name=date]').value===M.today?'14:15':''; const data = new FormData(form), date = data.get('date'), time = data.get('time'), raw = Number(data.get('volume')); form.querySelector('[type=submit]').disabled = !M.validDate(date) || date > M.today || date < M.earliest || !time || date===M.today&&time>'14:15' || raw<this.volumeMin || raw>this.volumeMax; };
      form.querySelector('[name=volume]').addEventListener('keydown',e=>{if(!['ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();const input=e.currentTarget;input.value=String(Math.min(this.volumeMax,Math.max(this.volumeMin,Number(input.value||250)+(e.key==='ArrowUp'?10:-10))));form.oninput();});
      form.onsubmit = e => { e.preventDefault(); this.saveEditor(new FormData(form)); };
      this.scrollbar();
    }
    closeEditor(restoreFocus = false) {
      this.q('.ni-editor').hidden = true;
      this.actions.menu.querySelector('[data-action=add]').disabled = false;
      if (restoreFocus && !this.editing) this.actions?.button.focus({ preventScroll: true });
      this.editing = null;
      requestAnimationFrame(() => this.scrollbar());
    }
    replaceDay(date, records) {
      this.overrides.set(date,records.map(({id,...r})=>r));
      if (date===M.today) { this.owner.records=records.map(({id,...r})=>r); this.owner.visual=this.owner.total; this.owner.feedback=null; this.owner.round=null; this.owner.affirmation=null; this.owner.affirmationsReached={first:records.length>0,half:this.owner.total>=this.owner.goal/2}; this.owner.toastUntil=0; if(this.owner.total<this.owner.goal)this.owner.goalAt=null; this.owner.fluid?.cancelEnding(); this.owner.updateGuidance(); this.owner.renderStatus(); }
      const goal = date === M.today ? this.owner.goal : this.days.find(day => day.date === date)?.goal ?? this.owner.goal;
      const snapshot=M.snapshot(date,records,goal,this.owner.collectionProfile?.id); this.owner.memoryDays=this.owner.memoryDays.map(d=>d.date===date?snapshot:d);
    }
    remove(id) { const r=this.detailRecords.find(r=>r.id===id); if(!r)return; this.replaceDay(r.date,this.records(r.date).filter(v=>v.id!==id)); this.closeEditor(); this.owner.renderMemory(); this.render(); this.owner.dispatch('insights-remove'); }
    saveEditor(data) {
      const date=data.get('date'), time=data.get('time'), raw=Number(data.get('volume')), id=data.get('drink');
      const old=this.editing;
      const drink = old?.drink.id === id ? old.drink : (this.owner.enabledDrinks || drinks).find(d => d.id === id);
      if(!M.validDate(date)||date<M.earliest||date>M.today||!time||date===M.today&&time>'14:15'||!drink||!Number.isInteger(raw)||raw<(this.volumeMin||10)||raw>(this.volumeMax||2000))return;
      if(old)this.replaceDay(old.date,this.records(old.date).filter(r=>r.id!==old.id));
      const effective = old && old.drink === drink && old.raw === raw ? old.effective : Math.round(raw * drink.factor);
      this.replaceDay(date,[...this.records(date),{drink,raw,time,effective}]);
      this.closeEditor(true);
      if (this.range !== 'day' && !(this.owner.memorable && this.range === 'month')) this.range='week';
      this.anchor=date; this.selected=date;
      this.syncMemory(); this.owner.renderMemory(); this.render(); this.owner.dispatch('insights-save');
    }
    export() {
      const rows=[['Date','Time','Drink','Raw ml','Effective ml'],...this.days.flatMap(d=>this.records(d.date)).map(r=>{
        const name = this.drinkLabel(r.drink);
        const value = /^[\s]*[=+@-]/.test(name) ? "'" + name : name;
        return [r.date, r.time, '"' + value.replaceAll('"', '""') + '"', r.raw, r.effective];
      })];
      const a=document.createElement('a'), url=URL.createObjectURL(new Blob(['\ufeff'+rows.map(row=>row.join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}));
      a.href=url; a.download='NotchHydro_Demo_Records.csv'; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000); this.owner.dispatch('insights-export');
    }
  }
  window.NotchHydroInsights = Insights;
})();
