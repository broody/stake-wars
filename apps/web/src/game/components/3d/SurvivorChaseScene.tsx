import { useLayoutEffect, useRef } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { colors } from '../../../ui/tokens';
import { surfaceRotation } from '../../survivors/renderFrame';
import { ENEMY_PREVIEW_TYPES } from '../../utils/enemyPreviewConfig';
import { CORE_RADIUS, createSectorGeometry } from '../../utils/sectorGeometry';
import { SECTOR_COLORS } from '../../utils/sectorVisuals';
import { VANGUARD } from '../../utils/vanguardAnimation';

const MODELS = [
  VANGUARD.url,
  ENEMY_PREVIEW_TYPES.lancers.modelUrl,
  ENEMY_PREVIEW_TYPES.mites.modelUrl,
];
for (const url of MODELS) useGLTF.preload(url);
type Runner = readonly [
  lag: number,
  lane: number,
  height: number,
  phase: number,
];

// Lag is an angle behind the leader. Lanes fan out across the Core so the
// front-facing camera can see each line of pursuit over the crest.
const FORMATION: readonly (readonly Runner[])[] = [
  [[0, 0.12, 1.98, 0.36]],
  [
    [0.4, -1.14, 1.1, 0.45],
    [0.54, 1.63, 1.03, 0.69],
    [0.76, -2.58, 0.96, 0.13],
    [0.88, 2.87, 0.96, 0.26],
    [1.0, -0.35, 1.03, 0.55],
  ],
  [
    [0.3, 1.12, 0.44, 0.32],
    [0.38, -2.02, 0.45, 0.21],
    [0.5, -3.16, 0.36, 0.1],
    [0.57, 0.63, 0.43, 0.05],
    [0.61, 2.48, 0.51, 0.08],
    [0.7, -0.6, 0.43, 0.58],
    [0.72, 3.44, 0.49, 0.54],
    [0.8, -1.72, 0.45, 0.43],
    [0.91, 2.01, 0.47, 0.49],
    [1.0, -3.36, 0.5, 0.18],
    [1.08, 1.02, 0.47, 0.37],
  ],
];

