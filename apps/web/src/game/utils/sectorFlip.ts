import * as THREE from 'three';
import { extractSectorPositions, SECTOR_COUNT } from './sectorGeometry';

export const SECTOR_FLIP_DURATION_SECONDS = 0.95;
export const SECTOR_FLIP_MAX_WAVE_DELAY = 0.72;

export function sectorFlipWaveDelayForCount(sectorCount: number): number {
  if (sectorCount <= 1) return 0;
  return Math.min(
    SECTOR_FLIP_MAX_WAVE_DELAY,
    0.14 + Math.log2(sectorCount) * 0.09
  );
}

export function randomSectorWaveOrigin(
  random: () => number = Math.random
): THREE.Vector3 {
  const y = random() * 2 - 1;
  const azimuth = random() * Math.PI * 2;
  const radialDistance = Math.sqrt(Math.max(0, 1 - y * y));
  return new THREE.Vector3(
    radialDistance * Math.cos(azimuth),
    y,
    radialDistance * Math.sin(azimuth)
  );
}

export function randomOutsideSectorWaveOrigin(
  excludedSectorIds: readonly number[],
  radius: number,
  random: () => number = Math.random
): THREE.Vector3 {
  const excluded = new Set(excludedSectorIds);
  const availableCount = SECTOR_COUNT - excluded.size;
  if (availableCount <= 0) return randomSectorWaveOrigin(random);
  let availableIndex = Math.min(
    Math.floor(random() * availableCount),
    availableCount - 1
  );
  for (let sectorId = 0; sectorId < SECTOR_COUNT; sectorId += 1) {
    if (excluded.has(sectorId)) continue;
    if (availableIndex === 0) {
      return sectorFlipParameters(sectorId, 0, radius).pivot.normalize();
    }
    availableIndex -= 1;
  }
  return randomSectorWaveOrigin(random);
}

export function randomVisibleOutsideSectorWaveOrigin(
  excludedSectorIds: readonly number[],
  camera: THREE.Camera,
  radius: number,
  random: () => number = Math.random
): THREE.Vector3 {
  camera.updateMatrixWorld();
  const cameraPosition = camera.getWorldPosition(new THREE.Vector3());
  const excluded = new Set(excludedSectorIds);
  const visibleOutsidePositions: THREE.Vector3[] = [];
  const visiblePositions: THREE.Vector3[] = [];

  for (let sectorId = 0; sectorId < SECTOR_COUNT; sectorId += 1) {
    const position = sectorFlipParameters(sectorId, 0, radius).pivot;
    const surfaceNormal = position.clone().normalize();
    const directionToCamera = cameraPosition.clone().sub(position).normalize();
    if (surfaceNormal.dot(directionToCamera) <= 0) continue;

    const projected = position.clone().project(camera);
    if (
      projected.z < -1 ||
      projected.z > 1 ||
      Math.abs(projected.x) > 1 ||
      Math.abs(projected.y) > 1
    ) {
      continue;
    }

    const normalizedPosition = position.normalize();
    visiblePositions.push(normalizedPosition);
    if (!excluded.has(sectorId)) {
      visibleOutsidePositions.push(normalizedPosition);
    }
  }

  const candidates =
    visibleOutsidePositions.length > 0
      ? visibleOutsidePositions
      : visiblePositions;
  if (candidates.length === 0) {
    return randomOutsideSectorWaveOrigin(excludedSectorIds, radius, random);
  }
  const candidateIndex = Math.min(
    Math.floor(random() * candidates.length),
    candidates.length - 1
  );
  return candidates[candidateIndex].clone();
}

export function sectorWaveDistance(
  sectorPosition: THREE.Vector3,
  waveOrigin: THREE.Vector3
): number {
  return (
    Math.acos(
      THREE.MathUtils.clamp(
        sectorPosition.clone().normalize().dot(waveOrigin.clone().normalize()),
        -1,
        1
      )
    ) / Math.PI
  );
}

