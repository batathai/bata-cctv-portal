import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { THAILAND_RINGS } from "./data/thailandOutline";
import { SCENE_CITIES } from "./cities";

/**
 * Login hero scene.
 *  - Thailand map: bevelled extrusion (Natural Earth outline), glossy top, red-lit sides, image-based reflections
 *  - small illustrative city pins with pulses
 *  - two glossy 3D orbital rings (red / blue) + a faint dotted ring: real meshes with thickness and energy segments,
 *    rotating in opposite directions and wobbling in tilt; depth-tested so they pass in front of / behind the map
 *  - low silver glass pedestal (lathe geometry) with a thin red plate, lit front slots, contact shadow and a faint rising light
 * No shadow maps / post-processing. One rAF loop that pauses when hidden or off-screen.
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
const X_STRETCH = 1.2; // outline is geographically exact; x widened so the shape reads like the approved art at this tilt
const DEPTH = 0.5;
const BEVEL = 0.06;
const MAP_TILT = 0.6;
const LON_C = 101.0;
const LAT_C = 13.1;
const COS_LAT = Math.cos((13 * Math.PI) / 180);

const mapX = (lon: number) => (lon - LON_C) * COS_LAT * WORLD_PER_DEG * X_STRETCH;
const mapY = (lat: number) => (lat - LAT_C) * WORLD_PER_DEG;

/* ---------- shaders ---------- */
const GLOW_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const GLOW_FRAG = /* glsl */ `
uniform vec3 uBase; uniform vec3 uHi; uniform float uAlpha; uniform float uFade;
uniform float uCount; uniform float uSharp; uniform float uDash;
varying vec2 vUv;
void main() {
  float a = 0.5 + 0.5 * sin(vUv.x * 6.2831853 * uCount);
  float arc = pow(a, uSharp);
  if (uDash > 0.5 && a < 0.5) discard;
  gl_FragColor = vec4(mix(uBase, uHi, arc), uAlpha * uFade * (0.6 + 0.4 * arc));
}`;

const BEAM_VERT = /* glsl */ `
varying vec2 vUv; varying vec3 vN; varying vec3 vV;
void main() {
  vUv = uv;
  vN = normalMatrix * normal;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vV = -mv.xyz;
  gl_Position = projectionMatrix * mv;
}`;

const BEAM_FRAG = /* glsl */ `
uniform float uTime; uniform float uAlpha; uniform float uFade;
varying vec2 vUv; varying vec3 vN; varying vec3 vV;
void main() {
  float h = vUv.y;                                  // 0 at the pedestal, 1 at the top of the light
  float rise = pow(1.0 - h, 1.5);
  float ang = vUv.x * 6.2831853;
  float streak = 0.62 + 0.38 * sin(ang * 13.0 + sin(ang * 5.0) * 1.7 + uTime * 0.18);
  float facing = pow(abs(dot(normalize(vN), normalize(vV))), 1.3);   // soft silhouette, no hard edge
  vec3 c = mix(vec3(1.0, 0.58, 0.63), vec3(1.0, 0.93, 0.94), (1.0 - h) * 0.75);
  float breathe = 0.93 + 0.07 * sin(uTime * 0.6);
  gl_FragColor = vec4(c, uAlpha * uFade * rise * streak * facing * breathe);
}`;