function createCore() {
  const core = new THREE.Group();
  const geometry = createSectorGeometry();
  const material = new THREE.ShaderMaterial({
    uniforms: {
      base: { value: new THREE.Color(colors.surface.raised) },
      rim: { value: new THREE.Color(colors.accent.soft) },
    },
    vertexShader: `
      varying vec3 eye;
      varying vec3 surfaceNormal;
      void main() {
        vec4 positionMV = modelViewMatrix * vec4(position, 1.0);
        eye = -positionMV.xyz;
        surfaceNormal = normalMatrix * normalize(position);
        gl_Position = projectionMatrix * positionMV;
      }`,
    fragmentShader: `
      varying vec3 eye;
      varying vec3 surfaceNormal;
      uniform vec3 base;
      uniform vec3 rim;
      void main() {
        float edge = pow(1.0 - max(0.0, dot(normalize(eye), normalize(surfaceNormal))), 8.0);
        gl_FragColor = vec4(base + rim * edge * 0.23, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const shell = new THREE.Mesh(geometry, material);
  const grid = new THREE.LineSegments(
    new THREE.WireframeGeometry(geometry),
    new THREE.LineBasicMaterial({
      color: SECTOR_COLORS.neutralGrid,
      transparent: true,
      opacity: 0.41,
    })
  );
  grid.scale.setScalar(1.0007);
  const sectors = geometry.getAttribute('position');
  const highlighted: number[] = [];
  for (let i = 0; i < sectors.count; i += 3) {
    if (
      sectors.getY(i) <= 1 ||
      sectors.getZ(i) <= -0.4 ||
      (i * 13 + 7) % 193 >= 7
    )
      continue;
    highlighted.push(i, i + 1, i + 2);
  }
  const overlay = new THREE.BufferGeometry();
  overlay.setAttribute('position', sectors);
  overlay.setIndex(highlighted);
  const patches = new THREE.Mesh(
    overlay,
    new THREE.MeshBasicMaterial({
      color: colors.accent.DEFAULT,
      transparent: true,
      opacity: 0.22,
    })
  );
  patches.scale.setScalar(1.001);
  core.add(shell, grid, patches);
  core.position.y = -CORE_RADIUS;
  return {
    core,
    dispose() {
      for (const mesh of [shell, grid, patches]) {
        mesh.geometry.dispose();
        mesh.material.dispose();
      }
    },
  };
}

function createRunner(
  scene: THREE.Group,
  run: THREE.AnimationClip,
  [lag, lane, height, phase]: Runner
) {
  const root = clone(scene);
  const mixer = new THREE.AnimationMixer(root);
  mixer.clipAction(run).play();
  mixer.setTime(phase);
  root.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(root, true);
  const scale = height / (bounds.max.y - bounds.min.y);
  root.scale.setScalar(scale);
  root.position.y = -bounds.min.y * scale;
  const group = new THREE.Group();
  group.add(root);
  return { group, mixer, lag, lane, phase };
}

export default function SurvivorChaseScene({ active }: { active: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const animate = useRef<(active: boolean) => void>(null);
  // Share the game's cached GLTFs; only the skeletons and mixers are private.
  const vanguard = useGLTF(MODELS[0]);
  const lancer = useGLTF(MODELS[1]);
  const mite = useGLTF(MODELS[2]);

  useLayoutEffect(() => {
    const container = host.current;
    if (!container) return;
    const models = [vanguard, lancer, mite];
    const clips = models.map((model) => {
      const clip = THREE.AnimationClip.findByName(model.animations, 'Run');
      if (!clip) throw new Error('Missing Run animation for Survivor chase');
      return clip;
    });
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'low-power',
    });
    const canvas = renderer.domElement;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.setClearColor(colors.surface.DEFAULT);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    canvas.className = 'block h-full w-full';
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(31, 1, 0.05, 150);
    const generator = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    const environment = generator.fromScene(room, 0.02);
    generator.dispose();
    room.dispose();
    scene.environment = environment.texture;
    scene.environmentIntensity = 0.46;
    scene.add(
      new THREE.HemisphereLight(colors.fg.DEFAULT, colors.fg.disabled, 0.81)
    );
    function light(
      x: number,
      y: number,
      z: number,
      color: string,
      intensity: number
    ) {
      const lamp = new THREE.DirectionalLight(color, intensity);
      lamp.position.set(x, y, z);
      scene.add(lamp);
    }
    light(-4, 7, 4, colors.fg.DEFAULT, 2.7);
    light(4, 3, -4, colors.accent.soft, 5.7);
    light(2, 1, 5, colors.fg.secondary, 0.25);
    const { core, dispose } = createCore();
    scene.add(core);
    const runners = FORMATION.flatMap((pack, index) =>
      pack.map((spec) => createRunner(models[index].scene, clips[index], spec))
    );
    for (const runner of runners) scene.add(runner.group);
    const normal = new THREE.Vector3();
    const forward = new THREE.Vector3();
    const leader = runners[0].group.position;
    let time = 0;
    let previous = 0;
    function draw() {
      core.rotation.z = time * 0.176;
      for (const { group, mixer, lag, lane, phase } of runners) {
        const angle =
          0.56 - lag + (lag ? 0.035 * Math.sin(time * 1.12 + phase * 17) : 0);
        const z = lane + (lag ? 0.07 * Math.sin(time * 0.8 + phase * 23) : 0);
        const radius = Math.sqrt(CORE_RADIUS ** 2 - z ** 2);
        normal.set(radius * Math.sin(angle), radius * Math.cos(angle), z);
        group.position.copy(normal).add(core.position);
        normal.normalize();
        if (lag) forward.subVectors(leader, group.position);
        else forward.set(Math.cos(angle), -Math.sin(angle), 0);
        surfaceRotation(group.quaternion, normal, forward);
        mixer.setTime(time + phase);
      }
      renderer.render(scene, camera);
    }
    function resize() {
      if (!container || !container.clientWidth || !container.clientHeight)
        return;
      camera.aspect = container.clientWidth / container.clientHeight;
      const distance = Math.max(15, 18 / camera.aspect);
      camera.position.set(distance * 0.89, distance * 0.45, distance * 0.23);
      camera.lookAt(0.6, -0.97, 0.18);
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight, false);
      draw();
    }
    function frame(now: number) {
      const elapsed = now - previous;
      if (elapsed < 1000 / 30) return;
      time += Math.min(elapsed / 1000, 0.1);
      previous = now;
      draw();
    }
    let playing = false;
    function play(value: boolean) {
      playing = value;
      previous = performance.now();
      renderer.setAnimationLoop(
        value && !renderer.getContext().isContextLost() ? frame : null
      );
    }
    function lost() {
      canvas.style.visibility = 'hidden';
      renderer.setAnimationLoop(null);
    }
    function restored() {
      resize();
      canvas.style.visibility = '';
      play(playing);
    }
    resize();
    container.append(canvas);
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    animate.current = play;
    canvas.addEventListener('webglcontextlost', lost);
    canvas.addEventListener('webglcontextrestored', restored);
    return () => {
      animate.current = null;
      observer.disconnect();
      renderer.setAnimationLoop(null);
      canvas.removeEventListener('webglcontextlost', lost);
      canvas.removeEventListener('webglcontextrestored', restored);
      canvas.remove();
      for (const { group, mixer } of runners) {
        mixer.stopAllAction();
        group.traverse((node) => {
          if (node instanceof THREE.SkinnedMesh) node.skeleton.dispose();
        });
      }
      dispose();
      environment.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    };
  }, [vanguard, lancer, mite]);

  useLayoutEffect(() => {
    animate.current?.(active);
  }, [active, vanguard, lancer, mite]);
  return <div ref={host} className="absolute inset-0" />;
}
