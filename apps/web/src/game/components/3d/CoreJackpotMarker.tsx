import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import type { Jackpot } from '../../types';
import {
  CORE_RADIUS,
  createSectorSetGeometry,
  extractSectorPositions,
} from '../../utils/sectorGeometry';
import { isZeroAddress } from '../../utils/format';
import { isJackpotDrawPending } from '../../services/jackpot';

const JACKPOT_GOLD = '#d6a84b';
const MARKER_RADIUS = 0.32;
const MARKER_HALF_HEIGHT = 0.25;
const ARRIVAL_DURATION_SECONDS = 1.15;
const DEPARTURE_DURATION_SECONDS = 0.9;
const FLIGHT_DISTANCE = 2.1;
const ARRIVAL_SCALE = 0.35;

function easeOutCubic(value: number): number {
  return 1 - (1 - value) ** 3;
}

function easeInCubic(value: number): number {
  return value ** 3;
}

function sectorAnchor(sectorId: number) {
  const positions = extractSectorPositions([sectorId], CORE_RADIUS);
  const normal = new THREE.Vector3(
    (positions[0] + positions[3] + positions[6]) / 3,
    (positions[1] + positions[4] + positions[7]) / 3,
    (positions[2] + positions[5] + positions[8]) / 3
  ).normalize();
  const orientation = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    normal
  );
  return {
    normal,
    position: normal.clone().multiplyScalar(CORE_RADIUS + 0.85),
    orientation,
  };
}

