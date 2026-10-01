import { expect, it } from 'vitest';
import * as THREE from 'three';
import { createAimChevronGeometry } from './aimChevron';

it('points the telegraph arrow along +Z, the direction of the shot', () => {
  const geometry = createAimChevronGeometry();
  const position = geometry.getAttribute('position');
  const vertex = new THREE.Vector3();
  let tip = new THREE.Vector3(0, 0, -Infinity);
  for (let i = 0; i < position.count; i++) {
    vertex.fromBufferAttribute(position, i);
    expect(Math.abs(vertex.y)).toBeLessThan(1e-6);
    if (vertex.z > tip.z) tip = vertex.clone();
  }
  // The single point of the chevron leads; its wings trail behind it.
  expect(tip.x).toBeCloseTo(0, 6);
  expect(tip.z).toBeCloseTo(0.04, 6);
  geometry.computeVertexNormals();
  expect(
    new THREE.Vector3().fromBufferAttribute(geometry.getAttribute('normal'), 0)
      .y
  ).toBeCloseTo(1, 6);
  geometry.dispose();
});
