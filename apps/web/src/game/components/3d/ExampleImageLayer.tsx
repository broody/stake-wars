import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import {
  createExampleDetailImageGeometry,
  createExampleDetailTexture,
  createExampleImageGeometry,
  getExampleImageAtlasTexture,
} from '../../utils/exampleImageAtlas';

export function ExampleImageLayer({
  controlPointIds,
  heights,
}: {
  controlPointIds: readonly number[];
  heights: ReadonlyMap<number, number>;
}) {
  if (controlPointIds.length === 0) return null;

  return (
    <PopulatedExampleImageLayer
      controlPointIds={controlPointIds}
      heights={heights}
    />
  );
}

export function ExampleDetailImageLayer({
  controlPointId,
  heights,
}: {
  controlPointId: number;
  heights: ReadonlyMap<number, number>;
}) {
  const geometry = useMemo(
    () => createExampleDetailImageGeometry(controlPointId, heights),
    [controlPointId, heights]
  );
  const texture = useMemo(
    () => createExampleDetailTexture(controlPointId),
    [controlPointId]
  );

  useEffect(
    () => () => {
      geometry.dispose();
      texture.dispose();
    },
    [geometry, texture]
  );

  return (
    <mesh
      geometry={geometry}
      scale={1.002}
      raycast={() => undefined}
      renderOrder={4}
    >
      <meshBasicMaterial
        map={texture}
        side={THREE.DoubleSide}
        toneMapped={false}
      />
    </mesh>
  );
}

function PopulatedExampleImageLayer({
  controlPointIds,
  heights,
}: {
  controlPointIds: readonly number[];
  heights: ReadonlyMap<number, number>;
}) {
  const geometry = useMemo(
    () => createExampleImageGeometry(controlPointIds, heights),
    [controlPointIds, heights]
  );
  const texture = useMemo(() => getExampleImageAtlasTexture(), []);

  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <mesh geometry={geometry} raycast={() => undefined} renderOrder={3}>
      <meshBasicMaterial
        map={texture}
        side={THREE.DoubleSide}
        toneMapped={false}
      />
    </mesh>
  );
}
