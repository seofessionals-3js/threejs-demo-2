// The drawing is not drawn. It is the house rendered once into a small G-buffer (normal and what the surface is in
// eight bits each, depth in the 24-bit depth texture: no float target, so it also runs on phones that cannot render
// to one), then one full-screen pass finds the edges and inks them on paper. The same pass mixes in the lit house
// (real.js) on the far side of the scan plane and adds the sunbeams. While the camera walks through the house there is
// no ink on screen at all: then the G-buffer and the ink pass are skipped and present() only puts the lit house up.
import * as THREE from 'three';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { mergePieces } from './house.js';

const srgb = (h) => new THREE.Vector3(((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255);
const FULL_VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }';

const ND_MAT = () => new THREE.ShaderMaterial({
  side: THREE.DoubleSide,
  vertexShader: `attribute float aId; varying vec3 vN; varying float vId;
    void main(){ vN = normalize(normalMatrix * normal); vId = aId; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
  fragmentShader: `varying vec3 vN; varying float vId;
    void main(){ vec3 n = normalize(vN); if (!gl_FrontFacing) n = -n; gl_FragColor = vec4(n.xy * .5 + .5, 0., vId / 8.); }`,
});

// the grade of the lit house and the sunbeams, shared by the ink pass and the plain presentation
const GRADE = `
    // the lit house stays in daylight colours: only a touch of contrast, no grading to the sheet
    vec3 grade(vec3 real){ return clamp(real, 0., 1.); }
    vec3 beams(vec3 real, vec3 rd, float shVal){
      float mu = dot(rd, uSunDir), g = .55;
      float ph = (1. - g * g) / pow(1. + g * g - 2. * g * mu, 1.5) * .25;
      float sc = shVal * .135 * uShaft * uShaftK * (.4 + ph * .6);
      return mix(real, cSun, (1. - exp(-sc)) * .42);
    }`;

const INK = {
  uniforms: {
    tND: { value: null }, tDepth: { value: null }, tReal: { value: null }, tShaft: { value: null }, res: { value: new THREE.Vector2(1, 1) }, uB: { value: 0 },
    uF: { value: 1 }, uFN: { value: 1 },
    uCamWorld: { value: new THREE.Matrix4() }, uFr: { value: new THREE.Vector4(-1, 1, -1, 1) },
    dK: { value: 1.6 }, px: { value: 1 }, uDpr: { value: 1 },
    uPoche: { value: 1 }, uLines: { value: 99 }, uEarth: { value: 1 }, uGrain: { value: 1 },
    uScanX: { value: 100 }, uScan: { value: 0 }, uReal: { value: 0 }, uShaft: { value: 0 }, uShaftK: { value: 1 },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    cPaper: { value: srgb(0xe9e7e0) }, cInk: { value: srgb(0x1b1c1e) }, cPoche: { value: srgb(0x1b1c1e) }, cAccent: { value: srgb(0xe07a12) }, cSun: { value: srgb(0xffd9a0) },
  },
  vertexShader: FULL_VS,
  fragmentShader: `
    precision highp float;
    uniform sampler2D tND, tReal, tShaft; uniform highp sampler2D tDepth; uniform vec2 res; uniform float uB, uF, uFN; uniform mat4 uCamWorld; uniform vec4 uFr;
    uniform float dK, px, uDpr, uPoche, uLines, uEarth, uGrain, uScanX, uScan, uReal, uShaft, uShaftK;
    uniform vec3 uSunDir, cPaper, cInk, cPoche, cAccent, cSun;
    varying vec2 vUv;
    // normal.xy, metres behind the near plane (0 = nothing there), what the surface is.
    // n * d * (f - n) / (f - d * (f - n)) is the depth behind the near plane without the cancellation of z - n
    vec4 nd(vec2 uv){
      vec4 t = texture2D(tND, uv); float d = texture2D(tDepth, uv).r;
      return vec4(t.xy * 2. - 1., d < 1. ? uB * d * uFN / (uF - d * uFN) : 0., t.a * 8.);
    }
    vec3 nrm(vec4 t){ return vec3(t.xy, sqrt(max(0., 1. - dot(t.xy, t.xy)))); }
    float foot(float s){ return (uB + s) * (uFr.w - uFr.z) / res.y; }
    vec3 worldAt(vec2 uv, float s){ float z = uB + s; return (uCamWorld * vec4(mix(uFr.x, uFr.y, uv.x) * z, mix(uFr.z, uFr.w, uv.y) * z, -z, 1.)).xyz; }
    float bend(float a, float b, float c){ return (2. * c - a - b) + (c - a) * (c - a) / (uB + a) + (c - b) * (c - b) / (uB + b); }
    float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    bool isL(vec4 t){ return abs(t.w - 6.) < .5; }
${GRADE}
    // x: how much of an edge this pixel is, y: the depth of the nearer side of it
    vec2 edgeAt(vec2 uv, vec4 c){
      vec2 o = px / res;
      if (c.z <= 0.) {
        float s = 1e9; vec4 t;
        t = nd(uv + vec2(o.x, 0.)); if (t.z > 0.) s = min(s, t.z);
        t = nd(uv - vec2(o.x, 0.)); if (t.z > 0.) s = min(s, t.z);
        t = nd(uv + vec2(0., o.y)); if (t.z > 0.) s = min(s, t.z);
        t = nd(uv - vec2(0., o.y)); if (t.z > 0.) s = min(s, t.z);
        return s < 1e8 ? vec2(1., s) : vec2(0.);
      }
      vec3 nc = nrm(c); float e = 0., sMin = c.z, f = foot(c.z);
      bool leafy = isL(c);
      for (int i = 0; i < 4; i++) {
        vec2 d = i == 0 ? vec2(o.x, 0.) : i == 1 ? vec2(0., o.y) : i == 2 ? o : vec2(o.x, -o.y);
        vec4 a = nd(uv + d), b = nd(uv - d);
        if (a.z <= 0. || b.z <= 0.) { e = 1.; continue; }
        sMin = min(sMin, min(a.z, b.z));
        bool inCrown = leafy && isL(a) && isL(b);
        float bd = abs(bend(a.z, b.z, c.z));
        e = max(e, inCrown ? smoothstep(.7, 1.4, bd) : smoothstep(dK, dK * 2., bd / f));
        if (!inCrown) { float dn = max(1. - dot(nc, nrm(a)), 1. - dot(nc, nrm(b))); e = max(e, smoothstep(.1, .28, dn)); }
      }
      return vec2(e, sMin);
    }
    void main(){
      vec4 c = nd(vUv);
      bool geo = c.z > 0.;
      vec3 cam = uCamWorld[3].xyz;
      vec3 rdir = normalize(worldAt(vUv, 1.) - cam);
      float tw = rdir.z < -.05 ? (-30. - cam.z) / rdir.z : 60.;
      vec3 wp = geo ? worldAt(vUv, c.z) : cam + rdir * clamp(tw, 10., 90.);
      float sw = geo ? .015 : 5.;
      float m = uReal > .5 ? 1. - smoothstep(uScanX - sw, uScanX + sw, wp.x) : 1.;
      bool isPoche = geo && c.w > 1.5 && c.w < 3.5;
      vec3 col = cPaper; float edge = 0.;
      // the ink is only worked out where the sheet shows: behind the scan plane the pixel belongs to the lit house
      if (m > .001 || uScan > 0.) {
        vec2 E = edgeAt(vUv, c); edge = E.x;
        vec3 dcol = cPaper;
        if (isPoche) {
          float rank = clamp((c.w - 2.) / .9, 0., 1.);
          float p = clamp((uPoche - rank * .62) / .38, 0., 1.);
          float sp = 6. * uDpr, t = fract((gl_FragCoord.x - gl_FragCoord.y) / sp);
          float cov = mix(.14, 1.08, smoothstep(.15, 1., p));
          float fill = cov >= 1. ? 1. : 1. - smoothstep(cov - 1. / sp, cov, t);
          dcol = mix(cPaper, cPoche, fill * smoothstep(0., .08, p));
        } else if (geo && c.w > 3.5 && c.w < 4.5) {
          float sp = .31, k = (wp.x + wp.y) / sp;
          float dpx = abs(fract(k + .5) - .5) * sp * .7071 / foot(c.z);
          float a = clamp(.55 * uDpr + .5 - dpx, 0., 1.);
          float rev = smoothstep(-.5, 0., wp.y - mix(.8, -11., uEarth));
          dcol = mix(cPaper, cInk, a * .5 * rev);
        }
        dcol += (hash(floor(gl_FragCoord.xy / uDpr)) - .5) * .024 * uGrain;
        float ink = 0.;
        if (E.x > 0.) {
          float layer = max(0., -worldAt(vUv, E.y).z);
          float w = mix(1., .46, smoothstep(.4, 12., layer));
          float rv = 1. - smoothstep(uLines - 1.4, uLines, layer);
          ink = E.x * .9 * w * rv;
        }
        col = mix(dcol, cInk, ink);
      }
      if (uReal > .5 && m < .999) {
        vec3 real = grade(texture2D(tReal, vUv).rgb);
        if (uShaft > 0.) real = beams(real, normalize(wp - cam), texture2D(tShaft, vUv).r);
        col = mix(real, col, m);
      }
      if (geo && uScan > 0.) {
        // the scan plane: a crisp line where it cuts the house, and just ahead of it a band of wireframe and 1 m datum ticks
        float fx = max(fwidth(wp.x), 1e-5), dx = abs(wp.x - uScanX) / fx;
        float u = (wp.x - (uScanX - 0.15)) / 1.15;
        if (u > 0. && u < 1. && !isPoche) {
          float env = sin(u * 3.14159);
          float contour = 1. - smoothstep(0.0, 0.035, abs(fract(wp.y) - 0.5));
          float wire = clamp(edge * 0.95 + contour * 0.38, 0., 1.);
          col = mix(col, cInk, env * 0.07 * uScan);
          col = mix(col, cAccent, clamp(wire * env * 0.92 + env * 0.12, 0., 1.) * uScan);
        }
        col = mix(col, cAccent, clamp(1.65 * uDpr + .5 - dx, 0., 1.) * uScan);
      }
      gl_FragColor = vec4(col, 1.);
    }`,
};

// the lit house alone, for the walk: no G-buffer, no edges, two texture reads
const SHOW = {
  uniforms: {
    tReal: { value: null }, tShaft: { value: null }, uCamWorld: { value: new THREE.Matrix4() }, uFr: { value: new THREE.Vector4(-1, 1, -1, 1) },
    uShaft: { value: 0 }, uShaftK: { value: 1 }, uSunDir: { value: new THREE.Vector3(0, 1, 0) }, cSun: { value: srgb(0xffd9a0) },
  },
  vertexShader: FULL_VS,
  fragmentShader: `
    precision highp float;
    uniform sampler2D tReal, tShaft; uniform mat4 uCamWorld; uniform vec4 uFr; uniform float uShaft, uShaftK; uniform vec3 uSunDir, cSun;
    varying vec2 vUv;
${GRADE}
    void main(){
      vec3 real = grade(texture2D(tReal, vUv).rgb);
      if (uShaft > 0.) {
        vec3 rd = normalize((uCamWorld * vec4(mix(uFr.x, uFr.y, vUv.x), mix(uFr.z, uFr.w, vUv.y), -1., 0.)).xyz);
        real = beams(real, rd, texture2D(tShaft, vUv).r);
      }
      gl_FragColor = vec4(real, 1.);
    }`,
};

export function createDrawing(renderer, pieces) {
  const scene = new THREE.Scene();
  const ndMat = ND_MAT();
  const parts = {};
  for (const part of ['behind', 'front', 'people']) {
    const mesh = new THREE.Mesh(mergePieces(pieces.filter((p) => p.part === part && !p.glass), { id: true }), ndMat);
    mesh.frustumCulled = false;
    scene.add(mesh); parts[part] = mesh;
  }
  parts.front.visible = false;
  const quad = (mat) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat); m.frustumCulled = false; const s = new THREE.Scene(); s.add(m); return s; };
  const full = (S) => new THREE.ShaderMaterial({ uniforms: THREE.UniformsUtils.clone(S.uniforms), vertexShader: S.vertexShader, fragmentShader: S.fragmentShader, depthTest: false, depthWrite: false });
  const ink = full(INK), show = full(SHOW);
  const fxaa = new THREE.ShaderMaterial({ uniforms: THREE.UniformsUtils.clone(FXAAShader.uniforms), vertexShader: FULL_VS, fragmentShader: FXAAShader.fragmentShader, depthTest: false, depthWrite: false });
  const inkScene = quad(ink), showScene = quad(show), fxaaScene = quad(fxaa);
  const flat = new THREE.Camera();
  let ndRT = null, inkRT = null;
  const size = new THREE.Vector2();

  function resize() {
    renderer.getDrawingBufferSize(size);
    ndRT?.dispose(); inkRT?.dispose();
    // normal and id in RGBA8, depth in a 24-bit depth texture (half the memory traffic of the old RGBA32F target)
    ndRT = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.UnsignedByteType, format: THREE.RGBAFormat, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
      depthBuffer: true, depthTexture: new THREE.DepthTexture(size.x, size.y, THREE.UnsignedIntType), generateMipmaps: false });
    inkRT = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.UnsignedByteType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, generateMipmaps: false });
    ink.uniforms.res.value.copy(size);
    fxaa.uniforms.resolution.value.set(1 / size.x, 1 / size.y);
    return size;
  }
  function renderND(cam) {
    renderer.setRenderTarget(ndRT); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.render(scene, cam);
    renderer.setRenderTarget(null);
  }
  const lens = (U, cam) => { U.uCamWorld.value.copy(cam.matrixWorld); U.uFr.value.copy(cam.userData.fr); };
  // the sheet, and the lit house on the far side of the scan plane
  function compose(cam, u) {
    const iu = ink.uniforms;
    iu.uB.value = cam.near; iu.uF.value = cam.far; iu.uFN.value = cam.far - cam.near;
    lens(iu, cam);
    for (const k in u) if (iu[k]) iu[k].value = u[k];
    iu.tND.value = ndRT.texture; iu.tDepth.value = ndRT.depthTexture;
    renderer.setRenderTarget(inkRT); renderer.render(inkScene, flat);
    fxaa.uniforms.tDiffuse.value = inkRT.texture;
    renderer.setRenderTarget(null); renderer.render(fxaaScene, flat);
  }
  // the lit house alone (it is already anti-aliased at its own resolution, see real.js)
  function present(cam, u) {
    const su = show.uniforms;
    lens(su, cam);
    for (const k in u) if (su[k]) su[k].value = u[k];
    renderer.setRenderTarget(null); renderer.render(showScene, flat);
  }
  return { resize, renderND, compose, present, parts, uniforms: ink.uniforms, show: show.uniforms };
}
