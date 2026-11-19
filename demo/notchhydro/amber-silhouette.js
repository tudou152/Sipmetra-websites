/* Project the shared 3D surface when the panel or gallery renders without WebGL. */
(() => {
  'use strict';
  const { view, forDay: shapeForDay, surfacePoint } = window.NotchHydroShape;
  const [rx, ry, rz] = view.rotation;
  const cx = Math.cos(rx), sx = Math.sin(rx), cy = Math.cos(ry), sy = Math.sin(ry);
  const cz = Math.cos(rz), sz = Math.sin(rz), ct = Math.cos(view.settledTurn), st = Math.sin(view.settledTurn);
  const focal = .5 / Math.tan(view.fov * Math.PI / 360);
  const normals = Array.from({ length: 48 }, (_, i) => {
    const angle = i * Math.PI / 24;
    return [Math.cos(angle), Math.sin(angle)];
  });

  // Sample the dated surface once. Its starting pose matches a fully formed WebGL stone.
  function settledVertices(shape) {
    const vertices = new Float64Array(25 * 48 * 3), point = {};
    let index = 0;
    for (let row = 0; row <= 24; row++) {
      const lat = (row / 24 - .5) * Math.PI, y = Math.sin(lat), radius = Math.cos(lat);
      for (let column = 0; column < 48; column++) {
        const lon = column * Math.PI / 24;
        surfacePoint(shape, radius * Math.cos(lon), y, radius * Math.sin(lon), point);
        const rollX = cz * point.x - sz * point.y, rollY = sz * point.x + cz * point.y;
        const yawX = cy * rollX + sy * point.z, yawZ = cy * point.z - sy * rollX;
        const pitchZ = sx * rollY + cx * yawZ;
        vertices[index++] = ct * yawX + st * pitchZ;
        vertices[index++] = cx * rollY - sx * yawZ;
        vertices[index++] = ct * pitchZ - st * yawX;
      }
    }
    return vertices;
  }

  function outline(vertices, rotation, step) {
    const { m11, m21, m31, m12, m22, m32, m13, m23, m33 } = rotation;
    const points = normals.map(() => [0, 0]);
    const furthest = new Float64Array(points.length).fill(-Infinity);
    let lightTotal = 0, lightX = 0, lightY = 0;
    for (let row = 0; row <= 24; row += step) {
      for (let column = 0; column < 48; column += step) {
        const i = (row * 48 + column) * 3;
        const u = vertices[i], v = vertices[i + 1], w = vertices[i + 2];
        const x = m11 * u + m21 * v + m31 * w, y = m12 * u + m22 * v + m32 * w;
        const z = m13 * u + m23 * v + m33 * w, scale = focal / (view.cameraZ - z);
        const px = .5 + x * scale, py = .5 - y * scale;
        for (let n = 0; n < normals.length; n++) {
          const distance = px * normals[n][0] + py * normals[n][1];
          if (distance > furthest[n]) {
            furthest[n] = distance;
            points[n][0] = px;
            points[n][1] = py;
          }
        }
        // A convex shell catches the fixed studio light near its supporting
        // plane. A weighted patch keeps the glint continuous between samples.
        const light = Math.exp(18 * (-.43 * x + .55 * y + .72 * z - 1));
        lightTotal += light; lightX += px * light; lightY += py * light;
      }
    }
    const right = points[0][0], bottom = points[12][1], left = points[24][0], top = points[36][1];
    return { points, bounds: { left, top, right, bottom },
      shineX: (lightX / lightTotal - left) / (right - left),
      shineY: (lightY / lightTotal - top) / (bottom - top) };
  }

  const stillOutlines = new WeakMap();
  const stillVertices = new WeakMap();
  const degrees = 180 / Math.PI;
  function forDay(day, shape = shapeForDay(day), pose) {
    if (pose?.isIdentity) pose = undefined;
    let outlines = stillOutlines.get(shape);
    if (!outlines) {
      outlines = new WeakMap();
      stillOutlines.set(shape, outlines);
    }
    const key = pose || shape;
    if (!outlines.has(key)) {
      let rotation = pose || new DOMMatrix();
      if (pose && !pose.toFloat64Array) {
        const { pitch = 0, yaw = 0, roll = 0 } = pose;
        // Match the ZYX Euler rotation of the WebGL thumbnail.
        rotation = new DOMMatrix().rotateAxisAngle(0, 0, 1, roll * degrees)
          .rotateAxisAngle(0, 1, 0, yaw * degrees).rotateAxisAngle(1, 0, 0, pitch * degrees);
      }
      if (!stillVertices.has(shape)) stillVertices.set(shape, settledVertices(shape));
      outlines.set(key, outline(stillVertices.get(shape), rotation, 1));
    }
    return outlines.get(key);
  }

  function drawStill(target, day, shape, tint, pose) {
    const ctx = target.getContext('2d');
    ctx.clearRect(0, 0, target.width, target.height);
    if (!tint || !shape) return;
    const { points, bounds, shineX, shineY } = forDay(day, shape, pose);
    const colorAt = depth => 'rgb(' + window.NotchHydroAmber.transmittedRGB(tint, depth).map(Math.round).join(',') + ')';
    ctx.save();
    ctx.scale(target.width, target.height);
    ctx.beginPath();
    points.forEach(([x, y], i) => { if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
    ctx.closePath();
    ctx.clip();
    const body = ctx.createLinearGradient(bounds.left, bounds.top, bounds.right, bounds.bottom);
    body.addColorStop(0, colorAt(.5));
    body.addColorStop(.6, colorAt(1));
    body.addColorStop(1, colorAt(2));
    ctx.fillStyle = body;
    ctx.fillRect(0, 0, 1, 1);
    // Keep the resting highlight as the reference when a hand starts turning the stone.
    const front = pose?.toFloat64Array ? forDay(day, shape) : null;
    const glintX = front ? .27 + shineX - front.shineX : pose ? shineX : .27;
    const glintY = front ? .14 + shineY - front.shineY : pose ? shineY : .14;
    ctx.translate(bounds.left + (bounds.right - bounds.left) * glintX,
      bounds.top + (bounds.bottom - bounds.top) * glintY);
    ctx.rotate(-.18);
    ctx.scale(1, .38);
    const light = ctx.createRadialGradient(0, 0, 0, 0, 0, .14);
    light.addColorStop(0, 'rgba(255,255,255,.82)');
    light.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = light;
    ctx.fillRect(-.15, -.15, .30, .30);
    ctx.restore();
  }

  const percent = fraction => (fraction * 100).toFixed(3) + '%';
  function writeOutline(element, contour, forming) {
    const { points, bounds: { left, top, right, bottom } } = contour;
    const coordinate = forming
      ? (a, b) => 'calc(' + percent(a) + ' + ' + percent(b - a) + ' * var(--solid))'
      : (a, b) => percent(b);
    element.style.setProperty('--nh-amber-inset', [top, 1 - right, 1 - bottom, left].map(b => coordinate(.21, b)).join(' '));
    const polygon = points.map(([x, y], i) => {
      const [nx, ny] = normals[i];
      return coordinate(.5 + .5 * nx, (x - left) / (right - left)) + ' ' +
             coordinate(.5 + .5 * ny, (y - top) / (bottom - top));
    });
    element.style.setProperty('--nh-amber-outline', 'polygon(' + polygon.join(',') + ')');
  }

  function applyToPanel(element, day, shape = shapeForDay(day)) {
    const vertices = settledVertices(shape), identity = new DOMMatrix();
    const front = outline(vertices, identity, 1);
    let turn = 0, inspection = identity, dirty = false;
    function resetPose() {
      turn = 0; inspection = identity; dirty = false;
      writeOutline(element, front, true);
      element.style.removeProperty('--nh-amber-shine-x');
      element.style.removeProperty('--nh-amber-shine-y');
    }
    function paint(visible) {
      if (!dirty || !visible) return;
      dirty = false;
      const rotation = inspection.rotateAxisAngle(Math.sin(view.presentationTilt), Math.cos(view.presentationTilt), 0, turn * degrees);
      // A 52 pt thumbnail needs only 312 of the cached vertices while it moves.
      const faceOn = inspection.isIdentity && turn % (2 * Math.PI) === 0;
      const contour = faceOn ? front : outline(vertices, rotation, 2);
      writeOutline(element, contour, false);
      element.style.setProperty('--nh-amber-shine-x', percent(.31 + contour.shineX - front.shineX));
      element.style.setProperty('--nh-amber-shine-y', percent(.16 + contour.shineY - front.shineY));
    }
    resetPose();
    return {
      setPresentationTurn(angle, visible = true) {
        if (angle !== turn) { turn = angle; dirty = true; }
        paint(visible);
      },
      rotate(dx, dy, visible = true) {
        const delta = identity.rotateAxisAngle(1, 0, 0, dy * degrees).rotateAxisAngle(0, 1, 0, dx * degrees);
        inspection = delta.multiply(inspection);
        dirty = true;
        paint(visible);
      },
      resetPose
    };
  }
  window.NotchHydroSilhouette = { forDay, drawStill, applyToPanel };
})();
