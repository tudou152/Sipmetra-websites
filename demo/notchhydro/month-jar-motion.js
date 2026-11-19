/* Rigid pebbles in the two depth planes of the 160 × 132 monthly jar. */
(() => {
  'use strict';
  const tick = 1 / 120;
  const clamp = (n, limit) => Math.max(-limit, Math.min(limit, n));

  function wallPlanes(floor) {
    // The lip also bounds the shake. The farther row meets the glass higher up.
    const corners = [[36, 24], [124, 24], [140, 40], [145, 49], [144, floor - 13],
      [139, floor - 5], [130, floor - 2.5], [108, floor - .8], [80, floor],
      [52, floor - .8], [30, floor - 2.5], [21, floor - 5], [16, floor - 13],
      [15, 49], [20, 40]];
    return corners.map(([x, y], i) => {
      const [nextX, nextY] = corners[(i + 1) % corners.length];
      const dx = nextX - x, dy = nextY - y, length = Math.hypot(dx, dy);
      const nx = -dy / length, ny = dx / length;
      return { nx, ny, offset: nx * x + ny * y };
    });
  }

  const wall = [wallPlanes(106), wallPlanes(115)];
  function createBody({ date, x, y, points, layer }) {
    // The rendering uses 48 support directions. Every second or third one
    // suffices for contact; retain the extremal directions on both axes.
    const vertices = [];
    const count = Math.min(16, points.length);
    for (let i = 0; i < count; i++) {
      const [px, py] = points[Math.floor(i * points.length / count)];
      const last = vertices[vertices.length - 1];
      if (!last || px !== last.px || py !== last.py) vertices.push({ px, py, x: px, y: py });
    }
    const radius = Math.max(...points.map(([px, py]) => Math.hypot(px, py)));
    let twiceArea = 0, momentSum = 0;
    for (let i = 0; i < vertices.length; i++) {
      const a = vertices[i], b = vertices[(i + 1) % vertices.length];
      const cross = a.px * b.py - a.py * b.px;
      twiceArea += cross;
      momentSum += cross * (a.px * a.px + a.py * a.py + b.px * b.px + b.py * b.py + a.px * b.px + a.py * b.py);
    }
    const mass = Math.max(1, Math.abs(twiceArea) / 2);
    return { date, x, y, angle: 0, vx: 0, vy: 0, spin: 0, layer, vertices, radius,
      inverseMass: 1 / mass, inverseInertia: 1 / Math.max(mass, Math.abs(momentSum) / 12) };
  }

  function rotateHull(b) {
    const cos = Math.cos(b.angle), sin = Math.sin(b.angle);
    for (const v of b.vertices) {
      v.x = cos * v.px - sin * v.py;
      v.y = sin * v.px + cos * v.py;
    }
  }

  // A support point on a nearly flat face is shared between its endpoints.
  // This prevents a resting pebble from seesawing between adjacent samples.
  function support(b, nx, ny) {
    let max = -Infinity;
    for (const v of b.vertices) max = Math.max(max, v.x * nx + v.y * ny);
    let x = 0, y = 0, weight = 0;
    for (const v of b.vertices) {
      const w = Math.max(0, 1 - (max - v.x * nx - v.y * ny) / .34);
      x += w * v.x; y += w * v.y; weight += w;
    }
    return { x: x / weight, y: y / weight };
  }

  function contact(a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    if (dx * dx + dy * dy >= (a.radius + b.radius) ** 2) return null;
    let depth = Infinity, nx = 0, ny = 0;
    // Separating-axis test of the two rotated silhouettes.
    for (const owner of [a, b]) {
      for (let i = 0; i < owner.vertices.length; i++) {
        const p = owner.vertices[i], q = owner.vertices[(i + 1) % owner.vertices.length];
        let sx = q.y - p.y, sy = p.x - q.x;
        const length = Math.sqrt(sx * sx + sy * sy);
        if (length < .01) continue;
        if (dx * sx + dy * sy < 0) { sx = -sx; sy = -sy; }
        let farA = -Infinity, nearB = Infinity;
        for (const v of a.vertices) farA = Math.max(farA, v.x * sx + v.y * sy);
        for (const v of b.vertices) nearB = Math.min(nearB, v.x * sx + v.y * sy);
        const overlap = (farA - nearB - dx * sx - dy * sy) / length;
        if (overlap <= 0) return null;
        if (overlap < depth) { depth = overlap; nx = sx / length; ny = sy / length; }
      }
    }
    return { nx, ny, depth };
  }

  // The normal points from A (glass or stone) into B. Resolve both translation
  // and rotation at the contact point; glancing blows produce a soft roll.
  function collision(a, b, nx, ny, bx, by, onHit) {
    const ax = a ? b.x + bx - a.x : 0, ay = a ? b.y + by - a.y : 0;
    const vx = b.vx - b.spin * by - (a ? a.vx - a.spin * ay : 0);
    const vy = b.vy + b.spin * bx - (a ? a.vy + a.spin * ax : 0);
    const closing = -(vx * nx + vy * ny);
    if (closing <= 0) return;
    const inverseMass = b.inverseMass + (a ? a.inverseMass : 0);
    const ra = ax * ny - ay * nx, rb = bx * ny - by * nx;
    const normalMass = inverseMass + rb * rb * b.inverseInertia + (a ? ra * ra * a.inverseInertia : 0);
    const restitution = closing < 20 ? 0 : a ? .21 : .31;
    const normalImpulse = (1 + restitution) * closing / normalMass;
    const ta = ax * nx + ay * ny, tb = bx * nx + by * ny;
    const tangentMass = inverseMass + tb * tb * b.inverseInertia + (a ? ta * ta * a.inverseInertia : 0);
    const friction = clamp((vx * ny - vy * nx) / tangentMass, normalImpulse * .39);
    const ix = normalImpulse * nx - friction * ny, iy = normalImpulse * ny + friction * nx;
    b.vx += ix * b.inverseMass; b.vy += iy * b.inverseMass;
    b.spin += (bx * iy - by * ix) * b.inverseInertia;
    if (a) {
      a.vx -= ix * a.inverseMass; a.vy -= iy * a.inverseMass;
      a.spin -= (ax * iy - ay * ix) * a.inverseInertia;
    }
    if (closing >= 22) onHit(closing, a ? 'stone' : 'glass', b.x + bx, b.y + by);
  }

  function hitWall(b, onHit) {
    for (const { nx, ny, offset } of wall[b.layer === 1 ? 0 : 1]) {
      const distance = b.x * nx + b.y * ny - offset;
      if (distance > b.radius + .45) continue;
      let extent = -Infinity;
      for (const v of b.vertices) extent = Math.max(extent, -v.x * nx - v.y * ny);
      const depth = extent + .45 - distance;
      if (depth <= 0) continue;
      b.x += nx * depth; b.y += ny * depth;
      const point = support(b, -nx, -ny);
      collision(null, b, nx, ny, point.x, point.y, onHit);
    }
  }

  function solvePair(a, b, onHit) {
    const hit = contact(a, b);
    if (!hit) return;
    const { nx, ny, depth } = hit;
    const correction = Math.max(0, depth - .045) * .82 / (a.inverseMass + b.inverseMass);
    a.x -= nx * correction * a.inverseMass; a.y -= ny * correction * a.inverseMass;
    b.x += nx * correction * b.inverseMass; b.y += ny * correction * b.inverseMass;
    const tipA = support(a, nx, ny), tipB = support(b, -nx, -ny);
    const bx = (a.x - b.x + tipA.x + tipB.x) / 2;
    const by = (a.y - b.y + tipA.y + tipB.y) / 2;
    collision(a, b, nx, ny, bx, by, onHit);
  }

  function create(stones, onImpact, previousBodies) {
    const bodies = stones.map(createBody);
    if (previousBodies) {
      const previous = new Map(previousBodies.map(body => [body.date, body]));
      for (const body of bodies) {
        const saved = previous.get(body.date);
        if (saved) {
          const { x, y, angle, vx, vy, spin } = saved;
          Object.assign(body, { x, y, angle, vx, vy, spin });
          rotateHull(body);
        } else {
          // Enter above the pile when a newly earned day joins a handled jar.
          body.x = Math.min(108, Math.max(52, body.x));
          body.y = 40 + body.radius;
        }
      }
    }
    const rows = [bodies.filter(b => b.layer === 1), bodies.filter(b => b.layer !== 1)];
    let sleeping = !previousBodies || bodies.length === 0, quiet = 0, carry = 0, sinceHit = 1, coasting = 0, lastTilt = 0;
    return {
      bodies,
      get sleeping() { return sleeping; },
      step(seconds, ax = 0, ay = 0, tilt = 0) {
        const driven = Math.abs(ax) + Math.abs(ay) > 7 || Math.abs(tilt - lastTilt) > .003;
        if (driven && bodies.length) { sleeping = false; quiet = 0; }
        if (sleeping || seconds <= 0) return bodies;
        lastTilt = tilt;
        // Screen-down gravity, expressed in the tilted vessel's coordinates.
        ax = clamp(ax, 2100) + 455 * Math.sin(tilt);
        ay = clamp(ay, 2100) + 455 * Math.cos(tilt);
        carry += Math.min(seconds, .06);
        let impact = null;
        const onHit = (speed, kind, x, y) => {
          if (!impact || speed > impact.speed) impact = { speed, kind, x, y };
        };
        while (carry + 1e-10 >= tick) {
          carry -= tick; sinceHit += tick;
          coasting = driven ? 0 : coasting + tick;
          const settlingDrag = 1 - Math.min(.18, quiet * .65);
          const drag = (coasting > .35 ? .974 : .991) * settlingDrag;
          const angularDrag = (coasting > .35 ? .93 : .977) * settlingDrag;
          for (const b of bodies) {
            b.lastX = b.x; b.lastY = b.y;
            b.vx = clamp((b.vx + ax * tick) * drag, 320);
            b.vy = clamp((b.vy + ay * tick) * drag, 320);
            b.spin = clamp(b.spin * angularDrag, 12);
            b.travelAngle = b.spin * tick;
            b.x += b.vx * tick; b.y += b.vy * tick; b.angle += b.travelAngle;
            rotateHull(b);
          }
          for (let pass = 0; pass < 3; pass++) {
            for (const row of rows) {
              for (let j = 1; j < row.length; j++) {
                for (let i = 0; i < j; i++) solvePair(row[i], row[j], onHit);
              }
            }
            for (const b of bodies) hitWall(b, onHit);
          }
          // A pile can carry a small downward solver velocity while its actual
          // position is fully supported. Measure travel after the contacts.
          const restTravel = (coasting > 1.25 ? 13 : 9) * tick;
          const slow = !driven && bodies.every(b =>
            Math.hypot(b.x - b.lastX, b.y - b.lastY) + Math.abs(b.travelAngle) * b.radius < restTravel);
          quiet = slow ? quiet + tick : 0;
          if (quiet >= .34) {
            for (const b of bodies) { b.vx = 0; b.vy = 0; b.spin = 0; }
            sleeping = true; carry = 0;
            break;
          }
        }
        if (impact && sinceHit >= .065) { sinceHit = 0; onImpact?.(impact); }
        return bodies;
      }
    };
  }
  window.NotchHydroJarMotion = { create };
})();
