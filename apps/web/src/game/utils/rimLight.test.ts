import { expect, it } from 'vitest';
import * as THREE from 'three';
import { addRimLight } from './rimLight';

function compiled(material: THREE.Material) {
  const shader = {
    uniforms: {},
    vertexShader: THREE.ShaderLib.standard.vertexShader,
    fragmentShader: THREE.ShaderLib.standard.fragmentShader,
  } as unknown as THREE.WebGLProgramParametersWithUniforms;
  material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
  return shader;
}

it('adds an edge glow to a lit material once, after its own shader changes', () => {
  const material = new THREE.MeshStandardMaterial();
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = '// earlier patch\n' + shader.fragmentShader;
  };
  const before = material.customProgramCacheKey();
  addRimLight(addRimLight(material));
  const shader = compiled(material);
  expect(shader.fragmentShader).toContain('// earlier patch');
  expect(shader.fragmentShader.match(/rimFacing =/g)).toHaveLength(1);
  expect(shader.uniforms).toHaveProperty('rimColor');
  expect(material.customProgramCacheKey()).not.toBe(before);
});

it('leaves unlit materials alone', () => {
  const material = new THREE.MeshBasicMaterial();
  addRimLight(material);
  expect(material.userData.rimLight).toBeUndefined();
});
