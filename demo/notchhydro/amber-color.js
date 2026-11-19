/* Prototype color model. Public RGB samples are encoded sRGB in the 0–255 range. */
(() => {
  'use strict';

  const clamp = x => Math.max(0, Math.min(1, x));
  const chroma = rgb => Math.max(...rgb) - Math.min(...rgb);
  const decode = x => x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4;
  const encode = x => x <= .0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - .055;
  const interpolate = (a, b, t) => a + (b - a) * t;
  function smooth(from, to, value) {
    const x = clamp((value - from) / (to - from));
    return x * x * (3 - 2 * x);
  }

  // HSL hue is in degrees, saturation and lightness in [0, 1].
  function toRGB([h, s, l]) {
    const amplitude = s * Math.min(l, 1 - l);
    return [0, 8, 4].map(offset => {
      const k = ((offset + h / 30) % 12 + 12) % 12;
      return l - amplitude * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    });
  }

  function toHSL(bytes) {
    const [r, g, b] = bytes.map(x => clamp(x / 255));
    const hi = Math.max(r, g, b), lo = Math.min(r, g, b);
    const c = hi - lo, l = (hi + lo) / 2;
    if (!c) return [0, 0, l];
    let sector;
    if (hi === r) sector = (g - b) / c;
    else if (hi === g) sector = 2 + (b - r) / c;
    else sector = 4 + (r - g) / c;
    return [(sector * 60 + 360) % 360, c / (1 - Math.abs(2 * l - 1)), l];
  }

  const water = [200, .8, .85], coffee = [25, .65, .35], juice = [15, .85, .6];
  const presets = new Map(Object.entries({
    water, coffee, juice, tea: juice, milk: [40, .3, .9], soda: toHSL([167, 139, 250])
  }));

  function drinkColor(drink) {
    if (!drink) return null;
    let hex = drink.customColorHex;
    if (typeof hex === 'string' && /^#?[0-9a-f]{6}$/i.test(hex)) hex = parseInt(hex.replace('#', ''), 16);
    if (Number.isInteger(hex) && hex >= 0 && hex <= 0xffffff) {
      return toHSL([hex >> 16, (hex >> 8) & 255, hex & 255]);
    }
    if (presets.has(drink.id)) return presets.get(drink.id);
    return Array.isArray(drink.top) && drink.top.length === 3 && drink.top.every(Number.isFinite)
      ? toHSL(drink.top) : null;
  }

  // An achromatic endpoint carries the other endpoint's hue. At 180 degrees
  // keep the signed difference (20 ↔ 200 passes through yellow/green).
  function arcHue(a, b, t) {
    if (!a[1]) return b[0];
    if (!b[1]) return a[0];
    let delta = b[0] - a[0];
    if (Math.abs(delta) > 180 + 1e-10) delta -= Math.sign(delta) * 360;
    return (a[0] + t * delta + 360) % 360;
  }

  function hueWeight([, s, l]) {
    return Math.min(1, (1 - Math.abs(2 * l - 1)) * s / .15);
  }

  function equalAnchor(colors) {
    if (colors.length === 1) return colors[0];
    const n = colors.length;
    const s = colors.reduce((sum, hsl) => sum + hsl[1], 0) / n;
    const l = colors.reduce((sum, hsl) => sum + hsl[2], 0) / n;
    let hue;
    if (n === 2) {
      const [a, b] = colors;
      const wa = hueWeight(a), wb = hueWeight(b);
      hue = arcHue(a, b, wa + wb > 0 ? wb / (wa + wb) : .5);
    } else {
      // The reviewed water/coffee/juice anchor is coral (20°). Other equal
      // sets use the same original circular mean, attenuating near-neutral votes.
      let x = 0, y = 0, dominant = colors[0];
      for (const hsl of colors) {
        const w = hueWeight(hsl), rad = hsl[0] * Math.PI / 180;
        x += w * Math.cos(rad);
        y += w * Math.sin(rad);
        if (w > hueWeight(dominant) || (w === hueWeight(dominant) && hsl[0] < dominant[0])) dominant = hsl;
      }
      hue = Math.hypot(x, y) <= 1e-12 ? dominant[0] : (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
    }
    return [hue, s, l];
  }

  // Rank volumes once. Equal shares form one subset; zero-weight subsets
  // disappear automatically on a boundary between two rank orderings.
  function recipeAnchors(records) {
    const groups = new Map();
    let total = 0;
    for (const record of records) {
      if (!Number.isFinite(record?.raw) || record.raw <= 0) continue;
      const color = drinkColor(record.drink);
      if (!color) continue;
      const key = color.join(',');
      if (!groups.has(key)) groups.set(key, { color, ml: 0 });
      groups.get(key).ml += record.raw;
      total += record.raw;
    }
    const ranked = [...groups.values()].sort((a, b) =>
      b.ml - a.ml || a.color[0] - b.color[0] || a.color[1] - b.color[1] || a.color[2] - b.color[2]);
    const anchors = [], colors = [];
    for (let i = 0; i < ranked.length; i++) {
      colors.push(ranked[i].color);
      const excess = ranked[i].ml - (ranked[i + 1]?.ml ?? 0);
      if (excess > 0) anchors.push({ color: equalAnchor(colors), weight: (i + 1) * excess / total });
    }
    return anchors;
  }

  // Each edge follows its HSL arc. In the interior the product of endpoint
  // weights makes the contribution vanish continuously at the opposite face.
  function mix(records) {
    const anchors = recipeAnchors(records);
    if (!anchors.length) return null;
    let rgb = [0, 0, 0], expectedChroma = 0, weightSum = 0;
    if (anchors.length === 1) {
      rgb = toRGB(anchors[0].color);
    } else {
      for (let i = 0; i < anchors.length; i++) {
        const a = anchors[i];
        for (let j = i + 1; j < anchors.length; j++) {
          const b = anchors[j];
          const t = b.weight / (a.weight + b.weight);
          const weight = a.weight * b.weight;
          const edge = toRGB([arcHue(a.color, b.color, t),
            interpolate(a.color[1], b.color[1], t), interpolate(a.color[2], b.color[2], t)]);
          edge.forEach((c, k) => { rgb[k] += c * weight; });
          expectedChroma += chroma(edge) * weight;
          weightSum += weight;
        }
      }
      rgb = rgb.map(c => c / weightSum);
      expectedChroma /= weightSum;
    }

    // Reduce only the shared optical density lost to cancellation. A neutral
    // source, or a single vivid edge, does not trigger this correction.
    const removal = expectedChroma > 0
      ? .55 * (1 - smooth(0, .60, chroma(rgb) / expectedChroma)) * smooth(.05, .15, expectedChroma) : 0;
    const peak = decode(Math.max(...rgb));
    const gain = peak > 0 ? peak ** -removal : 1;
    const linearTransmittance = rgb.map(c => clamp(decode(c) * gain));
    return { referenceRGB: linearTransmittance.map(c => 255 * encode(c)), linearTransmittance };
  }

  function transmittedRGB(mixture, relativeThickness = 1) {
    if (!Number.isFinite(relativeThickness) || relativeThickness < 0) throw new RangeError('Expected nonnegative finite thickness');
    return mixture && mixture.linearTransmittance.map(t => 255 * encode(t ** relativeThickness));
  }

  // Pass attenuationColor to THREE.Color.setRGB(...channels) in linear sRGB.
  // Reference thickness and material thickness share the model's length unit.
  function materialParameters(mixture, referenceThickness = 1) {
    if (!Number.isFinite(referenceThickness) || referenceThickness <= 0) throw new RangeError('Expected positive finite reference thickness');
    return mixture && { color: 0xffffff, attenuationColor: [...mixture.linearTransmittance], attenuationDistance: referenceThickness };
  }

  const api = { mix, transmittedRGB, materialParameters };
  if (typeof window !== 'undefined') window.NotchHydroAmber = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
