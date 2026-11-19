import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';

// Only injected into the local benchmark build by run.mjs.
const params = new URLSearchParams(location.search);
const trials = ['low', 'medium', 'high', 'high/shadows', 'high/water', 'high/direct', 'high/bridge', 'high/motion'];
const index = Number(params.get('i') || 0);
const [quality, variant] = trials[index].split('/');
export const benchQuality = quality as 'low' | 'medium' | 'high';

function landmarksMounted(scene: THREE.Scene) {
  let count = 0;
  scene.traverse((node) => {
    if (node.type === 'Group' && node.children.some((c) =>
      c.type === 'Mesh' && (c.name.startsWith('Heritage') || c.name.startsWith('Mesh_0')))) count++;
  });
  return count >= 3;
}

function applyTrial(scene: THREE.Scene, renderer: THREE.WebGLRenderer) {
  if (variant === 'shadows') renderer.shadowMap.enabled = false;
  scene.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (variant === 'water' && mesh.material instanceof THREE.ShaderMaterial && mesh.material.uniforms.uWater) {
      mesh.material = new THREE.MeshBasicMaterial({ color: '#205e5b' });
    }
    if (variant === 'direct' && node instanceof THREE.DirectionalLight) node.visible = false;
    if (variant === 'bridge' && node.type === 'Group' &&
        node.children.some((c) => c.name.includes('Thê') || c.name.includes('Ván'))) node.visible = false;
  });
}

export function ProfileScene() {
  const state = useRef({
    ready: 0, start: 0, done: false, frames: 0, submission: 0, calls: 0,
    triangles: 0, gpu: [] as number[], pending: null as WebGLQuery | null, visible: true,
    lastFrame: 0, frameTimes: [] as number[],
  });
  useFrame(({ gl, scene, camera }) => {
    const s = state.current;
    if (s.done) return;
    const now = performance.now();
    if (!s.ready && landmarksMounted(scene)) {
      s.ready = now;
      applyTrial(scene, gl);
    }
    if (variant === 'motion' && s.ready) {
      const t = (now - s.ready) * 0.0008;
      camera.position.set(63 + 6 * Math.sin(t), 7 + 2 * Math.cos(t), -210 + 7 * Math.cos(t));
      camera.lookAt(22, 2.3, -217);
    }
    const sample = s.ready && now - s.ready >= 5500;
    const ctx = gl.getContext() as WebGL2RenderingContext;
    const timer = ctx.getExtension('EXT_disjoint_timer_query_webgl2');
    if (timer && s.pending && ctx.getQueryParameter(s.pending, ctx.QUERY_RESULT_AVAILABLE)) {
      if (!ctx.getParameter(timer.GPU_DISJOINT_EXT)) s.gpu.push(ctx.getQueryParameter(s.pending, ctx.QUERY_RESULT) / 1e6);
      ctx.deleteQuery(s.pending);
      s.pending = null;
    }
    const query = sample && timer && !s.pending && s.frames % 16 === 0 ? ctx.createQuery() : null;
    if (query) ctx.beginQuery(timer.TIME_ELAPSED_EXT, query);
    gl.info.autoReset = false;
    gl.info.reset();
    const before = performance.now();
    gl.render(scene, camera);
    const submission = performance.now() - before;
    if (query) {
      ctx.endQuery(timer.TIME_ELAPSED_EXT);
      s.pending = query;
    }
    if (!sample) return;
    if (!s.start) { s.start = now; return; }
    s.frames++;
    if (s.lastFrame) s.frameTimes.push(now - s.lastFrame);
    s.lastFrame = now;
    s.submission += submission;
    s.calls += gl.info.render.calls;
    s.triangles += gl.info.render.triangles;
    s.visible &&= !document.hidden;
    const seconds = (now - s.start) / 1000;
    if (seconds < 30) return;
    s.done = true;
    const materials = new Set<THREE.Material>();
    scene.traverse((node) => {
      const m = (node as THREE.Mesh).material;
      if (m) (Array.isArray(m) ? m : [m]).forEach((entry) => materials.add(entry));
    });
    const debug = ctx.getExtension('WEBGL_debug_renderer_info');
    const sortedTimes = [...s.frameTimes].sort((a, b) => a - b);
    const slowFrameMs = sortedTimes[Math.floor(sortedTimes.length * 0.99)];
    const result = {
      step: trials[index], viewport: [innerWidth, innerHeight], dpr: devicePixelRatio,
      renderDpr: gl.getPixelRatio(), buffer: [ctx.drawingBufferWidth, ctx.drawingBufferHeight],
      seconds, frames: s.frames, fps: s.frames / seconds, submitMs: s.submission / s.frames,
      fpsAtP99FrameTime: slowFrameMs ? 1000 / slowFrameMs : null,
      lowestFrameFps: sortedTimes.length ? 1000 / sortedTimes[sortedTimes.length - 1] : null,
      gpuMs: s.gpu.length ? s.gpu.reduce((a, b) => a + b, 0) / s.gpu.length : null,
      gpuSamples: s.gpu.length, calls: s.calls / s.frames, triangles: s.triangles / s.frames,
      materials: materials.size, textures: gl.info.memory.textures, geometries: gl.info.memory.geometries,
      visible: s.visible, camera: camera.position.toArray(),
      renderer: ctx.getParameter(debug?.UNMASKED_RENDERER_WEBGL ?? ctx.RENDERER), ua: navigator.userAgent,
    };
    fetch('/result', { method: 'POST', body: JSON.stringify(result) }).then((response) => {
      if (!response.ok) throw Error('Saving sample failed');
      const next = params.get('run') === 'after' && index === 2 ? 7 : index + 1;
      if (params.get('run') !== 'single' && next < trials.length) {
        params.set('i', String(next));
        location.search = params.toString();
      } else {
        document.title = 'Benchmark complete';
      }
    });
  }, 1);
  return null;
}
