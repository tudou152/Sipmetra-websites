/* Canvas water physics with the prototype's amber transmission palette. */
(() => {
  'use strict';
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const smooth = (a, b, x) => { const p = clamp((x - a) / (b - a)); return p * p * (3 - 2 * p); };
  const rgb = hex => [hex >> 16 & 255, hex >> 8 & 255, hex & 255];
  const mix = (a, b, p) => a.map((v, i) => v + (b[i] - v) * clamp(p));
  const rgba = (c, a = 1) => `rgba(${c.map(x => Math.round(x)).join(',')},${clamp(a)})`;
  function waterlineY(ratio, height, goalY, ceilingY = goalY) {
    const depthAtGoal = height - goalY;
    const headroom = goalY - ceilingY;
    if (ratio <= 1 || headroom <= 0) return height - clamp(ratio) * depthAtGoal;
    // Match the pre-goal slope at 100%, then spend progressively less of the remaining space.
    return ceilingY + headroom * Math.exp(-(ratio - 1) * depthAtGoal / headroom);
  }
  function residualDropGeometry(drop, width, surfaceY) {
    const q = clamp(drop.progress), halfHeight = drop.radius * (1.18 + .08 * q);
    const startY = drop.startY, endY = Math.max(startY, surfaceY - halfHeight);
    return { x: width / 2, y: startY + (endY - startY) * q * q, halfHeight, travel: endY - startY };
  }
  // All times are measured from the final drop's impact, in seconds.
  const goalTiming = window.NotchHydroTokens.proposed.goalTiming;
  function formationFrame(age, width, impactY, waterY, spaceScale, reduced) {
    const settled = age === null || reduced || age >= goalTiming.settled;
    if (!settled && age < goalTiming.emergence) return null;
    const t = settled ? goalTiming.settled : age;
    const rise = smooth(goalTiming.emergence, goalTiming.crystallize, t);
    const stretch = smooth(1.21, 1.36, t) * (1 - smooth(1.38, goalTiming.neckBreak, t));
    const spring = Math.sin(Math.PI * smooth(goalTiming.neckBreak, goalTiming.settled, t));
    const crystallization = smooth(goalTiming.crystallize, goalTiming.crystalEnd, t);
    const beadSize = .88 - .70 * (1 - smooth(goalTiming.emergence, goalTiming.neckBreak, t)) + .12 * crystallization;
    // After the neck pinches off, both axes are equal while the bead is in flight.
    return {
      x: width / 2, y: (impactY + spaceScale) * (1 - rise) + (waterY - 28 * spaceScale) * rise - 5 * spring * spaceScale,
      scaleX: (beadSize - .09 * stretch) * spaceScale, scaleY: (beadSize + .16 * stretch) * spaceScale,
      opacity: smooth(goalTiming.emergence, goalTiming.goldEnd, t), turn: window.NotchHydroShape.view.settledTurn * crystallization,
      glint: smooth(1.17, 1.25, t) * (1 - smooth(1.26, 1.43, t)),
      neck: smooth(1.20, 1.30, t) * (1 - smooth(1.42, goalTiming.neckBreak, t)),
      crystallization, settled, phase: settled ? 'settled' : t < goalTiming.crystallize ? 'emerging' : 'settling'
    };
  }
  function affirmationFrame(time, event, reduced) {
    const design = window.NotchHydroTokens.affirmation;
    const age = event ? time - event.at : -1, profile = event && design[event.kind];
    if (reduced || !profile || age < 0 || age >= design.duration) return { strength: 0, spread: 0 };
    return { strength: smooth(0, .18, age) * (1 - smooth(.45, design.duration, age)),
      spread: smooth(0, design.spreadDuration, age), ...profile };
  }
  const Amber = window.NotchHydroAmber;
  function palette(records, fallback) {
    const amber = Amber.mix(records);
    if (!amber) return fallback;
    let amount = 0, opacityMass = 0;
    for (const { drink, raw } of records) {
      if (!drink || !Number.isFinite(raw) || raw <= 0) continue;
      amount += raw;
      opacityMass += raw * (drink.opacity ?? .85);
    }
    return { top: Amber.transmittedRGB(amber, .5), reference: amber.referenceRGB,
      bottom: Amber.transmittedRGB(amber, 2), opacity: opacityMass / amount, amber };
  }
  const drinks = [
    { id: 'water', name: '水', en: 'Water', factor: 1, dot: '#38BDF8', opacity: .85 },
    { id: 'tea', name: '茶', en: 'Tea', factor: .95, dot: '#A3E635', opacity: .78 },
    { id: 'coffee', name: '咖啡', en: 'Coffee', factor: .8, dot: '#C27830', opacity: .86 },
    { id: 'juice', name: '果汁', en: 'Juice', factor: .9, dot: '#FB923C', opacity: .84 },
    { id: 'soda', name: '碳酸饮料', en: 'Soda', factor: 1, dot: '#A78BFA', opacity: .82, bubbles: true }
  ].map(drink => ({ ...drink, ...palette([{ drink, raw: 1 }]) }));
  class Fluid {
    constructor(canvas) {
      this.canvas = canvas; this.ctx = canvas.getContext('2d');
      this.phase = 0; this.amplitude = 2.3; this.stream = 0; this.drops = [];
      this.nodes = Array.from({ length: 48 }, () => ({ d: 0, v: 0 }));
      this.seed = 42; this.lastPointer = null; this.settledAt = -100;
    }
    random() { this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0; return this.seed / 4294967296; }
    reset() { this.phase = 0; this.amplitude = 2.3; this.stream = 0; this.drops = []; this.nodes.forEach(n => { n.d = 0; n.v = 0; }); this.lastPointer = null; this.lastSurfaceY = this.impactY = this.impactAt = null; this.cancelEnding(); }
    cancelEnding() { this.settledAt = -100; this.endingFrame = { phase: 'idle', quiet: 0, rebound: 0 }; }
    disturb(x, dx, width) {
      const center = Math.floor(clamp(x / width, 0, .999) * 48), impulse = clamp(dx * 2.6, -75, 75);
      for (let o = -3; o <= 3; o++) if (this.nodes[center + o]) this.nodes[center + o].v += impulse * Math.exp(-o * o / 3.5);
    }
    pointer(p, baseY, width, color, reduced) {
      if (this.lastPointer && !reduced) {
        const dx = p.x - this.lastPointer.x, distance = Math.abs(p.y - baseY);
        this.disturb(p.x, dx * (distance < 42 ? 1.15 : .45), width);
        if (Math.abs(dx) > 5 && distance < 30 && this.random() < .35) this.drops.push({ x: p.x, y: baseY, vx: dx * 1.4 + (this.random() - .5) * 24, vy: -18 - this.random() * 26, radius: 1.1 + this.random() * 1.1, life: .75, color, surface: true });
      }
      this.lastPointer = p;
    }
    ripple(x, width) { const a = clamp(x / width, 0, .999) * 47, i = Math.floor(a); return this.nodes[i].d + (this.nodes[Math.min(47, i + 1)].d - this.nodes[i].d) * (a - i); }
    complete(time, width, baseY, color, refined, reduced) {
      if (!refined || reduced) return;
      this.settledAt = time;
      // The last residual drop arrives at completion; no more drops after the chime.
      this.drops = this.drops.filter(drop => drop.surface);
      this.stream = 0;
    }
    completionFrame(time, p) {
      const d = window.NotchHydroTokens.proposed;
      const neutral = { phase: p.pouring ? 'pouring' : 'idle', quiet: 0, close: 0, drops: [], age: -1, rebound: 0, ring: 0 };
      if (!p.refined || p.reduced) return neutral;
      const sequence = d.dropSequence;
      const firstDropAt = Math.min(...sequence.map(drop => 1 - drop.arriveBeforeEnd - drop.flightDuration));
      const progress = p.pouring ? clamp(p.pourProgress) : 1 + time - this.settledAt;
      // The first two arrivals disturb the surface gently; completion remains one event.
      const earlyRebound = sequence.reduce((sum, drop) => {
        const elapsed = progress - (1 - drop.arriveBeforeEnd);
        return drop.arriveBeforeEnd > 0 && elapsed >= 0 && elapsed < .26
          ? sum - Math.sin(Math.PI * elapsed / .26) * Math.exp(-elapsed * 3) * drop.radiusScale : sum;
      }, 0);
      if (p.pouring) {
        const close = smooth(1 - d.tailDuration, firstDropAt, progress);
        const phase = progress >= firstDropAt ? 'drop' : close > 0 ? 'closing' : 'pouring';
        const drops = sequence.flatMap((drop, index) => {
          const arrival = 1 - drop.arriveBeforeEnd;
          const emitted = arrival - drop.flightDuration;
          if (progress < emitted || progress >= arrival) return [];
          const q = clamp((progress - emitted) / drop.flightDuration);
          return [{ index, progress: q, radius: d.dropRadius * drop.radiusScale, startY: d.inflowStartY, opacity: 1 }];
        });
        return { ...neutral, phase, close, quiet: smooth(1 - d.tailDuration - .12, firstDropAt, progress), drops, rebound: earlyRebound };
      }
      const age = time - this.settledAt;
      if (age < 0 || age >= d.settleDuration || p.goalCelebrating) return neutral;
      const rebound = age <= d.reboundDuration
        ? -d.reboundAmplitude * Math.sin(Math.PI * age / d.reboundDuration) * (1 - .22 * age / d.reboundDuration)
        : d.reboundAmplitude * .16 * Math.sin(Math.PI * (age - d.reboundDuration) / (d.settleDuration - d.reboundDuration));
      return { ...neutral, phase: age < d.reboundDuration ? 'rebound' : 'settling', age, rebound: rebound + earlyRebound,
        quiet: 1 - smooth(d.reboundDuration, d.settleDuration, age), ring: Math.sin(Math.PI * clamp(age / .68)) };
    }
    goalFrame(time, p) {
      const height = p.height ?? window.NotchHydroTokens.height;
      const age = p.goalAt == null ? null : Math.max(0, time - p.goalAt);
      const rev = p.reverse && time - p.reverse.at < .55 ? p.reverse : null;
      const reversal = rev ? 1 - smooth(0, .55, time - rev.at) : 0;
      if (p.formGoalAmber) {
        const impactY = this.impactY ?? p.baseY;
        const top = p.safeAreaTop ? p.safeAreaTop + 2 : 0;
        // Scale the whole lift about the waterline when a crossing cup leaves less room below the camera.
        const spaceScale = clamp((p.baseY - top) / (p.fullY - top));
        const formation = p.reached && !rev ? formationFrame(age, p.width, impactY, p.baseY, spaceScale, p.reduced) : null;
        if (p.reduced || (!rev && (!p.reached || age === null))) {
          return { age: null, surfaceAge: null, scale: 1, gold: 0, reveal: 0, radius: 0, impactY,
            attack: 0, surface: 0, solid: false, rim: 0, goldPhase: 'clear', formation };
        }
        const maxRadius = Math.hypot(p.width / 2, (height - impactY) / .58) + 5;
        const expand = 1 - Math.pow(1 - clamp(age / .65), 2.6);
        const reveal = rev ? rev.reveal * reversal : expand * (1 - smooth(goalTiming.holdEnd, goalTiming.goldEnd, age));
        const attack = rev ? 1 : smooth(0, .035, age);
        const gold = rev ? rev.gold * reversal : 1 - smooth(1.23, goalTiming.goldEnd, age);
        const release = smooth(goalTiming.holdEnd, .83, age) * (1 - smooth(1.25, goalTiming.goldEnd, age));
        return {
          age: rev ? null : age, surfaceAge: rev ? rev.age : age, scale: rev ? reversal : 1,
          gold, reveal, radius: maxRadius * reveal, impactY, attack,
          surface: rev ? rev.surface * reversal : gold * smooth(0, .28, age),
          solid: reveal >= 1, rim: rev ? 0 : attack * (1 - smooth(.28, .61, age)) + release,
          goldPhase: reveal <= 0 ? 'clear' : rev ? 'contract' : age < .65 ? 'expand' : age <= goalTiming.holdEnd ? 'hold' : 'contract', formation
        };
      }
      const gold = rev ? rev.gold * reversal : p.reached && age !== null && !p.reduced ? 1 - smooth(1.4, 2.3, age) : 0;
      const progress = rev ? 1 - Math.pow(1 - clamp(rev.reveal * reversal), 1 / 2.6) : age === null || p.reduced ? 0 : clamp(age / .68);
      const reveal = 1 - Math.pow(1 - progress, 2.6);
      const radius = progress > 0 ? 6 + Math.max(390 * p.width / 369, Math.hypot(p.width / 2, (height - p.baseY - 2) / .58) + 8) * reveal : 0;
      const surface = rev ? rev.surface * reversal : p.reached ? (p.reduced || age === null ? 1 : smooth(0, .28, age)) : 0;
      return { age: rev ? null : age, surfaceAge: rev ? rev.age : age, scale: rev ? reversal : 1, gold, surface, radius,
        attack: smooth(0, .055, progress), rim: p.reduced ? 0 : smooth(0, .055, progress) * (1 - smooth(.4, .64, progress)),
        solid: !rev && age !== null && age >= .68, reveal };
    }
    draw(time, dt, p) {
      const c = this.ctx, w = p.width, h = p.height ?? window.NotchHydroTokens.height, dpr = Math.min(3, window.devicePixelRatio || 2);
      const baseY = waterlineY(p.ratio, h, p.fullY, p.ceilingY);
      if (this.height != null && this.height !== h) {
        // The same recorded volume has different overflow headroom on each display.
        const delta = waterlineY(this.lastRatio, h, p.fullY, p.ceilingY) - this.baseY;
        for (const drop of this.drops) drop.y += delta;
        if (this.impactAt != null) this.impactY = waterlineY(this.impactRatio, h, p.fullY, p.ceilingY) + this.impactOffset;
      }
      if (this.canvas.width !== Math.round(w * dpr) || this.canvas.height !== Math.round(h * dpr)) {
        this.canvas.width = Math.round(w * dpr); this.canvas.height = Math.round(h * dpr);
      }
      c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, w, h);
      if (p.formGoalAmber && p.reached && p.goalAt != null && this.impactAt !== p.goalAt) {
        this.impactAt = p.goalAt;
        this.impactRatio = p.ratio;
        this.impactOffset = this.lastSurfaceY == null ? 0 : this.lastSurfaceY - this.baseY;
        this.impactY = baseY + this.impactOffset;
      }
      this.height = h; this.lastRatio = p.ratio; this.baseY = p.baseY = baseY;
      const f = this.goalFrame(time, p); this.frame = f;
      const ending = this.completionFrame(time, { ...p, goalCelebrating: f.age !== null && f.age < 2.6 });
      this.endingFrame = ending;
      // Stream, final drop and response share the original panel's center axis.
      const inflowX = w / 2;
      const pal = p.palette, incoming = p.incoming || p.drink;
      this.amplitude += ((p.pouring ? 7.2 : 2.3) - this.amplitude) * (1 - Math.exp(-(p.pouring ? 9 : 5) * dt));
      this.phase += (p.pouring ? 6.2 : 2.6) * dt;
      this.stream = p.pouring ? Math.min(1, this.stream + 9 * dt) : Math.max(0, this.stream - 11 * dt);
      if (!p.reduced) {
        if (p.pouring && ending.quiet < .2 && this.random() < 1 - Math.pow(.35, dt * 60)) this.drops.push({ x: inflowX + (this.random() - .5) * 8, y: baseY, vx: (this.random() - .5) * 95, vy: -35 - this.random() * 55, radius: 1.5 + this.random() * 1.6, life: .9, color: incoming.top });
        for (const n of this.nodes) { n.v += (-145 * n.d - 4.6 * n.v) * dt; n.d += n.v * dt; }
        for (let loop = 0; loop < 2; loop++) this.nodes.forEach((n, i) => {
          if (i) this.nodes[i - 1].v += .22 * (n.d - this.nodes[i - 1].d) / Math.max(.008, dt) * .04;
          if (i < 47) this.nodes[i + 1].v += .22 * (n.d - this.nodes[i + 1].d) / Math.max(.008, dt) * .04;
        });
      }
      for (const d of this.drops) { d.x += d.vx * dt; d.y += d.vy * dt; d.vy += 240 * dt; d.life -= dt * 1.9; }
      this.drops = this.drops.filter(d => d.life > 0);
      const amplitude = p.reduced ? 1.2 : this.amplitude + (window.NotchHydroTokens.proposed.quietAmplitude - this.amplitude) * ending.quiet;
      const surfaceOffset = (x, back) => {
        const a = f.surfaceAge;
        if (p.reduced || a === null || a < 0 || a > 2.6) return 0;
        const localX = x / w * 369, gaussian = (center, spread) => Math.exp(-Math.pow((localX - center) / spread, 2));
        const surge = Math.exp(-a * 4.7) * Math.sin(a * 13);
        const crown = -19 * surge * gaussian(184.5, 51) + 8 * surge * (gaussian(105, 35) + gaussian(264, 35));
        const outward = Math.sin(Math.abs(localX - 184.5) / 17 - a * 13) * 3 * Math.exp(-a * 3.6) * (1 - Math.exp(-a * 14));
        return (crown + outward) * 1.1 * (1 - smooth(.92, 1.27, a)) * (back ? .65 : 1) * f.scale;
      };
      const formAge = p.formGoalAmber ? f.age : null;
      const gather = formAge === null ? 0 : smooth(1.11, goalTiming.goldEnd, formAge) * (1 - smooth(1.33, goalTiming.neckBreak, formAge));
      const lock = formAge === null ? 0 : smooth(goalTiming.holdEnd, goalTiming.emergence, formAge) * (1 - smooth(goalTiming.neckBreak, 1.83, formAge));
      const waveY = (x, back, y = baseY) => {
        const oscillation = back ? -2 + Math.sin(x / w * Math.PI * 2.2 - this.phase * .85) * amplitude * .75 + this.ripple(x, w) * .45
          : Math.sin(x / w * Math.PI * 2.6 + this.phase) * amplitude + this.ripple(x, w);
        const offset = x - inflowX;
        const crown = ending.rebound * Math.exp(-Math.pow(offset / 40, 2));
        const spread = ending.age > 0 ? Math.sin(Math.PI * clamp(ending.age / .8)) * 1.35
          * smooth(.05, .16, ending.age) * Math.exp(-Math.pow((Math.abs(offset) - ending.age * 110) / 15, 2)) : 0;
        const settle = (crown + spread) * (back ? .65 : 1);
        let level = y + oscillation + surfaceOffset(x, back) + settle;
        if (lock && y === baseY) {
          // Guide the waves back to the actual landing point as the gold recedes.
          level += (f.impactY - level) * lock * Math.exp(-(offset * offset) / 648);
          level -= (back ? 4 : 9) * gather * Math.exp(-(offset * offset) / 170);
        }
        return p.ratio <= 0 && y === baseY ? h : level;
      };
      const path = (back, close = true, y = baseY) => {
        const shape = new Path2D();
        for (let x = 0; x <= w + 3; x += 3) { const yy = waveY(x, back, y); x === 0 ? shape.moveTo(x, yy) : shape.lineTo(x, yy); }
        if (close) { shape.lineTo(w, h); shape.lineTo(0, h); shape.closePath(); } return shape;
      };
      const front = path(false), back = path(true), surface = path(false, false);
      this.lastSurfaceY = waveY(inflowX, false);
      if (p.previewAlpha > .001) {
        const targetY = waterlineY(p.previewRatio, h, p.fullY, p.ceilingY);
        if (baseY - targetY > .05) {
          const band = new Path2D(); let lower = [];
          for (let x = 0; x <= w + 3; x += 3) { const y = waveY(x, false, targetY); x === 0 ? band.moveTo(x, y) : band.lineTo(x, y); lower.push([x, waveY(x, false)]); }
          lower.reverse().forEach(([x, y]) => band.lineTo(x, y)); band.closePath();
          const preview = p.previewPalette || incoming;
          const g = c.createLinearGradient(0, targetY - 4, 0, baseY + 4); g.addColorStop(0, rgba(preview.top, .24 * p.previewAlpha)); g.addColorStop(1, rgba(preview.reference, .10 * p.previewAlpha)); c.fillStyle = g; c.fill(band);
          c.strokeStyle = `rgba(255,255,255,${.42 * p.previewAlpha})`; c.lineWidth = 1; c.stroke(path(false, false, targetY));
        }
      }
      if (this.stream > .01 && !p.reduced && ending.phase !== 'drop') {
        c.save(); const closing = ending.close || 0;
        const start = p.refined ? window.NotchHydroTokens.proposed.inflowStartY : 26;
        const end = start + (baseY - start) * this.stream;
        c.beginPath(); c.moveTo(inflowX, start); c.quadraticCurveTo(inflowX + Math.sin(time * 30) * .8, (start + end) / 2, inflowX, Math.max(start, end));
        c.strokeStyle = rgba(incoming.top, .9 * (1 - closing * .65)); c.lineWidth = 3.8 * this.stream * (1 - closing * .84); c.lineCap = 'round'; c.shadowColor = rgba(incoming.top, .5); c.shadowBlur = 6 * (1 - closing); c.stroke(); c.restore();
      }
      c.fillStyle = rgba(pal.top, .3); c.fill(back);
      const gradient = c.createLinearGradient(0, baseY - 10, 0, h);
      gradient.addColorStop(0, rgba(pal.top, pal.opacity));
      gradient.addColorStop(.5, rgba(pal.reference, (pal.opacity + .92) / 2));
      gradient.addColorStop(1, rgba(pal.bottom, p.drink.ice ? .95 : .92)); c.fillStyle = gradient; c.fill(front);
      if (p.ratio > 0) { c.lineWidth = 1.1; c.strokeStyle = 'rgba(255,255,255,.35)'; c.stroke(surface); }
      if (ending.ring > 0 && p.ratio > 0) {
        const progress = clamp(ending.age / .68);
        c.save(); c.clip(front); c.globalAlpha = ending.ring * .34;
        c.strokeStyle = rgba(mix(pal.top, [255, 255, 255], .72)); c.lineWidth = .95;
        c.beginPath(); c.ellipse(inflowX, baseY + 3, 8 + 58 * progress, 1.4 + 4.4 * progress, 0, 0, Math.PI * 2); c.stroke(); c.restore();
      }
      if (p.incoming && p.ratio > 0 && !p.reduced) {
        const opacity = (p.pouring ? 1 : 1 - smooth(0, 1.05, time - p.flowEnded)) * Math.min(.58, .18 + Math.sqrt(Math.max(0, p.incomingFraction)) * .45);
        if (opacity > .001) {
          c.save(); c.clip(front);
          for (let i = 0; i < 3; i++) {
            const depth = .16 + i * .23, x = inflowX + Math.sin(this.phase * .65 + i * 1.7) * (10 + i * 11), y = baseY + (h - baseY) * depth, radius = 23 + i * 13;
            c.save(); c.translate(x, y); c.scale(.8, 1.3);
            const tint = mix(p.incoming.top, p.incoming.bottom, depth), g = c.createRadialGradient(0, 0, 0, 0, 0, radius);
            g.addColorStop(0, rgba(tint, opacity * (1 - i * .12))); g.addColorStop(1, rgba(tint, 0)); c.fillStyle = g; c.beginPath(); c.arc(0, 0, radius, 0, Math.PI * 2); c.fill(); c.restore();
          } c.restore();
        }
      }
      // A single quiet lift in the existing liquid; gold remains exclusive to the goal.
      const affirmation = affirmationFrame(time, p.affirmation, p.reduced || p.reached);
      this.affirmationVisual = affirmation;
      if (affirmation.strength > .001 && p.ratio > 0 && !p.pouring) {
        const a = affirmation.strength, reach = w * (.16 + .44 * affirmation.spread);
        c.save(); c.clip(front);
        c.fillStyle = rgba([255, 255, 255], a * affirmation.bodyLift); c.fill(front);
        c.save(); c.translate(w / 2, baseY + 2); c.scale(reach / 24, 1);
        const glow = c.createRadialGradient(0, 0, 0, 0, 0, 24);
        glow.addColorStop(0, rgba([255, 255, 255], a * affirmation.bandLift));
        glow.addColorStop(1, 'rgba(255,255,255,0)');
        c.fillStyle = glow; c.fillRect(-24, -24, 48, 48); c.restore();
        c.beginPath(); c.rect(w / 2 - reach, 0, reach * 2, h); c.clip();
        c.strokeStyle = rgba([255, 255, 255], a * affirmation.surfaceLift); c.lineWidth = 1.4; c.stroke(surface);
        c.restore();
      }
      const impactY = f.impactY ?? baseY + 2;
      if (f.gold > .001 && (f.solid || f.radius > 0)) {
        c.save(); c.globalAlpha = f.gold * (f.solid ? 1 : f.attack);
        if (!f.solid) { c.beginPath(); c.ellipse(w / 2, impactY, f.radius, f.radius * .58, 0, 0, Math.PI * 2); c.clip(); }
        c.fillStyle = '#0A0B0E'; c.fill(back); c.fillStyle = 'rgba(234,179,8,.35)'; c.fill(back);
        const g = c.createLinearGradient(0, baseY - 10, 0, h); g.addColorStop(0, 'rgba(253,224,71,.88)'); g.addColorStop(1, 'rgba(180,83,9,.96)'); c.fillStyle = g; c.fill(front); c.restore();
        if (f.rim > 0) { c.save(); c.clip(front); c.strokeStyle = `rgba(255,249,212,${Math.min(.9, .78 * f.rim * 1.1)})`; c.lineWidth = 1.2; c.shadowColor = '#FFE98C'; c.shadowBlur = 3; c.beginPath(); c.ellipse(w / 2, impactY, f.radius, f.radius * .58, 0, 0, Math.PI * 2); c.stroke(); c.restore(); }
      }
      if (p.ratio > 0 && f.surface > 0) {
        c.save(); c.globalAlpha = f.surface; c.shadowColor = 'rgba(251,211,107,.8)'; c.shadowBlur = 9;
        if (p.formGoalAmber && !f.solid) { c.beginPath(); c.ellipse(inflowX, impactY, f.radius, f.radius * .58, 0, 0, Math.PI * 2); c.clip(); }
        c.strokeStyle = 'rgba(253,224,71,.14)'; c.lineWidth = 13; c.stroke(surface);
        c.strokeStyle = '#FBE08A'; c.lineWidth = 2; c.stroke(surface); c.shadowBlur = 0; c.strokeStyle = '#FFF4CB'; c.lineWidth = .7; c.stroke(surface); c.restore();
      }
      if (f.formation?.neck > 0) {
        const bead = f.formation;
        // Keep a trace of the returning gold on the crest until the neck pinches off.
        const foot = 1 + 9 * bead.neck;
        const crest = c.createLinearGradient(inflowX - foot, 0, inflowX + foot, 0);
        crest.addColorStop(0, 'rgba(251,224,138,0)'); crest.addColorStop(.5, '#FBE08A'); crest.addColorStop(1, 'rgba(251,224,138,0)');
        c.save(); c.globalAlpha = bead.opacity * bead.neck; c.strokeStyle = crest; c.lineWidth = 2; c.stroke(surface); c.restore();
        // The bead has a 15 pt radius at full scale. Join the neck inside its belly.
        const footY = waveY(inflowX + 7, false) + 2, tipY = bead.y + 12 * bead.scaleY;
        const height = footY - tipY;
        if (height > 0) {
          const pinch = bead.neck;
          const tip = 3.8 * pinch, waist = Math.max(.18, 2.7 * pinch);
          const neck = new Path2D();
          neck.moveTo(inflowX - foot, footY);
          neck.bezierCurveTo(inflowX - waist, footY - height * .08, inflowX - waist, tipY + height * .48, inflowX - tip, tipY);
          neck.lineTo(inflowX + tip, tipY);
          neck.bezierCurveTo(inflowX + waist, tipY + height * .48, inflowX + waist, footY - height * .08, inflowX + foot, footY);
          neck.closePath();
          const glass = c.createLinearGradient(inflowX - foot, 0, inflowX + foot, 0);
          glass.addColorStop(0, '#B97819'); glass.addColorStop(.38, '#FFF4CB');
          glass.addColorStop(.70, '#FBE08A'); glass.addColorStop(1, '#C68620');
          c.save(); c.globalAlpha = bead.opacity * (1 - smooth(1.50, goalTiming.neckBreak, formAge));
          c.fillStyle = glass; c.fill(neck); c.restore();
        }
      }
      if (formAge !== null && formAge >= goalTiming.neckBreak && formAge < goalTiming.neckBreak + .36) {
        const release = clamp((formAge - goalTiming.neckBreak) / .36);
        c.save(); c.clip(front); c.globalAlpha = .62 * Math.sin(Math.PI * release);
        c.strokeStyle = rgba(mix(pal.top, [255, 255, 255], .66)); c.lineWidth = .95;
        c.beginPath(); c.ellipse(inflowX, impactY + 3, 2 + 33 * release, .9 + 3 * release, 0, 0, Math.PI * 2); c.stroke(); c.restore();
      }
      if (p.drink.bubbles && p.ratio > 0 && !p.reduced) for (let i = 0; i < 16; i++) {
        const travel = (time * (22 + i % 6 * 4) + i * 27) % Math.max(12, h - baseY), y = h - travel, x = 15 + i * 51 % (w - 30) + Math.sin(time * 1.5 + i) * 3;
        if (y > baseY + 4) { const r = 1.3 + i % 3 * .5; c.strokeStyle = 'rgba(255,255,255,.38)'; c.lineWidth = .6; c.beginPath(); c.arc(x + r, y + r, r, 0, Math.PI * 2); c.stroke(); }
      }
      if (p.drink.ice && p.ratio > 0) for (let i = 0; i < 2; i++) {
        const x = w * (i === 0 ? .24 : .72), seed = i * 2.1, y = baseY + 3 + Math.sin(this.phase * .9 + seed) * amplitude * .55 + this.ripple(x, w);
        c.save(); c.translate(x, y); c.rotate((i === 0 ? -.22 : .18) + Math.sin(this.phase * .7 + seed) * .12); c.beginPath(); c.roundRect(-6.5, -6.5, 13, 13, 3); c.fillStyle = 'rgba(255,255,255,.2)'; c.strokeStyle = 'rgba(255,255,255,.42)'; c.lineWidth = 1; c.fill(); c.stroke(); c.restore();
      }
      const tint = (original, x) => mix(original, rgb(0xFDE047), f.gold * (f.solid || f.radius > 0 && Math.pow((x - w / 2) / f.radius, 2) < 1 ? (f.solid ? 1 : f.attack) : 0));
      if (!p.reduced) for (const d of this.drops) { c.fillStyle = rgba(tint(d.surface ? pal.top : d.color, d.x), Math.max(0, d.life) * (d.surface ? 1 : 1 - ending.quiet)); c.beginPath(); c.arc(d.x + d.radius, d.y + d.radius, d.radius, 0, Math.PI * 2); c.fill(); }
      for (const drop of ending.drops) {
        const r = drop.radius, q = drop.progress;
        const { x, y, halfHeight } = residualDropGeometry(drop, w, waveY(inflowX, false));
        c.save(); c.translate(x, y); c.globalAlpha = drop.opacity;
        const g = c.createRadialGradient(-r * .35, -r * .5, 0, 0, 0, r * 1.65);
        g.addColorStop(0, rgba(mix(incoming.top, [255, 255, 255], .82)));
        g.addColorStop(.4, rgba(mix(incoming.top, [255, 255, 255], .22)));
        g.addColorStop(1, rgba(incoming.top)); c.fillStyle = g;
        c.shadowColor = rgba(incoming.top, .25); c.shadowBlur = 2;
        c.beginPath(); c.ellipse(0, 0, r * (1 - .1 * q), halfHeight, 0, 0, Math.PI * 2); c.fill(); c.restore();
      }
      if (!p.reduced && f.age !== null && f.age < 2.6) {
        const hash = i => { const v = Math.sin(i * 127.1 + 311.7) * 43758.5453123; return v - Math.floor(v); };
        for (let i = 0; i < 10; i++) {
          const elapsed = f.age - (.02 + hash(i + 4) * .045); if (elapsed < 0 || elapsed > .66) continue;
          const side = i % 2 ? 1 : -1, vx = side * (65 + hash(i + 11) * 95), vy = -(62 + hash(i + 17) * 66);
          const x = w / 2 + side * (6 + hash(i + 8) * 22) + vx * elapsed * 1.1, y = baseY + 12 + (vy * elapsed + 195 * elapsed * elapsed) * 1.1;
          const r = (2 + hash(i + 21) * 1.1) * 1.065, stretch = 1 + Math.min(1, Math.abs(vy + 390 * elapsed) / 120) * (1.5 + hash(i + 30) * .6) * .35;
          c.save(); c.globalAlpha = (1 - smooth(.4, .66, elapsed)) * smooth(0, .035, elapsed); c.translate(x, y); c.rotate(-Math.atan2(vx, -(vy + 390 * elapsed)) * .5);
          const color = tint(pal.top, x), g = c.createRadialGradient(-r * .35, -r * .4, 0, -r * .35, -r * .4, r * 2);
          g.addColorStop(0, rgba(mix(color, [255, 255, 255], .94))); g.addColorStop(.5, rgba(mix(color, [255, 255, 255], .38))); g.addColorStop(1, rgba(color)); c.fillStyle = g; c.shadowColor = rgba(color); c.shadowBlur = 2; c.beginPath(); c.ellipse(0, 0, r, r * stretch, 0, 0, Math.PI * 2); c.fill(); c.restore();
        }
        for (let i = 0; i < 2; i++) {
          const elapsed = f.age - (.54 + i * .105); if (elapsed <= 0 || elapsed >= .58) continue;
          const progress = elapsed / .58, x = w / 2 + (i - .5) * 82;
          c.save(); c.globalAlpha = Math.sin(Math.PI * progress) * .20 * 1.1; c.strokeStyle = '#FEF08A'; c.lineWidth = 1.1; c.beginPath(); c.ellipse(x, baseY + 4, 9 + 58 * progress, 1.5 + 6 * progress, 0, 0, Math.PI * 2); c.stroke(); c.restore();
        }
      }
      const emphasisAge = f.age === null ? -1 : f.age - .05;
      const liquidColor = mix(pal.top.map(v => v * pal.opacity), pal.bottom.map(v => v * .92), .36);
      const goldColor = mix(rgb(0xFDE047).map(v => v * .88), rgb(0xB45309).map(v => v * .96), .36);
      const inkColor = mix(liquidColor, goldColor, f.gold).map(v => { const c = v / 255; return c <= .04045 ? c / 12.92 : Math.pow((c + .055) / 1.055, 2.4); });
      const goldInk = f.gold > 0 && (f.solid || f.radius > 138) && .2126 * inkColor[0] + .7152 * inkColor[1] + .0722 * inkColor[2] > .179;
      return { gold: f.gold, goldInk, formation: f.formation,
        emphasis: !p.reduced && emphasisAge >= 0 ? Math.sin(emphasisAge * 16) * Math.exp(-emphasisAge * 6) * .065 * 1.1 : 0 };
    }
  }
  window.NotchHydroFluid = { Fluid, drinks, palette, clamp, smooth, mix, rgba, waterlineY, affirmationFrame, residualDropGeometry };
})();
