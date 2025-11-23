import { useEffect, useRef } from 'react';

interface Point3D {
  x: number;
  y: number;
  z: number;
}

export const WireframeSphere = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointsRef = useRef<Point3D[]>([]);
  const animationFrameRef = useRef<number>();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const sphereRadius = 250;
    const numPoints = 400;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    const initSphere = () => {
      pointsRef.current = [];
      const phi = Math.PI * (3 - Math.sqrt(5));

      for (let i = 0; i < numPoints; i++) {
        const y = 1 - (i / (numPoints - 1)) * 2;
        const radius = Math.sqrt(1 - y * y);
        const theta = phi * i;
        const x = Math.cos(theta) * radius;
        const z = Math.sin(theta) * radius;
        pointsRef.current.push({
          x: x * sphereRadius,
          y: y * sphereRadius,
          z: z * sphereRadius,
        });
      }
    };

    const rotate = (point: Point3D, angleX: number, angleY: number): Point3D => {
      const x = point.x * Math.cos(angleY) - point.z * Math.sin(angleY);
      const z = point.x * Math.sin(angleY) + point.z * Math.cos(angleY);
      const y = point.y;
      const y2 = y * Math.cos(angleX) - z * Math.sin(angleX);
      const z2 = y * Math.sin(angleX) + z * Math.cos(angleX);
      return { x, y: y2, z: z2 };
    };

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const cx = canvas.width / 2;
      const cy = canvas.height / 2;

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.lineWidth = 1;

      pointsRef.current = pointsRef.current.map((p) => rotate(p, 0.002, 0.003));

      pointsRef.current.forEach((p, i) => {
        for (let j = i + 1; j < i + 6; j++) {
          if (j < pointsRef.current.length) {
            const p2 = pointsRef.current[j];
            const dist = Math.sqrt(
              (p.x - p2.x) ** 2 + (p.y - p2.y) ** 2 + (p.z - p2.z) ** 2
            );
            if (dist < 50) {
              ctx.beginPath();
              ctx.moveTo(cx + p.x, cy + p.y);
              ctx.lineTo(cx + p2.x, cy + p2.y);
              ctx.stroke();
            }
          }
        }
      });

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    resize();
    initSphere();
    animate();

    window.addEventListener('resize', resize);

    return () => {
      window.removeEventListener('resize', resize);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed top-0 left-0 w-full h-full -z-10 opacity-50"
    />
  );
};

