// The lit house: the same pieces as the drawing, merged by material, a low sun, a few lamps, ambient occlusion
// on desktop. Rendered into a target (never to the screen): draw.js mixes it with the ink by the scan plane.
//
// The target holds finished picture values (tone-mapped, sRGB, eight bits): no HDR buffer and no output pass.
// Its depth texture feeds the ambient occlusion and the sunbeams, so the house is drawn exactly once per frame.
import * as THREE from 'three';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { mergePieces } from './house.js';

export const SUN_DIR = new THREE.Vector3(0.85, 0.44, 0.28).normalize();
const FULL_VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }';

// three.js r160 tone-maps and encodes a material's output only for the screen or for a target flagged like this one.
// internalFormat keeps the bytes as written (an sRGB format would encode them a second time).
const display = (rt) => { rt.isXRRenderTarget = true; rt.texture.colorSpace = THREE.SRGBColorSpace; rt.texture.internalFormat = 'RGBA8'; return rt; };

export function createReal(renderer, look, pieces, cam, { ao = true, shadowSize = 4096, sunSize = 1024, shaftSteps = 22, shaftDiv = 2, lamps = 10, solid = null } = {}) {
  const scene = new THREE.Scene();
  scene.background = look.sky;
  // subtle atmospheric horizon fog so distant grass blends softly into the pale sky
  // (the fog is mixed in after the encoding, so its colour is given as the picture value)
  scene.fog = new THREE.FogExp2(0x000000, 0.012);
  scene.fog.color.setRGB(look.fog[0], look.fog[1], look.fog[2], THREE.LinearSRGBColorSpace);
  const parts = { behind: new THREE.Group(), front: new THREE.Group(), people: new THREE.Group() };
  const buckets = {};
  for (const p of pieces) (buckets[p.part + '|' + p.mat] ||= []).push(p);
  for (const [k, list] of Object.entries(buckets)) {
    const [part, mat] = k.split('|');
    const m = look.M[mat] || look.M.conc;
    const mesh = new THREE.Mesh(mergePieces(list, { uv: true }), m);
    const glow = mat === 'shade' || mat === 'opal';
    mesh.castShadow = mat !== 'glass' && !glow;
    mesh.receiveShadow = !glow;
    mesh.frustumCulled = false;
    parts[part].add(mesh);
  }
  scene.add(parts.behind, parts.front, parts.people);

  // Depth first: the house is merged by material, so it cannot be drawn front to back, and inside a room every pixel
  // would be lit three or four times over. The drawing's merged meshes (everything but glass, three draw calls) lay
  // down the depth, then each pixel of the lit pass is shaded exactly once. The materials are pulled two depth steps
  // towards the eye (look.js) so that the second pass never loses against the first.
  let pre = null;
  if (solid) {
    const preMat = new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide });
    pre = { scene: new THREE.Scene() };
    for (const k of ['behind', 'front', 'people']) { const m = new THREE.Mesh(solid[k].geometry, preMat); m.frustumCulled = false; pre.scene.add(m); pre[k] = m; }
    pre.front.visible = false;
  }

  // light: daylight. A warm low December sun, a pale sky hemisphere for the bounce, a grazing fill so the bump
  // textures catch reflections, and the room lamps for the gradient deep inside
  const target = new THREE.Vector3(11, 2, -2);
  const sun = new THREE.DirectionalLight(0xffe6c4, 3.4);
  sun.position.copy(target).addScaledVector(SUN_DIR, 90); sun.target.position.copy(target);
  sun.castShadow = true; sun.shadow.mapSize.set(shadowSize, shadowSize);
  Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 22, bottom: -18, near: 30, far: 160 });
  sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.025;
  const fillLight = new THREE.DirectionalLight(0xdfe8ee, 0.55);
  fillLight.position.set(-18, 22, 28);
  scene.add(sun, sun.target, fillLight, new THREE.HemisphereLight(0xcfdde6, 0x8f8b80, 0.62), new THREE.AmbientLight(0xf1efe9, 0.1));
  // the room lamps, the ones that carry the picture first: a phone gets fewer of them (every lamp is paid per pixel)
  [
    [10.7, 1.7, -3.4, 5.0], [15.1, 3.8, -4.0, 4.6], [13.0, 1.6, -5.8, 2.8], [7.75, 2.2, -4.2, 2.6],
    [12.7, 4.3, -2.9, 2.6], [16.0, 0.7, -6.5, 3.4], [5.75, 3.95, -4.1, 2.0], [5.75, 3.95, -1.1, 2.0],
    [10.5, 4.6, 2.0, 2.2], [14.8, 1.2, 3.2, 2.0],
  ].slice(0, lamps).forEach(([x, y, z, i]) => { const l = new THREE.PointLight(0xffe9d0, i * 0.8, 0, 2); l.position.set(x, y, z); scene.add(l); });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.88;

  const opt = { type: THREE.UnsignedByteType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false };
  const depthTex = new THREE.DepthTexture(4, 4, THREE.UnsignedIntType);
  const rt = display(new THREE.WebGLRenderTarget(4, 4, { ...opt, depthBuffer: true, depthTexture: depthTex }));
  const aaRT = new THREE.WebGLRenderTarget(4, 4, { ...opt, depthBuffer: false });
  const flat = new THREE.Camera();
  const quad = (mat) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat); m.frustumCulled = false; const s = new THREE.Scene(); s.add(m); return s; };

  // ambient occlusion (desktop): from the depth of the picture itself, no second pass over the house
  let gtao = null, aoRT = null;
  if (ao) {
    aoRT = new THREE.WebGLRenderTarget(4, 4, { ...opt, depthBuffer: false });
    gtao = new GTAOPass(scene, cam, 4, 4);
    gtao.setGBuffer(depthTex);   // after the constructor: r160 trips over a depth texture handed to the constructor
    gtao.gtaoMaterial.needsUpdate = gtao.pdMaterial.needsUpdate = true;
    gtao.updateGtaoMaterial({ radius: 0.35, distanceExponent: 1.3, thickness: 1.0, scale: 1.2, samples: 8 });
    gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 5, rings: 2, samples: 8 });
    gtao.blendIntensity = 0.85;
  }
  // the picture is anti-aliased at its own resolution, before it is scaled up to the screen
  const fxaa = new THREE.ShaderMaterial({ uniforms: THREE.UniformsUtils.clone(FXAAShader.uniforms), vertexShader: FULL_VS, fragmentShader: FXAAShader.fragmentShader, depthTest: false, depthWrite: false });
  const fxaaScene = quad(fxaa);

  // the sun's own view of the house, depth only: what the sunbeams are marched against
  const sunCam = new THREE.OrthographicCamera(-24, 24, 20, -16, 30, 160);
  sunCam.position.copy(target).addScaledVector(SUN_DIR, 90); sunCam.lookAt(target); sunCam.updateMatrixWorld();
  const sunRT = new THREE.WebGLRenderTarget(sunSize, sunSize, { ...opt, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true, depthTexture: new THREE.DepthTexture(sunSize, sunSize, THREE.UnsignedIntType) });
  const depthMat = new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide });
  const sunMat = new THREE.Matrix4();
  function renderSunDepth() {
    const hid = []; scene.traverse((m) => { if (m.isMesh && !m.castShadow && m.visible) { m.visible = false; hid.push(m); } });
    const bg = scene.background, fog = scene.fog; scene.background = null; scene.fog = null; scene.overrideMaterial = depthMat;
    renderer.setRenderTarget(sunRT); renderer.setClearColor(0xffffff, 1); renderer.clear(); renderer.render(scene, sunCam);
    scene.overrideMaterial = null; scene.background = bg; scene.fog = fog; hid.forEach((m) => (m.visible = true));
    sunMat.multiplyMatrices(sunCam.projectionMatrix, sunCam.matrixWorldInverse);
  }

  const shaftMat = new THREE.ShaderMaterial({
    depthTest: false, depthWrite: false,
    defines: { STEPS: shaftSteps },
    uniforms: { tDepth: { value: depthTex }, tSun: { value: sunRT.depthTexture }, uSunMat: { value: sunMat }, uCamWorld: { value: new THREE.Matrix4() }, uFr: { value: new THREE.Vector4() },
      uN: { value: 0 }, uF: { value: 1 }, uFN: { value: 1 },
      uBoxMin: { value: new THREE.Vector3(5.3, 0, -7.7) }, uBoxMax: { value: new THREE.Vector3(16.92, 6.0, 0) } },
    vertexShader: FULL_VS,
    fragmentShader: `precision highp float;
      uniform highp sampler2D tDepth, tSun; uniform mat4 uSunMat, uCamWorld; uniform vec4 uFr; uniform float uN, uF, uFN; uniform vec3 uBoxMin, uBoxMax;
      varying vec2 vUv;
      float ign(vec2 p){ return fract(52.9829189 * fract(dot(p, vec2(.06711056, .00583715)))); }
      void main(){
        float d = texture2D(tDepth, vUv).r;
        float z = d < 1. ? uN + uN * d * uFN / (uF - d * uFN) : 90.;
        vec3 ro = uCamWorld[3].xyz;
        vec3 pw = (uCamWorld * vec4(mix(uFr.x, uFr.y, vUv.x) * z, mix(uFr.z, uFr.w, vUv.y) * z, -z, 1.)).xyz;
        vec3 rd = pw - ro; float L = length(rd); rd /= L;
        vec3 inv = 1. / rd, t0 = (uBoxMin - ro) * inv, t1 = (uBoxMax - ro) * inv, lo = min(t0, t1), hi = max(t0, t1);
        float a = max(max(lo.x, lo.y), max(lo.z, 0.)), b = min(min(hi.x, hi.y), min(hi.z, L));
        if (b <= a) { gl_FragColor = vec4(0.); return; }
        float dt = (b - a) / float(STEPS), j = ign(gl_FragCoord.xy), acc = 0.;
        for (int i = 0; i < STEPS; i++) {
          vec3 p = ro + rd * (a + (float(i) + j) * dt);
          vec4 s = uSunMat * vec4(p, 1.);
          vec3 q = s.xyz * .5 + .5;
          acc += step(q.z, texture2D(tSun, q.xy).r + .0015);
        }
        gl_FragColor = vec4(acc * dt, 0., 0., 1.);
      }`,
  });
  const shaftScene = quad(shaftMat);
  const shaftRT = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, generateMipmaps: false });

  let shadowsDirty = true, sunDirty = true;
  function resize(w, h, scale) {
    const rw = Math.max(2, Math.round(w * scale)), rh = Math.max(2, Math.round(h * scale));
    rt.setSize(rw, rh); aaRT.setSize(rw, rh);
    if (gtao) { aoRT.setSize(rw, rh); gtao.setSize(rw, rh); }
    fxaa.uniforms.resolution.value.set(1 / rw, 1 / rh);
    shaftRT.setSize(Math.max(2, Math.round(w / shaftDiv)), Math.max(2, Math.round(h / shaftDiv)));
  }
  function setFront(v) { if (parts.front.visible !== v) { parts.front.visible = v; if (pre) pre.front.visible = v; shadowsDirty = true; sunDirty = true; } }
  // one frame of the lit house. beams: also march the sunbeams (only asked for while they can be seen)
  function render(inside, beams = true) {
    if (sunDirty) { renderSunDepth(); sunDirty = false; }
    if (shadowsDirty) { renderer.shadowMap.needsUpdate = true; shadowsDirty = false; }
    renderer.setRenderTarget(rt);
    if (pre) { renderer.render(pre.scene, cam); renderer.autoClear = false; renderer.render(scene, cam); renderer.autoClear = true; }
    else renderer.render(scene, cam);
    let color = rt.texture;
    if (gtao) { gtao.render(renderer, aoRT, rt); color = aoRT.texture; }
    fxaa.uniforms.tDiffuse.value = color;
    renderer.setRenderTarget(aaRT); renderer.render(fxaaScene, flat);
    if (beams) {
      const u = shaftMat.uniforms;
      u.uN.value = cam.near; u.uF.value = cam.far; u.uFN.value = cam.far - cam.near;
      u.uCamWorld.value.copy(cam.matrixWorld); u.uFr.value.copy(cam.userData.fr);
      u.uBoxMax.value.z = inside ? 3.7 : 0;
      renderer.setRenderTarget(shaftRT); renderer.render(shaftScene, flat);
    }
    renderer.setRenderTarget(null);
    return { color: aaRT.texture, shafts: shaftRT.texture };
  }
  return { scene, parts, sun, resize, render, setFront, gtao };
}
