/* Two local demo collections. The seed and each earned day's geometry survive a replay. */
(() => {
  'use strict';
  const shapes = window.NotchHydroShape;
  const prefix = 'notchhydro.prototype.amber.';
  const stonePrefix = prefix + 'stone.';
  const ids = ['a', 'b'];
  const params = typeof URLSearchParams === 'function' ? new URLSearchParams(window.location?.search) : null;
  const read = key => {
    try { return window.localStorage?.getItem(key) ?? null; } catch { return null; }
  };
  function write(key, value) {
    try { window.localStorage?.setItem(key, value); } catch { /* In restricted embeds, keep the in-memory collection. */ }
  }
  function newSeed() {
    const words = new Uint32Array(4);
    if (window.crypto?.getRandomValues) window.crypto.getRandomValues(words);
    else for (let i = 0; i < words.length; i++) words[i] = Math.floor(Math.random() * 4294967296);
    return Array.from(words, word => word.toString(16).padStart(8, '0')).join('');
  }

  // A link carries both identities so separately opened file:// pages agree.
  // An explicitly linked collection can coexist with the device's default pair.
  const linked = ids.map(id => params?.get('seed' + id.toUpperCase()));
  const hasLinkedPair = linked.every(shapes.validSeed) && linked[0] !== linked[1];
  const bindings = ids.map(id => read(prefix + 'user.' + id));
  const usesDevicePair = !hasLinkedPair ||
    !bindings.some((seed, index) => shapes.validSeed(seed) && seed !== linked[index]);
  const users = [];
  for (const [index, id] of ids.entries()) {
    const stored = bindings[index];
    let seed = hasLinkedPair ? linked[index] : stored;
    if (!shapes.validSeed(seed) || users.some(user => user.seed === seed)) seed = newSeed();
    if (usesDevicePair && stored !== seed) write(prefix + 'user.' + id, seed);
    users.push(Object.freeze({ id, name: '用户 ' + id.toUpperCase(), seed }));
  }
  Object.freeze(users);
  let active = params?.get('user');
  if (ids.includes(active)) {
    if (usesDevicePair) write(prefix + 'active', active);
  } else {
    const last = read(prefix + 'active');
    active = ids.includes(last) ? last : ids[0];
  }
  function select(id) {
    if (!ids.includes(id)) return;
    active = id;
    if (usesDevicePair) write(prefix + 'active', id);
  }
  function linkParams(target) {
    target.set('user', active);
    for (const user of users) target.set('seed' + user.id.toUpperCase(), user.seed);
    return target;
  }

  const entries = new Map();
  function freeze(shape) {
    Object.freeze(shape.radii);
    return Object.freeze(shape);
  }
  function readStone(key) {
    try {
      return JSON.parse(read(key));
    } catch { return null; }
  }
  function entry(id, day) {
    const user = users.find(user => user.id === id);
    if (!user) throw new RangeError('Unknown amber collection');
    const key = stonePrefix + user.seed + '.' + day;
    if (!entries.has(key)) {
      const stored = readStone(key);
      const earned = shapes.isValid(stored);
      const shape = earned ? stored : shapes.forDay(day, user.seed);
      entries.set(key, { key, shape: freeze(shape), earned });
    }
    return entries.get(key);
  }
  function earn(id, day) {
    const record = entry(id, day);
    if (record.earned || !shapes.isValid(record.shape)) return record.shape;
    // Check again at award time, since another tab may have committed this day.
    const stored = readStone(record.key);
    if (shapes.isValid(stored)) record.shape = freeze(stored);
    else if (Number.isSafeInteger(stored?.version) && stored.version > shapes.version) return record.shape;
    else write(record.key, JSON.stringify(record.shape));
    record.earned = true;
    return record.shape;
  }
  function saved(id, day) {
    const record = entry(id, day);
    return record.earned ? record.shape : null;
  }
  window.addEventListener?.('storage', event => {
    if (event.key === null) entries.clear();
    else if (event.key.startsWith(stonePrefix)) entries.delete(event.key);
  });
  window.NotchHydroCollection = {
    users, select, activeId: () => active, linkParams, saved, earn,
    shapeFor: (id, day) => entry(id, day).shape
  };
})();
