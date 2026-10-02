import type * as THREE from 'three';
import { createSectorGeometry } from '../utils/sectorGeometry';

let geometry: THREE.BufferGeometry | null = null;

/** One Core shared by every stage on the catalog page. */
export const catalogGround = () => (geometry ??= createSectorGeometry());

export function disposeCatalogGround() {
  geometry?.dispose();
  geometry = null;
}
