import * as THREE from 'three';

/**
 * One flat ground arrow of an aimed-shot telegraph, lying in the XZ plane and
 * pointing along +Z: survivors instances turn +Z toward the shot's direction.
 */
export function createAimChevronGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(-0.07, -0.03);
  shape.lineTo(0, 0.04);
  shape.lineTo(0.07, -0.03);
  shape.lineTo(0.07, -0.06);
  shape.lineTo(0, 0.01);
  shape.lineTo(-0.07, -0.06);
  const geometry = new THREE.ShapeGeometry(shape);
  // Lay it face-up on the ground, then turn the tip from -Z to +Z.
  geometry.rotateX(-Math.PI / 2);
  geometry.rotateY(Math.PI);
  return geometry;
}
