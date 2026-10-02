import { useEffect, useMemo, type Ref } from 'react';
import * as THREE from 'three';
import { colors } from '../../../ui/tokens';

/** Half the height of the body: two triangular cones joined at their bases. */
export const SUPPLY_DROP_HALF_HEIGHT = 0.25;
/** The bottom of the tether, below the body's centre. */
export const SUPPLY_DROP_TETHER_DEPTH = 0.92;

const RADIUS = 0.32;

/**
 * The Supply Drop, centred on its body: a dark double pyramid with lit edges,
 * a level ring and a tether hanging toward the ground. The Core marker, the
 * logo and Core Survivors all draw this one model; spin it through `bodyRef`.
 */
export function SupplyDropModel({
  bodyRef,
  claimed = false,
  ringOpacity = 0.76,
  renderOrder,
}: {
  bodyRef?: Ref<THREE.Group>;
  /** A drawn drop with a winner fills its hull with gold. */
  claimed?: boolean;
  ringOpacity?: number;
  /**
   * Render order of the body and ring, to sort against the Beacon. A
   * group's order also sorts everything inside it, so the body's groups share
   * one.
   */
  renderOrder?: { body?: number; ring?: number };
}) {
  const geometry = useMemo(
    () =>
      new THREE.ConeGeometry(RADIUS, SUPPLY_DROP_HALF_HEIGHT * 2, 3, 1, false),
    []
  );
  const edges = useMemo(() => new THREE.EdgesGeometry(geometry), [geometry]);

  useEffect(
    () => () => {
      edges.dispose();
      geometry.dispose();
    },
    [edges, geometry]
  );

  return (
    <>
      <mesh position={[0, -0.66, 0]} raycast={() => undefined}>
        <cylinderGeometry args={[0.008, 0.008, 0.52, 3]} />
        <meshBasicMaterial
          color={colors.gold.DEFAULT}
          transparent
          opacity={0.48}
          toneMapped={false}
        />
      </mesh>

      <group ref={bodyRef} renderOrder={renderOrder?.body}>
        {[-1, 1].map((direction) => (
          <group
            key={direction}
            position={[0, direction * SUPPLY_DROP_HALF_HEIGHT, 0]}
            rotation={[0, 0, direction < 0 ? Math.PI : 0]}
            renderOrder={renderOrder?.body}
          >
            <mesh geometry={geometry} raycast={() => undefined}>
              <meshBasicMaterial
                color={claimed ? colors.gold.DEFAULT : colors.gold.deep}
                transparent
                opacity={claimed ? 0.58 : 0.7}
                depthWrite={false}
                side={THREE.DoubleSide}
                toneMapped={false}
              />
            </mesh>
            <lineSegments
              geometry={edges}
              raycast={() => undefined}
              renderOrder={3}
            >
              <lineBasicMaterial
                color={colors.gold.edge}
                transparent
                opacity={0.96}
                depthWrite={false}
                blending={THREE.AdditiveBlending}
                toneMapped={false}
              />
            </lineSegments>
          </group>
        ))}
      </group>

      <mesh
        rotation={[Math.PI / 2, 0, 0]}
        raycast={() => undefined}
        renderOrder={renderOrder?.ring}
      >
        <torusGeometry args={[0.49, 0.01, 6, 64]} />
        <meshBasicMaterial
          color={colors.gold.DEFAULT}
          transparent
          opacity={ringOpacity}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>
    </>
  );
}