function radialTexture(stops: Array<[number, string]>, size = 256) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  stops.forEach(([o, col]) => grd.addColorStop(o, col));
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Soft shadow of the (tilted) map projected onto the platform, drawn from the real outline. */
function shadowTexture(worldSide: number, k: number) {
  const size = 512;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  const ppu = size / worldSide;
  g.shadowColor = "rgba(60, 15, 25, 0.95)";
  g.shadowBlur = 34;
  g.shadowOffsetX = 5000; // draw the shape far off-canvas so only its blurred shadow lands here
  g.fillStyle = "#000";
  THAILAND_RINGS.forEach((ring) => {
    g.beginPath();
    ring.forEach(([lon, lat], i) => {
      const x = size / 2 + mapX(lon) * k * ppu - 5000;
      const y = size / 2 - mapY(lat) * Math.sin(MAP_TILT) * k * ppu;
      if (i) g.lineTo(x, y);
      else g.moveTo(x, y);
    });
    g.closePath();
    g.fill();
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Physical (clear-coat) material on capable devices; plain standard material on compact/low-power ones. */
function glossy(compact: boolean, params: THREE.MeshPhysicalMaterialParameters): THREE.Material {
  if (!compact) return new THREE.MeshPhysicalMaterial(params);
  const rest: THREE.MeshPhysicalMaterialParameters = { ...params };
  delete rest.clearcoat;
  delete rest.clearcoatRoughness;
  return new THREE.MeshStandardMaterial(rest as THREE.MeshStandardMaterialParameters);
}

interface RingSpec {
  radius: number;
  tube: number;
  base: number;
  emissive: number;
  hi: number;
  arcs: number;
  arcLen: number;
  tilt: number;
  roll: number;
  spin: number; // rad/s about the ring's own axis (sign = direction)
  wobble: number;
  phase: number;
  dotted?: boolean;
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
  camera.position.set(0, 3.19, 23.58); // dolly-out (x1.0625) = map & rings render ~20% smaller than before
  camera.lookAt(0, -0.6, 0);

  // reflections: small procedural studio environment, generated once
  const pmrem = new THREE.PMREMGenerator(renderer);
  const roomEnv = new RoomEnvironment();
  const envTex = pmrem.fromScene(roomEnv, 0.04).texture;
  scene.environment = envTex;
  scene.environmentIntensity = 0.75;
  roomEnv.dispose();
  pmrem.dispose();

  scene.add(new THREE.HemisphereLight(0xffffff, 0xaeb8cf, 0.7));
  const key = new THREE.DirectionalLight(0xffffff, 1.5);
  key.position.set(4, 8, 10);
  scene.add(key);
  const rim = new THREE.PointLight(0xff3a44, 40, 16);
  rim.position.set(-5, 1.5, -2.5);
  scene.add(rim);
  const under = new THREE.PointLight(0xff4a55, 26, 9); // red glow thrown up from the platform
  under.position.set(0.6, -3.2, 1.5);
  scene.add(under);

  const root = new THREE.Group();
  scene.add(root);

  /* ---------- Thailand map ---------- */
  const mapGroup = new THREE.Group();
  mapGroup.rotation.x = -MAP_TILT;
  mapGroup.position.set(0, 0.35, 0);
  root.add(mapGroup);

  const shapes = THAILAND_RINGS.map((ring) => {
    const shape = new THREE.Shape();
    ring.forEach(([lon, lat], i) => (i ? shape.lineTo(mapX(lon), mapY(lat)) : shape.moveTo(mapX(lon), mapY(lat))));
    shape.closePath();
    return shape;
  });
  const mapGeo = new THREE.ExtrudeGeometry(shapes, {
    depth: DEPTH,
    bevelEnabled: true,
    bevelThickness: BEVEL,
    bevelSize: 0.05,
    bevelOffset: 0,
    bevelSegments: compact ? 1 : 2,
    curveSegments: 1,
  });
  const topMat = glossy(compact, {
    color: 0xd2d9e7,
    roughness: 0.4,
    metalness: 0.0,
    clearcoat: 0.5,
    clearcoatRoughness: 0.25,
    envMapIntensity: 0.45,
  });
  const sideMat = glossy(compact, {
    color: 0xd9141c,
    roughness: 0.28,
    metalness: 0.25,
    clearcoat: 0.6,
    clearcoatRoughness: 0.2,
    emissive: 0xff1f2b,
    emissiveIntensity: 0.2,
    envMapIntensity: 0.9,
  });
  mapGroup.add(new THREE.Mesh(mapGeo, [topMat, sideMat]));

  // soft red-lit rim on the top face
  const edgeMat = new THREE.LineBasicMaterial({ color: 0xff7d85, transparent: true, opacity: 0.6 });
  const edgeGeos: THREE.BufferGeometry[] = [];
  THAILAND_RINGS.forEach((ring) => {
    const pts = ring.map(([lon, lat]) => new THREE.Vector3(mapX(lon), mapY(lat), DEPTH + BEVEL + 0.004));
    const g = new THREE.BufferGeometry().setFromPoints(pts);
    edgeGeos.push(g);
    mapGroup.add(new THREE.LineLoop(g, edgeMat));
  });

  /* ---------- pins (small) ---------- */
  const seg = compact ? 12 : 20;
  const headGeo = new THREE.SphereGeometry(0.2, seg, seg);
  const tipGeo = new THREE.ConeGeometry(0.17, 0.46, seg);
  tipGeo.rotateX(Math.PI);
  tipGeo.translate(0, 0.23, 0);
  headGeo.translate(0, 0.6, 0);
  const dotGeo = new THREE.SphereGeometry(0.07, 10, 10);
  dotGeo.translate(0, 0.62, 0.14);
  const pinMat = new THREE.MeshStandardMaterial({ color: 0xe0161e, roughness: 0.28, metalness: 0.1, emissive: 0xb3000a, emissiveIntensity: 0.8 });
  const dotMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const pulseGeo = new THREE.RingGeometry(0.12, 0.16, 36);
  const PIN_SCALE = 0.4;
  const PIN_Z = DEPTH + BEVEL;

  interface Pin { group: THREE.Group; pulse: THREE.Mesh; pulseMat: THREE.MeshBasicMaterial; phase: number }
  const pins: Pin[] = SCENE_CITIES.map((c, i) => {
    const group = new THREE.Group();
    group.position.set(mapX(c.lon), mapY(c.lat), PIN_Z);
    const body = new THREE.Group();
    body.rotation.x = Math.PI / 2;
    body.scale.setScalar(PIN_SCALE);
    body.add(new THREE.Mesh(tipGeo, pinMat), new THREE.Mesh(headGeo, pinMat), new THREE.Mesh(dotGeo, dotMat));
    group.add(body);
    const pulseMat = new THREE.MeshBasicMaterial({ color: RED, transparent: true, opacity: 0, depthWrite: false });
    const pulse = new THREE.Mesh(pulseGeo, pulseMat);
    pulse.position.set(group.position.x, group.position.y, PIN_Z + 0.012);
    mapGroup.add(group, pulse);
    return { group, pulse, pulseMat, phase: (i * 0.173) % 1 };
  });

  /* ---------- holographic pedestal (real geometry) ---------- */
  // Low, thick silver drum with rounded edges, a frosted-glass top, three lit slots on the front wall,
  // a thin red plate underneath, soft contact shadow and a faint rising light. Sized to ~64% of the map width.
  const PLATFORM_Y = -5.3;
  const PLATFORM_SCALE = 0.875; // x0.8 camera dolly => ~30% smaller on screen than before // sits well below the map so the map floats above it, as in the reference
  const PED_R = 1.95; // pedestal radius
  const PED_H = 0.56; // pedestal height
  const PLATE_H = 0.05;
  const PLATE_R = PED_R + 0.19; // red plate only peeks out as a thin rim
  const radial = compact ? 64 : 128;
  const platform = new THREE.Group();
  platform.position.set(0.5, PLATFORM_Y, 0);
  platform.scale.setScalar(PLATFORM_SCALE);
  root.add(platform);

  // body: lathe profile with rounded bottom/top shoulders and a shallow recess for the glass
  const profile: THREE.Vector2[] = [];
  const arc = (cx: number, cy: number, r: number, a0: number, a1: number, n: number) => {
    for (let i = 0; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      profile.push(new THREE.Vector2(cx + Math.cos(a) * r, cy + Math.sin(a) * r));
    }
  };
  const rs = compact ? 3 : 6;
  profile.push(new THREE.Vector2(0, PLATE_H));
  arc(PED_R - 0.06, PLATE_H + 0.06, 0.06, -Math.PI / 2, 0, rs); // bottom shoulder
  arc(PED_R - 0.12, PLATE_H + PED_H - 0.12, 0.12, 0, Math.PI / 2, rs); // top shoulder
  profile.push(new THREE.Vector2(PED_R - 0.3, PLATE_H + PED_H));
  profile.push(new THREE.Vector2(PED_R - 0.3, PLATE_H + PED_H - 0.05));
  profile.push(new THREE.Vector2(0, PLATE_H + PED_H - 0.05));
  const bodyMat = glossy(compact, { color: 0xd3d8e1, roughness: 0.27, metalness: 0.68, clearcoat: 0.7, clearcoatRoughness: 0.2, emissive: 0x1b212c, emissiveIntensity: 0.15, envMapIntensity: 1.2 });
  const body = new THREE.Mesh(new THREE.LatheGeometry(profile, radial), bodyMat);
  const TOP = PLATE_H + PED_H;

  // thin Bata-red plate under the pedestal (lit lightly so it glows without a hard outline)
  const plate = new THREE.Mesh(
    new THREE.CylinderGeometry(PLATE_R, PLATE_R + 0.02, PLATE_H, radial),
    glossy(compact, { color: 0xd4131b, roughness: 0.32, metalness: 0.1, clearcoat: 0.8, clearcoatRoughness: 0.15, emissive: 0xe0101a, emissiveIntensity: 0.16 }),
  );
  plate.position.y = PLATE_H / 2;

  // recessed groove ring (slightly darker metal) between the bezel and the glass
  const groove = new THREE.Mesh(
    new THREE.RingGeometry(PED_R - 0.4, PED_R - 0.3, radial),
    new THREE.MeshStandardMaterial({ color: 0x8f98aa, roughness: 0.5, metalness: 0.6 }),
  );
  groove.rotation.x = -Math.PI / 2;
  groove.position.y = TOP - 0.048;

  // frosted-white glass top (translucent, soft reflections; no transmission pass so it stays cheap)
  const glassMat = glossy(compact, {
    color: 0xf6f8fc,
    roughness: 0.42,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.1,
    transparent: true,
    opacity: 0.9,
    emissive: 0xffe9ec,
    emissiveIntensity: 0.28,
    envMapIntensity: 1.1,
  });
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(PED_R - 0.4, PED_R - 0.4, 0.045, radial), glassMat);
  glass.position.y = TOP - 0.026;
  glass.renderOrder = 1;

  // three softly lit slots on the front wall
  const slotMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95 });
  const slotDefs: Array<[number, number]> = [[0, 0.5], [-0.78, 0.3], [0.78, 0.3]]; // [centre angle, length]
  const slots = slotDefs.map(([a, len]) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(PED_R + 0.004, PED_R + 0.004, 0.075, 24, 1, true, a - len / 2, len), slotMat);
    m.position.y = PLATE_H + PED_H * 0.42;
    return m;
  });
  const slotGlowTex = radialTexture([[0, "rgba(255,255,255,0.9)"], [0.4, "rgba(255,170,178,0.35)"], [1, "rgba(255,120,130,0)"]], 128);
  const slotGlowMat = new THREE.SpriteMaterial({ map: slotGlowTex, transparent: true, depthWrite: false });
  const slotGlows = slotDefs.map(([a, len]) => {
    const s = new THREE.Sprite(slotGlowMat);
    s.scale.set(len * 2.4, 0.4, 1);
    s.position.set(Math.sin(a) * (PED_R + 0.06), PLATE_H + PED_H * 0.42, Math.cos(a) * (PED_R + 0.06));
    s.renderOrder = 3;
    return s;
  });
  platform.add(plate, body, groove, glass, ...slots, ...slotGlows);

  // soft pink-white glow on the glass: bright centre, no hard edge, no rings
  const poolTex = radialTexture([
    [0, "rgba(255,255,255,0.9)"],
    [0.28, "rgba(255,206,211,0.5)"],
    [0.6, "rgba(255,130,140,0.14)"],
    [1, "rgba(255,110,120,0)"],
  ]);
  const poolMat = new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, depthWrite: false });
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(2.7, 2.7), poolMat);
  pool.rotation.x = -Math.PI / 2;
  pool.position.y = TOP + 0.004;
  pool.renderOrder = 2;
  platform.add(pool);

  // ambient pink wash + contact shadow on the ground around the pedestal
  const ambientMat = new THREE.MeshBasicMaterial({
    map: radialTexture([[0, "rgba(255,120,130,0.3)"], [0.55, "rgba(255,150,160,0.12)"], [1, "rgba(255,150,160,0)"]]),
    transparent: true,
    depthWrite: false,
  });
  const ambient = new THREE.Mesh(new THREE.PlaneGeometry(7.2, 7.2), ambientMat);
  ambient.rotation.x = -Math.PI / 2;
  ambient.position.y = 0.002;
  const contactMat = new THREE.MeshBasicMaterial({
    map: radialTexture([[0, "rgba(70,25,35,0.5)"], [0.5, "rgba(70,25,35,0.32)"], [0.78, "rgba(70,25,35,0.1)"], [1, "rgba(70,25,35,0)"]]),
    transparent: true,
    depthWrite: false,
  });
  const contact = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 5.6), contactMat);
  contact.rotation.x = -Math.PI / 2;
  contact.position.y = 0.004;
  ambient.renderOrder = 0;
  contact.renderOrder = 0;
  platform.add(ambient, contact);

  // soft projected shadow of the map, drawn from the real outline onto the glass
  const SHADOW_K = 0.36;
  const shadowTex = shadowTexture(7, SHADOW_K);
  const shadowMat = new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, opacity: 0.3, depthWrite: false });
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(7, 7), shadowMat);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.set(0, TOP + 0.006, 0.05);
  shadow.renderOrder = 2;
  platform.add(shadow);

  // faint rising light (pale pink / white vertical streaks that fade out toward the map)
  const beamMat = new THREE.ShaderMaterial({
    vertexShader: BEAM_VERT,
    fragmentShader: BEAM_FRAG,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 }, uAlpha: { value: 0.22 }, uFade: { value: opts.reducedMotion ? 1 : 0 } },
  });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.75, 1.2, 3.0, compact ? 32 : 64, 1, true), beamMat);
  beam.position.y = TOP + 1.5;
  beam.renderOrder = 4;
  platform.add(beam);

  /* ---------- orbital rings (real 3D meshes) ---------- */
  const ringSpecs: RingSpec[] = [
    { radius: 4.6, tube: 0.06, base: 0xd71920, emissive: 0x8a0008, hi: 0xffffff, arcs: 3, arcLen: 0.95, tilt: 1.05, roll: -0.3, spin: 0.55, wobble: 0.05, phase: 0 },
    { radius: 4.05, tube: 0.041, base: 0x4f9bf0, emissive: 0x1a4c99, hi: 0xffffff, arcs: 2, arcLen: 0.75, tilt: 1.12, roll: 0.26, spin: -0.4, wobble: 0.06, phase: 1.7 },
    { radius: 3.5, tube: 0.015, base: 0x9fb4d6, emissive: 0x9fb4d6, hi: 0xffffff, arcs: 0, arcLen: 0, tilt: 0.7, roll: -0.75, spin: 0.28, wobble: 0.08, phase: 3.1, dotted: true },
  ];
  const glowMats: THREE.ShaderMaterial[] = [];
  const torusSeg = compact ? 90 : 180;

  const rings = ringSpecs.map((s) => {
    const outer = new THREE.Group();
    outer.position.set(0, 0.2, 0);
    outer.rotation.z = s.roll;
    const pivot = new THREE.Group();
    const spin = new THREE.Group();

    if (s.dotted) {
      const m = new THREE.ShaderMaterial({
        vertexShader: GLOW_VERT,
        fragmentShader: GLOW_FRAG,
        transparent: true,
        depthWrite: false,
        uniforms: {
          uBase: { value: new THREE.Color(s.base) }, uHi: { value: new THREE.Color(s.hi) },
          uAlpha: { value: 0.75 }, uFade: { value: opts.reducedMotion ? 1 : 0 },
          uCount: { value: 18 }, uSharp: { value: 1 }, uDash: { value: 1 },
        },
      });
      glowMats.push(m);
      spin.add(new THREE.Mesh(new THREE.TorusGeometry(s.radius, s.tube, 6, torusSeg), m));
    } else {
      const bodyMat = new THREE.MeshStandardMaterial({ color: s.base, roughness: 0.22, metalness: 0.35, emissive: s.emissive, emissiveIntensity: 0.55, envMapIntensity: 1.2 });
      spin.add(new THREE.Mesh(new THREE.TorusGeometry(s.radius, s.tube, 16, torusSeg), bodyMat));
      // thicker bright energy segments: make the rotation read in 3D
      const segMat = new THREE.MeshStandardMaterial({ color: s.hi, roughness: 0.2, metalness: 0.1, emissive: s.base, emissiveIntensity: 0.9, envMapIntensity: 1 });
      const segGeo = new THREE.TorusGeometry(s.radius, s.tube * 1.8, 12, 48, s.arcLen);
      for (let i = 0; i < s.arcs; i++) {
        const segMesh = new THREE.Mesh(segGeo, segMat);
        segMesh.rotation.z = (i / s.arcs) * Math.PI * 2;
        spin.add(segMesh);
      }
      // soft glow shell
      const glow = new THREE.ShaderMaterial({
        vertexShader: GLOW_VERT,
        fragmentShader: GLOW_FRAG,
        transparent: true,
        depthWrite: false,
        uniforms: {
          uBase: { value: new THREE.Color(s.base) }, uHi: { value: new THREE.Color(s.hi) },
          uAlpha: { value: 0.07 }, uFade: { value: opts.reducedMotion ? 1 : 0 },
          uCount: { value: s.arcs || 1 }, uSharp: { value: 2 }, uDash: { value: 0 },
        },
      });
      glowMats.push(glow);
      spin.add(new THREE.Mesh(new THREE.TorusGeometry(s.radius, s.tube * 2.6, 8, torusSeg), glow));
      // satellite
      const sat = new THREE.Mesh(
        new THREE.SphereGeometry(s.tube * 2.4, 20, 20),
        new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.15, emissive: s.base, emissiveIntensity: 0.9 }),
      );
      sat.position.set(s.radius, 0, 0);
      spin.add(sat);
    }
    pivot.add(spin);
    outer.add(pivot);
    root.add(outer);
    return { spec: s, outer, pivot, spin };
  });

  /* ---------- sparkles ---------- */
  const N = compact ? 36 : 80;
  const pPos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const r = 2.8 + Math.random() * 3.0;
    const th = Math.random() * Math.PI * 2;
    pPos[i * 3] = Math.cos(th) * r;
    pPos[i * 3 + 1] = (Math.random() - 0.5) * 6.5;
    pPos[i * 3 + 2] = Math.sin(th) * r * 0.6;
  }
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute("position", new THREE.BufferAttribute(pPos, 3));
  const pMat = new THREE.PointsMaterial({ color: 0xe84c54, size: 0.06, sizeAttenuation: true, transparent: true, opacity: 0.5, depthWrite: false });
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

  const timer = new THREE.Timer();
  let raf = 0;
  let visible = true;
  let inView = true;
  let disposed = false;
  const easeOut = (x: number) => 1 - Math.pow(1 - x, 3);

  function frame() {
    raf = 0;
    if (disposed || !visible || !inView) return;
    timer.update();
    const t = timer.getElapsed();
    const intro = opts.reducedMotion ? 1 : easeOut(Math.min(1, t / 1.4));

    root.rotation.y += (px * 0.14 - root.rotation.y) * 0.05;
    root.rotation.x += (py * 0.04 - root.rotation.x) * 0.05;

    const bob = Math.sin(t * 0.9);
    mapGroup.scale.setScalar(0.86 + 0.14 * intro);
    mapGroup.position.y = 0.35 + bob * 0.1;
    mapGroup.rotation.z = Math.sin(t * 0.35) * 0.03;

    // shadow / light pool react to the floating map
    shadow.scale.setScalar(1 - bob * 0.03);
    shadowMat.opacity = (0.3 - bob * 0.02) * intro;

    for (const r of rings) {
      r.spin.rotation.z = t * r.spec.spin + r.spec.phase + (1 - intro) * 5 * Math.sign(r.spec.spin);
      r.pivot.rotation.x = r.spec.tilt + Math.sin(t * 0.5 + r.spec.phase) * r.spec.wobble;
      r.pivot.rotation.y = Math.sin(t * 0.37 + r.spec.phase * 1.3) * r.spec.wobble;
      r.outer.scale.setScalar(0.8 + 0.2 * intro);
    }
    for (const m of glowMats) m.uniforms.uFade.value = intro;
    beamMat.uniforms.uTime.value = t;
    beamMat.uniforms.uFade.value = intro;

    // restrained light breathing on the pedestal
    const breath = 0.5 + 0.5 * Math.sin(t * 0.6);
    poolMat.opacity = (0.88 + 0.12 * breath) * intro;
    slotMat.opacity = (0.88 + 0.1 * breath) * intro;
    slotGlowMat.opacity = (0.7 + 0.2 * breath) * intro;

    for (const p of pins) {
      const k = (t * 0.55 + p.phase) % 1;
      p.pulse.scale.setScalar(0.8 + k * 1.6);
      p.pulseMat.opacity = (1 - k) * 0.22 * intro;
      p.group.position.z = PIN_Z + Math.sin(t * 1.6 + p.phase * 6.28) * 0.02;
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
    for (const m of glowMats) m.uniforms.uFade.value = 1;
    beamMat.uniforms.uFade.value = 1;
    shadowMat.opacity = 0.3;
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
        const list = Array.isArray(mat) ? mat : mat ? [mat] : [];
        list.forEach((x) => {
          (x as THREE.MeshBasicMaterial).map?.dispose?.();
          x.dispose();
        });
      });
      edgeGeos.forEach((g) => g.dispose());
      envTex.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
