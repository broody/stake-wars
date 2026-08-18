import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import {
  createExampleDetailImageGeometry,
  createExampleDetailTexture,
  createExampleImageGeometry,
  getExampleImageAtlasTexture,
} from '../../utils/exampleImageAtlas';

export function ExampleImageLayer({
  sectorIds,
  heights,
}: {
  sectorIds: readonly number[];
  heights: ReadonlyMap<number, number>;
}) {
  if (sectorIds.length === 0) return null;

  return <PopulatedExampleImageLayer sectorIds={sectorIds} heights={heights} />;
}

export function ExampleDetailImageLayer({
  sectorId,
  heights,
}: {
  sectorId: number;
  heights: ReadonlyMap<number, number>;
}) {
  const geometry = useMemo(
    () => createExampleDetailImageGeometry(sectorId, heights),
    [sectorId, heights]
  );
  const texture = useMemo(
    () => createExampleDetailTexture(sectorId),
    [sectorId]
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
  sectorIds,
  heights,
}: {
  sectorIds: readonly number[];
  heights: ReadonlyMap<number, number>;
}) {
  const geometry = useMemo(
    () => createExampleImageGeometry(sectorIds, heights),
    [sectorIds, heights]
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