export function CoreJackpotMarker({
  jackpot,
  isOpen,
  onInspect,
}: {
  jackpot: Jackpot;
  isOpen: boolean;
  onInspect: () => void;
}) {
  const markerRef = useRef<THREE.Group>(null);
  const bodyRef = useRef<THREE.Group>(null);
  const sectorFillMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
  const sectorEdgeMaterialRef = useRef<THREE.LineBasicMaterial>(null);
  const arrivalStartedAtRef = useRef<number | null>(null);
  const departureStartedAtRef = useRef<number | null>(null);
  const [isHovered, setIsHovered] = useState(false);
  const hasWinner = !isZeroAddress(jackpot.winner);
  const anchor = useMemo(
    () => sectorAnchor(jackpot.lastDrawnSectorId),
    [jackpot.lastDrawnSectorId]
  );
  const arrivalPosition = useMemo(
    () =>
      anchor.position.clone().addScaledVector(anchor.normal, FLIGHT_DISTANCE),
    [anchor]
  );
  const sectorGeometry = useMemo(
    () =>
      createSectorSetGeometry([jackpot.lastDrawnSectorId], CORE_RADIUS * 1.006),
    [jackpot.lastDrawnSectorId]
  );
  const sectorEdges = useMemo(
    () => new THREE.EdgesGeometry(sectorGeometry),
    [sectorGeometry]
  );
  const beaconGeometry = useMemo(
    () =>
      new THREE.ConeGeometry(
        MARKER_RADIUS,
        MARKER_HALF_HEIGHT * 2,
        3,
        1,
        false
      ),
    []
  );
  const beaconEdges = useMemo(
    () => new THREE.EdgesGeometry(beaconGeometry),
    [beaconGeometry]
  );
  const prefersReducedMotion = useMemo(
    () =>
      globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ??
      false,
    []
  );

  useEffect(
    () => () => {
      sectorEdges.dispose();
      sectorGeometry.dispose();
      beaconEdges.dispose();
      beaconGeometry.dispose();
      document.body.style.cursor = '';
    },
    [beaconEdges, beaconGeometry, sectorEdges, sectorGeometry]
  );

  useFrame(({ clock }, delta) => {
    const marker = markerRef.current;
    const body = bodyRef.current;
    if (!marker || !body) return;

    const elapsed = clock.getElapsedTime();
    arrivalStartedAtRef.current ??= elapsed;
    const floatOffset = prefersReducedMotion
      ? 0
      : Math.sin(elapsed * 1.45) * 0.055;
    marker.quaternion.copy(anchor.orientation);
    const fillOpacity = isOpen ? 0.24 : 0.12;
    const edgeOpacity = isOpen ? 1 : 0.72;
    const interactionScale = isHovered || isOpen ? 1.13 : 1;
    const isPending = isJackpotDrawPending(jackpot);

    if (prefersReducedMotion) {
      marker.visible = !isPending;
      marker.position.copy(anchor.position);
      marker.scale.setScalar(interactionScale);
      if (sectorFillMaterialRef.current) {
        sectorFillMaterialRef.current.opacity = isPending ? 0 : fillOpacity;
      }
      if (sectorEdgeMaterialRef.current) {
        sectorEdgeMaterialRef.current.opacity = isPending ? 0 : edgeOpacity;
      }
      return;
    }

    if (isPending) {
      departureStartedAtRef.current ??= elapsed;
      const departureProgress = THREE.MathUtils.clamp(
        (elapsed - departureStartedAtRef.current) / DEPARTURE_DURATION_SECONDS,
        0,
        1
      );
      const easedDeparture = easeInCubic(departureProgress);
      marker.visible = departureProgress < 1;
      marker.position
        .copy(anchor.position)
        .addScaledVector(
          anchor.normal,
          floatOffset + easedDeparture * FLIGHT_DISTANCE
        );
      marker.scale.setScalar(interactionScale * (1 - easedDeparture));
      body.rotation.y += delta * (0.9 + easedDeparture * 8);
      if (sectorFillMaterialRef.current) {
        sectorFillMaterialRef.current.opacity =
          fillOpacity * (1 - departureProgress);
      }
      if (sectorEdgeMaterialRef.current) {
        sectorEdgeMaterialRef.current.opacity =
          edgeOpacity * (1 - departureProgress);
      }
      if (departureProgress === 1) document.body.style.cursor = '';
      return;
    }

    marker.visible = true;
    const arrivalProgress = THREE.MathUtils.clamp(
      (elapsed - arrivalStartedAtRef.current) / ARRIVAL_DURATION_SECONDS,
      0,
      1
    );
    const easedArrival = easeOutCubic(arrivalProgress);
    marker.position
      .copy(anchor.position)
      .addScaledVector(
        anchor.normal,
        (1 - easedArrival) * FLIGHT_DISTANCE + floatOffset * easedArrival
      );
    if (arrivalProgress < 1) {
      marker.scale.setScalar(
        (ARRIVAL_SCALE + (1 - ARRIVAL_SCALE) * easedArrival) * interactionScale
      );
    } else {
      const nextScale = THREE.MathUtils.damp(
        marker.scale.x,
        interactionScale,
        10,
        delta
      );
      marker.scale.setScalar(nextScale);
    }
    if (sectorFillMaterialRef.current) {
      sectorFillMaterialRef.current.opacity = fillOpacity * easedArrival;
    }
    if (sectorEdgeMaterialRef.current) {
      sectorEdgeMaterialRef.current.opacity = edgeOpacity * easedArrival;
    }
    body.rotation.y +=
      delta * ((isOpen ? 0.9 : 0.45) + (1 - arrivalProgress) * 5);
  });

  const inspect = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    document.body.style.cursor = '';
    onInspect();
  };

  return (
    <group>
      <mesh
        geometry={sectorGeometry}
        raycast={() => undefined}
        renderOrder={12}
      >
        <meshBasicMaterial
          ref={sectorFillMaterialRef}
          color={JACKPOT_GOLD}
          transparent
          opacity={prefersReducedMotion ? (isOpen ? 0.24 : 0.12) : 0}
          depthWrite={false}
          side={THREE.DoubleSide}
          toneMapped={false}
        />
      </mesh>
      <lineSegments
        geometry={sectorEdges}
        raycast={() => undefined}
        renderOrder={13}
      >
        <lineBasicMaterial
          ref={sectorEdgeMaterialRef}
          color={JACKPOT_GOLD}
          transparent
          opacity={prefersReducedMotion ? (isOpen ? 1 : 0.72) : 0}
          depthWrite={false}
          toneMapped={false}
        />
      </lineSegments>

      <group
        ref={markerRef}
        position={prefersReducedMotion ? anchor.position : arrivalPosition}
        quaternion={anchor.orientation}
        scale={prefersReducedMotion ? 1 : ARRIVAL_SCALE}
      >
        <mesh position={[0, -0.66, 0]} raycast={() => undefined}>
          <cylinderGeometry args={[0.008, 0.008, 0.52, 3]} />
          <meshBasicMaterial
            color={JACKPOT_GOLD}
            transparent
            opacity={0.48}
            toneMapped={false}
          />
        </mesh>

        <group ref={bodyRef}>
          <mesh
            geometry={beaconGeometry}
            position={[0, -MARKER_HALF_HEIGHT, 0]}
            rotation={[0, 0, Math.PI]}
            raycast={() => undefined}
          >
            <meshBasicMaterial
              color={hasWinner ? JACKPOT_GOLD : '#17130b'}
              transparent
              opacity={hasWinner ? 0.58 : 0.7}
              depthWrite={false}
              side={THREE.DoubleSide}
              toneMapped={false}
            />
          </mesh>
          <lineSegments
            geometry={beaconEdges}
            position={[0, -MARKER_HALF_HEIGHT, 0]}
            rotation={[0, 0, Math.PI]}
            raycast={() => undefined}
            renderOrder={3}
          >
            <lineBasicMaterial
              color="#f2c76e"
              transparent
              opacity={0.96}
              depthTest
              depthWrite={false}
              blending={THREE.AdditiveBlending}
              toneMapped={false}
            />
          </lineSegments>

          <mesh
            geometry={beaconGeometry}
            position={[0, MARKER_HALF_HEIGHT, 0]}
            raycast={() => undefined}
          >
            <meshBasicMaterial
              color={hasWinner ? JACKPOT_GOLD : '#17130b'}
              transparent
              opacity={hasWinner ? 0.58 : 0.7}
              depthWrite={false}
              side={THREE.DoubleSide}
              toneMapped={false}
            />
          </mesh>
          <lineSegments
            geometry={beaconEdges}
            position={[0, MARKER_HALF_HEIGHT, 0]}
            raycast={() => undefined}
            renderOrder={3}
          >
            <lineBasicMaterial
              color="#f2c76e"
              transparent
              opacity={0.96}
              depthTest
              depthWrite={false}
              blending={THREE.AdditiveBlending}
              toneMapped={false}
            />
          </lineSegments>
        </group>

        <mesh
          rotation={[Math.PI / 2, 0, 0]}
          raycast={() => undefined}
          renderOrder={1}
        >
          <torusGeometry args={[0.49, 0.01, 6, 64]} />
          <meshBasicMaterial
            color={JACKPOT_GOLD}
            transparent
            opacity={isOpen ? 0.94 : 0.66}
            depthTest
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </mesh>

        <mesh
          onPointerOver={(event) => {
            event.stopPropagation();
            document.body.style.cursor = 'pointer';
            setIsHovered(true);
          }}
          onPointerOut={() => {
            document.body.style.cursor = '';
            setIsHovered(false);
          }}
          onClick={inspect}
        >
          <sphereGeometry args={[0.72, 8, 8]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </group>
    </group>
  );
}
