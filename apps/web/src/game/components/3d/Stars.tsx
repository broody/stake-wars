import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

export const Stars: React.FC = () => {
  const pointsRef = useRef<THREE.Points>(null);

  const [positions, baseColors, blinkData] = useMemo(() => {
    const positions = new Float32Array(10000 * 3);
    const baseColors = new Float32Array(10000 * 3);
    const blinkData = new Float32Array(10000 * 4); // [shouldBlink, speed, phase, baseBrightness]

    for (let i = 0; i < 10000; i++) {
      const i3 = i * 3;
      const i4 = i * 4;

      // Random positions in a large sphere (closer to viewer)
      const radius = 30 + Math.random() * 40;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);

      positions[i3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[i3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
      positions[i3 + 2] = radius * Math.cos(phi);

      // Random white/blue tint
      const brightness = 0.5 + Math.random() * 0.5;
      baseColors[i3] = brightness;
      baseColors[i3 + 1] = brightness;
      baseColors[i3 + 2] = brightness + Math.random() * 0.2;

      // ~50% of stars will blink (very visible)
      const shouldBlink = Math.random() < 0.5 ? 1 : 0;
      const blinkSpeed = 1 + Math.random() * 2; // Variable blink speed (faster)
      const phase = Math.random() * Math.PI * 2; // Random starting phase

      blinkData[i4] = shouldBlink;
      blinkData[i4 + 1] = blinkSpeed;
      blinkData[i4 + 2] = phase;
      blinkData[i4 + 3] = brightness;
    }

    return [positions, baseColors, blinkData];
  }, []);

  // Animate blinking stars
  useFrame(({ clock }) => {
    if (!pointsRef.current) return;

    const geometry = pointsRef.current.geometry;
    const colorAttribute = geometry.getAttribute(
      'color'
    ) as THREE.BufferAttribute;
    const colors = colorAttribute.array as Float32Array;
    const time = clock.getElapsedTime();

    for (let i = 0; i < 10000; i++) {
      const i3 = i * 3;
      const i4 = i * 4;

      if (blinkData[i4] === 1) {
        // Should blink
        const speed = blinkData[i4 + 1];
        const phase = blinkData[i4 + 2];
        const baseBrightness = blinkData[i4 + 3];

        // Sine wave for smooth on/off blinking
        const blink = (Math.sin(time * speed + phase) + 1) * 0.5; // 0 to 1
        const brightness = baseBrightness * blink; // Vary from 0 (off) to 100% (full brightness)

        colors[i3] = brightness;
        colors[i3 + 1] = brightness;
        colors[i3 + 2] = brightness;
      } else {
        // Keep non-blinking stars at their base color
        colors[i3] = baseColors[i3];
        colors[i3 + 1] = baseColors[i3 + 1];
        colors[i3 + 2] = baseColors[i3 + 2];
      }
    }

    colorAttribute.needsUpdate = true;
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={positions.length / 3}
          array={positions}
          itemSize={3}
          args={[positions, 3]}
        />
        <bufferAttribute
          attach="attributes-color"
          count={baseColors.length / 3}
          array={baseColors}
          itemSize={3}
          args={[baseColors, 3]}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.1}
        vertexColors
        transparent
        opacity={0.8}
        sizeAttenuation
      />
    </points>
  );
};
