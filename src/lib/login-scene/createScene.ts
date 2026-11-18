import * as THREE from "three";
import { THAILAND_RINGS } from "./data/thailandOutline";
import { SCENE_CITIES } from "./cities";

/**
 * Login hero scene: extruded Thailand map (Natural Earth outline), illustrative city pins,
 * three genuine 3D orbital rings (separate meshes, rotated every frame, counter-rotating, wobbling tilt)
 * and a pedestal. No shadow maps / post-processing; one rAF loop that pauses when hidden or off-screen.
 */

export interface SceneOptions {
  reducedMotion: boolean;
  /** Called if WebGL is unavailable or the context is lost, so the caller can show the static fallback. */
  onFail: () => void;
}
export interface SceneHandle {
  dispose: () => void;
}

const RED = 0xd71920;
const WORLD_PER_DEG = 0.63;
const DEPTH = 0.5;
const LON_C = 101.0;
const LAT_C = 13.1;
const COS_LAT = Math.cos((13 * Math.PI) / 180);

// outline is geographically exact; x is widened 1.2x so the shape reads like the approved art at this tilt
const X_STRETCH = 1.2;
const mapX = (lon: number) => (lon - LON_C) * COS_LAT * WORLD_PER_DEG * X_STRETCH;
const mapY = (lat: number) => (lat - LAT_C) * WORLD_PER_DEG;

const RING_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

// Brightness varies along the ring's angle (uv.x), so spinning the mesh visibly moves the light around it.
const RING_FRAG = /* glsl */ `
uniform vec3 uBase;
uniform vec3 uHi;
uniform float uAlpha;
uniform float uFade;
uniform float uCount;
uniform float uSharp;
uniform float uDash;
varying vec2 vUv;
void main() {
  float a = 0.5 + 0.5 * sin(vUv.x * 6.2831853 * uCount);
  float arc = pow(a, uSharp);
  if (uDash > 0.5 && a < 0.5) discard;
  vec3 c = mix(uBase, uHi, arc);
  gl_FragColor = vec4(c, uAlpha * uFade * (0.72 + 0.28 * arc));
}`;

interface RingSpec {
  radius: number;
  tube: number;
  base: number;
  hi: number;
  count: number;
  sharp: number;
  alpha: number;
  dash?: boolean;
  tilt: number;
  roll: number;
  spin: number; // rad/s about the ring's own axis (sign = direction)
  wobble: number;
  phase: number;
  satellite: number; // satellite colour
}

