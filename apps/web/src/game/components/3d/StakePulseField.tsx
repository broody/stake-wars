import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { colors } from '../../../ui/tokens';
import {
  surfaceRotation,
  toVector,
  useRenderer,
  type Renderer,
} from '../../survivors/renderFrame';
import { markedSectors, SectorMarkings } from '../../survivors/sectorMarkings';
import { SECTOR_COLORS } from '../../utils/sectorVisuals';
import { SIM_HZ } from '../../survivors/sim';

const EMITTERS = 6;
const DISCHARGE = 0.4;
const CONTACT_LIFE = 0.3;
const RETURN_LIFE = 0.42;
const pulsePalette = {
  tint: new THREE.Color(colors.warning.soft),
  hot: new THREE.Color(colors.warning.faint),
};
const bastionPalette = {
  tint: new THREE.Color(colors.danger.line),
  hot: new THREE.Color(colors.danger.DEFAULT),
};
const up = new THREE.Vector3(0, 1, 0);

// The six stakes carry the range. The travelling light briefly picks out the
// Core's own seams, so the ground and targets remain visible through the field.
const fieldFragment = `
  uniform vec3 tint, hot;
  void main() {
    float r = length(offset);
    if (r > 1.) discard;
    float beat = phase.x, evolved = phase.y;
    float edge = sectorEdge();
    float rim = smoothstep(.58, .96, r);
    float d = r - mix(.08, 1., 1. - (1. - beat) * (1. - beat));
    float crest = exp(-65. * d*d) * (1. - smoothstep(.55, 1., beat));
    float outer = 1. - smoothstep(.96, 1., r);
    float shoulder = smoothstep(.13, .47, r);
    float light = edge * (.16 + .35 * rim + .44 * crest) + crest * (.04 + .075 * facet);
    float alpha = outer * shoulder * (light + .02 * rim) * mix(.86, .76, evolved);
    gl_FragColor = vec4(mix(tint, hot, .48 * crest * edge), alpha);
    #include <colorspace_fragment>
  }`;

const emitterVertex = `
  varying float facet, height;
  void main() {
    height = position.y;
    facet = normal.x * .45 + normal.z * .55;
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.);
  }`;

const emitterFragment = `
  uniform vec3 tint, hot, graphite, ceramic;
  uniform float beat;
  varying float facet, height;
  void main() {
    float side = .62 + .36 * facet;
    vec3 plate = mix(graphite, ceramic, step(.08, height)) * side;
    float slot = 1. - smoothstep(.055, .055 + max(.03, fwidth(height)), abs(height - .36));
    float tip = smoothstep(.73, .83, height);
    float flash = 1. - smoothstep(0., .42, beat);
    vec3 signal = mix(tint, hot, flash * .65);
    gl_FragColor = vec4(mix(plate, signal, max(slot, tip)), 1.);
    #include <colorspace_fragment>
  }`;

type Emitters = THREE.InstancedMesh<THREE.BufferGeometry, THREE.ShaderMaterial>;

