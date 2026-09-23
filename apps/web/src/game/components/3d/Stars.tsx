import React, { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const STAR_COUNT = 10000;

export const Stars: React.FC = () => {
  const [positions, baseColors, blinkData] = useMemo(() => {
    const positions = new Float32Array(STAR_COUNT * 3);
    const baseColors = new Float32Array(STAR_COUNT * 3);
    const blinkData = new Float32Array(STAR_COUNT * 4); // [shouldBlink, speed, phase, baseBrightness]

    for (let i = 0; i < STAR_COUNT; i++) {
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

  // Blinking runs in the vertex shader so the CPU never rewrites or
  // re-uploads the 10k-star color buffer.
  const timeUniform = useMemo(() => ({ value: 0 }), []);
  const material = useMemo(() => {
    const value = new THREE.PointsMaterial({
      size: 0.1,
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
      sizeAttenuation: true,
    });
    value.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = timeUniform;
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          '#include <common>\nattribute vec4 blink;\nuniform float uTime;'
        )
        .replace(
          '#include <color_vertex>',
          `#include <color_vertex>
          if (blink.x > 0.5) {
            // Sine wave for smooth on/off blinking, 0 (off) to full brightness
            vColor.rgb = vec3(blink.w * (sin(uTime * blink.y + blink.z) + 1.0) * 0.5);
          }`
        );
    };
    return value;
  }, [timeUniform]);

  useEffect(() => () => material.dispose(), [material]);

  useFrame(({ clock }) => {
    timeUniform.value = clock.getElapsedTime();
  });

  return (
    <points material={material}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[baseColors, 3]} />
        <bufferAttribute attach="attributes-blink" args={[blinkData, 4]} />
      </bufferGeometry>
    </points>
  );
};
