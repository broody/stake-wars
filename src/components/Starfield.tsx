import { useEffect, useRef } from 'react';

interface Star {
  x: number;
  y: number;
  size: number;
  speed: number;
  opacity: number;
  fadeDir: number;
}

export const Starfield = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const starsRef = useRef<Star[]>([]);
  const animationFrameRef = useRef<number>();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = window.innerWidth;
    let height = window.innerHeight;

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width;
      canvas.height = height;
      initStars();
    };

    const initStars = () => {
      starsRef.current = [];
      for (let i = 0; i < 150; i++) {
        starsRef.current.push({
          x: Math.random() * width,
          y: Math.random() * height,
          size: Math.random() > 0.9 ? 3 : 2,
          speed: Math.random() * 0.2 + 0.05,
          opacity: Math.random(),
          fadeDir: Math.random() > 0.5 ? 0.01 : -0.01,
        });
      }
    };

    const updateStar = (star: Star) => {
      star.y -= star.speed;
      if (star.y < 0) star.y = height;
      star.opacity += star.fadeDir;
      if (star.opacity > 1 || star.opacity < 0.2) star.fadeDir *= -1;
    };

    const drawStar = (star: Star) => {
      ctx.fillStyle = `rgba(255, 255, 255, ${star.opacity})`;
      ctx.fillRect(star.x, star.y, star.size, star.size);
    };

    const animate = () => {
      ctx.clearRect(0, 0, width, height);
      starsRef.current.forEach((star) => {
        updateStar(star);
        drawStar(star);
      });
      animationFrameRef.current = requestAnimationFrame(animate);
    };

    resize();
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
      className="fixed top-0 left-0 w-full h-full -z-10"
    />
  );
};