export function StakePulseField({ registry }: { registry: Set<Renderer> }) {
  const group = useRef<THREE.Group>(null);
  const stakes = useRef<Emitters>(null);
  const contacts = useRef<THREE.InstancedMesh>(null);
  const uniforms = useMemo(
    () => ({
      beat: { value: 1 },
      graphite: { value: new THREE.Color(colors.line.strong) },
      ceramic: { value: new THREE.Color(SECTOR_COLORS.opponent) },
      tint: { value: pulsePalette.tint.clone() },
      hot: { value: pulsePalette.hot.clone() },
    }),
    []
  );
  const surface = useMemo(
    // Includes the padded neighborhood of a fully amplified Bastion.
    () => new SectorMarkings(512, fieldFragment, uniforms),
    [uniforms]
  );
  useEffect(
    () => () => {
      surface.dispose();
    },
    [surface]
  );
  const neighborhood = useMemo(
    () => ({
      center: new THREE.Vector3(),
      chord: -1,
      faces: [] as ReturnType<typeof markedSectors>,
    }),
    []
  );
  const s = useMemo(
    () => ({
      object: new THREE.Object3D(),
      normal: new THREE.Vector3(),
      ahead: new THREE.Vector3(),
      side: new THREE.Vector3(),
      axis: new THREE.Vector3(),
      center: new THREE.Vector3(),
    }),
    []
  );

  useRenderer(registry, ({ run, normal, forward, alpha, radius }) => {
    const root = group.current,
      emitters = stakes.current,
      sparks = contacts.current;
    if (!root || !emitters || !sparks) return;
    const pulse = run.weapons.find((w) => w.id === 'pulse');
    root.visible = !!pulse && pulse.radius > 0 && run.status !== 'fallen';
    surface.begin(radius);
    sparks.count = 0;
    if (!root.visible || !pulse) return;

    const { object, center, ahead, side, axis } = s;
    toVector(center, normal);
    surfaceRotation(root.quaternion, center, toVector(ahead, forward));
    root.position.copy(center).multiplyScalar(radius);
    const { tint, hot } = pulse.evolved ? bastionPalette : pulsePalette;
    const time = run.time - (1 - alpha) / SIM_HZ;
    const beat = THREE.MathUtils.clamp(
      (time - (pulse.dischargedAt ?? -Infinity)) / DISCHARGE,
      0,
      1
    );
    // Reuse a padded neighborhood while the player moves within it.
    const chord = pulse.radius / radius;
    const pad = 0.04;
    if (
      chord !== neighborhood.chord ||
      neighborhood.center.distanceToSquared(center) > pad * pad
    ) {
      neighborhood.chord = chord;
      neighborhood.center.copy(center);
      neighborhood.faces = markedSectors(normal, chord + pad);
    }
    surface.material.uniforms.tint.value.copy(tint);
    surface.material.uniforms.hot.value.copy(hot);
    surface.mark(
      neighborhood.faces,
      normal,
      chord,
      beat,
      Number(pulse.evolved)
    );
    surface.flush();
    emitters.material.uniforms.tint.value.copy(tint);
    emitters.material.uniforms.hot.value.copy(hot);
    emitters.material.uniforms.beat.value = beat;

    const ring = pulse.radius * 0.965;
    const drop = (ring * ring) / (2 * radius);
    const projected = ring * Math.sqrt(1 - drop / (2 * radius));
    const height =
      (pulse.evolved ? 0.092 : 0.063) * (1 + 0.25 * (1 - beat) ** 3);
    for (let i = 0; i < EMITTERS; i++) {
      const angle = i * ((Math.PI * 2) / EMITTERS);
      object.position.set(
        projected * Math.cos(angle),
        0.024 - drop,
        projected * Math.sin(angle)
      );
      axis.set(0.4 * Math.cos(angle), 1, 0.4 * Math.sin(angle)).normalize();
      object.quaternion.setFromUnitVectors(up, axis);
      object.scale.set(0.028, height, 0.028);
      object.updateMatrix();
      emitters.setMatrixAt(i, object.matrix);
    }
    emitters.instanceMatrix.needsUpdate = true;

    // Foot contacts stay at the impact position even if the player or target moves.
    // Only contacts that healed send a mote back to the body.
    for (let i = run.texts.length - 1; i >= 0; i--) {
      const hit = run.texts[i];
      const contact = hit.pulseContact;
      if (sparks.count + 4 > sparks.instanceMatrix.count) break;
      if (!contact) continue;
      const age = Math.max(0, hit.age - (1 - alpha) / SIM_HZ);
      if (age >= RETURN_LIFE) continue;
      const at = toVector(s.normal, hit.n);
      side.crossVectors(at, ahead);
      side.normalize();
      if (age < CONTACT_LIFE) {
        const t = age / CONTACT_LIFE;
        for (const sign of [-1, 1]) {
          object.position
            .copy(at)
            .multiplyScalar(radius + 0.025 + 0.09 * t)
            .addScaledVector(
              side,
              sign * (contact.radius * (1.12 - 0.45 * t) + 0.012)
            );
          axis
            .copy(at)
            .addScaledVector(side, -0.38 * sign)
            .normalize();
          object.quaternion.setFromUnitVectors(up, axis);
          const size = 1 - t * t;
          object.scale.set(0.012 * size, 0.044 * size, 0.012 * size);
          object.updateMatrix();
          sparks.setMatrixAt(sparks.count, object.matrix);
          sparks.setColorAt(sparks.count++, tint);
        }
      }
      if (contact.repaired) {
        for (const lag of [0, 0.09]) {
          const t = Math.max(0, age / RETURN_LIFE - lag);
          const lift = 0.035 + 0.19 * t + 0.15 * Math.sin(Math.PI * t);
          object.position
            .lerpVectors(at, center, t)
            .normalize()
            .multiplyScalar(radius + lift);
          const size = (lag ? 0.012 : 0.022) * Math.sin(Math.PI * t);
          object.scale.setScalar(size);
          object.updateMatrix();
          sparks.setMatrixAt(sparks.count, object.matrix);
          sparks.setColorAt(sparks.count++, lag ? tint : hot);
        }
      }
    }
    if (sparks.count) {
      sparks.instanceMatrix.needsUpdate = true;
      if (sparks.instanceColor) sparks.instanceColor.needsUpdate = true;
    }
  });

  return (
    <>
      <primitive object={surface} />
      <group ref={group} visible={false}>
        <instancedMesh
          ref={stakes}
          args={[undefined, undefined, EMITTERS]}
          frustumCulled={false}
          raycast={() => undefined}
        >
          <coneGeometry args={[1, 2, 3, 1]} />
          <shaderMaterial
            uniforms={uniforms}
            vertexShader={emitterVertex}
            fragmentShader={emitterFragment}
            toneMapped={false}
          />
        </instancedMesh>
      </group>
      <instancedMesh
        ref={contacts}
        args={[undefined, undefined, 96]}
        count={0}
        frustumCulled={false}
        raycast={() => undefined}
      >
        <octahedronGeometry args={[1, 0]} />
        <meshBasicMaterial color={colors.fg.secondary} toneMapped={false} />
      </instancedMesh>
    </>
  );
}
