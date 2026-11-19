/* Three.js r160. The glass uses the prototype's linear absorption at unit thickness. */
(() => {
  'use strict';

  function pebbleGeometry(THREE, shape, detail) {
    const geometry = new THREE.IcosahedronGeometry(1, detail);
    const positions = geometry.getAttribute('position');
    const normals = geometry.getAttribute('normal');
    const directions = new THREE.BufferAttribute(new Float32Array(positions.count * 3), 3);
    const n = new THREE.Vector3(), tangent = new THREE.Vector3(), bitangent = new THREE.Vector3();
    const offset = new THREE.Vector3(), p = new THREE.Vector3(), q = new THREE.Vector3(), surfaceNormal = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0), side = new THREE.Vector3(1, 0, 0);
    function surface(direction, out) {
      return window.NotchHydroShape.surfacePoint(shape, direction.x, direction.y, direction.z, out);
    }
    for (let i = 0; i < positions.count; i++) {
      n.fromBufferAttribute(positions, i).normalize();
      directions.setXYZ(i, n.x, n.y, n.z);
      tangent.crossVectors(Math.abs(n.y) > .9 ? side : up, n).normalize();
      bitangent.crossVectors(n, tangent);
      surface(n, p);
      positions.setXYZ(i, p.x, p.y, p.z);
      surface(offset.copy(n).addScaledVector(tangent, .0002).normalize(), q).sub(p);
      surface(offset.copy(n).addScaledVector(bitangent, .0002).normalize(), surfaceNormal).sub(p);
      surfaceNormal.crossVectors(q, surfaceNormal).normalize();
      normals.setXYZ(i, surfaceNormal.x, surfaceNormal.y, surfaceNormal.z);
    }
    geometry.setAttribute('amberDirection', directions);
    geometry.computeBoundingSphere();
    return geometry;
  }

  const studioPanels = [
    [[-2.8, 3.3, 2.8], 4.0, 1.05, 4.2],
    [[2.9, 1.5, 2], .42, 3.2, 3.0],
    [[-.5, 1.5, -3.4], 4, 2.3, 2.6],
    [[1.8, -2, 2.2], 4.2, 1.2, .025]
  ];
  function studioReflections(THREE, renderer) {
    const studio = new THREE.Scene();
    studio.background = new THREE.Color(.095, .10, .12);
    const panelGeometry = new THREE.PlaneGeometry();
    const panelMaterials = [];
    function panel(position, width, height, intensity) {
      const material = new THREE.MeshBasicMaterial({ color: new THREE.Color(intensity, intensity, intensity) });
      panelMaterials.push(material);
      const card = new THREE.Mesh(panelGeometry, material);
      card.position.set(...position);
      card.lookAt(0, 0, 0);
      card.scale.set(width, height, 1);
      studio.add(card);
    }
    studioPanels.forEach(args => panel(...args));
    const generator = new THREE.PMREMGenerator(renderer);
    const target = generator.fromScene(studio, .025);
    generator.dispose();
    panelGeometry.dispose();
    panelMaterials.forEach(material => material.dispose());
    return target;
  }

  // Light falling through a transparent object needs something to refract. This
  // card is visible to Three's transmission buffer only; the page stays transparent.
  const cardLight = `float cardLight(vec2 p, float dim) {
    float band = p.y + 0.42 * p.x + 0.34 * p.x * p.x;
    float key = smoothstep(-0.11, 0.07, band);
    float brightStrip = 1.0 - smoothstep(0.022, 0.067, abs(band + 0.16));
    float darkStrip = 1.0 - smoothstep(0.009, 0.046, abs(band + 0.085));
    return 1.07 + 0.89 * key + 1.48 * brightStrip - (0.60 + 0.12 * dim) * darkStrip - 0.085 * dim;
  }`;
  function transmissionCard(THREE) {
    const material = new THREE.ShaderMaterial({
      uniforms: { dim: { value: 0 } }, depthWrite: false,
      vertexShader: 'varying vec2 cardUV; void main() { cardUV = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `varying vec2 cardUV;
        uniform float dim;
        ${cardLight}
        void main() {
          float light = cardLight(cardUV - 0.5, dim);
          gl_FragColor = vec4(vec3(light), 1.0);
        }` });
    const card = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), material);
    card.position.z = -2.7;
    card.onBeforeRender = renderer => { material.colorWrite = renderer.getRenderTarget() !== null; };
    return card;
  }

  // A folded film inside the volume catches grazing light. Render it into the
  // refraction buffer with the lighting card so the front surface bends its image.
  function inclusionFilm(THREE) {
    const geometry = new THREE.PlaneGeometry(1, 1, 36, 8);
    const positions = geometry.getAttribute('position'), uv = geometry.getAttribute('uv');
    for (let i = 0; i < positions.count; i++) {
      const u = uv.getX(i), cross = 2 * uv.getY(i) - 1;
      const width = Math.sin(Math.PI * u) ** .70 * (.12 + .04 * Math.sin(10 * u));
      positions.setXYZ(i, (u - .5) * 1.02, .16 * Math.sin(3.6 * u - .8) + cross * width,
        .30 * Math.sin(4.7 * u) + .065 * cross + .026 * Math.abs(cross));
    }
    geometry.computeVertexNormals();
    const material = new THREE.ShaderMaterial({
      side: THREE.DoubleSide, depthWrite: false, blending: THREE.CustomBlending,
      blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
      vertexShader: `varying vec2 filmUV; varying vec3 normalV; varying vec3 toEye;
        void main() {
          filmUV=uv; normalV=normalMatrix*normal; vec4 pos=modelViewMatrix*vec4(position,1.);
          toEye=-pos.xyz; gl_Position=projectionMatrix*pos;
        }`,
      fragmentShader: `varying vec2 filmUV; varying vec3 normalV; varying vec3 toEye;
        void main() {
          float u=filmUV.x, v=filmUV.y;
          float taper=sin(3.14159*u);
          float grain=pow(max(0.,cos(72.*u + 6.*v + 0.9*sin(19.*u))),9.);
          float ridge=exp(-29.*abs(v-.52-.17*sin(5.*u))) + .6*exp(-22.*abs(v-.95));
          float grazing=1.-abs(dot(normalize(normalV),normalize(toEye)));
          float alpha=taper*(.055 + .16*grazing + .16*grain + .50*ridge);
          gl_FragColor=vec4(vec3(2.3,2.24,2.1),alpha);
        }`
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = 2;
    mesh.onBeforeRender = renderer => { material.colorWrite = renderer.getRenderTarget() !== null; };
    return mesh;
  }

  // The path length is in the rotating stone's object space, for both materials.
  const opticalPath = `float pathLength(vec3 direction, vec3 pos, vec3 radii, vec3 eye) {
    vec3 ray = normalize(eye - pos) / radii;
    return max(0.002, 2.0 * dot(normalize(direction), ray) / dot(ray, ray));
  }`;
  function physicalGlass(THREE, uniforms) {
    const glass = new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: .1, roughness: .15,
      transmission: .85, thickness: 1.2, transparent: true, opacity: .95,
      reflectivity: .9, clearcoat: 1, clearcoatRoughness: .1, envMapIntensity: .72 });
    // Approximate the local chord through the pebble by its underlying ellipsoid.
    // Both the normalised surface direction and the eye are in stone coordinates,
    // so a side view traverses a different volume from a front view.
    glass.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = 'attribute vec3 amberDirection; varying vec3 shellDirection; varying vec3 shellPosition;\n' +
        shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n shellDirection = amberDirection; shellPosition = position;');
      const transmission = THREE.ShaderChunk.transmission_fragment.replace('material.thickness = thickness;',
        'material.thickness = pathLength(shellDirection, shellPosition, amberRadii, amberEye);');
      shader.fragmentShader = 'varying vec3 shellDirection; varying vec3 shellPosition; uniform vec3 amberEye; uniform vec3 amberRadii; uniform float amberShoulderGlint;\n' + opticalPath + '\n' +
        shader.fragmentShader.replace('#include <transmission_fragment>', transmission)
          .replace('#include <opaque_fragment>', `
            float shoulder = pow(max(0.0, dot(normal, normalize(vec3(-.52, .61, .60)))), 13.0);
            outgoingLight += vec3(2.5, 1.18, .085) * shoulder * amberShoulderGlint;
            #include <opaque_fragment>`);
    };
    return glass;
  }

  // At 52 pt the studio cards can be sampled analytically in a single draw,
  // avoiding PMREM generation and a screen-space transmission pass at impact.
  function compactGlass(THREE, uniforms) {
    const panels = studioPanels.map(([pos, width, height, intensity]) =>
      'light += ' + intensity.toFixed(3) + ' * panel(r, vec3(' + pos.map(v => v.toFixed(3)).join(',') +
      '), vec2(' + (width / 2).toFixed(3) + ',' + (height / 2).toFixed(3) + '));').join('\n');
    return new THREE.ShaderMaterial({
      uniforms: { ...uniforms, absorptionColor: { value: new THREE.Color() },
        waveGold: { value: new THREE.Color(0xfde047) }, dim: { value: 1 } },
      transparent: true,
      vertexShader: `attribute vec3 amberDirection;
        uniform float crystallization;
        varying vec3 dir, pos, normalV, world;
        void main() {
          dir = amberDirection;
          pos = mix(.78 * dir, position, crystallization);
          normalV = normalMatrix * mix(dir, normal, crystallization);
          world = (modelMatrix * vec4(pos, 1.0)).xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        }`,
      fragmentShader: `varying vec3 dir, pos, normalV, world;
        uniform vec3 amberRadii, amberEye, absorptionColor, waveGold;
        uniform float dim, amberShoulderGlint, crystallization;
        ${opticalPath}
        ${cardLight}
        float panel(vec3 r, vec3 center, vec2 halfSize) {
          vec3 z = normalize(center);
          float cosAngle = dot(r, z);
          if (cosAngle <= .01) return 0.;
          vec3 x = normalize(cross(vec3(0., 1., 0.), z)), y = cross(z, x);
          vec3 offset = r * (length(center) / cosAngle) - center;
          vec2 edge = halfSize - abs(vec2(dot(offset, x), dot(offset, y)));
          return smoothstep(-.23, .18, min(edge.x, edge.y));
        }
        void main() {
          vec3 n = normalize(normalV), toEye = normalize(cameraPosition - world);
          vec3 radii = mix(vec3(.78), amberRadii, crystallization);
          float depth = pathLength(dir, pos, radii, amberEye);
          vec3 exitPoint = world + refract(-toEye, n, 1. / 1.5) * depth;
          vec2 card = exitPoint.xy * ((cameraPosition.z + 2.7) / (cameraPosition.z - exitPoint.z)) / 6.;
          vec3 transmitted = pow(absorptionColor, vec3(depth)) * cardLight(card, dim);
          vec3 r = reflect(-toEye, n);
          float light = .10;
          ${panels}
          float fresnel = .095 + .80 * pow(1. - max(0., dot(n, toEye)), 5.);
          vec3 color = .80 * (1. - fresnel) * transmitted + vec3(.016 + light * fresnel);
          // In the liquid phase the surface catches a single soft highlight.
          // The stone's internal refraction bands develop as its shape sets.
          float facing = clamp(dot(n, toEye), 0., 1.);
          float edge = pow(1. - facing, 2.);
          float highlight = pow(max(0., dot(n, normalize(vec3(-.43, .55, .72)))), 34.);
          float caustic = pow(max(0., dot(n, normalize(vec3(.18, -.83, .38)))), 9.);
          vec3 reflections = vec3(.72 * highlight + .22 * edge + .18 * caustic);
          vec3 water = pow(absorptionColor, vec3(.53 * depth)) * (.72 + .12 * n.y) + reflections;
          color = mix(water, color, crystallization);
          // Project the liquid's chord onto the visible disc. The daily color
          // opens at its deepest point while the edges still carry the wave's gold.
          float radius = sqrt(max(0., 1. - facing * facing));
          float feather = .13;
          float front = mix(-feather, 1. + feather, sqrt(crystallization));
          float revealed = 1. - smoothstep(front - feather, front + feather, radius);
          vec3 goldWater = pow(waveGold, vec3(.72 * depth)) * (.91 + .14 * n.y) + reflections;
          color = mix(goldWater, color, revealed);
          float glint = pow(max(0., dot(n, normalize(vec3(-.52, .61, .60)))), 13.);
          color += vec3(2.5, 1.18, .085) * glint * amberShoulderGlint * mix(.38, 1., crystallization);
          float alpha = mix(.69 + .29 * max(edge, highlight), .95, crystallization);
          alpha = mix(.86 + .12 * max(edge, highlight), alpha, revealed);
          gl_FragColor = vec4(color, alpha);
          #include <colorspace_fragment>
        }`
    });
  }

  window.createAmberScene = function createAmberScene(canvas, onFirstPaint, { compact = false, context, day = null, shape } = {}) {
    const THREE = window.THREE;
    const options = { alpha: true, antialias: true, powerPreference: 'low-power' };
    if (context) options.context = context;
    const renderer = new THREE.WebGLRenderer({ canvas, ...options });
    renderer.setClearColor(0x000000, 0);
    const view = window.NotchHydroShape.view;
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(view.fov, 1, .1, 24);
    camera.position.z = view.cameraZ;
    // World-space hand gestures wrap the automatic turn, which wraps the formed stone.
    const inspection = new THREE.Group(), presentation = new THREE.Group(), stone = new THREE.Group();
    stone.rotation.set(...view.rotation);
    stone.visible = false;
    presentation.add(stone);
    inspection.add(presentation);
    scene.add(inspection);
    const initialShape = shape || window.NotchHydroShape.forDay(day);
    const radii = new THREE.Vector3().fromArray(initialShape.radii), eyeInStone = new THREE.Vector3(), shoulderGlint = { value: 0 };
    const crystallization = { value: 1 };
    const uniforms = { amberRadii: { value: radii }, amberEye: { value: eyeInStone }, amberShoulderGlint: shoulderGlint };
    if (compact) uniforms.crystallization = crystallization;
    const glass = compact ? compactGlass(THREE, uniforms) : physicalGlass(THREE, uniforms);
    const detail = compact ? 8 : 18;
    const shell = new THREE.Mesh(pebbleGeometry(THREE, initialShape, detail), glass);
    stone.add(shell);
    let environment, backdrop, film;
    if (!compact) {
      environment = studioReflections(THREE, renderer);
      scene.environment = environment.texture;
      backdrop = transmissionCard(THREE);
      scene.add(backdrop, new THREE.AmbientLight(0xffffff, .48));
      const warm = new THREE.PointLight(0xffdab0, 8), cool = new THREE.PointLight(0xc6e1ff, 8);
      warm.position.set(-2.8, 3.4, 3.1); cool.position.set(3.4, .9, -1.7);
      scene.add(warm, cool);
      film = inclusionFilm(THREE);
      film.position.set(-.10, -.22, .04); film.rotation.set(.56, .16, -.24);
      stone.add(film);
    }

    let disposed = false, paused = false, painted = false, frame = null, width = 0, height = 0, density = 0, formationTurn = 0;
    function draw() {
      frame = null;
      if (disposed || renderer.getContext().isContextLost()) return false;
      const w = canvas.clientWidth, h = canvas.clientHeight, dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (!w || !h) return false;
      if (w !== width || h !== height || dpr !== density) {
        width = w; height = h; density = dpr;
        renderer.setPixelRatio(density);
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      }
      stone.worldToLocal(eyeInStone.copy(camera.position));
      renderer.render(scene, camera);
      if (!painted && stone.visible) {
        painted = true;
        onFirstPaint?.();
      }
      return stone.visible;
    }
    function invalidate() {
      if (frame === null && !disposed && !paused) frame = requestAnimationFrame(draw);
    }
    function restoreEnvironment() {
      painted = false;
      if (environment) {
        environment.dispose();
        environment = studioReflections(THREE, renderer);
        scene.environment = environment.texture;
      }
      invalidate();
    }
    const resize = new ResizeObserver(invalidate);
    resize.observe(canvas);
    canvas.addEventListener('webglcontextrestored', restoreEnvironment);
    const axisX = new THREE.Vector3(1, 0, 0), axisY = new THREE.Vector3(0, 1, 0);
    const inspectionMatrix = new THREE.Matrix4();
    const presentationAxis = new THREE.Vector3(Math.sin(view.presentationTilt), Math.cos(view.presentationTilt), 0);
    let presentationTurn = 0;
    return {
      setDay(nextDay, nextShape) {
        if (disposed || day === nextDay && shape === nextShape) return;
        const next = nextShape || window.NotchHydroShape.forDay(nextDay);
        const previous = shell.geometry;
        shell.geometry = pebbleGeometry(THREE, next, detail);
        radii.fromArray(next.radii);
        previous.dispose();
        day = nextDay;
        shape = nextShape;
        invalidate();
      },
      renderNow() {
        if (frame !== null) cancelAnimationFrame(frame);
        return draw();
      },
      setPaused(value) {
        if (value === paused) return;
        paused = value;
        if (paused) {
          if (frame !== null) cancelAnimationFrame(frame);
          frame = null; painted = false;
        } else invalidate();
      },
      setMixture(mixture) {
        stone.visible = !!mixture;
        if (mixture) {
          const optics = window.NotchHydroAmber.materialParameters(mixture, 1);
          if (compact) glass.uniforms.absorptionColor.value.setRGB(...optics.attenuationColor);
          else {
            glass.attenuationColor.setRGB(...optics.attenuationColor);
            glass.attenuationDistance = optics.attenuationDistance;
          }
        }
        invalidate();
      },
      setDark(dark) { (compact ? glass : backdrop.material).uniforms.dim.value = dark ? 1 : 0; invalidate(); },
      setFormation(turn, glint, solidFraction = 1) {
        if (turn === formationTurn && glint === shoulderGlint.value && solidFraction === crystallization.value) return;
        stone.rotateOnWorldAxis(axisY, turn - formationTurn);
        formationTurn = turn;
        shoulderGlint.value = glint;
        crystallization.value = solidFraction;
        invalidate();
      },
      setPresentationTurn(angle) {
        if (angle === presentationTurn) return;
        presentationTurn = angle;
        presentation.quaternion.setFromAxisAngle(presentationAxis, angle);
        invalidate();
      },
      setRestPose(pose) {
        if (pose?.toFloat64Array) {
          inspection.quaternion.setFromRotationMatrix(inspectionMatrix.fromArray(pose.toFloat64Array()));
        } else {
          // Jar stones apply roll last, after their individual pitch and yaw.
          const { pitch = 0, yaw = 0, roll = 0 } = pose || {};
          inspection.rotation.set(pitch, yaw, roll, 'ZYX');
        }
        invalidate();
      },
      resetPose() {
        stone.rotation.set(...view.rotation);
        inspection.quaternion.identity();
        presentation.quaternion.identity();
        presentationTurn = 0;
        formationTurn = 0;
        shoulderGlint.value = 0;
        crystallization.value = 1;
        invalidate();
      },
      rotate(dx, dy) {
        inspection.rotateOnWorldAxis(axisY, dx);
        inspection.rotateOnWorldAxis(axisX, dy);
        invalidate();
      },
      dispose() {
        if (disposed) return;
        disposed = true;
        if (frame !== null) cancelAnimationFrame(frame);
        resize.disconnect();
        canvas.removeEventListener('webglcontextrestored', restoreEnvironment);
        shell.geometry.dispose(); glass.dispose();
        if (film) { film.geometry.dispose(); film.material.dispose(); }
        if (backdrop) { backdrop.geometry.dispose(); backdrop.material.dispose(); }
        environment?.dispose();
        renderer.dispose();
        renderer.forceContextLoss();
      }
    };
  };
})();
