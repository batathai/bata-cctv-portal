import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

/**
 * Login hero scene.
 *  - Thailand map: supplied artwork on a depth-writing cut-out plane (floats and sways in the scene)
 *  - two luminous 3D orbital trails (red / blue) + a faint dotted ring: real meshes rotating in opposite directions and
 *    wobbling in tilt; depth-tested so they pass in front of / behind the map
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

// Orbital rings: true = supplied artwork (two layers: back half behind the map, front half in front of it);
// false = the procedural 3D rotating energy-trail rings (kept below as an alternative).
const USE_RING_ARTWORK = false;
const RING_BACK_URL = "/login/rings-back.webp";
const RING_FRONT_URL = "/login/rings-front.webp";
const RING_W = 11.2; // world width of the ring artwork plane (1400 x 720 px artwork)
const RING_X = 0.35;
const RING_Y = 1.7;
const RING_DEPTH = 0.9; // the two halves sit this far in front of / behind the map plane

// The map is supplied artwork (pearl-white slab, red walls, glowing pins) placed in the scene as a cut-out plane.
const MAP_URL = "/login/thailand-map.webp";
const MAP_H = 8.7; // world height of the map plane (width follows the artwork's aspect)
const MAP_X = 0.3;
const MAP_Y = -0.1;

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
  float rise = pow(1.0 - h, 1.25);
  float ang = vUv.x * 6.2831853;
  float wave = 0.5 + 0.5 * sin(ang * 11.0 + sin(ang * 4.0) * 1.7 + uTime * 0.15);
  float streak = 0.28 + 0.72 * pow(wave, 2.2);
  float facing = pow(abs(dot(normalize(vN), normalize(vV))), 1.3);   // soft silhouette, no hard edge
  vec3 c = mix(vec3(1.0, 0.58, 0.63), vec3(1.0, 0.93, 0.94), (1.0 - h) * 0.75);
  float breathe = 0.93 + 0.07 * sin(uTime * 0.6);
  gl_FragColor = vec4(c, uAlpha * uFade * rise * streak * facing * breathe);
}`;

/** Luminous energy trail: white-hot core, soft coloured falloff (view-dependent, so it reads as light, not as a solid tube). */
const TRAIL_VERT = /* glsl */ `
varying vec2 vUv; varying vec3 vN; varying vec3 vV;
void main() {
  vUv = uv;
  vN = normalMatrix * normal;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vV = -mv.xyz;
  gl_Position = projectionMatrix * mv;
}`;

const TRAIL_FRAG = /* glsl */ `
uniform vec3 uCol; uniform float uAlpha; uniform float uFade; uniform float uTime; uniform float uHeads; uniform float uWhite; uniform float uDir;
varying vec2 vUv; varying vec3 vN; varying vec3 vV;
void main() {
  float f = clamp(abs(dot(normalize(vN), normalize(vV))), 0.0, 1.0);   // 1 on the centre line of the tube
  float core = pow(f, 7.0);
  float halo = pow(f, 1.5) * 0.4;
  float body = pow(f, 2.2);
  float h = fract(vUv.x * uHeads - uTime * uDir * 0.3);                       // slow drift of the bright heads along the path
  float energy = 0.12 + 0.88 * exp(-h * 3.0);   // bright comet head with a long fading tail
  float hot = core * (uWhite + (1.0 - uWhite) * energy);
  vec3 c = mix(uCol, vec3(1.0), clamp(hot, 0.0, 1.0));
  float a = clamp(halo + body, 0.0, 1.0) * uAlpha * uFade * (0.5 + 0.5 * energy);
  gl_FragColor = vec4(c, a);
}`;

