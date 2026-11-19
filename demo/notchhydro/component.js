/* Reusable recording-panel prototype. No connection to the real application. */
(() => {
  'use strict';
  const { Fluid, drinks, palette, clamp, smooth, waterlineY } = window.NotchHydroFluid;
  const T = window.NotchHydroTokens;
  const Memory = window.NotchHydroMemory;
  const Collection = window.NotchHydroCollection;
  const defaultQuickAmounts = [150, 250, 350];
  const learnedPresetKey = 'notchhydro.prototype.learnedPresetAdjustment';
  const dayMinutes = 1440;
  const demoWeekday = new Date(Memory.today + 'T12:00:00Z').getUTCDay() || 7;
  const minuteOfDay = clock => Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3));
  function clockLabel(minute) {
    const m = Math.floor(minute) % dayMinutes;
    return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  }
  // Use the prototype's demo date and clock. Merge overlapping periods, carry
  // the countdown across breaks, and restart it when the next reminder day begins.
  function reminderPlan(options, now) {
    const day = Math.floor(now / dayMinutes), ranges = [], dailyStarts = [];
    const week = new Set(options.weekdays);
    for (let d = day - 1; d <= day + 8; d++) {
      const weekday = (demoWeekday - 1 + d + 7) % 7 + 1;
      if (!week.has(weekday)) continue;
      let first = Infinity;
      for (const period of options.periods) {
        const start = minuteOfDay(period.start), end = minuteOfDay(period.end);
        first = Math.min(first, start);
        ranges.push({ start: d * dayMinutes + start, end: d * dayMinutes + end + (end <= start ? dayMinutes : 0) });
      }
      if (Number.isFinite(first)) dailyStarts.push(d * dayMinutes + first);
    }
    const windows = [];
    for (const range of ranges.sort((a, b) => a.start - b.start)) {
      const last = windows.at(-1);
      if (last && range.start <= last.end) last.end = Math.max(last.end, range.end);
      else windows.push(range);
    }
    let wait = options.interval, next = null, count = 0;
    const tomorrow = (day + 1) * dayMinutes;
    for (const window of windows) {
      let start = Math.max(now, window.start);
      if (start >= window.end) continue;
      // Split even merged overnight periods at the following day's reset.
      const boundaries = dailyStarts.filter(at => at > start && at < window.end);
      for (const end of [...boundaries, window.end]) {
        if (dailyStarts.includes(start)) wait = options.interval;
        let due = start + wait;
        while (due < end) {
          next ??= due;
          if (due >= tomorrow) return { next, count, windows };
          count++;
          due += options.interval;
        }
        wait = due - end;
        start = end;
      }
    }
    return { next, count, windows };
  }
  const icon = (name, cls = '') => {
    const s = window.NotchHydroSymbols[name] ?? window.NotchHydroInsightsSymbols[name];
    return `<img class="${cls}" src="${s.src}" width="${s.width}" height="${s.height}" alt="" aria-hidden="true">`;
  };
  const ease = p => 1 - Math.pow(1 - clamp(p), 3);
  function initialRecords(scene, memorable) {
    if (scene === 'empty') return [];
    if (scene === 'website') return [{ drink: drinks[0], raw: 450 }];
    if (scene === 'mixed') return [{ drink: drinks[0], raw: 700 }, { drink: drinks[2], raw: 250 }, { drink: drinks[4], raw: 350 }];
    if (scene === 'goal' && memorable) return [{ drink: drinks[0], raw: 855 }, { drink: drinks[3], raw: 1105 }];
    return [{ drink: drinks[0], raw: scene === 'goal' ? 1850 : scene === 'half' ? 850 : 1250 }];
  }
  // The water-habit demo has its own history and per-user edits.
  const profileSessionKey = (id, scene) => scene === 'water-habit' ? id + ':water-habit' : id;
  function liquidVolumes(before, after) {
    const volumes = new Map();
    for (const [records, endpoint] of [[before, 'from'], [after, 'to']]) {
      for (const { drink, raw } of records) {
        if (!volumes.has(drink)) volumes.set(drink, { drink, from: 0, to: 0 });
        volumes.get(drink)[endpoint] += raw;
      }
    }
    return [...volumes.values()];
  }
  class NotchHydroDemo extends HTMLElement {
    recordHeight = T.height;
    previewFirstRun = new URLSearchParams(window.location.search).get('onboarding') === 'preview';
    static get observedAttributes() { return ['variant', 'geometry', 'zoom', 'scene', 'reduced', 'auto-collapse', 'language', 'memory-open']; }
    constructor() {
      super(); this.attachShadow({ mode: 'open' }); this.audio = new window.NotchHydroAudio(); this.animations = {};
      this.shadowRoot.innerHTML = `<style>${window.NotchHydroPanelStyle}</style>
        <div class="nh-stage">
          <div class="nh-scale"><div class="nh-shadow"><div class="nh-shell">
            <div class="nh-liquid" aria-hidden="true"><canvas class="nh-water"></canvas></div>
            <nav class="nh-header" aria-label="面板工具栏">
              <div class="nh-leading">
                <button type="button" class="nh-drink cursor-interaction" aria-label="水，切换饮品"> <span class="nh-dot"></span><span class="nh-name">水</span>${icon('switch', 'nh-switch')}</button>
                <div class="nh-page-leading" inert>
                  <button type="button" class="nh-tool nh-back cursor-interaction" aria-label="返回">${icon('back')}</button>
                  <h1 id="nh-page-title" class="nh-page-title" tabindex="-1"></h1>
                </div>
              </div>
              <div class="nh-tools">
                <button type="button" class="nh-tool nh-stats cursor-interaction" aria-label="查看饮水统计图表" aria-controls="nh-insights">${icon('stats')}</button>
                <button type="button" class="nh-tool nh-settings cursor-interaction" aria-label="设置" aria-controls="nh-daily-settings">${icon('settings')}</button>
                <button type="button" class="nh-tool nh-collapse cursor-interaction" aria-label="收起面板">${icon('collapse')}</button>
              </div>
            </nav>
          <div class="nh-body">
            <div class="nh-readout" role="img" aria-label="1250 / 2000 ml">
              <div class="nh-readout-content"><span class="nh-main">1250</span><span class="nh-readout-unit">ml</span><span class="nh-target"><span class="nh-slash">/</span><span>2000 ml</span></span></div>
              <div class="nh-forecast"><div class="nh-forecast-number"><span class="nh-forecast-label">预计</span><span class="nh-forecast-main">1500</span><span class="nh-readout-unit">ml</span><span class="nh-target"><span class="nh-slash">/</span><span>2000 ml</span></span></div></div>
            </div>
            <div class="nh-status">
              <div class="nh-status-layer nh-guidance visible"><button type="button" class="nh-next cursor-interaction" aria-label="下次提醒时间，长按调整"><span class="nh-relative">45 分钟后提醒</span><span class="nh-exact">15:00 提醒</span></button><span class="nh-guidance-separator">·</span><span class="nh-serving" role="group"><span class="nh-serving-goal" aria-hidden="true">目标 2000 ml</span><span class="nh-suggestion" aria-hidden="true">每次约 150 ml</span></span></div>
              <div class="nh-status-layer nh-pouring"><span class="nh-pour-prefix">正在注水 +</span><span class="nh-count">0</span><span> ml</span><span class="nh-effective"></span></div>
              <div class="nh-status-layer nh-success"><span class="nh-success-message">${icon('check', 'nh-check')}<span class="nh-success-text">已记录 250 ml</span></span><button type="button" class="nh-undo cursor-interaction">撤销</button></div>
            </div>
            <div class="nh-cups">${defaultQuickAmounts.map(n => `<button type="button" class="nh-cup cursor-interaction" data-amount="${n}" aria-label="记录 ${n} 毫升水"><span>+${n}</span><span class="nh-cup-unit">ml</span></button>`).join('')}</div>
            <div class="nh-preset-hint" id="nh-preset-hint" aria-hidden="true"></div>
            <div class="nh-hold-pill"><span class="nh-pulse"></span><span class="nh-hold-text">松开完成 · 上滑取消</span></div>
            <div class="nh-ruler"><canvas aria-hidden="true"></canvas><div class="nh-ruler-label">250<span class="nh-ruler-unit">ml</span></div><span class="nh-ruler-cue">上滑取消</span></div>
          </div></div></div>
            <section id="nh-memory" class="nh-memory" hidden aria-label="水色记忆">
              <div class="nh-memory-header"><h2 class="nh-memory-title">水色记忆</h2><button type="button" class="nh-memory-close cursor-interaction">收起</button></div>
              <div class="nh-memory-controls">
                <div class="nh-memory-period"><button type="button" class="nh-memory-prev cursor-interaction" aria-label="上一周">‹</button><span class="nh-memory-period-label"></span><button type="button" class="nh-memory-next cursor-interaction" aria-label="下一周">›</button></div>
                <div class="nh-memory-ranges" role="group" aria-label="水色记忆时间范围"><button type="button" class="cursor-interaction" data-range="week">周</button><button type="button" class="cursor-interaction" data-range="month">月</button><button type="button" class="cursor-interaction" data-range="year">年</button></div>
              </div>
              <div class="nh-memory-weekdays" aria-hidden="true" hidden></div>
              <div class="nh-memory-grid" role="group" aria-label="最近七天"></div>
              <div class="nh-memory-detail" role="group"><div class="nh-memory-summary"><span class="nh-memory-selected-date"></span><span class="nh-memory-total"></span></div><div class="nh-memory-drinks"></div></div>
            </section>
          </div>
          <button type="button" class="nh-reopen cursor-interaction" hidden>展开饮水面板</button>
          <div class="nh-toast" role="status">✨ 今日饮水目标达成！继续保持</div>
          <div class="nh-announcement" role="status" aria-live="polite"></div>
        </div>`;
      const q = s => this.shadowRoot.querySelector(s);
      this.el = Object.fromEntries(['stage', 'shell', 'body', 'water', 'drink', 'dot', 'name', 'readout', 'main', 'forecast', 'forecast-main', 'readout-content', 'guidance', 'relative', 'exact', 'next', 'guidance-separator', 'serving', 'serving-goal', 'suggestion', 'pouring', 'pour-prefix', 'count', 'effective', 'success', 'success-text', 'undo', 'check', 'cups', 'hold-pill', 'hold-text', 'ruler', 'ruler-label', 'ruler-cue', 'toast', 'announcement', 'reopen'].map(k => [k, q('.nh-' + k)]));
      for (const k of ['header', 'page-leading', 'page-title', 'back', 'settings', 'collapse', 'preset-hint']) this.el[k] = q('.nh-' + k);
      for (const k of ['stats', 'memory', 'memory-title', 'memory-close', 'memory-grid', 'memory-detail', 'memory-selected-date', 'memory-total', 'memory-drinks', 'memory-prev', 'memory-next', 'memory-period-label', 'memory-ranges', 'memory-weekdays']) this.el[k] = q('.nh-' + k);
      this.insights = new window.NotchHydroInsights(this);
      this.el.stats.addEventListener('click', () => this.toggleMemory());
      this.el.settings.addEventListener('click', () => this.openDailySettings());
      this.el.back.addEventListener('click', () => {
        if (this.page === 'settings') this.leaveDailySettings();
        else if (!this.insights.returnToCollection()) this.insights.showRecord();
      });
      this.el['memory-close'].addEventListener('click', () => { this.toggleMemory(false); this.el.stats.focus(); });
      this.el['memory-grid'].addEventListener('click', e => { const item = e.target.closest('[data-day],[data-month]'); if (item) item.dataset.month ? this.openMemoryMonth(item.dataset.month) : this.selectMemoryDay(item.dataset.day); });
      for (const event of ['pointerover', 'focusin']) this.el['memory-grid'].addEventListener(event, e => { const month = e.target.closest('[data-month]'); if (month && !month.disabled) this.previewMemoryMonth(month.dataset.month); });
      this.el['memory-ranges'].addEventListener('click', e => { const button = e.target.closest('[data-range]'); if (button) this.setMemoryRange(button.dataset.range); });
      this.el['memory-prev'].addEventListener('click', () => this.moveMemoryPeriod(-1));
      this.el['memory-next'].addEventListener('click', () => this.moveMemoryPeriod(1));
      this.fluid = new Fluid(this.el.water);
      this.el.drink.addEventListener('click', () => this.cycleDrink(1));
      this.el.collapse.addEventListener('click', () => this.closePanel());
      this.el.reopen.addEventListener('click', () => this.openPanel());
      this.el.undo.addEventListener('click', () => this.undo());
      const pauses = new Set();
      for (const [type, key, on] of [['pointerenter', 'hover', true], ['pointerleave', 'hover', false], ['focus', 'focus', true], ['blur', 'focus', false]]) this.el.undo.addEventListener(type, () => { on ? pauses.add(key) : pauses.delete(key); this.pausedFeedback = pauses.size > 0; });
      this.el.shell.addEventListener('pointerenter', () => { this.inside = true; this.pointerLeftAt = null; });
      this.el.shell.addEventListener('pointerleave', () => { this.inside = false; this.pointerLeftAt = this.time(); this.fluid.lastPointer = null; if (!this.press) this.setPreview(null); });
      this.el.body.addEventListener('pointermove', e => {
        const p = this.point(e); this.fluid.pointer(p, this.fluid.baseY ?? 100, this.width, this.currentPalette().top, this.reduced);
        if (this.press && e.pointerId === this.press.id) this.movePress(p, e);
      });
      this.el.body.addEventListener('pointerdown', e => this.pointerDown(e));
      this.el.serving.addEventListener('pointerdown', e => { if (this.memorable) e.stopPropagation(); });
      this.el.body.addEventListener('pointerup', e => this.pointerUp(e));
      this.el.body.addEventListener('pointercancel', () => this.cancelPress());
      this.shadowRoot.querySelectorAll('.nh-cup').forEach(button => {
        for (const event of ['pointerenter', 'focus']) button.addEventListener(event, () => {
          const raw = Number(button.dataset.amount);
          if (!this.press && this.blockedPreview !== raw) this.setPreview(raw);
        });
        for (const event of ['pointerleave', 'blur']) button.addEventListener(event, () => { if (!this.press) this.setPreview(null); if (this.blockedPreview === Number(button.dataset.amount)) this.blockedPreview = null; });
        button.addEventListener('click', e => { if (e.detail === 0) this.record(Number(button.dataset.amount)); });
      });
      this.keyListener = e => {
        if (!this.isConnected || e.defaultPrevented) return;
        const target = e.composedPath()[0];
        if (e.key !== 'Escape' && (target.isContentEditable || target.matches?.('input,select,textarea'))) return;
        const option = e.altKey && !e.metaKey && !e.ctrlKey;
        if (option && !e.shiftKey && e.code === 'KeyW') {
          e.preventDefault();
          if (!e.repeat && !this.opening) this.open ? this.closePanel() : this.openPanel();
          return;
        }
        if (this.page === 'settings') {
          if (e.key === 'Escape' && this.open && !this.opening && !e.repeat) {
            if (!this.dailySettings?.handleEscape()) this.leaveDailySettings();
            e.preventDefault();
          }
          return;
        }
        const viewer = this.insights.jarViewer?.isOpen ? this.insights.jarViewer : this.memoryAmberViewer;
        if (viewer?.isOpen) {
          if (e.key === 'Escape') {
            if (!e.repeat) {
              if (viewer === this.insights.jarViewer) viewer.goBack();
              else viewer.close();
            }
            e.preventDefault();
          }
          return;
        }
        if (e.key === 'Escape') {
          if (this.press) this.cancelPress();
          else if (this.insights.active) {
            if (!this.insights.q('.ni-editor').hidden) this.insights.closeEditor(true);
            else if (!this.insights.returnToCollection()) this.closePanel();
          } else if (this.memoryVisible) {
            this.toggleMemory(false);
            this.el.stats.focus();
          } else this.closePanel();
          e.preventDefault();
        }
        if (!this.open || this.opening || this.insights.active || !option || e.repeat) return;
        if (e.shiftKey && e.code !== 'Tab') return;
        // Physical codes keep Option + 1/2/3 working on Mac layouts that produce symbols.
        switch (e.code) {
          case 'Digit1': case 'Digit2': case 'Digit3':
            this.record(this.dailyOptions.quickAmounts[Number(e.code.at(-1)) - 1]); break;
          case 'ArrowLeft': this.cycleDrink(-1); break;
          case 'ArrowRight': this.cycleDrink(1); break;
          case 'Tab': this.cycleDrink(e.shiftKey ? -1 : 1); break;
          case 'Comma': this.openDailySettings(); break;
          case 'KeyS': this.insights.showStats(); break;
          default: return;
        }
        e.preventDefault();
      };
      this.media = window.matchMedia('(prefers-reduced-motion: reduce)');
      this.stopHiddenFormationSound = () => {
        if (document.hidden || this.reduced) this.audio.stopFormation();
        if (this.reduced && this.memorable) this.goalAt = null;
      };
      this.resize = new ResizeObserver(() => this.layout());
    }
    get refined() { return this.getAttribute('variant') !== 'current'; }
    get affirmative() { return ['affirming', 'memory'].includes(this.getAttribute('variant')); }
    get memorable() { return this.getAttribute('variant') === 'memory'; }
    get recordingPage() { return this.page !== 'stats' && this.page !== 'settings'; }
    get reduced() { return this.hasAttribute('reduced') || this.media.matches; }
    get english() { return this.getAttribute('language') === 'en'; }
    get collectionProfile() {
      return this.currentProfile ||= Collection.users.find(user => user.id === Collection.activeId());
    }
    get drinkCatalog() { return this.catalog.items; }
    get currentDrink() { return this.catalog.current; }
    get enabledDrinks() { return this.catalog.enabled; }
    drinkLabel(drink, english = this.english, profileId = this.collectionProfile.id) {
      const catalog = this.catalogsByProfile.get(profileId);
      return catalog?.customNames.get(drink.id) ?? (english ? drink.en : drink.name);
    }
    drinkNameAvailable(name, excludingId) { return this.catalog.isNameAvailable(name, excludingId); }
    toggleDrink(id) {
      const previous = this.currentDrink;
      if (!this.catalog.toggle(id)) return false;
      this.drinkCatalogChanged(previous);
      return true;
    }
    selectDrink(id, asDefault = true) {
      if (this.hold || this.motion?.pouring) return false;
      const previous = this.currentDrink;
      if (!this.catalog.select(id, asDefault)) return false;
      this.drinkCatalogChanged(previous);
      return true;
    }
    moveDrink(id, targetId) {
      if (!this.catalog.move(id, targetId)) return false;
      this.dispatch('drink-settings');
      return true;
    }
    saveDrink(id, draft) {
      const previous = this.currentDrink;
      const saved = this.catalog.save(id, draft);
      if (saved) this.drinkCatalogChanged(previous);
      return saved;
    }
    deleteDrink(id) {
      const previous = this.currentDrink;
      if (!this.catalog.remove(id)) return false;
      this.drinkCatalogChanged(previous);
      return true;
    }
    drinkCatalogChanged(previous) {
      if (previous !== this.currentDrink) {
        this.feedback = null; this.round = null; this.affirmation = null;
        this.setPreview(null); this.updateDrink(); this.updateGuidance(); this.renderStatus();
      }
      this.dispatch(previous.id === this.currentDrink.id ? 'drink-settings' : 'drink');
    }
    setCollectionProfile(profile) {
      const next = Collection.users.find(user => user.id === (profile?.id ?? profile));
      if (!next || this.collectionProfile.id === next.id) return;
      const scene = this.scene;
      if (this.press) this.cancelPress();
      if (this.motion?.pouring) this.updateMemory(); // The record was committed before the visual pour.
      this.profileSessions ||= new Map();
      this.profileSessions.set(profileSessionKey(this.collectionProfile.id, scene), { scene, records: this.records, selectedId: this.currentDrink.id,
        days: this.memoryDays, overrides: this.insights?.overrides });
      this.insights?.closeEditor();
      Collection.select(next.id);
      this.currentProfile = next;
      const session = this.profileSessions.get(profileSessionKey(next.id, scene));
      if (session && session.scene !== scene) {
        this.switchingProfile = true;
        this.setAttribute('scene', session.scene);
        this.switchingProfile = false;
      }
      this.reset(session?.scene || scene, session);
    }
    collectionWeek(id, endDay) {
      if (!Memory.validDate(endDay) || !Collection.users.some(user => user.id === id)) return [];
      const scene = this.scene;
      const days = (id === this.collectionProfile.id ? this.memoryDays : this.profileSessions?.get(profileSessionKey(id, scene))?.days)
        || Memory.archive(initialRecords(scene, this.memorable), this.goal, id, scene);
      return Memory.entries(days, 'week', endDay).map(day => ({ ...day,
        shape: day.progress >= 1 ? day.shape || Collection.earn(id, day.date) : null }));
    }
    collectionRecord(day) {
      const entry = this.memoryDays.find(item => item.date === day);
      return entry?.progress >= 1 ? entry.shape || Collection.earn(this.collectionProfile.id, day) : null;
    }
    openMemoryAmber(date, trigger) {
      if (!this.memorable || !this.insights.active || !['day', 'week'].includes(this.insights.range)) return;
      const day = this.memoryDays.find(item => item.date === date);
      const shape = this.collectionRecord(date);
      if (!day?.color?.amber || !shape) return;
      this.memoryAmberViewer ||= new window.NotchHydroMemoryAmberViewer(this);
      this.memoryAmberViewer.open(day, shape, trigger);
    }
    openDailySettings(section) {
      if (this.page === 'settings') {
        if (section) this.dailySettings.selectSection(section);
        return;
      }
      if (this.motion?.pouring || this.hold) return;
      if (!this.open) this.openPanel();
      if (this.press) this.cancelPress();
      this.settingsOrigin = this.insights.active ? 'stats' : 'record';
      this.insights.closeTools();
      this.insights.jarViewer?.close(false);
      this.memoryAmberViewer?.close(false);
      this.insights.transition();
      this.setPreview(null);
      this.goalAt = null;
      this.toastUntil = 0;
      this.audio.stopFormation();
      this.panelAmber?.hide();
      this.dailySettings ||= new window.NotchHydroDailySettings(this);
      this.dailySettings.root.style.opacity = '';
      this.dailySettings.root.style.filter = '';
      this.dailySettings.root.inert = false;
      this.page = this.dataset.page = 'settings';
      this.memoryVisible = false;
      this.el.body.setAttribute('inert', '');
      this.el.body.setAttribute('aria-hidden', 'true');
      this.insights.root.inert = true;
      this.insights.root.hidden = true;
      this.layout();
      this.dailySettings.show(section);
      this.dispatch('settings');
    }
    leaveDailySettings() {
      if (this.page !== 'settings') return;
      if (this.settingsOrigin === 'stats') this.insights.showStats();
      else this.insights.showRecord();
    }
    setGeneralOption(key, value) {
      if (key === 'language') {
        if (value === 'zh' || value === 'en') this.setAttribute('language', value);
        return;
      }
      const options = this.generalOptions;
      if (!Object.hasOwn(options, key) || options[key] === value) return;
      if (key === 'menuBarStyle' ? !['full', 'compact', 'iconOnly'].includes(value) : typeof value !== 'boolean') return;
      const weekDay = key === 'weekStartsOnMonday' && this.insights?.range === 'week' ? this.insights.detailDay : null;
      options[key] = value;
      if (key === 'belowNotchOffset') this.layout();
      if (key === 'weekStartsOnMonday') {
        if (weekDay) this.insights.anchor = this.insights.selected = weekDay;
        this.insights?.syncMemory();
        this.renderMemory();
      }
      this.dispatch('general-settings');
    }
    get minimumDailyGoal() { return this.scene === 'website' ? 1000 : 1200; }
    setDailyGoal(value) {
      if (!Number.isFinite(value)) return;
      const goal = clamp(Math.round(value / 100) * 100, this.minimumDailyGoal, 3500);
      if (goal === this.goal) return;
      this.goal = goal;
      this.affirmationsReached.half = this.total >= goal / 2;
      this.updateMemory();
      this.updateDrink();
      this.updateGuidance();
      this.dispatch('daily-goal');
    }
    planReminder() {
      this.reminderPlan = reminderPlan(this.reminderOptions, this.reminderClock);
      const next = this.reminderPlan.next;
      this.sampleMinutes = next === null ? null : Math.floor(next);
      this.remaining = next === null ? 0 : Math.round((next - this.reminderClock) * 60_000) / 1000;
    }
    updateReminderSettings(key) {
      if (key === 'periods' || key === 'weekdays' || key === 'interval' || key === 'afterGoal') {
        this.planReminder();
        // Undoing an earlier drink must not restore a superseded schedule.
        if (this.round) this.round.reminderBeforePour = null;
      }
      if (key === 'sound' && !this.reminderOptions.sound) this.reminderPlayer?.pause();
      this.updateGuidance();
      this.dispatch('reminder-settings');
    }
    nextReminderLabel() {
      const at = this.sampleMinutes;
      if (at === null) return this.text('暂无提醒', 'No reminder scheduled');
      const time = clockLabel(at);
      const offset = Math.floor(at / dayMinutes) - Math.floor(this.reminderClock / dayMinutes);
      if (offset === 0) return time;
      if (offset === 1) return this.text('明天 ', 'Tomorrow ') + time;
      const weekday = (demoWeekday + Math.floor(at / dayMinutes)) % 7;
      return this.text('周' + '日一二三四五六'[weekday],
        ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][weekday]) + ' ' + time;
    }
    reminderStatus() {
      if (this.reminderToastUntil > this.time()) return this.text('该喝水了', 'Time for water');
      if (this.total >= this.goal && !this.reminderOptions.afterGoal) return this.text('今日已达标，提醒已暂停', 'Daily goal reached · reminders paused');
      if (this.sampleMinutes === null) return this.nextReminderLabel();
      if (this.remaining > this.reminderOptions.interval * 60 + 1) {
        return this.text('下次提醒 ', 'Next reminder ') + this.nextReminderLabel();
      }
      const seconds = Math.ceil(this.remaining);
      const min = Math.floor(seconds / 60), sec = String(seconds % 60).padStart(2, '0');
      return this.text(`${min} 分 ${sec} 秒后提醒`, `Reminder in ${min}m ${sec}s`);
    }
    testReminder() {
      this.reminderToastUntil = this.time() + 3;
      this.el.toast.textContent = this.text('该喝水了', 'Time for water');
      this.dailySettings?.reminders?.refreshStatus();
      if (this.reminderOptions.sound && window.Audio) {
        this.reminderPlayer ||= new window.Audio('assets/reminder-water-drop.wav');
        this.reminderPlayer.currentTime = 0;
        this.reminderPlayer.play().catch(() => {});
      }
      this.dispatch('reminder-preview');
    }
    setQuickAmount(index, value) {
      if (!Number.isInteger(index) || index < 0 || index >= this.dailyOptions.quickAmounts.length || !Number.isFinite(value)) return;
      this.dailyOptions.quickAmounts[index] = clamp(Math.round(value), 20, 1500);
      this.updateDrink();
    }
    resetQuickAmounts() {
      this.dailyOptions.quickAmounts = [...defaultQuickAmounts];
      this.updateDrink();
    }
    setHoldRate(kind, value) {
      if (!Number.isFinite(value)) return;
      const rate = clamp(Math.round(value), 1, 100);
      const options = this.dailyOptions;
      if (kind === 'light') {
        options.lightRate = rate;
        options.firmRate = Math.max(options.firmRate, rate);
      } else if (kind === 'firm') {
        options.firmRate = rate;
        options.lightRate = Math.min(options.lightRate, rate);
      }
    }
    text(zh, en) { return this.english ? en : zh; }
    time() { return performance.now() / 1000; }
    connectedCallback() {
      this.panelAmber = new window.NotchHydroPanelAmber(this.el.body, this.el.stats);
      // Start audio only when the user interacts with the website preview.
      if (this.getAttribute('scene') === 'website') this.audio.enabled = true;
      this.resize.observe(this); window.addEventListener('keydown', this.keyListener);
      document.addEventListener('visibilitychange', this.stopHiddenFormationSound);
      this.media.addEventListener('change', this.stopHiddenFormationSound);
      this.reset(this.getAttribute('scene') || 'cup'); this.layout();
      if (this.hasAttribute('memory-open')) this.insights.showStats();
      this.lastFrame = this.time();
      const loop = () => { if (!this.isConnected) return; const now = this.time(); const dt = clamp(now - this.lastFrame, 0, .05); this.lastFrame = now;
        if (this.open && !document.hidden) this.tick(now, dt); this.raf = requestAnimationFrame(loop); };
      this.raf = requestAnimationFrame(loop);
    }
    disconnectedCallback() {
      this.reminderPlayer?.pause();
      this.dailySettings?.hide();
      this.insights?.clearCollectionNavigation();
      cancelAnimationFrame(this.raf); this.resize.disconnect(); window.removeEventListener('keydown', this.keyListener); this.audio.stop();
      document.removeEventListener('visibilitychange', this.stopHiddenFormationSound);
      this.media.removeEventListener('change', this.stopHiddenFormationSound);
      this.memoryAmberViewer?.dispose(); this.memoryAmberViewer = null;
      this.insights.jarViewer?.dispose(); this.insights.jarViewer = null;
      this.insights.amberThumbnails?.dispose(); this.insights.amberThumbnails = null;
      this.insights.previewKey = null;
      this.panelAmber?.dispose(); this.panelAmber = null;
    }
    attributeChangedCallback(name, old, value) {
      if (old === value || !this.isConnected || this.switchingProfile) return;
      if (name === 'auto-collapse' || name === 'language') this.dispatchEvent(new Event('hydro-preferences-change'));
      if (name === 'reduced') this.stopHiddenFormationSound();
      if (name === 'scene') this.reset(value); else if (name === 'geometry' || name === 'zoom') this.layout();
      else if (name === 'variant') { this.audio.stop(); this.reset(this.getAttribute('scene') || 'cup'); this.layout(); }
      else if (name === 'memory-open') this.toggleMemory(value !== null);
      else { this.updateDrink(); this.updateGuidance(); this.renderMemory(); }
    }
    reset(scene = 'cup', session) {
      if (this.page === 'settings') this.leaveDailySettings();
      this.scene = scene || 'cup';
      if (this.memorable && !this.learnedPresetAdjustment && !this.previewFirstRun) {
        try { this.learnedPresetAdjustment = window.localStorage?.getItem(learnedPresetKey) === '1'; }
        catch { /* Restricted embeds keep the gesture state for this session. */ }
      }
      this.reservesPresetHint = this.memorable && this.scene === 'empty' && !this.learnedPresetAdjustment;
      this.catalogsByProfile ||= new Map();
      const profileId = this.collectionProfile.id;
      if (!this.catalogsByProfile.has(profileId)) this.catalogsByProfile.set(profileId, new window.NotchHydroDrinkCatalog());
      this.catalog = this.catalogsByProfile.get(profileId);
      const selectedId = this.catalog.enabledIds.has(session?.selectedId) ? session.selectedId : this.catalog.defaultId;
      this.catalog.select(selectedId, false);
      this.dailyOptions ||= { quickAmounts: [...defaultQuickAmounts], holdEnabled: true, lightRate: 15, firmRate: 25 };
      this.generalOptions ||= {
        menuBarStyle: 'full', monochromeMenuBar: true, showDockIcon: false, launchAtLogin: false,
        belowNotchOffset: false, autoResetCountdownOnLogging: true, weekStartsOnMonday: true
      };
      this.reminderOptions ||= {
        periods: [{ start: '09:00', end: '12:00' }, { start: '14:00', end: '21:00' }],
        weekdays: [1, 2, 3, 4, 5], interval: 45, afterGoal: false, sound: true,
        meetings: false, focus: false, screenAsleep: true
      };
      this.insights?.clearCollectionNavigation();
      this.insights?.jarViewer?.close(false);
      this.memoryAmberViewer?.close(false);
      this.panelAmber?.hide();
      this.audio.stop();
      this.records = session?.records || initialRecords(scene, this.memorable);
      this.goal ??= scene === 'website' ? this.minimumDailyGoal : 2000;
      this.feedback = null; this.round = null;
      this.motion = null; this.hold = null; this.press = null; this.ruler = null; this.rulerExit = null; this.goalAt = null; this.reverse = null;
      this.preview = null; this.previewPalette = null; this.previewAlpha = 0; this.previewTotal = 0; this.previewCommitAt = null; this.animations = {};
      this.blockedPreview = null; this.pausedFeedback = false; this.inside = false; this.pointerLeftAt = null;
      this.flowEnded = -100; this.incoming = null; this.toastUntil = 0; this.reminderToastUntil = 0;
      this.reminderClock = 14 * 60 + 15; this.planReminder();
      this.affirmationsReached = { first: this.records.length > 0, half: this.total >= this.goal / 2 }; this.affirmation = null;
      this.memoryDays = session?.days || Memory.archive(this.records, this.goal, this.collectionProfile.id, scene); this.memorySelection ||= Memory.today; this.memoryRange ||= 'week'; this.memoryCursor ||= Memory.today; this.memoryMonthSelection ||= Memory.today.slice(0, 7);
      if (session?.days && this.memoryDays.at(-1).goal !== this.goal) {
        this.memoryDays = [...this.memoryDays.slice(0, -1), Memory.snapshot(Memory.today, this.records, this.goal, this.collectionProfile.id)];
      }
      this.memoryVisible = this.memorable && (this.insights ? this.insights.active : this.hasAttribute('memory-open'));
      if (this.insights) { this.insights.overrides = session?.overrides || new Map(); if (this.insights.active) this.insights.syncMemory(); }
      this.fluid.reset(); this.visual = this.total; this.beforeHold = this.visual; this.roundLiveRaw = 0; this.roundLiveEffective = 0;
      this.open = true; this.reveal = 1; this.opening = null; this.el.reopen.hidden = true; this.el.shell.style.opacity = '1'; this.el.announcement.textContent = '';
      this.el.body.style.opacity = ''; this.el.body.style.filter = '';
      this.el.water.style.opacity = ''; this.el.water.style.filter = '';
      this.el.header.style.opacity = ''; this.el.header.style.filter = ''; this.el.header.inert = false;
      if (this.insights) { this.insights.root.style.opacity = ''; this.insights.root.style.filter = ''; }
      if (this.width) this.updateContour(1);
      this.updateDrink(); this.updateGuidance(); this.renderStatus(); this.renderMemory(); this.dispatch('reset');
      if (this.memorable) {
        const today = this.memoryDays.at(-1);
        this.panelAmber?.prepare(today.color?.amber || this.currentDrink.amber, today.date,
          today.shape || Collection.shapeFor(this.collectionProfile.id, today.date));
      }
    }
    get total() { return this.records.reduce((sum, r) => sum + (r.effective ?? Math.round(r.raw * r.drink.factor)), 0); }
    updateMemory() {
      const today = Memory.snapshot(Memory.today, this.records, this.goal, this.collectionProfile.id);
      this.memoryDays = this.memoryDays.map(day => day.date === Memory.today ? today : day);
      this.renderMemory();
    }
    toggleMemory(visible = !this.memoryVisible) {
      if (this.insights) { visible ? this.insights.showStats() : this.insights.showRecord(); return; }
      if (!this.memorable) return;
      const next = !!visible && this.open;
      if (next === this.memoryVisible) return;
      this.memoryVisible = next;
      this.renderMemory(); this.dispatch('memory');
    }
    selectMemoryDay(date) {
      if (this.insights?.active) { this.insights.selectDay(date); return; }
      if (!this.memorable || date === this.memorySelection || !this.memoryDays.some(day => day.date === date)) return;
      this.memorySelection = date;
      if (this.memoryRange === 'month' && date.slice(0, 7) !== this.memoryCursor.slice(0, 7) || this.memoryRange === 'week' && (date > this.memoryCursor || date < Memory.addDays(this.memoryCursor, -6))) this.memoryCursor = date;
      this.renderMemory(); this.dispatch('memory-day');
    }
    setMemoryRange(range, cursor = null) {
      if (this.insights?.active) { this.insights.selectRange(range, cursor); return; }
      if (!this.memorable || !['week', 'month', 'year'].includes(range)) return;
      cursor ||= range === 'week' ? this.memorySelection : this.memoryCursor;
      if (!Memory.validDate(cursor) || cursor < Memory.earliest || cursor.slice(0, 7) > Memory.today.slice(0, 7)) return;
      if (range === 'week') { const minimum = Memory.addDays(Memory.earliest, 6); cursor = cursor < minimum ? minimum : cursor > Memory.today ? Memory.today : cursor; }
      if (range === this.memoryRange && cursor === this.memoryCursor) return;
      this.memoryRange = range; this.memoryCursor = cursor;
      if (range === 'month') this.memoryMonthSelection = cursor.slice(0, 7);
      if (range === 'month' && !this.memorySelection.startsWith(cursor.slice(0, 7))) this.memorySelection = Memory.monthDates(cursor).filter(date => date <= Memory.today).at(-1);
      if (range === 'week' && (this.memorySelection > cursor || this.memorySelection < Memory.addDays(cursor, -6))) this.memorySelection = cursor;
      if (range === 'year') {
        if (!this.memoryMonthSelection.startsWith(cursor.slice(0, 4))) this.memoryMonthSelection = cursor.slice(0, 4) + '-12';
        if (this.memoryMonthSelection > Memory.today.slice(0, 7)) this.memoryMonthSelection = Memory.today.slice(0, 7);
        this.memoryCursor = this.memoryMonthSelection + '-01';
      }
      this.renderMemory(); this.dispatch('memory-range');
    }
    moveMemoryPeriod(offset) {
      const cursor = Memory.navigate(this.memoryRange, this.memoryCursor, offset);
      if (cursor !== this.memoryCursor) this.setMemoryRange(this.memoryRange, cursor);
    }
    previewMemoryMonth(month) {
      if (!this.memorable || this.memoryRange !== 'year' || month === this.memoryMonthSelection || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || month > Memory.today.slice(0, 7) || month < Memory.earliest.slice(0, 7)) return;
      this.memoryMonthSelection = month; this.memoryCursor = month + '-01'; this.renderMemory(); this.dispatch('memory-month-preview');
    }
    openMemoryMonth(month) {
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return;
      this.setMemoryRange('month', month + '-01');
    }
    updateMemoryLayout() {
      let bottom = (this.panelTop ?? 0) + (this.recordingPage ? this.recordHeight : this.surfaceHeight);
      if (!this.insights && this.memoryVisible) bottom += 16 + (this.el.memory.offsetHeight || 180);
      this.style.setProperty('--nh-stage-height', `${bottom + (this.recordingPage ? 82 : 62)}px`);
      this.style.setProperty('--nh-toast-top', `${bottom + 37}px`);
    }
    renderMemory() {
      this.memoryVisible = this.memorable && !!this.memoryVisible;
      this.el.memory.hidden = !!this.insights || !this.memoryVisible;
      this.el.stats.setAttribute('aria-disabled', String(!this.insights && !this.memorable));
      this.el.stats.setAttribute('aria-expanded', String(this.insights ? this.insights.active : this.memoryVisible));
      if (this.insights) this.el.stats.setAttribute('aria-controls','nh-insights');
      this.el.stats.setAttribute('aria-label', this.insights ? this.text('统计洞察', 'Statistics') : this.memorable ? this.text('水色记忆', 'Daily colors') : this.text('查看饮水统计图表（本轮原型仅展示记录面板）', 'Hydration statistics (outside this prototype)'));
      this.el.memory.setAttribute('aria-label', this.text('水色记忆', 'Daily colors'));
      this.el['memory-title'].textContent = this.text('水色记忆', 'Daily colors'); this.el['memory-close'].textContent = this.text('收起', 'Close');
      const range = this.memoryRange || 'week', cursor = this.memoryCursor || Memory.today;
      const monday = this.generalOptions.weekStartsOnMonday;
      const items = this.insights?.active ? this.insights.memoryItems() : Memory.entries(this.memoryDays, range, cursor, monday), period = this.insights?.active ? this.insights.periodLabel() : Memory.periodLabel(range, cursor, this.english);
      this.el.memory.dataset.range = range;
      this.el['memory-period-label'].textContent = period;
      this.el['memory-period-label'].setAttribute('aria-label', period);
      const rangeName = this.english ? { week: 'week', month: 'month', year: 'year' }[range] : { week: '周', month: '月', year: '年' }[range];
      this.el['memory-prev'].setAttribute('aria-label', this.text(`上一${rangeName}`, `Previous ${rangeName}`));
      this.el['memory-next'].setAttribute('aria-label', this.text(`下一${rangeName}`, `Next ${rangeName}`));
      this.el['memory-prev'].disabled = Memory.navigate(range, cursor, -1) === cursor;
      this.el['memory-next'].disabled = Memory.navigate(range, cursor, 1) === cursor;
      this.el['memory-ranges'].setAttribute('aria-label', this.text('水色记忆时间范围', 'Memory time range'));
      for (const button of this.el['memory-ranges'].querySelectorAll?.('button') || []) { button.setAttribute('aria-pressed', String(button.dataset.range === range)); button.textContent = this.english ? { week: 'Week', month: 'Month', year: 'Year' }[button.dataset.range] : { week: '周', month: '月', year: '年' }[button.dataset.range]; }
      this.el['memory-weekdays'].hidden = range !== 'month';
      this.el['memory-weekdays'].innerHTML = Memory.weekdayHeadings(this.english, monday).map(day => `<span>${day}</span>`).join('');
      this.el['memory-grid'].setAttribute('aria-label', period + this.text('水色记忆', ' daily colors'));
      const overviewVisible = this.insights?.active && (range === 'week' || (this.memorable && ['day', 'month', 'year'].includes(range)));
      const gridItems = overviewVisible ? [] : items;
      const key = range + ':' + gridItems.map(item => item?.date || '_').join(',');
      if (key !== this.memoryGridKey) {
        this.memoryGridKey = key;
        this.el['memory-grid'].innerHTML = gridItems.map(item => item ? `<button type="button" class="nh-memory-day cursor-interaction" data-${item.kind === 'month' ? 'month' : 'day'}="${item.date}" aria-pressed="false">${item.kind === 'month' ? '<span class="nh-memory-date"></span><span class="nh-memory-mini-grid" aria-hidden="true"></span>' : '<span class="nh-memory-swatch" aria-hidden="true"><span class="nh-memory-fill"></span></span><span class="nh-memory-date"></span>'}</button>` : '<span class="nh-memory-blank" aria-hidden="true"></span>').join('');
        this.memoryButtons = [...(this.el['memory-grid'].querySelectorAll?.('button') || [])];
      }
      for (const button of this.memoryButtons || []) {
        const day = items.find(item => item?.date === (button.dataset.day || button.dataset.month));
        const isMonth = day.kind === 'month', label = isMonth ? Memory.monthLabel(day.date, this.english) : Memory.dateLabel(day.date, this.english), empty = !day.records.length;
        button.setAttribute('aria-pressed', String(day.date === (isMonth ? this.memoryMonthSelection : this.memorySelection)));
        button.classList.toggle('reached', !isMonth && day.progress >= 1); button.classList.toggle('future', day.future); button.disabled = day.future;
        const value = isMonth ? this.text(`有效 ${day.total} 毫升，日均完成 ${Math.round(day.progress * 100)}%，查看月历`, `${day.total} ml effective, ${Math.round(day.progress * 100)}% daily average. Open month`) : this.text(`有效 ${day.total} 毫升，完成 ${Math.round(day.progress * 100)}%`, `${day.total} ml effective, ${Math.round(day.progress * 100)}% of goal`);
        button.setAttribute('aria-label', `${label}，${day.future ? this.text('尚未到来', 'Upcoming') : empty ? this.text('暂无记录', 'No records') : value}`);
        button.querySelector('.nh-memory-date').textContent = isMonth ? (this.english ? Memory.monthLabel(day.date, true).split(' ')[0] : `${Number(day.date.slice(-2))}月`) : day.date === Memory.today ? this.text('今天', 'Today') : String(Number(day.date.slice(-2)));
        if (isMonth) {
          const dates = Memory.entries(this.memoryDays, 'month', day.date + '-01', monday);
          while (dates.length < 42) dates.push(null);
          const signature = dates.map(date => date ? `${date.date}:${date.total}:${date.goal}:${Memory.swatch(date)}` : '').join('|');
          if (button.memoryCalendarKey !== signature) {
            button.memoryCalendarKey = signature;
            button.querySelector('.nh-memory-mini-grid').innerHTML = dates.map(date => date ? `<span class="nh-memory-mini-day${date.future ? ' future' : ''}${date.progress >= 1 ? ' reached' : ''}" data-mini-day="${date.date}"><span class="nh-memory-swatch${date.records.length ? '' : ' empty'}"><span class="nh-memory-fill" style="height:${date.progress * 100}%;background-image:${Memory.swatch(date)}"></span></span></span>` : '<span aria-hidden="true"></span>').join('');
          }
        } else {
          const swatch = button.querySelector('.nh-memory-swatch'); swatch.classList.toggle('empty', empty);
          const fill = button.querySelector('.nh-memory-fill'); fill.style.backgroundImage = Memory.swatch(day); fill.style.height = `${day.progress * 100}%`;
        }
        button.dataset.progress = String(day.progress);
      }
      const selected = range === 'year' ? items.find(item => item.date === this.memoryMonthSelection) : this.memoryDays?.find(d => d.date === this.memorySelection);
      if (selected) {
        const isMonth = selected.kind === 'month';
        this.el['memory-selected-date'].textContent = isMonth ? Memory.monthLabel(selected.date, this.english) : Memory.dateLabel(selected.date, this.english);
        this.el['memory-total'].textContent = isMonth ? this.text(`有效 ${selected.total} ml`, `${selected.total} ml effective`) : selected.records.length ? this.text(`有效 ${selected.total} / ${selected.goal} ml`, `${selected.total} / ${selected.goal} ml effective`) : this.text('暂无记录', 'No records');
        const summary = this.el['memory-drinks'];
        if (isMonth) {
          summary.textContent = this.text(`达标 ${selected.goalDays} / ${selected.elapsedDays} 天 · 日均完成 ${Math.round(selected.progress * 100)}%`, `${selected.goalDays} / ${selected.elapsedDays} goal days · ${Math.round(selected.progress * 100)}% daily average`);
        } else {
          summary.innerHTML = '<span class="nh-memory-drink"></span>'.repeat(selected.drinks.length);
          summary.querySelectorAll?.('.nh-memory-drink').forEach((chip, index) => {
            const { drink, raw } = selected.drinks[index];
            chip.style.setProperty('--nh-drink-dot', drink.dot);
            chip.textContent = this.drinkLabel(drink) + ' ' + raw + ' ml';
          });
        }
        this.el['memory-detail'].setAttribute('aria-label', `${this.el['memory-selected-date'].textContent}，${this.el['memory-total'].textContent}`);
        this.dataset.memoryDay = this.memorySelection; this.dataset.memoryTotal = String(selected.total); this.dataset.memoryProgress = String(selected.progress);
        this.dataset.memoryColor = selected.color ? selected.color.reference.map(Math.round).join(',') : '';
      }
      this.dataset.memoryRange = range; this.dataset.memoryCursor = cursor; this.dataset.memoryMonth = this.memoryMonthSelection;
      this.dataset.memoryCells = String(items.filter(Boolean).length);
      this.dataset.memoryVisible = String(this.memoryVisible); this.updateMemoryLayout();
      this.insights?.render();
    }
    liquidRecords(now) {
      if (this.hold) return [...this.records, { drink: this.currentDrink, raw: this.hold.raw }];
      const m = this.motion;
      if (!m || !m.duration) return this.records;
      const progress = clamp((now - m.at) / m.duration);
      const p = m.pouring ? progress : smooth(0, 1, progress);
      return m.volumes.map(({ drink, from, to }) => ({ drink, raw: from + (to - from) * p }));
    }
    currentPalette(now = this.time()) {
      const fallback = this.currentDrink;
      if (!this.motion && !this.hold) return this.memoryDays.at(-1).color || fallback;
      return palette(this.liquidRecords(now), fallback);
    }
    layout() {
      const hasCamera = this.getAttribute('geometry') !== 'external';
      const lower = this.generalOptions?.belowNotchOffset === true;
      const notch = hasCamera && !lower;
      // The external-display sample reserves a 24 pt menu bar and a 12 pt gap.
      this.panelTop = lower ? (hasCamera ? 40 : 36) : 0;
      this.style.setProperty('--nh-panel-top', this.panelTop + 'px');
      this.cameraHousingWidth = notch ? 185 : 0;
      this.safeAreaTop = notch ? 32 : 0;
      this.camera = notch ? this.cameraHousingWidth + 12 : 144; this.width = Math.max(316, 148 + this.camera + 24);
      const amberHeadroom = notch && this.memorable ? 40 : 0;
      this.recordHeight = T.height + amberHeadroom;
      this.fullY = 54 + amberHeadroom;
      this.ceilingY = this.memorable ? (notch ? 52 : 46) : this.fullY;
      this.insightsWidth = Math.max(420, 224 + this.camera + 24);
      this.surfaceWidth = this.recordingPage ? this.width : this.insightsWidth;
      this.surfaceHeight = this.page === 'settings' ? 520 : this.page === 'stats' ? 441 : this.recordHeight;
      const available = Math.max(240, this.getBoundingClientRect().width), requested = Number(this.getAttribute('zoom') || 1.5);
      // Fit the widest page so all three share the same visual scale during navigation.
      this.zoom = Math.min(requested, (available - 4) / (this.insightsWidth + 20));
      this.style.setProperty('--nh-body-width', this.width + 'px'); this.style.setProperty('--nh-full-width', (this.surfaceWidth + 20) + 'px');
      this.style.setProperty('--nh-height', this.recordHeight + 'px');
      const amberTiming = T.proposed.goalTiming;
      this.style.setProperty('--nh-amber-rise-duration', (amberTiming.crystallize - amberTiming.emergence) + 's');
      this.style.setProperty('--ni-width', this.insightsWidth + 'px'); this.style.setProperty('--nh-panel-height', this.surfaceHeight + 'px');
      this.style.setProperty('--nh-shoulder', Math.max(74, (this.width - this.camera - 24) / 2) + 'px'); this.style.setProperty('--nh-zoom', this.zoom);
      this.updateContour(1); this.dataset.panelSize = `${this.surfaceWidth} × ${this.surfaceHeight} pt`; this.updateMemoryLayout(); this.updateToolbar(); this.insights?.render();
    }
    updateContour(progress) {
      const notch = this.safeAreaTop > 0, width = this.surfaceWidth || this.width, height = this.surfaceHeight || this.recordHeight, full = width + 20;
      const w = notch ? this.cameraHousingWidth + (width - this.cameraHousingWidth) * progress : width, h = this.safeAreaTop + (height - this.safeAreaTop) * progress;
      const left = (full - w) / 2, right = left + w, r = Math.min(h / 2, 14 + 12 * progress), top = Math.min(10 * progress, h / 2), k = .5522847498;
      if (this.generalOptions?.belowNotchOffset) {
        this.style.setProperty('--nh-contour', `inset(0 10px ${height - h}px round ${r}px)`);
        return;
      }
      const path = `M ${right + top},-1 L ${right + top},0 C ${right + top * (1-k)},0 ${right},${top * (1-k)} ${right},${top} L ${right},${h-r} C ${right},${h-r*(1-k)} ${right-r*(1-k)},${h} ${right-r},${h} L ${left+r},${h} C ${left+r*(1-k)},${h} ${left},${h-r*(1-k)} ${left},${h-r} L ${left},${top} C ${left},${top*(1-k)} ${left-top*(1-k)},0 ${left-top},0 L ${left-top},-1 Z`;
      this.style.setProperty('--nh-contour', `path('${path}')`);
    }
    updateToolbar() {
      const recording = this.recordingPage;
      const settings = this.page === 'settings';
      this.el.drink.inert = this.el.settings.inert = !recording;
      this.el['page-leading'].inert = recording;
      this.el.stats.inert = !recording && !settings;
      if (this.insights?.actions) this.insights.actions.anchor.inert = this.page !== 'stats';
      if (!recording) this.el['page-title'].textContent = settings ? this.text('设置', 'Settings') : this.text('洞察', 'Insights');
      this.el.header.setAttribute('aria-label', this.text('面板工具栏', 'Panel toolbar'));
      this.el.back.setAttribute('aria-label', settings && this.settingsOrigin === 'stats' ? this.text('返回洞察', 'Back to Insights') : this.text('返回饮水记录', 'Back to recording'));
      this.el.stats.setAttribute('aria-label', this.text('查看饮水统计图表', 'View statistics'));
      this.el.settings.setAttribute('aria-label', this.text('设置', 'Settings'));
      this.el.collapse.setAttribute('aria-label', this.text('收起面板', 'Close panel'));
    }

    updateDrink() {
      const d = this.currentDrink, name = this.drinkLabel(d);
      this.el['preset-hint'].textContent = this.text('长按上方任一杯量按钮，左右拖动调整本次饮水量', 'Hold any cup button above and drag left or right to adjust the amount');
      this.el.name.textContent = name;
      this.el.drink.classList.toggle('long', name.length >= 4);
      this.el.drink.title = name;
      this.el.dot.style.background = d.dot;
      this.el.drink.setAttribute('aria-label', this.text(`${name}，切换饮品`, `${name}, switch drink`));
      this.el.drink.disabled = !!this.hold;
      this.el.forecast.querySelector('.nh-forecast-label').textContent = this.text('预计', 'Preview'); this.el.undo.textContent = this.text('撤销', 'Undo');
      this.el.reopen.textContent = this.text('展开饮水面板', 'Open hydration panel');
      this.el.toast.textContent = this.reminderToastUntil > this.time() ? this.text('该喝水了', 'Time for water') : this.text('✨ 今日饮水目标达成！继续保持', '✨ Daily hydration goal reached!');
      this.updateToolbar();
      this.shadowRoot.querySelectorAll('.nh-target span:last-child').forEach(label => { label.textContent = `${this.goal} ml`; });
      this.shadowRoot.querySelectorAll('.nh-cup').forEach((button, index) => {
        const raw = this.dailyOptions.quickAmounts[index];
        button.dataset.amount = String(raw);
        button.firstElementChild.textContent = '+' + raw;
        button.setAttribute('aria-label', this.text(`记录 ${raw} 毫升${d.name}`, `Record ${raw} ml ${d.en}`));
      });
    }
    updateGuidance() {
      const reached = this.total >= this.goal;
      const paused = reached && !this.reminderOptions.afterGoal;
      const minutes = Math.max(0, Math.ceil(this.remaining / 60));
      const label = this.nextReminderLabel();
      this.el.relative.textContent = paused ? this.text('今日已达标', 'Goal reached today') :
        this.sampleMinutes === null || minutes > this.reminderOptions.interval ? label : this.text(`${minutes} 分钟后提醒`, `Remind in ${minutes} min`);
      this.el.exact.textContent = paused || this.sampleMinutes === null ? this.el.relative.textContent : label + this.text(' 提醒', ' reminder');
      const remainingReminders = Math.max(1, this.reminderPlan.count);
      const suggested = Math.ceil(Math.max(0, this.goal - this.total) / remainingReminders / this.currentDrink.factor / 25) * 25;
      const goal = this.text(`目标 ${this.goal} ml`, `Goal ${this.goal} ml`);
      const suggestion = this.text(`每次约 ${suggested} ml`, `~${suggested} ml each`);
      const hasSuggestion = !reached && this.reminderPlan.count > 0;
      this.el['serving-goal'].textContent = goal;
      this.el.suggestion.textContent = suggestion;
      this.el.suggestion.hidden = !hasSuggestion;
      this.el.serving.hidden = reached || (!this.memorable && !hasSuggestion);
      this.el['guidance-separator'].hidden = this.el.serving.hidden;
      this.el.serving.tabIndex = this.memorable && hasSuggestion ? 0 : -1;
      this.el.serving.setAttribute('aria-label', this.memorable ? (hasSuggestion ? goal + ' · ' + suggestion : goal) : suggestion);
      this.el.next.disabled = paused || this.sampleMinutes === null;
    }
    renderPresetHint() {
      const adjusting = this.ruler || this.rulerExit || this.hold;
      // Hold the layout through the last drop, even after the ruler has closed.
      if (this.learnedPresetAdjustment && !adjusting && !this.motion?.pouring) this.reservesPresetHint = false;
      const visible = this.reservesPresetHint && !this.learnedPresetAdjustment && !adjusting;
      const state = this.reservesPresetHint ? (visible ? 'visible' : 'reserved') : undefined;
      if (state === this.dataset.presetHint) return;
      if (state) this.dataset.presetHint = state;
      else delete this.dataset.presetHint;
      this.el['preset-hint'].setAttribute('aria-hidden', String(!visible));
      this.shadowRoot.querySelectorAll('.nh-cup').forEach(button => {
        if (visible) button.setAttribute('aria-describedby', 'nh-preset-hint');
        else button.removeAttribute('aria-describedby');
      });
    }
    renderStatus() {
      this.renderPresetHint();
      const filling = !!this.motion?.pouring || !!this.hold;
      const success = !!this.feedback && !filling;
      // Match the current native row: enter pouring immediately; fade on completion.
      for (const layer of [this.el.guidance, this.el.pouring, this.el.success]) layer.style.transition = filling ? 'none' : '';
      this.el.guidance.classList.toggle('visible', !filling && !success && this.ruler?.kind !== 'time');
      this.el.pouring.classList.toggle('visible', filling);
      this.el.success.classList.toggle('visible', success);
      this.el.guidance.inert = filling || success || this.ruler?.kind === 'time';
      this.el.guidance.setAttribute('aria-hidden', String(this.el.guidance.inert));
      this.el.pouring.setAttribute('aria-hidden', String(!filling));
      this.el.success.setAttribute('aria-hidden', String(!success));
      this.el.undo.disabled = !success || this.feedback?.undone;
      this.el.undo.hidden = !!this.feedback?.undone;
      this.el.cups.style.opacity = this.hold || this.ruler ? '0' : '1';
      this.el.cups.style.pointerEvents = this.hold || this.ruler ? 'none' : 'auto';
      this.el.cups.setAttribute('aria-hidden', String(!!this.hold || !!this.ruler));
      this.el['hold-pill'].style.opacity = this.hold ? '1' : '0';
      this.el['hold-pill'].setAttribute('aria-hidden', String(!this.hold));
      if (this.hold) this.el['hold-text'].textContent = this.hold.cancelling ? this.text('松开取消', 'Release to cancel') : this.text('松开完成 · 上滑取消', 'Release to finish · Slide up to cancel');
      if (this.feedback) this.el['success-text'].textContent = this.successMessage();
    }
    successMessage() {
      const f = this.feedback;
      if (f.undone) return this.text('已撤销', 'Undone');
      if (f.showGoalStatus) return this.text('今日已达标', 'Goal reached today');
      if (f.affirmation === 'first') return this.text(`今天第一杯 · +${f.raw} ml`, `First cup today · +${f.raw} ml`);
      if (f.affirmation === 'half') return this.text(`到一半了 · +${f.raw} ml`, `Halfway · +${f.raw} ml`);
      return this.text(`已记录 ${f.raw} ml`, `Recorded ${f.raw} ml`);
    }
    setPreview(raw) {
      if (this.hold) return;
      const now = this.time(), d = this.currentDrink;
      this.preview = raw;
      if (raw !== null) this.previewPalette = palette([...this.records, { drink: d, raw }], d);
      this.previewMotion = { at: now, fromTotal: this.previewAlpha > .001 ? this.previewTotal : this.visual, toTotal: raw === null ? this.visual : this.total + Math.round(raw * d.factor),
        fromAlpha: this.previewAlpha, toAlpha: raw === null ? 0 : 1, duration: this.reduced ? 0 : .23, delay: raw === null && !this.reduced ? .08 : 0 };
      this.previewCommitAt = null;
    }
    cycleDrink(direction) {
      const enabled = this.enabledDrinks;
      const next = (enabled.indexOf(this.currentDrink) + direction + enabled.length) % enabled.length;
      this.selectDrink(enabled[next].id, false);
    }
    storeAmberBeforePour() {
      if (!this.memorable || this.goalAt == null) return;
      this.goalAt = null;
      this.panelAmber?.store();
    }
    record(raw, { fromHold = false } = {}) {
      if (raw <= 0 || this.hold && !fromHold) return;
      this.storeAmberBeforePour();
      const now = this.time(), d = this.currentDrink, before = this.total;
      const from = this.visual;
      const beforeRecords = fromHold ? [...this.records, { drink: d, raw }] : this.liquidRecords(now);
      this.fluid.cancelEnding(); this.affirmation = null;
      const keepRound = this.round && this.round.drink === d.id && (this.feedback && !this.feedback.undone || this.motion?.pouring);
      if (!keepRound) this.round = { start: this.records.length, raw: 0, drink: d.id, beforeGoalAt: this.goalAt,
        affirmationsBefore: { ...this.affirmationsReached } };
      const rawFrom = keepRound ? this.roundLiveRaw : 0, effectiveFrom = keepRound ? this.roundLiveEffective : 0;
      const first = !this.affirmationsReached.first && this.records.length === 0;
      this.records = [...this.records, { drink: d, raw }]; this.round.raw += raw;
      this.feedback = { raw: this.round.raw, remaining: 3, started: false, undone: false };
      const effectiveTo = this.records.slice(this.round.start).reduce((sum, r) => sum + Math.round(r.raw * r.drink.factor), 0);
      const tailOnly = fromHold && this.refined && !this.reduced;
      this.motion = { at: now, from, to: this.total, duration: this.reduced ? 0 : fromHold ? (tailOnly ? T.proposed.tailDuration : 0) : T.pourDuration, volumes: liquidVolumes(beforeRecords, this.records),
        pouring: true, tailOnly, rawFrom: tailOnly ? this.round.raw : rawFrom, rawTo: this.round.raw, effectiveFrom: tailOnly ? effectiveTo : effectiveFrom, effectiveTo,
        pendingGoal: before < this.goal && this.total >= this.goal || !!this.motion?.pendingGoal,
        pendingAffirmations: { first: first || !!this.motion?.pendingAffirmations?.first,
          half: !this.affirmationsReached.half && before < this.goal / 2 && this.total >= this.goal / 2 || !!this.motion?.pendingAffirmations?.half } };
      if (this.memorable && this.motion.pendingGoal) this.panelAmber?.beginCelebration(palette(this.records, d).amber);
      this.incoming = d; this.incomingFraction = raw / this.records.reduce((sum, r) => sum + r.raw, 0); this.blockedPreview = raw;
      if (this.previewAlpha > .001) this.previewCommitAt = now; this.preview = null; this.previewMotion = null;
      if (this.generalOptions.autoResetCountdownOnLogging) {
        this.round.reminderBeforePour ??= { due: this.reminderClock + this.remaining / 60,
          sampleMinutes: this.sampleMinutes, plan: this.reminderPlan };
        this.planReminder();
      }
      this.updateGuidance(); this.renderStatus();
      this.audio.activate(this.audio.enabled); this.audio.begin(clamp(from / this.goal));
      if (this.motion.duration === 0) this.finishPour(now); this.dispatch('record');
    }
    finishPour(now) {
      const m = this.motion; if (!m) return;
      this.visual = m.to; this.roundLiveRaw = m.rawTo; this.roundLiveEffective = m.effectiveTo;
      this.motion = null; this.flowEnded = now;
      if (m.pendingGoal) {
        this.goalAt = this.memorable && this.reduced ? null : now; this.reverse = null; this.toastUntil = now + 3;
        this.reminderToastUntil = 0;
        this.el.toast.textContent = this.text('✨ 今日饮水目标达成！继续保持', '✨ Daily hydration goal reached!');
      }
      const milestones = m.pendingAffirmations || {};
      for (const kind of ['first', 'half']) if (milestones[kind]) this.affirmationsReached[kind] = true;
      const kind = this.affirmative && !m.pendingGoal ? (milestones.half ? 'half' : milestones.first ? 'first' : null) : null;
      this.feedback.affirmation = kind;
      this.feedback.earnedAmber = this.memorable && m.pendingGoal;
      this.affirmation = kind && !this.reduced ? { kind, at: now } : null;
      this.feedback.started = true; this.feedback.remaining = 3;
      const baseY = waterlineY(this.visual / this.goal, this.recordHeight, this.fullY, this.ceilingY);
      if (!m.pendingGoal) this.fluid.complete(now, this.width, baseY, palette(this.records, this.currentDrink).top, this.refined, this.reduced);
      this.completedAt = now;
      this.audio.finish(m.pendingGoal, { formAmber: this.memorable && this.recordingPage && !this.reduced });
      this.renderStatus();
      this.el.announcement.textContent = this.successMessage() + this.text('，可撤销', '. Undo available.');
      this.updateMemory();
      this.dispatch('completed');
    }
    undo() {
      if (!this.round || !this.feedback?.started || this.motion?.pouring || this.hold || this.feedback.undone) return;
      const now = this.time(), from = this.visual, beforeRecords = this.records, frame = this.fluid.frame;
      this.fluid.cancelEnding(); this.affirmation = null;
      this.affirmationsReached = { ...this.round.affirmationsBefore };
      this.records = this.records.slice(0, this.round.start);
      const reminder = this.round.reminderBeforePour;
      if (reminder) {
        if (reminder.sampleMinutes !== null && reminder.due <= this.reminderClock) this.planReminder();
        else {
          this.sampleMinutes = reminder.sampleMinutes;
          this.reminderPlan = reminder.plan;
          this.remaining = Math.max(0, (reminder.due - this.reminderClock) * 60);
        }
      }
      if (this.total < this.goal && from >= this.goal) {
        this.panelAmber?.hide();
        this.reverse = { at: now, gold: frame?.gold ?? 0, surface: frame?.surface ?? 1, reveal: frame?.reveal ?? 1, age: frame?.surfaceAge ?? 3 };
        this.goalAt = this.round.beforeGoalAt; this.toastUntil = 0;
      }
      this.motion = { at: now, from, to: this.total, volumes: liquidVolumes(beforeRecords, this.records), duration: this.reduced ? 0 : T.undoDuration, pouring: false };
      this.round = null; this.feedback = { undone: true, started: true, remaining: 3 }; this.audio.stop(); this.setPreview(null); this.updateGuidance(); this.renderStatus();
      this.el.announcement.textContent = this.text('已撤销本轮记录', 'This round was undone.'); this.updateMemory(); this.dispatch('undo');
    }
    point(e) { const r = this.el.body.getBoundingClientRect(); return { x: (e.clientX - r.left) / this.zoom, y: (e.clientY - r.top) / this.zoom }; }
    pointerDown(e) {
      if (e.button !== 0 || this.press || !this.open || !this.recordingPage) return;
      const target = e.target.closest('button'), p = this.point(e);
      if (target && !target.classList.contains('nh-cup') && !target.classList.contains('nh-next')) return;
      if (target?.classList.contains('nh-next') && (this.feedback || this.motion || this.el.next.disabled)) return;
      if (!target && (p.y < 32 || !this.dailyOptions.holdEnabled || this.ruler || this.motion?.pouring)) return;
      this.audio.activate(this.audio.enabled);
      const targetRect = target?.getBoundingClientRect(), rulerRect = this.el.ruler.getBoundingClientRect();
      const source = targetRect ? { x: (targetRect.left - rulerRect.left) / this.zoom, y: (targetRect.top - rulerRect.top) / this.zoom, width: targetRect.width / this.zoom, height: targetRect.height / this.zoom } : null;
      this.press = { kind: target?.classList.contains('nh-cup') ? 'volume' : target?.classList.contains('nh-next') ? 'time' : 'hold', target, source, at: this.time(), p, last: p, raw: Number(target?.dataset.amount || 0), id: e.pointerId };
      this.el.body.setPointerCapture(e.pointerId); e.preventDefault();
      if (this.press.kind === 'hold') this.beginHold(p, e);
    }
    holdRate(event) {
      const { lightRate, firmRate } = this.dailyOptions;
      // Pointer Events use 0.5 for an ordinary pressed mouse with no pressure sensor.
      const pressure = event?.pressure;
      if (!Number.isFinite(pressure) || (pressure === .5 && event.pointerType !== 'pen')) return lightRate;
      return lightRate + (firmRate - lightRate) * clamp((pressure - .2) / .6);
    }
    beginHold(p, event) {
      this.storeAmberBeforePour();
      this.fluid.cancelEnding(); this.affirmation = null;
      this.feedback = null; this.round = null; this.previewAlpha = 0; this.preview = null; this.previewMotion = null;
      this.hold = { raw: 0, rate: this.holdRate(event), cancelling: false, anchorY: p.y }; this.beforeHold = this.total;
      this.incoming = this.currentDrink; this.incomingFraction = 0;
      this.audio.begin(clamp(this.total / this.goal)); this.updateDrink(); this.renderStatus();
    }
    movePress(p, event) {
      const press = this.press; if (!press) return; press.last = p;
      if (this.hold) {
        if (event) this.hold.rate = this.holdRate(event);
        const rise = this.hold.anchorY - p.y;
        if (!this.hold.cancelling && rise >= 36) this.hold.cancelling = true;
        else if (this.hold.cancelling && rise <= 24) this.hold.cancelling = false;
        this.renderStatus(); return;
      }
      if (this.ruler) {
        const r = this.ruler, rise = r.anchorY - p.y;
        r.cancelling = r.cancelling ? rise > 24 : rise >= 36;
        r.pointer = p.x - 12; this.updateRulerValue();
        if (this.memorable && !this.learnedPresetAdjustment && r.kind === 'volume' && !r.cancelling
            && r.amount !== r.base && Math.abs(p.x - press.p.x) >= T.rulerSpacing / 2) {
          this.learnedPresetAdjustment = true;
          if (!this.previewFirstRun) {
            try { window.localStorage?.setItem(learnedPresetKey, '1'); }
            catch { /* The in-memory flag also works without browser storage. */ }
          }
        }
      } else if (Math.hypot(p.x - press.p.x, p.y - press.p.y) > 6) press.cancelled = true;
    }
    beginRuler(now) {
      const p = this.press, width = this.width - 24;
      this.ruler = { kind: p.kind, amount: p.kind === 'time' ? this.sampleMinutes : p.raw,
        base: p.kind === 'time' ? this.sampleMinutes : p.raw, origin: p.p.x - 12, pointer: p.last.x - 12, anchorY: p.p.y,
        sourceX: p.source ? p.source.x + p.source.width / 2 + (p.kind === 'volume' ? 2.5 : 0) : p.p.x - 12,
        source: p.source, at: now, width, height: this.el.ruler.clientHeight, speed: 2, direction: 0, cancelling: false };
      if (p.kind === 'time') {
        const dayStart = Math.floor(this.sampleMinutes / dayMinutes) * dayMinutes;
        const first = Math.max(dayStart, Math.ceil(this.reminderClock));
        this.ruler.windows = this.reminderPlan.windows
          .map(w => ({ start: Math.max(first, w.start), end: Math.min(dayStart + dayMinutes, w.end) }))
          .filter(w => w.start < w.end);
      }
      this.rulerExit = null; this.setPreview(p.kind === 'time' ? null : p.raw); this.renderStatus();
    }
    updateRulerValue() {
      const r = this.ruler; if (!r || r.cancelling) { if (r?.kind === 'volume') this.setPreview(null); return; }
      const step = r.kind === 'time' ? 1 : 5, value = r.base + Math.round((clamp(r.pointer, 28, r.width - 28) - r.origin) / 8) * step;
      if (r.kind === 'time') {
        const forward = value >= r.amount;
        const period = forward ? r.windows.find(w => w.end > value) || r.windows.at(-1) :
          r.windows.findLast(w => w.start <= value) || r.windows[0];
        if (period) r.amount = clamp(value, period.start, period.end - 1);
      } else r.amount = clamp(value, 5, 1500);
      if (r.kind === 'volume' && this.preview !== r.amount) this.setPreview(r.amount);
    }
    pointerUp(e) {
      const p = this.press; if (!p || e.pointerId != null && e.pointerId !== p.id) return;
      if (this.el.body.hasPointerCapture(p.id)) this.el.body.releasePointerCapture(p.id);
      if (this.hold) {
        const held = this.hold.raw, raw = Math.round(held), cancelled = this.hold.cancelling;
        this.hold = null; this.press = null;
        if (!cancelled && raw > 0) this.record(raw, { fromHold: true });
        else {
          const before = [...this.records, { drink: this.currentDrink, raw: held }];
          this.motion = { at: this.time(), from: this.visual, to: this.total, volumes: liquidVolumes(before, this.records), duration: this.reduced ? 0 : .55, pouring: false };
          this.flowEnded = this.time(); this.audio.stop(); this.renderStatus();
        }
        this.updateDrink(); return;
      }
      if (this.ruler) {
        const r = this.ruler; this.rulerExit = { ...r, exitAt: this.time() }; this.ruler = null; this.press = null;
        if (!r.cancelling) {
          if (r.kind === 'volume') this.record(r.amount);
          else { this.sampleMinutes = r.amount; this.remaining = Math.max(0, (r.amount - this.reminderClock) * 60); this.updateGuidance(); this.setPreview(null); this.renderStatus(); this.dispatch('reminder'); }
        } else { this.setPreview(null); this.renderStatus(); }
      } else {
        this.press = null;
        if (p.kind === 'volume' && !p.cancelled) this.record(p.raw);
      }
    }
    cancelPress() {
      if (!this.press) return;
      this.press.cancelled = true;
      if (this.hold) this.hold.cancelling = true;
      if (this.ruler) this.ruler.cancelling = true;
      this.pointerUp({}); this.dispatch('cancel');
    }
    renderRuler(now, dt) {
      const r = this.ruler || this.rulerExit;
      if (!r) { this.el.ruler.style.opacity = '0'; return; }
      const entry = this.reduced ? 1 : clamp((now - r.at) / T.rulerEntry), exit = this.ruler ? 0 : this.reduced ? 1 : clamp((now - r.exitAt) / T.rulerExit);
      if (exit >= 1) {
        this.rulerExit = null; this.el.ruler.style.opacity = '0';
        this.renderPresetHint();
        return;
      }
      if (this.ruler) {
        const next = r.cancelling ? 0 : r.pointer <= 28 ? -1 : r.pointer >= r.width - 28 ? 1 : 0;
        if (next !== r.direction) { r.direction = next; r.speed = 2; }
        if (next) { const response = -Math.expm1(-dt / .6), difference = 12 - r.speed, ticks = 12 * dt - difference * .6 * response; r.speed += difference * response; r.origin -= next * 8 * ticks; this.updateRulerValue(); }
      }
      this.el.ruler.style.opacity = String(1 - exit); this.el.ruler.classList.toggle('cancelling', r.cancelling);
      const canvas = this.el.ruler.querySelector('canvas'), c = canvas.getContext('2d'), scale = Math.min(3, devicePixelRatio || 2);
      const pixelWidth = Math.round(r.width * scale), pixelHeight = Math.round(r.height * scale);
      if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
      if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
      c.setTransform(pixelWidth / r.width, 0, 0, pixelHeight / r.height, 0, 0); c.clearRect(0, 0, r.width, r.height);
      const step = r.kind === 'time' ? 1 : 5, selectedX = r.origin + (r.amount - r.base) / step * 8, labelX = clamp(selectedX, 38, r.width - 38);
      const cueX = r.cancelling ? r.width / 2 : labelX < 110 ? r.width - 48 : 48;
      const label = n => r.kind === 'time' ? clockLabel(n) : String(n);
      for (let i = Math.floor(-r.origin / 8); i <= Math.ceil((r.width - r.origin) / 8); i++) {
        const value = r.base + i * step, x = r.origin + i * 8;
        const inRange = r.kind === 'time' ? r.windows.some(w => value >= w.start && value < w.end) : value >= 5 && value <= 1500;
        if (value === r.amount || !inRange) continue;
        const major = value % (r.kind === 'time' ? 10 : 50) === 0, medium = value % (r.kind === 'time' ? 5 : 25) === 0;
        const distance = clamp(Math.abs(x - r.origin) / Math.max(1, r.origin, r.width - r.origin)), appear = ease((entry - .1 - .22 * distance) / .65), edge = clamp(Math.min(x, r.width - x) / 18);
        const tickTop = major ? 30 : medium ? 35 : 40, height = (r.height - tickTop) * appear;
        c.fillStyle = `rgba(255,255,255,${(major ? .65 : medium ? .55 : .44) * edge * appear * (1 - exit)})`; c.fillRect(x - .5, r.height - height + exit * 6, 1, height);
        if (major && (r.cancelling || Math.abs(x - labelX) > 37) && Math.abs(x - cueX) > (r.cancelling ? 42 : 35)) { c.fillStyle = `rgba(255,255,255,${.65 * edge * smooth(.38 + .12 * distance, .9, entry) * (1 - exit)})`; c.font = '9px -apple-system, BlinkMacSystemFont, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(label(value), x, 12 + exit * 6); }
      }
      const markerTop = 26, markerHeight = r.height - markerTop;
      if (r.source && r.kind === 'volume' && !exit && entry < .82 && !r.cancelling) {
        const p = ease((entry - .02) / .7), source = r.source, width = source.width + (2 - source.width) * p, height = source.height + (markerHeight - source.height) * p;
        const x = source.x + source.width / 2 + (selectedX - source.x - source.width / 2) * p,
          y = source.y + (markerTop - source.y) * p + height / 2;
        c.save(); c.globalAlpha = 1 - smooth(.42, .82, entry); c.beginPath(); c.roundRect(x - width / 2, y - height / 2, width, height, 13 - 12 * p); c.fillStyle = 'rgba(0,0,0,.45)'; c.fill(); c.strokeStyle = 'rgba(255,255,255,.21)'; c.lineWidth = 1; c.stroke(); c.restore();
      }
      c.fillStyle = '#fff'; const marker = markerHeight * (.35 + .65 * ease(entry)); c.globalAlpha = r.cancelling ? 0 : smooth(.28, .78, entry) * (1 - exit); c.fillRect(selectedX - 1, r.height - marker + exit * 6, 2, marker); c.globalAlpha = 1;
      const sourceY = r.kind === 'volume' && r.source ? r.source.y + r.source.height / 2 : 27;
      const travel = smooth(0, .92, entry), x = r.sourceX + (labelX - r.sourceX) * travel, y = sourceY + (12 - sourceY) * travel;
      const labelMarkup = `${label(r.amount)}${r.kind === 'volume' ? '<span class="nh-ruler-unit">ml</span>' : ''}`;
      if (this.el['ruler-label'].innerHTML !== labelMarkup) this.el['ruler-label'].innerHTML = labelMarkup;
      this.el['ruler-label'].style.left = x + 'px'; this.el['ruler-label'].style.top = y + 'px'; this.el['ruler-label'].style.transform = `translate(-50%,-50%) scale(${.833 + .167 * travel})`; this.el['ruler-label'].style.opacity = r.cancelling ? '0' : String(1 - exit);
      this.el['ruler-cue'].textContent = r.cancelling ? this.text('松开取消', 'Release to cancel') : this.text('上滑取消', 'Slide up to cancel'); this.el['ruler-cue'].style.left = cueX + 'px'; this.el['ruler-cue'].style.opacity = smooth(.58, 1, entry);
    }
    tick(now, dt) {
      const previousSeconds = Math.ceil(this.remaining);
      this.reminderClock += dt / 60;
      if (this.sampleMinutes !== null) {
        this.remaining = Math.max(0, this.remaining - dt);
        if (this.remaining === 0) {
          if (this.total < this.goal || this.reminderOptions.afterGoal) this.testReminder();
          this.planReminder();
        }
      }
      const reminderPreviewEnded = this.reminderToastUntil > 0 && now >= this.reminderToastUntil;
      if (reminderPreviewEnded) this.reminderToastUntil = 0;
      if (Math.ceil(this.remaining) !== previousSeconds || reminderPreviewEnded) {
        if (this.page === 'settings' && this.dailySettings.section === 'reminders') this.dailySettings.reminders?.refreshStatus();
        if (this.recordingPage) this.updateGuidance();
      }
      if (this.press && !this.hold && !this.ruler && !this.press.cancelled && now - this.press.at >= T.rulerHold) this.beginRuler(now);
      let pourProgress = 0;
      if (this.motion) {
        const m = this.motion, p = m.duration ? clamp((now - m.at) / m.duration) : 1;
        const progress = m.pouring ? p : smooth(0, 1, p);
        this.visual = m.from + (m.to - m.from) * progress;
        if (m.pouring) { this.roundLiveRaw = m.rawFrom + (m.rawTo - m.rawFrom) * p; this.roundLiveEffective = m.effectiveFrom + (m.effectiveTo - m.effectiveFrom) * p; pourProgress = m.tailOnly ? 1 - T.proposed.tailDuration + T.proposed.tailDuration * p : p; }
        if (p >= 1) { if (m.pouring) this.finishPour(now); else { this.visual = m.to; this.motion = null; } }
      }
      if (this.hold) {
        if (!this.hold.cancelling) this.hold.raw += this.hold.rate * dt;
        const raw = Math.round(this.hold.raw), effective = Math.round(raw * this.currentDrink.factor);
        this.visual = this.total + effective; this.roundLiveRaw = raw; this.roundLiveEffective = effective;
        this.incomingFraction = this.hold.raw / Math.max(1, this.hold.raw + this.records.reduce((sum, r) => sum + r.raw, 0));
      }
      const pouring = !!this.motion?.pouring || !!this.hold && !this.hold.cancelling;
      if (this.previewMotion) {
        const m = this.previewMotion, p = m.duration ? clamp((now - m.at - m.delay) / m.duration) : 1, e = smooth(0, 1, p);
        this.previewTotal = m.fromTotal + (m.toTotal - m.fromTotal) * e;
        this.previewAlpha = m.duration ? m.fromAlpha + (m.toAlpha - m.fromAlpha) * smooth(0, .12, now - m.at - m.delay) : m.toAlpha;
        if (p >= 1) this.previewMotion = null;
      }
      if (this.previewCommitAt !== null) { this.previewAlpha = 1 - smooth(0, .12, now - this.previewCommitAt); if (this.previewAlpha <= 0) this.previewCommitAt = null; }
      if (this.feedback?.started && !this.pausedFeedback) {
        this.feedback.remaining -= dt;
        if (this.feedback.remaining <= 0) { this.feedback = null; this.round = null; this.renderStatus(); this.updateGuidance(); }
      }
      if (this.affirmation && now - this.affirmation.at >= T.affirmation.duration) this.affirmation = null;
      const reached = this.total >= this.goal && !this.motion?.pendingGoal;
      const draw = this.fluid.draw(now, dt, { width: this.width, height: this.recordHeight, fullY: this.fullY, ceilingY: this.ceilingY,
        safeAreaTop: this.safeAreaTop, ratio: this.visual / this.goal, pouring,
        pourProgress, drink: this.currentDrink, palette: this.currentPalette(now), incoming: this.incoming, previewPalette: this.previewPalette,
        incomingFraction: this.incomingFraction || 0, flowEnded: this.flowEnded, reached,
        goalAt: this.goalAt, reverse: this.reverse, formGoalAmber: this.memorable, previewRatio: this.previewTotal / this.goal, previewAlpha: this.previewAlpha, refined: this.refined, reduced: this.reduced, affirmation: this.affirmation });
      const showAmber = this.memorable && reached && this.recordingPage && this.opening?.open !== false;
      const today = this.memoryDays.at(-1);
      const amberMode = !showAmber ? 'hidden' : this.goalAt == null || this.reduced ? 'stored' : 'celebrate';
      this.panelAmber?.update(draw.formation, today.color?.amber, today.date, today.shape, amberMode);
      // The rendered amber keeps its frame while inspected and in flight, then drops it on landing.
      const hasAmberSpace = !!this.panelAmber?.frame;
      if (hasAmberSpace !== ('amberSpace' in this.el.body.dataset)) {
        if (hasAmberSpace) this.el.body.dataset.amberSpace = '';
        else delete this.el.body.dataset.amberSpace;
      }
      if (this.feedback?.earnedAmber && !this.feedback.showGoalStatus &&
          (hasAmberSpace || this.panelAmber?.stored || this.reduced)) {
        this.feedback.showGoalStatus = true;
        this.renderStatus();
      }
      this.el.main.textContent = String(Math.round(this.visual)); this.el['forecast-main'].textContent = String(Math.round(this.previewTotal));
      const textPreview = this.preview !== null || this.previewCommitAt !== null;
      this.el.forecast.style.opacity = textPreview ? this.previewAlpha : 0; this.el['readout-content'].style.opacity = textPreview ? 1 - this.previewAlpha : 1;
      this.el.readout.setAttribute('aria-label', `${textPreview ? this.text('预计 ', 'Preview ') : ''}${Math.round(textPreview ? this.previewTotal : this.visual)} / ${this.goal} ml`);
      this.el.readout.style.transform = `translateY(${-Math.max(0, draw.emphasis) * 18}px) scale(${1 + draw.emphasis})`;
      this.el.body.classList.toggle('gold-ink', !!draw.goldInk);
      this.el.header.classList.toggle('gold-ink', !!draw.goldInk && this.recordingPage);
      this.el.dot.style.background = draw.goldInk ? '#FDE047' : this.currentDrink.dot;
      const g = draw.gold;
      this.style.setProperty('--nh-text-shadow', `0 .8px ${2.2 + .8 * g}px rgba(0,0,0,${.68 + .2 * g}),0 .35px .7px rgba(0,0,0,${.08 + .12 * g})`);
      this.style.setProperty('--nh-status-shadow', `0 .8px ${2.2 + .8 * g}px rgba(0,0,0,${.72 + .16 * g}),0 .35px .7px rgba(0,0,0,${.08 + .12 * g})`);
      this.el['pour-prefix'].textContent = this.hold?.cancelling ? '+' : this.text('正在注水 +', 'Pouring +');
      this.el.count.textContent = String(Math.round(this.roundLiveRaw));
      this.el.effective.textContent = this.currentDrink.factor === 1 ? '' : this.text(` (有效 +${Math.round(this.roundLiveEffective)} ml)`, ` (effective +${Math.round(this.roundLiveEffective)} ml)`);
      const pop = this.refined && !this.reduced && this.completedAt ? Math.sin(Math.max(0, now - this.completedAt) * 18) * Math.exp(-Math.max(0, now - this.completedAt) * 14) * .13 : 0;
      this.el.check.style.transform = `scale(${1 + pop})`;
      const reminderPageVisible = this.page === 'settings' && this.dailySettings.section === 'reminders';
      const toastVisible = now < this.toastUntil || (!reminderPageVisible && now < this.reminderToastUntil);
      this.el.toast.classList.toggle('visible', toastVisible);
      this.el.toast.setAttribute('aria-hidden', String(!toastVisible));
      if (pouring) this.audio.update(clamp(this.visual / this.goal), pourProgress, this.refined);
      this.renderRuler(now, dt);
      if (this.opening) {
        const m = this.opening, p = this.reduced ? 1 : clamp((now - m.at) / m.duration), phase = m.open ? ease(p) : 1 - smooth(0, 1, p);
        this.updateContour(phase); this.el.shell.style.opacity = !this.safeAreaTop || this.reduced ? phase : 1;
        this.el.body.style.opacity = smooth(.35, 1, phase);
        this.el.body.style.filter = this.reduced ? 'none' : `blur(${10 * (1 - smooth(.35, 1, phase))}px)`;
        this.el.water.style.opacity = this.el.body.style.opacity;
        this.el.water.style.filter = this.el.body.style.filter;
        this.el.header.style.opacity = this.el.body.style.opacity;
        this.el.header.style.filter = this.el.body.style.filter;
        const pageRoot = this.page === 'settings' ? this.dailySettings.root : this.insights?.active && this.insights.root;
        if (pageRoot) {
          pageRoot.style.opacity = this.el.body.style.opacity;
          pageRoot.style.filter = this.el.body.style.filter;
        }
        if (p >= 1) {
          this.opening = null;
          if (!m.open) {
            this.open = false;
            this.el.reopen.hidden = this.scene === 'website';
            this.el.shell.style.opacity = '0';
          }
        }
      }
      if (this.hasAttribute('auto-collapse') && this.recordingPage && !this.inside && !this.memoryVisible && !this.feedback && !this.motion && !this.hold && !this.press && !this.panelAmber?.frame && now >= this.toastUntil && this.pointerLeftAt && now - this.pointerLeftAt > 1 && !this.opening) this.closePanel();
      this.dataset.total = String(this.total); this.dataset.display = String(Math.round(this.visual)); this.dataset.status = this.motion?.pouring ? 'pouring' : this.hold ? 'hold' : this.feedback?.undone ? 'undone' : this.feedback ? 'recorded' : 'idle';
      this.dataset.preview = String(this.preview !== null); this.dataset.roundRaw = String(this.round?.raw || 0); this.dataset.ruler = this.ruler?.kind || ''; this.dataset.goal = this.total >= this.goal ? 'true' : 'false';
      this.dataset.ending = this.fluid.endingFrame?.phase || 'idle';
      this.dataset.endingDrops = String(this.fluid.endingFrame?.drops?.length || 0);
      this.dataset.endingDropIds = (this.fluid.endingFrame?.drops || []).map(drop => drop.index).join(',');
      this.dataset.affirmation = this.feedback?.affirmation || '';
      this.dataset.affirmationAge = this.affirmation ? String(Math.max(0, now - this.affirmation.at)) : '';
      this.dataset.affirmationGlow = String(this.fluid.affirmationVisual?.strength || 0);
    }
    closePanel() {
      this.reminderToastUntil = 0; this.reminderPlayer?.pause();
      if (this.page === 'settings') this.dailySettings.root.inert = true;
      this.insights?.closeTools();
      this.insights?.yearJarTransition?.cancel();
      this.insights?.jarViewer?.close(false);
      this.memoryAmberViewer?.close(false);
      this.el.header.inert = true;
      if (this.press) this.cancelPress();
      // Saved records survive closing; their acknowledgements must not replay on reopen.
      this.motion = null; this.visual = this.total; this.feedback = null; this.round = null; this.affirmation = null;
      this.affirmationsReached = { first: this.records.length > 0, half: this.total >= this.goal / 2 };
      this.audio.stop(); this.fluid.cancelEnding(); this.setPreview(null); this.toastUntil = 0;
      if (this.memorable) this.goalAt = null;
      this.panelAmber?.hide();
      this.memoryVisible = false; this.updateMemory();
      this.opening = { open: false, at: this.time(), duration: .24 }; this.dispatch('close');
    }
    openPanel() {
      this.open = true; this.el.reopen.hidden = true; this.opening = { open: true, at: this.time(), duration: .32 };
      this.el.header.inert = false;
      this.lastFrame = this.time();
      if (this.insights?.active) { this.memoryVisible = this.memorable; this.renderMemory(); }
      if (this.page === 'settings') {
        this.dailySettings.root.inert = false;
        this.dailySettings.show();
      }
      this.renderStatus(); this.dispatch('open');
    }
    setSound(enabled) {
      const previous = this.audio.enabled;
      this.audio.activate(enabled);
      if (previous !== this.audio.enabled) this.dispatchEvent(new Event('hydro-preferences-change'));
    }
    dispatch(action) {
      this.dispatchEvent(new CustomEvent('hydro-change', { bubbles: true, composed: true, detail: { action, total: this.total, variant: this.getAttribute('variant') || 'refined', scene: this.getAttribute('scene') || 'cup', drink: this.currentDrink.id, affirmation: this.feedback?.affirmation || null, memoryDate: this.memorable ? this.memorySelection : null, memoryVisible: this.memoryVisible, memoryRange: this.memoryRange, memoryCursor: this.memoryCursor, memoryMonth: this.memoryMonthSelection } }));
    }
  }
  const register = () => customElements.define('notch-hydro-demo', NotchHydroDemo);
  // Wait for the deferred audio class on a cold preview load if it is still arriving.
  if (typeof window.NotchHydroAudio !== 'function' && document.readyState !== 'complete') document.addEventListener('DOMContentLoaded', register, { once: true });
  else register();
})();