export function sectorWaveDistanceRange(
  sectorIds: readonly number[],
  waveOrigin: THREE.Vector3,
  radius: number
): THREE.Vector2 {
  if (sectorIds.length === 0) return new THREE.Vector2(0, 1);
  let minimum = Infinity;
  let maximum = -Infinity;
  sectorIds.forEach((sectorId) => {
    const distance = sectorWaveDistance(
      sectorFlipParameters(sectorId, 0, radius).pivot,
      waveOrigin
    );
    minimum = Math.min(minimum, distance);
    maximum = Math.max(maximum, distance);
  });
  return new THREE.Vector2(minimum, maximum);
}

export function sectorWaveDelay(
  sectorPosition: THREE.Vector3,
  waveOrigin: THREE.Vector3,
  waveDelay = SECTOR_FLIP_MAX_WAVE_DELAY
): number {
  return sectorWaveDistance(sectorPosition, waveOrigin) * waveDelay;
}

export interface SectorFlipParameters {
  axis: THREE.Vector3;
  normal: THREE.Vector3;
  pivot: THREE.Vector3;
}

export function sectorFlipParameters(
  sectorId: number,
  height: number,
  radius: number
): SectorFlipParameters {
  const positions = extractSectorPositions([sectorId], radius);
  const radialScale = (radius + height) / radius;
  const corners = [0, 1, 2].map((corner) =>
    new THREE.Vector3(
      positions[corner * 3],
      positions[corner * 3 + 1],
      positions[corner * 3 + 2]
    ).multiplyScalar(radialScale)
  );
  const pivot = new THREE.Vector3(
    (positions[0] + positions[3] + positions[6]) / 3,
    (positions[1] + positions[4] + positions[7]) / 3,
    (positions[2] + positions[5] + positions[8]) / 3
  ).multiplyScalar(radialScale);
  const normal = corners[1]
    .clone()
    .sub(corners[0])
    .cross(corners[2].clone().sub(corners[0]))
    .normalize();
  if (normal.dot(pivot) < 0) normal.multiplyScalar(-1);
  const worldHinge =
    Math.abs(normal.y) < 0.95
      ? new THREE.Vector3(0, 1, 0)
      : new THREE.Vector3(1, 0, 0);
  const axis = worldHinge
    .sub(normal.clone().multiplyScalar(worldHinge.dot(normal)))
    .normalize();

  return {
    axis,
    normal,
    pivot,
  };
}

export function addSectorFlipAttributes(
  geometry: THREE.BufferGeometry,
  faceSectorIds: readonly number[],
  heights: ReadonlyMap<number, number>,
  radius: number
): void {
  const vertexCount = geometry.getAttribute('position').count;
  if (vertexCount !== faceSectorIds.length * 3) {
    throw new Error(
      'Sector flip geometry must contain three vertices per face'
    );
  }

  const axes = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const pivots = new Float32Array(vertexCount * 3);
  const parameters = new Map<number, SectorFlipParameters>();

  faceSectorIds.forEach((sectorId, faceIndex) => {
    let sectorParameters = parameters.get(sectorId);
    if (!sectorParameters) {
      sectorParameters = sectorFlipParameters(
        sectorId,
        heights.get(sectorId) ?? 0,
        radius
      );
      parameters.set(sectorId, sectorParameters);
    }

    for (let faceVertex = 0; faceVertex < 3; faceVertex += 1) {
      const vertexIndex = faceIndex * 3 + faceVertex;
      sectorParameters.axis.toArray(axes, vertexIndex * 3);
      sectorParameters.normal.toArray(normals, vertexIndex * 3);
      sectorParameters.pivot.toArray(pivots, vertexIndex * 3);
    }
  });

  geometry.setAttribute('flipAxis', new THREE.BufferAttribute(axes, 3));
  geometry.setAttribute('flipNormal', new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute('flipPivot', new THREE.BufferAttribute(pivots, 3));
}
