import * as THREE from 'three';
import { colors } from '../../ui/tokens';

// In both arcs U runs from tip to tip, V from the inside toward the cutting edge.
const melee = `
  float age = progress;
  float stroke = eclipse ? fract(2. * uvCut.x) : uvCut.x;
  float reach = 1. - pow(1. - clamp(age / .48, 0., 1.), 3.);
  float head = .52 + .60 * reach;
  float laid = 1. - smoothstep(head - .12, head, stroke);
  float tip = pow(max(0., sin(3.14159 * stroke)), .65);
  float rim = mix(.47, .987, reach) - .06 * (1. - tip) * (1. - stroke);
  float behind = rim - uvCut.y;
  float width = mix(.007, .34, tip) * (1. - .48 * age);
  float body = smoothstep(-.012, .014, behind) * (1. - smoothstep(0., width, behind));
  float edge = filament((behind - .018 * tip) / mix(.006, .028, tip));
  float echo = filament((behind - width - .04) / .014) * tip;
  // The trailing end burns away first; the last glint follows the follow-through.
  float tail = smoothstep(-.24, .04, stroke - .91 * smoothstep(.30, 1., age));
  float ends = smoothstep(0., .10, tip);
  float fade = (1. - smoothstep(.38, 1., age)) * laid * tail * ends;
  float light = (body * .69 + edge * .90 + echo * .28) * fade;
  vec3 color = mix(tint, white, .86 * edge);
`;

const wave = `
  float tip = pow(max(0., sin(3.14159 * uvCut.x)), .62);
  float behind = .983 - .09 * (1. - tip) - uvCut.y;
  float width = .62 * tip;
  float body = smoothstep(-.02, .015, behind) * (1. - smoothstep(0., max(.015,width), behind));
  float edge = filament((behind - .025 * tip) / mix(.009, .073, tip));
  // A second filament curls in the wake, breaking up before it reaches either tip.
  float wake = filament((behind - .19 - width) / .055) * tip;
  float strand = smoothstep(-.86, .28, sin(14. * uvCut.x - 12. * clock));
  float light = (.82 * body + .94 * edge + .49 * wake * strand) * smoothstep(0., .14, tip) * power;
  vec3 color = mix(tint, white, .94 * edge);
`;

export function bladeArcMaterial(
  color: THREE.ColorRepresentation,
  travelling = false
) {
  return new THREE.ShaderMaterial({
    uniforms: {
      blade: { value: new THREE.Color(color) },
      white: { value: new THREE.Color(colors.fg.DEFAULT) },
      progress: { value: 0 },
      eclipse: { value: false },
      clock: { value: 0 },
    },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    forceSinglePass: true,
    vertexShader: `
      uniform vec3 blade;
      varying vec2 uvCut;
      varying vec3 tint;
      varying float power;
      void main() {
        uvCut = uv;
        tint = blade;
        power = 1.;
        vec3 p = position;
        p.y += .055 * sin(3.14159 * uv.x) * uv.y;
        vec4 local = vec4(p, 1.);
        #ifdef USE_INSTANCING
          local = instanceMatrix * local;
        #endif
        #ifdef USE_INSTANCING_COLOR
          power = max(max(instanceColor.r, instanceColor.g), instanceColor.b);
          tint = instanceColor / max(.001, power);
        #endif
        gl_Position = projectionMatrix * modelViewMatrix * local;
      }`,
    fragmentShader: `
      float filament(float distanceFromLine) { return exp(-distanceFromLine * distanceFromLine); }
      uniform bool eclipse;
      uniform float progress, clock;
      uniform vec3 white;
      varying vec2 uvCut;
      varying vec3 tint;
      varying float power;
      void main() {
        ${travelling ? wave : melee}
        gl_FragColor = vec4(color, clamp(light, 0., 1.));
        #include <colorspace_fragment>
      }`,
  });
}