/** Wide, soft additive bloom around each ring (cheap stand-in for a post-process glow). */
const HALO_FRAG = /* glsl */ `
uniform vec3 uCol; uniform float uAlpha; uniform float uFade; uniform float uTime; uniform float uHeads; uniform float uDir;
varying vec2 vUv; varying vec3 vN; varying vec3 vV;
void main() {
  float f = clamp(abs(dot(normalize(vN), normalize(vV))), 0.0, 1.0);
  float h = fract(vUv.x * uHeads - uTime * uDir * 0.3);
  float energy = 0.25 + 0.75 * exp(-h * 3.0);
  float a = pow(f, 2.4) * uAlpha * uFade * energy;
  gl_FragColor = vec4(uCol * a, a);
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

/** Soft shadow of the map on the pedestal, drawn from the artwork's own alpha (squashed flat and blurred). */
function shadowFromImage(img: CanvasImageSource & { width: number; height: number }, mapW: number, mapH: number, worldSide: number, k: number) {
  const size = 512;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  const ppu = size / worldSide;
  const dw = mapW * k * ppu;
  const dh = mapH * k * ppu * 0.45;
  g.shadowColor = "rgba(60, 15, 25, 0.95)";
  g.shadowBlur = 34;
  g.shadowOffsetX = 5000; // draw far off-canvas so only the blurred shadow lands here
  g.drawImage(img, size / 2 - dw / 2 - 5000, size / 2 - dh / 2, dw, dh);
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
  delete rest.sheen;
  delete rest.sheenRoughness;
  delete rest.sheenColor;
  delete rest.iridescence;
  delete rest.iridescenceIOR;
  delete rest.iridescenceThicknessRange;
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
  camera.position.set(0, 2.4, 22.2);
  camera.lookAt(0, -0.6, 0);

  // reflections: small procedural studio environment, generated once
  const pmrem = new THREE.PMREMGenerator(renderer);
  const roomEnv = new RoomEnvironment();
  const envTex = pmrem.fromScene(roomEnv, 0.04).texture;
  scene.environment = envTex;
  scene.environmentIntensity = 0.75;
  roomEnv.dispose();
  pmrem.dispose();

  scene.add(new THREE.HemisphereLight(0xffffff, 0xf0c6d0, 0.7)); // pink bounce from below
  const fill = new THREE.DirectionalLight(0xffe4ea, 0.55); // soft studio fill from the left
  fill.position.set(-6, 3, 8);
  scene.add(fill);
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

  /* ---------- Thailand map (supplied artwork, filled in once the texture has loaded) ---------- */
  const mapGroup = new THREE.Group();
  mapGroup.position.set(MAP_X, MAP_Y, 0);
  mapGroup.visible = false;
  root.add(mapGroup);
  let mapLoadedAt = -1;
  const mapDisposables: Array<{ dispose: () => void }> = [];

  /* ---------- holographic pedestal (real geometry) ---------- */
  // Low, thick silver drum with rounded edges, a frosted-glass top, three lit slots on the front wall,
  // a thin red plate underneath, soft contact shadow and a faint rising light. Sized to ~64% of the map width.
  const PLATFORM_Y = -5.4;
  const PLATFORM_SCALE = 1; // sits well below the map so the map floats above it, as in the reference
  const PED_R = 2.2; // pedestal radius
  const PED_H = 0.5; // pedestal height
  const PLATE_H = 0.06;
  const PLATE_R = PED_R * 1.27; // thin red plate, ~27% wider than the pedestal like the reference
  const radial = compact ? 64 : 128;
  const platform = new THREE.Group();
  platform.position.set(0.5, PLATFORM_Y, 0);
  platform.scale.setScalar(PLATFORM_SCALE);
  platform.rotation.x = -0.2; // lean back ~11 deg: the pedestal is seen from a lower angle than the map, as in the reference
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
  const wallCanvas = document.createElement("canvas");
  wallCanvas.width = 256;
  wallCanvas.height = 4;
  const wg = wallCanvas.getContext("2d")!;
  for (let x = 0; x < 256; x++) {
    const u = x / 255; // 0 = front centre, 0.25 = right, 0.75 = left (LatheGeometry)
    const k = 0.5 + 0.5 * Math.cos((u - 0.74) * Math.PI * 2); // brightest on the left
    const v = Math.round(150 + 100 * k);
    wg.fillStyle = `rgb(${v},${v + 2},${Math.min(255, v + 8)})`;
    wg.fillRect(x, 0, 1, 4);
  }
  const wallTex = new THREE.CanvasTexture(wallCanvas);
  wallTex.colorSpace = THREE.SRGBColorSpace;
  wallTex.wrapS = THREE.RepeatWrapping;
  const bodyMat = glossy(compact, { map: wallTex, color: 0xffffff, roughness: 0.24, metalness: 0.6, clearcoat: 0.8, clearcoatRoughness: 0.15, emissive: 0x222833, emissiveIntensity: 0.12, envMapIntensity: 1.25 });
  const body = new THREE.Mesh(new THREE.LatheGeometry(profile, radial), bodyMat);
  const TOP = PLATE_H + PED_H;

  // thin Bata-red plate under the pedestal (lit lightly so it glows without a hard outline)
  const plate = new THREE.Mesh(
    new THREE.CylinderGeometry(PLATE_R, PLATE_R + 0.02, PLATE_H, radial),
    glossy(compact, { color: 0xc9101a, roughness: 0.22, metalness: 0.15, clearcoat: 1, clearcoatRoughness: 0.08, emissive: 0xd8101a, emissiveIntensity: 0.22 }),
  );
  plate.position.y = PLATE_H / 2;
  // thin lit edge on the plate (pink-white highlight, like the reference)
  const plateEdge = new THREE.Mesh(new THREE.TorusGeometry(PLATE_R + 0.005, 0.018, 6, radial), new THREE.MeshBasicMaterial({ color: 0xff8d95 }));
  plateEdge.rotation.x = Math.PI / 2;
  plateEdge.position.y = PLATE_H - 0.004;

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
  const slotDefs: Array<[number, number]> = [[0, 0.62], [-1.02, 0.4], [1.02, 0.4]]; // [centre angle, length]
  const slots = slotDefs.map(([a, len]) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(PED_R + 0.004, PED_R + 0.004, 0.1, 24, 1, true, a - len / 2, len), slotMat);
    m.position.y = PLATE_H + PED_H * 0.42;
    return m;
  });
  const slotGlowTex = radialTexture([[0, "rgba(255,255,255,0.95)"], [0.3, "rgba(255,200,206,0.6)"], [0.65, "rgba(255,120,130,0.18)"], [1, "rgba(255,120,130,0)"]], 128);
  const slotGlowMat = new THREE.SpriteMaterial({ map: slotGlowTex, transparent: true, depthWrite: false, depthTest: false });
  const slotGlows = slotDefs.map(([a, len]) => {
    const s = new THREE.Sprite(slotGlowMat);
    s.scale.set(len * 3.4, 0.62, 1);
    s.position.set(Math.sin(a) * (PED_R + 0.06), PLATE_H + PED_H * 0.42, Math.cos(a) * (PED_R + 0.06));
    s.renderOrder = 5;
    return s;
  });
  platform.add(plate, plateEdge, body, groove, glass, ...slots, ...slotGlows);

  // soft pink-white glow on the glass: bright centre, no hard edge, no rings
  const poolTex = radialTexture([
    [0, "rgba(255,255,255,0.95)"],
    [0.1, "rgba(255,240,242,0.9)"],
    [0.24, "rgba(255,112,122,0.72)"],
    [0.42, "rgba(255,70,82,0.38)"],
    [0.72, "rgba(255,100,110,0.08)"],
    [1, "rgba(255,100,110,0)"],
  ]);
  const poolMat = new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, depthWrite: false });
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(3.1, 3.1), poolMat);
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
  const ambient = new THREE.Mesh(new THREE.PlaneGeometry(8.6, 8.6), ambientMat);
  ambient.rotation.x = -Math.PI / 2;
  ambient.position.y = 0.002;
  const contactMat = new THREE.MeshBasicMaterial({
    map: radialTexture([[0, "rgba(70,25,35,0.5)"], [0.5, "rgba(70,25,35,0.32)"], [0.78, "rgba(70,25,35,0.1)"], [1, "rgba(70,25,35,0)"]]),
    transparent: true,
    depthWrite: false,
  });
  const contact = new THREE.Mesh(new THREE.PlaneGeometry(6.8, 6.8), contactMat);
  contact.rotation.x = -Math.PI / 2;
  contact.position.y = 0.004;
  ambient.renderOrder = 0;
  contact.renderOrder = 0;
  platform.add(ambient, contact);

  // soft projected shadow of the map, drawn from the real outline onto the glass
  const SHADOW_K = 0.42;
  const shadowMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(7, 7), shadowMat);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.set(0, TOP + 0.006, 0.05);
  shadow.renderOrder = 2;
  platform.add(shadow);

  new THREE.TextureLoader().load(MAP_URL, (tex) => {
    if (disposed) {
      tex.dispose();
      return;
    }
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    const img = tex.image as HTMLImageElement;
    const w = MAP_H * (img.width / img.height);
    const plane = new THREE.PlaneGeometry(w, MAP_H);
    // opaque cut-out: writes depth, so the orbital rings pass behind it and in front of it correctly
    const solid = new THREE.Mesh(plane, new THREE.MeshBasicMaterial({ map: tex, alphaTest: 0.5, alphaToCoverage: true, toneMapped: false }));
    // translucent fringe (soft glow around pins / edges), just behind the cut-out
    const soft = new THREE.Mesh(plane, new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }));
    soft.position.z = -0.01;
    mapGroup.add(soft, solid);
    const shTex = shadowFromImage(img, w, MAP_H, 7, SHADOW_K);
    shadowMat.map = shTex;
    shadowMat.needsUpdate = true;
    mapDisposables.push(tex, plane, solid.material as THREE.Material, soft.material as THREE.Material, shTex);
    mapGroup.visible = true;
    mapLoadedAt = timer.getElapsed();
    if (opts.reducedMotion) {
      shadowMat.opacity = 0.16;
      renderer.render(scene, camera);
    }
  });

  // faint rising light (pale pink / white vertical streaks that fade out toward the map)
  const beamMat = new THREE.ShaderMaterial({
    vertexShader: BEAM_VERT,
    fragmentShader: BEAM_FRAG,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 }, uAlpha: { value: 0.6 }, uFade: { value: opts.reducedMotion ? 1 : 0 } },
  });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.45, 3.0, compact ? 32 : 64, 1, true), beamMat);
  beam.position.y = TOP + 1.5;
  beam.renderOrder = 4;
  platform.add(beam);

  // soft reflection of the lit slots / red plate on the glossy floor
  const refCanvas = document.createElement("canvas");
  refCanvas.width = 512;
  refCanvas.height = 160;
  const rg = refCanvas.getContext("2d")!;
  const band = rg.createLinearGradient(0, 0, 0, 160);
  band.addColorStop(0, "rgba(225,30,40,0.5)");
  band.addColorStop(0.5, "rgba(235,70,80,0.16)");
  band.addColorStop(1, "rgba(235,70,80,0)");
  rg.fillStyle = band;
  rg.fillRect(60, 0, 392, 160);
  [[256, 78], [128, 34], [384, 34]].forEach(([cx, hw]) => {
    const sg = rg.createLinearGradient(0, 0, 0, 160);
    sg.addColorStop(0, "rgba(255,255,255,0.75)");
    sg.addColorStop(0.45, "rgba(255,170,178,0.22)");
    sg.addColorStop(1, "rgba(255,170,178,0)");
    rg.fillStyle = sg;
    rg.fillRect(cx - hw, 0, hw * 2, 160);
  });
  rg.globalCompositeOperation = "destination-in"; // feather the left/right ends
  const feather = rg.createLinearGradient(0, 0, 512, 0);
  feather.addColorStop(0, "rgba(0,0,0,0)");
  feather.addColorStop(0.15, "rgba(0,0,0,1)");
  feather.addColorStop(0.85, "rgba(0,0,0,1)");
  feather.addColorStop(1, "rgba(0,0,0,0)");
  rg.fillStyle = feather;
  rg.fillRect(0, 0, 512, 160);
  const topFade = rg.createLinearGradient(0, 0, 0, 160); // no hard top edge
  topFade.addColorStop(0, "rgba(0,0,0,0)");
  topFade.addColorStop(0.16, "rgba(0,0,0,1)");
  topFade.addColorStop(1, "rgba(0,0,0,1)");
  rg.fillStyle = topFade;
  rg.fillRect(0, 0, 512, 160);
  const refTex = new THREE.CanvasTexture(refCanvas);
  refTex.colorSpace = THREE.SRGBColorSpace;
  const reflectMat = new THREE.MeshBasicMaterial({ map: refTex, transparent: true, depthWrite: false });
  const reflection = new THREE.Mesh(new THREE.PlaneGeometry(PLATE_R * 1.55, 0.56), reflectMat);
  reflection.position.set(0.5, PLATFORM_Y + PLATE_R * 0.2 - 0.2, PLATE_R * 0.94);
  reflection.renderOrder = 0;
  root.add(reflection);

  /* ---------- orbital rings (real 3D meshes) ---------- */
  const ringSpecs: RingSpec[] = USE_RING_ARTWORK ? [] : [
    { radius: 4.6, tube: 0.115, base: 0xee1420, emissive: 0, hi: 0xffffff, arcs: 3, arcLen: 0, tilt: 1.05, roll: -0.3, spin: 0.36, wobble: 0.04, phase: 0 },
    { radius: 4.05, tube: 0.095, base: 0x8cc4ff, emissive: 0, hi: 0xffffff, arcs: 2, arcLen: 0, tilt: 1.12, roll: 0.26, spin: -0.3, wobble: 0.05, phase: 1.9 },
    { radius: 3.5, tube: 0.018, base: 0x9fb4d6, emissive: 0x9fb4d6, hi: 0xffffff, arcs: 0, arcLen: 0, tilt: 0.7, roll: -0.75, spin: 0.2, wobble: 0.06, phase: 3.1, dotted: true },
  ];
  const glowMats: THREE.ShaderMaterial[] = [];
  const torusSeg = compact ? 120 : 240;

  const rings = ringSpecs.map((s) => {
    const outer = new THREE.Group();
    outer.position.set(0, 0.2, 0);
    outer.rotation.order = "ZYX"; // roll the axis on screen, then precess the ring about that axis
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
          uAlpha: { value: 0.55 }, uFade: { value: opts.reducedMotion ? 1 : 0 },
          uCount: { value: 18 }, uSharp: { value: 1 }, uDash: { value: 1 },
        },
      });
      glowMats.push(m);
      spin.add(new THREE.Mesh(new THREE.TorusGeometry(s.radius, s.tube, 6, torusSeg), m));
    } else {
      // one translucent tube whose shading is computed from the view angle: bright white core, coloured soft falloff
      const trail = new THREE.ShaderMaterial({
        vertexShader: TRAIL_VERT,
        fragmentShader: TRAIL_FRAG,
        transparent: true,
        depthWrite: false, // depth *test* stays on: the map still hides the far side of each ring
        uniforms: {
          uCol: { value: new THREE.Color(s.base) },
          uAlpha: { value: 0.95 },
          uFade: { value: opts.reducedMotion ? 1 : 0 },
          uTime: { value: 0 },
          uHeads: { value: s.arcs },
          uDir: { value: s.spin < 0 ? -1 : 1 },
          uWhite: { value: s.base === 0xee1420 ? 0.3 : 0.5 },
        },
      });
      glowMats.push(trail);
      spin.add(new THREE.Mesh(new THREE.TorusGeometry(s.radius, s.tube, 14, torusSeg), trail));
      const halo = new THREE.ShaderMaterial({
        vertexShader: TRAIL_VERT,
        fragmentShader: HALO_FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
          uCol: { value: new THREE.Color(s.base === 0xee1420 ? 0xff3b4a : 0x7fb8ff) },
          uAlpha: { value: 0.55 },
          uFade: { value: opts.reducedMotion ? 1 : 0 },
          uTime: { value: 0 },
          uHeads: { value: s.arcs },
          uDir: { value: s.spin < 0 ? -1 : 1 },
        },
      });
      glowMats.push(halo);
      spin.add(new THREE.Mesh(new THREE.TorusGeometry(s.radius, s.tube * 3.4, 14, torusSeg), halo));
    }
    pivot.add(spin);
    outer.add(pivot);
    root.add(outer);
    return { spec: s, outer, pivot, spin };
  });

  /* ---------- orbital ring artwork: back half behind the map, front half in front ---------- */
  interface RingLayer { mesh: THREE.Mesh; depth: number }
  const ringLayers: RingLayer[] = [];
  const ringMats: THREE.MeshBasicMaterial[] = [];
  if (USE_RING_ARTWORK) {
    const loader = new THREE.TextureLoader();
    const addLayer = (url: string, depth: number, order: number) => {
      loader.load(url, (tex) => {
        if (disposed) {
          tex.dispose();
          return;
        }
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
        const img = tex.image as HTMLImageElement;
        const geo = new THREE.PlaneGeometry(RING_W, RING_W * (img.height / img.width));
        const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false, opacity: opts.reducedMotion ? 1 : 0 });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.renderOrder = order;
        root.add(mesh);
        ringLayers.push({ mesh, depth });
        ringMats.push(mat);
        mapDisposables.push(tex, geo, mat);
        layoutRings(0, 1);
        if (opts.reducedMotion) renderer.render(scene, camera);
      });
    };
    addLayer(RING_BACK_URL, -RING_DEPTH, 1);
    addLayer(RING_FRONT_URL, RING_DEPTH, 6);
  }
  /** Places each half at its own depth but scaled/shifted along the camera ray, so both halves line up exactly on screen. */
  function layoutRings(roll: number, scale: number) {
    const camZ = camera.position.z;
    const camY = camera.position.y;
    for (const l of ringLayers) {
      const k = (camZ - l.depth) / camZ;
      l.mesh.position.set(RING_X * k, camY + (RING_Y - camY) * k, l.depth);
      l.mesh.scale.setScalar(k * scale);
      l.mesh.rotation.z = roll;
    }
  }

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
    const mi = mapLoadedAt < 0 ? 0 : easeOut(Math.min(1, (t - mapLoadedAt) / 1.1));
    mapGroup.scale.setScalar(0.86 + 0.14 * mi);
    mapGroup.position.y = MAP_Y + bob * 0.1;
    mapGroup.rotation.z = Math.sin(t * 0.35) * 0.03;

    // shadow / light pool react to the floating map
    shadow.scale.setScalar(1 - bob * 0.03);
    shadowMat.opacity = (0.16 - bob * 0.015) * mi;

    if (ringLayers.length) {
      layoutRings(Math.sin(t * 0.3) * 0.012, 1 + Math.sin(t * 0.5) * 0.012);
      const o = (0.94 + 0.06 * (0.5 + 0.5 * Math.sin(t * 0.7))) * intro;
      for (const m of ringMats) m.opacity = o;
    }
    for (const r of rings) {
      // the ring swings about the map's axis (never edge-on) while its light heads race round it
      r.outer.rotation.y = Math.sin(t * Math.abs(r.spec.spin) * 1.3 + r.spec.phase) * 0.6 * Math.sign(r.spec.spin) + (1 - intro) * 1.5 * Math.sign(r.spec.spin);
      r.pivot.rotation.x = r.spec.tilt + Math.sin(t * 0.5 + r.spec.phase) * r.spec.wobble;
      r.spin.rotation.z = t * r.spec.spin * 0.5;
      r.outer.scale.setScalar(0.8 + 0.2 * intro);
    }
    for (const m of glowMats) {
      m.uniforms.uFade.value = intro;
      if (m.uniforms.uTime) m.uniforms.uTime.value = t;
    }
    beamMat.uniforms.uTime.value = t;
    beamMat.uniforms.uFade.value = intro;

    // restrained light breathing on the pedestal
    const breath = 0.5 + 0.5 * Math.sin(t * 0.6);
    poolMat.opacity = (0.88 + 0.12 * breath) * intro;
    slotMat.opacity = (0.88 + 0.1 * breath) * intro;
    slotGlowMat.opacity = (0.7 + 0.2 * breath) * intro;

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
    shadowMat.opacity = 0.16;
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
      mapDisposables.forEach((d) => d.dispose());
      envTex.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