export function createLoginScene(canvas: HTMLCanvasElement, opts: SceneOptions): SceneHandle {
  const host = canvas.parentElement as HTMLElement;
  const compact = window.innerWidth < 768 || (navigator.hardwareConcurrency ?? 8) <= 4;

  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "high-performance" });
  } catch {
    opts.onFail();
    return { dispose() {} };
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, compact ? 1.5 : 2));
  renderer.setClearColor(0xffffff, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  camera.position.set(0, 2.4, 22.2);
  camera.lookAt(0, -0.6, 0);

  scene.add(new THREE.HemisphereLight(0xffffff, 0xb9c3d8, 0.9));
  const key = new THREE.DirectionalLight(0xffffff, 2.3);
  key.position.set(3, 7, 9);
  scene.add(key);
  const rim = new THREE.PointLight(0xff3b44, 20, 14);
  rim.position.set(-4, 1, -2);
  scene.add(rim);

  const root = new THREE.Group();
  scene.add(root);

  /* ---------- Thailand map ---------- */
  const mapGroup = new THREE.Group();
  mapGroup.rotation.x = -0.6;
  mapGroup.position.set(0, 0.35, 0);
  root.add(mapGroup);

  const shapes = THAILAND_RINGS.map((ring) => {
    const shape = new THREE.Shape();
    ring.forEach(([lon, lat], i) => (i ? shape.lineTo(mapX(lon), mapY(lat)) : shape.moveTo(mapX(lon), mapY(lat))));
    shape.closePath();
    return shape;
  });
  const mapGeo = new THREE.ExtrudeGeometry(shapes, { depth: DEPTH, bevelEnabled: false, curveSegments: 1 });
  const topMat = new THREE.MeshStandardMaterial({ color: 0xe6ebf5, roughness: 0.6, metalness: 0.0 });
  const sideMat = new THREE.MeshStandardMaterial({
    color: RED,
    roughness: 0.38,
    metalness: 0.1,
    emissive: 0x6a0a0f,
    emissiveIntensity: 0.55,
  });
  const mapMesh = new THREE.Mesh(mapGeo, [topMat, sideMat]);
  mapGroup.add(mapMesh);

  // soft cool edge line on the top face
  const edgeMat = new THREE.LineBasicMaterial({ color: 0x9cc2ee, transparent: true, opacity: 1 });
  const edgeGeos: THREE.BufferGeometry[] = [];
  THAILAND_RINGS.forEach((ring) => {
    const pts = ring.map(([lon, lat]) => new THREE.Vector3(mapX(lon), mapY(lat), DEPTH + 0.004));
    const g = new THREE.BufferGeometry().setFromPoints(pts);
    edgeGeos.push(g);
    mapGroup.add(new THREE.LineLoop(g, edgeMat));
  });

  /* ---------- pins ---------- */
  const seg = compact ? 14 : 24;
  const headGeo = new THREE.SphereGeometry(0.22, seg, seg);
  const tipGeo = new THREE.ConeGeometry(0.19, 0.5, seg);
  tipGeo.rotateX(Math.PI); // point down (tip at origin after translate)
  tipGeo.translate(0, 0.25, 0);
  headGeo.translate(0, 0.66, 0);
  const dotGeo = new THREE.SphereGeometry(0.08, 12, 12);
  dotGeo.translate(0, 0.68, 0.15);
  const pinMat = new THREE.MeshStandardMaterial({ color: 0xe0161e, roughness: 0.3, metalness: 0.1, emissive: 0xb3000a, emissiveIntensity: 0.9 });
  const dotMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const pulseGeo = new THREE.RingGeometry(0.2, 0.26, 40);

  interface Pin {
    group: THREE.Group;
    pulse: THREE.Mesh;
    pulseMat: THREE.MeshBasicMaterial;
    phase: number;
  }
  const pins: Pin[] = SCENE_CITIES.map((c, i) => {
    const group = new THREE.Group();
    group.position.set(mapX(c.lon), mapY(c.lat), DEPTH);
    const body = new THREE.Group();
    body.rotation.x = Math.PI / 2; // stand up along the map normal (+z)
    body.add(new THREE.Mesh(tipGeo, pinMat), new THREE.Mesh(headGeo, pinMat), new THREE.Mesh(dotGeo, dotMat));
    group.add(body);
    const pulseMat = new THREE.MeshBasicMaterial({ color: RED, transparent: true, opacity: 0, depthWrite: false });
    const pulse = new THREE.Mesh(pulseGeo, pulseMat);
    pulse.position.set(group.position.x, group.position.y, DEPTH + 0.012);
    mapGroup.add(group, pulse);
    return { group, pulse, pulseMat, phase: (i * 0.173) % 1 };
  });

  /* ---------- pedestal + beam ---------- */
  const pedestal = new THREE.Group();
  pedestal.position.set(0.9, -4.9, 0);
  root.add(pedestal);
  const discMat = new THREE.MeshBasicMaterial({ color: 0xeceef5 });
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(3.1, 3.3, 0.2, compact ? 40 : 72), discMat);
  const glowRingMat = new THREE.MeshBasicMaterial({ color: 0xff2a33 });
  const glowRing = new THREE.Mesh(new THREE.TorusGeometry(3.14, 0.05, 8, compact ? 64 : 120), glowRingMat);
  glowRing.rotation.x = Math.PI / 2;
  glowRing.position.y = 0.11;
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(3.7, 3.7, 0.03, compact ? 40 : 72),
    new THREE.MeshBasicMaterial({ color: 0xe5242b, transparent: true, opacity: 0.92 }),
  );
  base.position.y = -0.16;
  const beamMat = new THREE.MeshBasicMaterial({ color: 0xff4a52, transparent: true, opacity: 0.045, side: THREE.DoubleSide, depthWrite: false });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 3.0, 3.6, compact ? 32 : 56, 1, true), beamMat);
  beam.position.y = 1.7;
  pedestal.add(base, disc, glowRing, beam);

  /* ---------- orbital rings (real 3D meshes) ---------- */
  const ringSpecs: RingSpec[] = [
    { radius: 4.6, tube: 0.07, base: 0xd71920, hi: 0xff8a8f, count: 3, sharp: 3, alpha: 1, tilt: 1.05, roll: -0.3, spin: 0.55, wobble: 0.05, phase: 0, satellite: 0xd71920 },
    { radius: 4.05, tube: 0.045, base: 0x5c9dee, hi: 0xffffff, count: 2, sharp: 2.5, alpha: 0.95, tilt: 1.12, roll: 0.26, spin: -0.4, wobble: 0.06, phase: 1.7, satellite: 0x5c9dee },
    { radius: 3.5, tube: 0.028, base: 0x9fb4d6, hi: 0xffffff, count: 18, sharp: 1, alpha: 0.7, dash: true, tilt: 0.7, roll: -0.75, spin: 0.28, wobble: 0.08, phase: 3.1, satellite: 0x8fa6cc },
  ];
  const shaderMats: THREE.ShaderMaterial[] = [];
  const torusSeg = compact ? 80 : 160;
  const rings = ringSpecs.map((s) => {
    const mk = (tube: number, alphaMul: number) => {
      const m = new THREE.ShaderMaterial({
        vertexShader: RING_VERT,
        fragmentShader: RING_FRAG,
        transparent: true,
        depthWrite: false,
        uniforms: {
          uBase: { value: new THREE.Color(s.base) },
          uHi: { value: new THREE.Color(s.hi) },
          uAlpha: { value: s.alpha * alphaMul },
          uFade: { value: opts.reducedMotion ? 1 : 0 },
          uCount: { value: s.count },
          uSharp: { value: s.sharp },
          uDash: { value: s.dash ? 1 : 0 },
        },
      });
      shaderMats.push(m);
      return new THREE.Mesh(new THREE.TorusGeometry(s.radius, tube, 8, torusSeg), m);
    };
    const outer = new THREE.Group();
    outer.position.set(0, 0.2, 0);
    outer.rotation.z = s.roll;
    const pivot = new THREE.Group();
    const spin = new THREE.Group();
    spin.add(mk(s.tube, 1));
    if (!s.dash) spin.add(mk(s.tube * 3.4, 0.16)); // soft glow shell
    const sat = new THREE.Mesh(
      new THREE.SphereGeometry(s.dash ? 0.06 : 0.1, 16, 16),
      new THREE.MeshBasicMaterial({ color: s.satellite }),
    );
    sat.position.set(s.radius, 0, 0);
    spin.add(sat);
    pivot.add(spin);
    outer.add(pivot);
    root.add(outer);
    return { spec: s, pivot, spin };
  });

  /* ---------- sparkles ---------- */
  const N = compact ? 40 : 90;
  const pPos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const r = 2.6 + Math.random() * 3.0;
    const th = Math.random() * Math.PI * 2;
    pPos[i * 3] = Math.cos(th) * r;
    pPos[i * 3 + 1] = (Math.random() - 0.5) * 6.5;
    pPos[i * 3 + 2] = Math.sin(th) * r * 0.6;
  }
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute("position", new THREE.BufferAttribute(pPos, 3));
  const pMat = new THREE.PointsMaterial({ color: 0xe84c54, size: 0.07, sizeAttenuation: true, transparent: true, opacity: 0.55, depthWrite: false });
  const sparkles = new THREE.Points(pGeo, pMat);
  root.add(sparkles);

  /* ---------- sizing, pointer, loop ---------- */
  function resize() {
    const w = host.clientWidth;
    const h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (opts.reducedMotion) renderer.render(scene, camera);
  }
  const ro = new ResizeObserver(resize);
  ro.observe(host);
  resize();

  let px = 0;
  let py = 0;
  const hoverCapable = window.matchMedia("(hover: hover)").matches;
  const onPointer = (e: PointerEvent) => {
    px = (e.clientX / window.innerWidth - 0.5) * 2;
    py = (e.clientY / window.innerHeight - 0.5) * 2;
  };
  if (hoverCapable && !opts.reducedMotion) window.addEventListener("pointermove", onPointer, { passive: true });

  const clock = new THREE.Timer();
  let raf = 0;
  let visible = true;
  let inView = true;
  let disposed = false;

  const easeOut = (x: number) => 1 - Math.pow(1 - x, 3);

  function frame() {
    raf = 0;
    if (disposed || !visible || !inView) return;
    clock.update();
    const t = clock.getElapsed();
    const intro = opts.reducedMotion ? 1 : easeOut(Math.min(1, t / 1.4));

    root.rotation.y += (px * 0.16 - root.rotation.y) * 0.05;
    root.rotation.x += (py * 0.05 - root.rotation.x) * 0.05;

    const s = 0.86 + 0.14 * intro;
    mapGroup.scale.setScalar(s);
    mapGroup.position.y = 0.35 + Math.sin(t * 0.9) * 0.1;
    mapGroup.rotation.z = Math.sin(t * 0.35) * 0.03;

    for (const r of rings) {
      const dir = r.spec.spin;
      r.spin.rotation.z = (t * dir) + r.spec.phase + (1 - intro) * 5 * Math.sign(dir);
      r.pivot.rotation.x = r.spec.tilt + Math.sin(t * 0.5 + r.spec.phase) * r.spec.wobble;
      r.pivot.rotation.y = Math.sin(t * 0.37 + r.spec.phase * 1.3) * r.spec.wobble;
    }
    for (const m of shaderMats) m.uniforms.uFade.value = intro;

    for (const p of pins) {
      const k = (t * 0.55 + p.phase) % 1;
      p.pulse.scale.setScalar(0.8 + k * 1.5);
      p.pulseMat.opacity = (1 - k) * 0.38 * intro;
      p.group.position.z = DEPTH + Math.sin(t * 1.6 + p.phase * 6.28) * 0.025;
    }
    sparkles.rotation.y = t * 0.05;
    sparkles.position.y = Math.sin(t * 0.4) * 0.08;

    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  }
  function kick() {
    if (opts.reducedMotion) {
      renderer.render(scene, camera);
      return;
    }
    if (!raf && visible && inView && !disposed) raf = requestAnimationFrame(frame);
  }

  const io = new IntersectionObserver(([e]) => {
    inView = e.isIntersecting;
    kick();
  });
  io.observe(host);
  const onVis = () => {
    visible = !document.hidden;
    kick();
  };
  document.addEventListener("visibilitychange", onVis);

  const onLost = (e: Event) => {
    e.preventDefault();
    opts.onFail();
  };
  canvas.addEventListener("webglcontextlost", onLost);

  if (opts.reducedMotion) {
    for (const m of shaderMats) m.uniforms.uFade.value = 1;
    mapGroup.scale.setScalar(1);
    renderer.render(scene, camera);
  } else {
    kick();
  }

  return {
    dispose() {
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pointermove", onPointer);
      canvas.removeEventListener("webglcontextlost", onLost);
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose?.();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
        else mat?.dispose?.();
      });
      edgeGeos.forEach((g) => g.dispose());
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
