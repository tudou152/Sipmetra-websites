/* A year's shelf of the same dated stones and glass used in the monthly calendar. */
(() => {
  'use strict';
  const M = window.NotchHydroMemory;

  window.NotchHydroAnnualJars = class AnnualJars {
    constructor(insights, grid) {
      this.insights = insights;
      this.grid = grid;
      this.months = Array.from({ length: 12 }, () => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'ni-year-month cursor-interaction';
        const slot = document.createElement('span');
        slot.className = 'ni-year-jar-slot';
        const caption = document.createElement('span');
        caption.className = 'ni-year-month-label';
        button.append(slot, caption);
        return { button, caption, jar: new window.NotchHydroMonthJar(slot, 2), tiles: [] };
      });
      grid.replaceChildren(...this.months.map(month => month.button));
    }

    update() {
      const insights = this.insights, owner = insights.owner;
      const year = insights.interval.start.slice(0, 4), seed = owner.collectionProfile.seed;
      const key = ['year', year, seed, owner.english, owner.reduced].join(':');
      if (this.days === insights.days && insights.previewKey === key) {
        insights.amberThumbnails?.resume();
        this.resumeMonth();
        return;
      }
      if (insights.previewKey !== key) this.returningMonth = null;
      const groups = this.months.map(() => []);
      for (const day of insights.days) {
        if (day.date.startsWith(year + '-') && day.date >= M.earliest && day.date <= M.today && day.progress >= 1) {
          groups[Number(day.date.slice(5, 7)) - 1].push(day);
        }
      }
      const pending = [];
      this.grid.setAttribute('aria-label', insights.text(year + '年的琥珀收藏', 'Amber collection for ' + year));
      this.months.forEach((entry, index) => {
        const month = `${year}-${String(index + 1).padStart(2, '0')}`;
        const current = M.today.slice(0, 7), future = month > current;
        const days = groups[index], count = days.length;
        const label = M.monthLabel(month, owner.english);
        const description = future ? insights.text('尚未到来', 'Upcoming') :
          insights.text(`${count} 颗琥珀`, count + (count === 1 ? ' amber stone' : ' amber stones'));
        const { button, caption, jar } = entry;
        button.disabled = future || month < M.earliest.slice(0, 7);
        button.dataset.yearMonth = month;
        if (month === current) button.setAttribute('aria-current', 'date');
        else button.removeAttribute('aria-current');
        button.setAttribute('aria-label', label + insights.text('，', ', ') + description);
        caption.textContent = owner.english ? label.split(' ')[0] : (index + 1) + '月';
        jar.container.setAttribute('aria-hidden', 'true');

        const signature = JSON.stringify([seed, month, days.map(day => [day.date, day.color.amber, day.shape])]);
        if (signature !== entry.signature) {
          const earned = days.map(day => ({ day, shape: owner.collectionRecord(day.date) }));
          entry.tiles = jar.update(earned, label, seed, 64);
          entry.signature = signature;
          jar.artwork.style.transform = '';
        }
        const state = insights.jarSessions?.get(seed + ':' + month + '-01');
        if (state) jar.paintMotion(state, owner.reduced);
        for (const tile of entry.tiles) {
          if (tile.canvas.dataset.renderer !== 'webgl') pending.push(tile);
        }
      });
      // Keep completed yearly stills when a month is revisited. The shared
      // thumbnail renderer stops requesting frames when it reaches the last stone.
      insights.updateAmberThumbnails(pending);
      insights.previewKey = key;
      this.days = insights.days;
      this.resumeMonth();
    }

    // Only the jar just carried back to the shelf finishes its existing roll.
    resumeMonth(month = this.returningMonth) {
      if (!month) return;
      const insights = this.insights, viewer = insights.jarViewer;
      const key = insights.owner.collectionProfile.seed + ':' + month + '-01';
      const entry = this.months.find(({ button }) => button.dataset.yearMonth === month);
      const state = insights.jarSessions?.get(key);
      if (!entry || !viewer || !state || (state.motion.sleeping && !state.x && !state.y && !state.vx && !state.vy)) {
        this.returningMonth = null;
        return;
      }
      this.returningMonth = month;
      if (viewer.jar !== entry.jar || viewer.tiles !== entry.tiles) viewer.bindMonth(key, entry.jar, entry.tiles);
      else viewer.resume();
    }
  };
})();
