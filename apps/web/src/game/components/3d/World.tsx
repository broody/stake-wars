import { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { ArcballControls } from '@react-three/drei';
import { Scene } from './Scene';
import { IdleCameraRotation } from './IdleCameraRotation';
import { useControlPoints } from '../../contexts/ControlPointContext';

export function World() {
  const {
    selectedControlPointIds,
    projectionControlPointIds,
    isControlPointInteractionLocked,
  } = useControlPoints();
  const disableIdleRotation =
    selectedControlPointIds.length > 0 ||
    projectionControlPointIds.length > 0 ||
    isControlPointInteractionLocked;

  return (
    <Canvas
      camera={{ position: [0, 0, 15], fov: 75 }}
      style={{ width: '100%', height: '100%', background: '#000000' }}
    >
      <Suspense fallback={null}>
        <Scene />
      </Suspense>

      {/* ArcballControls provides free rotation including roll by default */}
      <ArcballControls minDistance={8} maxDistance={30} enablePan={false} />

      {/* Idle camera rotation after 10 seconds of inactivity */}
      <IdleCameraRotation disabled={disableIdleRotation} />
    </Canvas>
  );
}
