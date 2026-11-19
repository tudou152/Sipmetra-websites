/* A broad glass jar surrounding the month's actual amber thumbnails. */
(() => {
  'use strict';
  const width = 160, height = 132;
  const vessel = 'M32 21 C34 29 33 31 27 34 C17 39 12 43 12 52 L13 99 Q13 116 27 120 C49 127 113 127 134 119 Q147 115 147 100 L148 52 C148 42 142 38 133 34 Q125 30 128 21 Z';

  // The shell has a back and a front surface. Only the side reflections and the
  // thick foot pass in front of the stones, so the recorded colors stay clear.
  function glassLayer(front, scale) {
    const canvas = document.createElement('canvas');
    canvas.className = 'ni-jar-glass';
    canvas.width = width * scale;
    canvas.height = height * scale;
    canvas.setAttribute('aria-hidden', 'true');
    const ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);
    ctx.lineCap = ctx.lineJoin = 'round';
    function gradient(x1, y1, x2, y2, stops) {
      const color = ctx.createLinearGradient(x1, y1, x2, y2);
      for (const [at, value] of stops) color.addColorStop(at, value);
      return color;
    }
    function fill(path, paint) {
      ctx.fillStyle = paint;
      ctx.fill(new Path2D(path));
    }
    function stroke(path, paint, weight) {
      ctx.strokeStyle = paint;
      ctx.lineWidth = weight;
      ctx.stroke(new Path2D(path));
    }
    function ellipse(x, y, rx, ry, paint, weight = 0) {
      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
      if (weight) {
        ctx.lineWidth = weight;
        ctx.strokeStyle = paint;
        ctx.stroke();
      } else {
        ctx.fillStyle = paint;
        ctx.fill();
      }
    }
    const silver = gradient(12, 0, 148, 0, [
      [0, '#9aaab783'], [.08, '#eaf1f5c9'], [.19, '#82949f85'], [.36, '#6f839244'],
      [.56, '#83949f5c'], [.76, '#d1dee59e'], [.89, '#8596a069'], [1, '#c9d7deaf']
    ]);
    if (!front) {
      fill(vessel, gradient(12, 0, 148, 0, [
        [0, '#b6cfdd28'], [.07, '#b2c8d442'], [.15, '#879dab22'], [.30, '#7f93a110'],
        [.53, '#869dad10'], [.79, '#6e849521'], [.92, '#8c9eaa2f'], [1, '#e6f0fa36']
      ]));
      fill(vessel, gradient(0, 22, 0, 125, [[0, '#cad9e01d'], [.35, '#82919f09'], [.75, '#61738406'], [1, '#acbccf30']]));
      stroke(vessel, silver, 1.1);
      ellipse(80, 108.5, 59, 10.2, '#07101648');
      stroke('M20 110 C31 103 57 100 80 100 C107 100 126 102 140 109', '#ccd7df36', .9);
      return canvas;
    }

    // Softbox reflections wrap around the broad shoulders and fade down the wall.
    const leftLight = gradient(0, 33, 0, 115, [[0, '#e7f2f87a'], [.20, '#ecf5fa88'], [.57, '#dae9f137'], [1, '#d3e5f009']]);
    fill('M35 32 Q34 37 29 41 Q22 45 22 55 L22 88 Q20 86 19 71 L18 55 Q17 45 25 40 Z', leftLight);
    fill('M134 37 Q143 40 143 52 L141 97 Q140 106 137 108 Q138 84 138 65 L139 53 Q139 44 134 40 Z',
      gradient(0, 38, 0, 108, [[0, '#edf4f942'], [.28, '#dfedf369'], [.70, '#a6bac135'], [1, '#b5c9d31b']]));
    stroke('M16.5 49 Q15.2 59 16.8 90', '#d6e4ed51', .85);
    stroke('M26 42 Q21 45 20.8 51 L20.8 59', '#f5faff94', 1.15);
    stroke('M34 34 Q55 39 86 38 M116 36 Q124 35 128 33', '#c4d7df2d', .8);

    fill('M14 103 Q15 115 28 119 C55 127 110 126 134 118 Q145 114 146 103 Q141 111 131 114 C108 120 49 121 29 114 Q19 111 14 103 Z',
      gradient(0, 105, 0, 124, [[0, '#b7ccda08'], [.52, '#a1b4c135'], [.83, '#d4e0e951'], [1, '#bdceda21']]));
    stroke('M16 106 C18 117 44 121 74 121 C99 121.5 123 119 137 113', silver, .95);
    stroke('M28 118 Q41 122 56 122.4 M114 121 Q125 120 132 117', '#e4edf39c', .9);

    // Rolled lip with a dark opening, a back reflection, and a thicker front edge.
    fill('M31 16.5 C45 23 116 23 129 16.5 L129 21.5 C116 29 45 29 31 21.5 Z',
      gradient(0, 16, 0, 27, [[0, '#aabac672'], [.42, '#5e748473'], [.72, '#a7bac678'], [1, '#beced972']]));
    ellipse(80, 16.5, 49.4, 7.1, '#52636d');
    ellipse(80, 16.2, 45, 4.7, '#131b20');
    ellipse(80, 16.5, 49.4, 7.1, silver, 1.05);
    stroke('M36 15.1 C49 9.6 93 9.5 112.5 12', '#eef5fbd9', 1.15);
    stroke('M33 19.2 C50 25.3 111 25.2 127.5 19.1', '#d1e0e9ae', .95);
    stroke('M34 24 Q50 29 76 28.5 M101 28 Q119 27.5 126 24.5', '#b5c8d26d', .8);
    return canvas;
  }

  function restingPose(date, shape, seedWord) {
    const day = Date.parse(date + 'T00:00:00Z') / 86400000;
    // Advance by about sqrt(2) - 1 turns per day, even on unrecorded days.
    const turn = ((Math.imul(day, 0x6a09e667) + seedWord) >>> 0) / 2 ** 32;
    const phase = ((turn + 1 / 6) % 1) * 2 * Math.PI;
    const [radiusX, radiusY] = shape.radii;
    const flatness = Math.min(1, Math.max(0, (1 - radiusY / radiusX) / .6));
    return {
      roll: .20 + (.53 - .13 * flatness) * Math.cos(phase),
      pitch: .21 * Math.cos(1.8 * phase),
      yaw: .55 * Math.sin(phase)
    };
  }

  function depthPlane(floor) {
    return {
      surface: Array.from({ length: width }, (_, x) => floor - 3.5 * ((x - 80) / 60) ** 2),
      stones: []
    };
  }

  // Sample top and bottom edges in jar units so tilted stones rest on the
  // actual contour beneath them, including the curved glass floor.
  function verticalProfile(points, centerX, centerY, size, rx) {
    const edges = points.map(([x, y]) => [(x - centerX) * size, (y - centerY) * size]);
    const columns = [];
    for (let dx = Math.ceil(-rx); dx <= rx; dx++) {
      let top = Infinity, bottom = -Infinity;
      for (let i = 0; i < edges.length; i++) {
        const [ax, ay] = edges[i], [bx, by] = edges[(i + 1) % edges.length];
        if (ax === bx || dx < Math.min(ax, bx) || dx > Math.max(ax, bx)) continue;
        const y = ay + (by - ay) * (dx - ax) / (bx - ax);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
      if (top <= bottom) columns.push({ dx, top, bottom });
    }
    return columns;
  }

  function settle(shape, outline, index, planes) {
    const front = index < 3 || (index >= 6 && index % 2 === 0);
    const plane = planes[front ? 1 : 0];
    const otherPlane = planes[front ? 0 : 1];
    // All dates use one display scale with slight perspective in the rear.
    // Bound unusually bulky archived shapes to the area of a round pebble.
    const [radiusX, radiusY] = shape.radii;
    const size = (front ? 32 : 30) * Math.min(1, .9 / Math.sqrt(radiusX * radiusY));
    const { left, top, right, bottom } = outline.bounds;
    const centerX = (left + right) / 2, centerY = (top + bottom) / 2;
    const rx = (right - left) * size / 2, ry = (bottom - top) * size / 2;
    const columns = verticalProfile(outline.points, centerX, centerY, size, rx);
    const preferred = [48, 103, 75][index] ?? 80 + 44 * Math.sin(index * 2.4);
    let best = null;
    for (let x = Math.ceil(19 + rx); x <= 140 - rx; x += 2) {
      let y = Infinity;
      for (const edge of columns) y = Math.min(y, plane.surface[x + edge.dx] - edge.bottom);
      // Stagger the two rows in depth so the stones behind show through gaps.
      let overlap = 0;
      for (const other of otherPlane.stones) {
        const distance = Math.hypot((x - other.x) / (rx + other.rx), (y - other.y) / (ry + other.ry));
        overlap += Math.max(0, 1 - distance) ** 2;
      }
      const wallInset = Math.min(x - rx, width - x - rx);
      const shoulderY = 34 + 1.1 * Math.max(0, 29 - wallInset);
      const headroom = y - ry - shoulderY;
      const score = headroom < 0 ? headroom : y - .15 * Math.abs(x - preferred) - 18 * overlap;
      if (!best || score > best.score) best = { x, y, rx, ry, score };
    }
    for (const edge of columns) {
      const x = best.x + edge.dx;
      plane.surface[x] = Math.min(plane.surface[x], best.y + edge.top);
    }
    plane.stones.push(best);
    return { x: best.x + (.5 - centerX) * size, y: best.y + (.5 - centerY) * size,
      size, layer: front ? 2 : 1 };
  }

  window.NotchHydroMonthJar = class MonthJar {
    constructor(container, glassScale = 5) {
      this.container = container;
      container.classList.add('ni-month-jar');
      container.setAttribute('role', 'img');
      this.stones = document.createElement('span');
      this.stones.className = 'ni-jar-stones';
      this.stones.setAttribute('aria-hidden', 'true');
      this.artwork = document.createElement('span');
      this.artwork.className = 'ni-jar-artwork';
      this.artwork.append(glassLayer(false, glassScale), this.stones, glassLayer(true, glassScale));
      container.replaceChildren(this.artwork);
    }

    update(earnedDays, label, collectionSeed = '', stonePixels = 128) {
      this.container.setAttribute('aria-label', label);
      this.highlight(null);
      const planes = [depthPlane(106), depthPlane(115)], fragment = document.createDocumentFragment();
      const seedWord = parseInt(collectionSeed.slice(0, 8), 16) >>> 0;
      const tiles = earnedDays.map(({ day, shape }, index) => {
        const pose = restingPose(day.date, shape, seedWord);
        const outline = window.NotchHydroSilhouette.forDay(day.date, shape, pose);
        const placement = settle(shape, outline, index, planes);
        const canvas = document.createElement('canvas');
        canvas.className = 'ni-jar-stone';
        canvas.width = canvas.height = stonePixels;
        canvas.dataset.jarDay = day.date;
        canvas.style.left = placement.x / width * 100 + '%';
        canvas.style.top = placement.y / height * 100 + '%';
        canvas.style.width = placement.size / width * 100 + '%';
        canvas.style.setProperty('--ni-stone-layer', placement.layer);
        canvas.style.setProperty('--ni-stone-light', 'rgba(' + day.color.reference.map(Math.round).join(',') + ',.65)');
        fragment.append(canvas);
        const body = { date: day.date, x: placement.x, y: placement.y, layer: placement.layer,
          points: outline.points.map(([x, y]) => [(x - .5) * placement.size, (y - .5) * placement.size]) };
        return { canvas, day, shape, pose, body };
      });
      this.stones.replaceChildren(fragment);
      this.canvasesByDate = new Map(tiles.map(({ day, canvas }) => [day.date, canvas]));
      return tiles;
    }

    paintMotion({ x, y, motion }, reduced) {
      this.artwork.style.transform = reduced || (!x && !y) ? '' :
        `translate(${x / width * 100}%, ${y / height * 100}%) rotate(${x * .65}deg)`;
      for (const body of motion.bodies) {
        const canvas = this.canvasesByDate.get(body.date);
        if (!canvas) continue;
        canvas.style.left = body.x / width * 100 + '%';
        canvas.style.top = body.y / height * 100 + '%';
        canvas.style.transform = `translate(-50%,-50%) rotate(${body.angle}rad)`;
      }
    }

    highlight(date) {
      const next = date ? this.stones.querySelector(`[data-jar-day="${date}"]`) : null;
      if (next === this.highlighted) return;
      this.highlighted?.removeAttribute('data-highlighted');
      next?.setAttribute('data-highlighted', '');
      this.highlighted = next;
    }
  };
})();
