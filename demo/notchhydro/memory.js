/* Prototype-only, in-memory daily color snapshots. Dates are explicit demo data. */
(() => {
  'use strict';
  const { drinks, palette, rgba, clamp } = window.NotchHydroFluid;
  const design = window.NotchHydroTokens.memory;
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const waterHabitWeek = '2026-10-05';
  const waterHabitMonth = waterHabitWeek.slice(0, 7);
  const waterHabitServings = [
    ['07:30', 250], ['09:20', 300], ['10:45', 250], ['12:20', 250],
    ['14:00', 300], ['15:40', 250], ['17:50', 300], ['20:00', 200]
  ];
  const dateKey = date => date.toISOString().slice(0, 10);
  const parse = date => new Date(date + 'T12:00:00Z');
  const addDays = (date, count) => { const d = parse(date); d.setUTCDate(d.getUTCDate() + count); return dateKey(d); };
  const monthDates = month => {
    const [year, m] = month.slice(0, 7).split('-').map(Number), length = new Date(Date.UTC(year, m, 0)).getUTCDate();
    return Array.from({ length }, (_, i) => `${year}-${String(m).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`);
  };
  const validDate = date => /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(parse(date).valueOf()) && dateKey(parse(date)) === date;
  function snapshot(date, records, goal = 2000, profileId) {
    const copy = records.filter(r => Number.isFinite(r.raw) && r.raw > 0).map(r =>
      Object.freeze({ drink: r.drink, raw: r.raw, effective: r.effective ?? Math.round(r.raw * r.drink.factor),
        ...(r.time ? { time: r.time } : {}) }));
    const groups = new Map();
    for (const r of copy) {
      const group = groups.get(r.drink.id) || { drink: r.drink, raw: 0 };
      groups.set(r.drink.id, { drink: r.drink, raw: group.raw + r.raw });
    }
    const color = palette(copy, null);
    if (color) {
      for (const channels of [color.top, color.reference, color.bottom, color.amber.linearTransmittance]) Object.freeze(channels);
      Object.freeze(color.amber);
      Object.freeze(color);
    }
    const total = copy.reduce((sum, r) => sum + r.effective, 0);
    const progress = goal > 0 ? clamp(total / goal) : 0;
    const shape = profileId && progress >= 1 ? window.NotchHydroCollection.earn(profileId, date) : null;
    return Object.freeze({ date, records: Object.freeze(copy), total, goal, progress, color, shape,
      drinks: Object.freeze([...groups.values()].map(Object.freeze)) });
  }
  // Seeded illustrative history; the six previously reviewed days take priority.
  // This does not read, infer or create any actual user history.
  let past, waterHabitPast;
  function waterHabitDay(date) {
    const day = Number(date.slice(-2));
    const alternative = { 17: 'tea', 26: 'juice' }[day];
    const otherDrink = alternative && drinks.find(drink => drink.id === alternative);
    const servings = waterHabitServings.map(([time, raw], index) => {
      if (otherDrink && (index === 2 || index === 5)) {
        return { time, drink: otherDrink, raw: otherDrink.id === 'juice' ? 200 : raw };
      }
      return { time, drink: drinks[0], raw: index === 7 ? raw + (day % 3) * 50 : raw };
    });
    return snapshot(date, servings);
  }
  function archive(records, goal = 2000, profileId, scene) {
    if (!past) {
      const fixed = new Map(design.history.map(day => [day.date, day])); past = [];
      for (let date = design.historyStart; date < design.today; date = addDays(date, 1)) {
        const day = fixed.get(date);
        if (day) { past.push(snapshot(date, day.drinks.map(([id, raw]) => ({ drink: drinks.find(d => d.id === id), raw })), day.goal ?? 2000)); continue; }
        const [year, month, n] = date.split('-').map(Number);
        let seed = (Math.imul(year * 372 + month * 31 + n + design.demoSeed, 1664525) + 1013904223) >>> 0;
        seed = (seed ^ seed >>> 16) >>> 0;
        let sample = [];
        if (seed % 13 !== 0) {
          const type = (month + (seed % 7 === 0 ? 1 : 0)) % drinks.length;
          sample = [{ drink: drinks[0], raw: 850 + seed % 6 * 150 + (seed % 4 === 0 ? 600 : 0) }];
          if (type) sample.push({ drink: drinks[type], raw: (type === 2 ? 200 : 350) + seed % 3 * 100 });
        }
        past.push(snapshot(date, sample));
      }
      Object.freeze(past);
    }
    let history = past;
    if (scene === 'water-habit') {
      waterHabitPast ||= Object.freeze(past.map(day => day.date.startsWith(waterHabitMonth) ? waterHabitDay(day.date) : day));
      history = waterHabitPast;
    }
    return [...history, snapshot(design.today, records, goal, profileId)];
  }
  const week = (records, goal = 2000) => archive(records, goal).slice(-7);
  function monthSummary(days, month, now = design.today) {
    const elapsed = monthDates(month).filter(date => date <= now), included = days.filter(d => d.date.startsWith(month) && d.date <= now);
    const combined = snapshot(month, included.flatMap(d => d.records), elapsed.reduce((sum, date) => sum + (included.find(d => d.date === date)?.goal ?? 2000), 0));
    return Object.freeze({ ...combined, kind: 'month', elapsedDays: elapsed.length,
      progress: elapsed.length ? included.reduce((sum, d) => sum + d.progress, 0) / elapsed.length : 0,
      goalDays: included.filter(d => d.goal > 0 && d.total >= d.goal).length,
      recordedDays: included.filter(d => d.records.length).length, future: month > now.slice(0, 7) });
  }
  function orderedWeekdays(weekStartsOnMonday = true) {
    return weekStartsOnMonday ? [1, 2, 3, 4, 5, 6, 7] : [7, 1, 2, 3, 4, 5, 6];
  }
  function weekdayHeadings(english, weekStartsOnMonday = true) {
    const labels = english ? 'MTWTFSS' : '一二三四五六日';
    return orderedWeekdays(weekStartsOnMonday).map(day => labels[day - 1]);
  }
  function weekdayColumn(date, weekStartsOnMonday = true) {
    return (parse(date).getUTCDay() + (weekStartsOnMonday ? 6 : 0)) % 7;
  }
  function entries(days, range, cursor, weekStartsOnMonday = true) {
    if (range === 'year') return Array.from({ length: 12 }, (_, i) => monthSummary(days, `${cursor.slice(0, 4)}-${String(i + 1).padStart(2, '0')}`));
    const dates = range === 'month' ? monthDates(cursor) : Array.from({ length: 7 }, (_, i) => addDays(cursor, i - 6));
    const map = new Map(days.map(day => [day.date, day]));
    const cells = dates.map(date => ({ ...(map.get(date) || snapshot(date, [])), kind: 'day', future: date > design.today }));
    if (range === 'month') {
      const leading = weekdayColumn(dates[0], weekStartsOnMonday);
      cells.unshift(...Array(leading).fill(null));
      while (cells.length % 7) cells.push(null);
    }
    return cells;
  }
  function navigate(range, cursor, offset) {
    if (range === 'week') {
      const date = addDays(cursor, offset * 7), minimum = addDays(design.historyStart, 6);
      return date < minimum ? minimum : date > design.today ? design.today : date;
    }
    const [year, month] = cursor.split('-').map(Number);
    const next = range === 'month' ? dateKey(new Date(Date.UTC(year, month - 1 + offset, 1, 12))) : `${year + offset}-01-01`;
    const prefix = range === 'month' ? 7 : 4;
    if (next.slice(0, prefix) < design.historyStart.slice(0, prefix) || next.slice(0, prefix) > design.today.slice(0, prefix)) return cursor;
    return next;
  }
  const swatch = day => day.color ? `linear-gradient(160deg,${rgba(day.color.top)} 0%,${rgba(day.color.reference)} 50%,${rgba(day.color.bottom)} 100%)` : 'none';
  const dateLabel = (date, english) => {
    const [, month, day] = date.split('-').map(Number);
    return english ? `${months[month - 1]} ${day}` : `${month}月${day}日`;
  };
  const monthLabel = (month, english) => english ? `${months[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}` : `${month.slice(0, 4)}年${Number(month.slice(5, 7))}月`;
  function periodLabel(range, cursor, english) {
    if (range === 'year') return cursor.slice(0, 4) + (english ? '' : '年');
    if (range === 'month') return monthLabel(cursor, english);
    const first = addDays(cursor, -6);
    if (first.slice(0, 7) === cursor.slice(0, 7)) return english ? `${dateLabel(first, true)}–${Number(cursor.slice(-2))}` : `${Number(cursor.slice(5, 7))}月${Number(first.slice(-2))}–${Number(cursor.slice(-2))}日`;
    return `${dateLabel(first, english)}–${dateLabel(cursor, english)}`;
  }
  window.NotchHydroMemory = { snapshot, archive, week, monthSummary, entries, navigate, swatch, dateLabel, monthLabel, periodLabel, monthDates, addDays, validDate, orderedWeekdays, weekdayHeadings, weekdayColumn, waterHabitWeek, today: design.today, earliest: design.historyStart };
})();
