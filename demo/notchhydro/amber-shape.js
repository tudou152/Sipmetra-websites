/* The collection seed selects a starting point in the calendar's sequence of pebbles. */
(() => {
  'use strict';

  const original = Object.freeze({ radii: Object.freeze([1.07, .80, .69]), roundness: 2.55, lean: .10, shoulder: 0 });
  const view = Object.freeze({ rotation: Object.freeze([.27, -.34, -.19]), settledTurn: .185,
    presentationTilt: Math.PI / 18, cameraZ: 4.75, fov: 32 });

  const version = 1;
  const validSeed = seed => typeof seed === 'string' && /^[0-9a-f]{32}$/.test(seed);

  // Mix all four 32-bit seed words for the smaller surface details. The first
  // word also serves as a uniform phase offset in the low-discrepancy width sequence.
  function detailSeed(seed) {
    let bits = 0;
    for (let offset = 0; offset < 32; offset += 8) {
      bits = Math.imul(bits ^ parseInt(seed.slice(offset, offset + 8), 16), 0x85ebca6b);
      bits ^= bits >>> 13;
    }
    return bits;
  }

  function forDay(day, seed) {
    if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return original;
    const utc = Date.parse(day + 'T00:00:00Z');
    if (!Number.isFinite(utc) || new Date(utc).toISOString().slice(0, 10) !== day) return original;
    const ordinal = utc / 86400000;
    // Spread neighboring dates between a plump pebble and a low, rounded oval.
    const personalized = validSeed(seed);
    const phase = personalized ? parseInt(seed.slice(0, 8), 16) : 0;
    const widthRank = ((Math.imul(ordinal, 0x9e3779b9) + phase) >>> 0) / 4294967296;
    const elongation = widthRank * widthRank * (3 - 2 * widthRank);
    let bits = personalized ? ordinal ^ detailSeed(seed) : ordinal;
    function sample() {
      bits = (bits + 0x6d2b79f5) | 0;
      let x = Math.imul(bits ^ bits >>> 15, bits | 1);
      x ^= x + Math.imul(x ^ x >>> 7, x | 61);
      return ((x ^ x >>> 14) >>> 0) / 4294967296;
    }
    const shape = {
      radii: [
        .90 + .31 * elongation,
        .90 - .40 * elongation,
        (.78 - .15 * elongation) * (.96 + .08 * sample())
      ],
      roundness: 2.02 + .26 * elongation + .20 * sample(),
      lean: .19 * (sample() - .5),
      shoulder: .30 * (sample() - .5)
    };
    if (personalized) shape.version = version;
    return shape;
  }

  // Keep the version 1 surface contract when introducing future generators.
  function isValid(shape) {
    return shape?.version === 1 && Array.isArray(shape.radii) && shape.radii.length === 3 &&
      shape.radii.every(radius => Number.isFinite(radius) && radius >= .4 && radius <= 1.3) &&
      Number.isFinite(shape.roundness) && shape.roundness >= 2 && shape.roundness <= 3 &&
      Number.isFinite(shape.lean) && Math.abs(shape.lean) <= .15 &&
      Number.isFinite(shape.shoulder) && Math.abs(shape.shoulder) <= .23;
  }

  // Map a unit direction to a point on the same smooth shell in every renderer.
  function surfacePoint(shape, x, y, z, out) {
    const p = shape.roundness;
    const round = (Math.abs(x) ** p + Math.abs(y) ** p + Math.abs(z) ** p) ** (-1 / p);
    const radius = round * (1 + .055 * x * y - .075 * y * z + .045 * Math.sin(3.4 * x + 1.1 * z) * Math.cos(3 * y));
    out.x = shape.radii[0] * (x * radius + .09 * y * y - .06 * z * y);
    out.y = shape.radii[1] * (y * (radius + shape.shoulder * x) + shape.lean * x - .065 * x * x);
    out.z = shape.radii[2] * (z * radius - .085 * x * y);
    return out;
  }

  const api = { forDay, surfacePoint, view, version, validSeed, isValid };
  if (typeof window !== 'undefined') window.NotchHydroShape = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
