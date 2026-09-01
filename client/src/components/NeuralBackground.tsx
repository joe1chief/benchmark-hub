import React, { useEffect, useRef } from 'react';
import { useTheme } from '@/contexts/ThemeContext';

export default function NeuralBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };

    window.addEventListener('resize', handleResize);

    // Particle nodes
    const count = Math.min(Math.floor((width * height) / 28000), 55);
    const particles: Array<{
      x: number;
      y: number;
      vx: number;
      vy: number;
      radius: number;
      color: string;
      glowColor: string;
    }> = [];

    const colorsDark = [
      { fill: 'rgba(0, 240, 255, ', glow: '#00F0FF' },
      { fill: 'rgba(16, 163, 127, ', glow: '#10A37F' },
      { fill: 'rgba(139, 92, 246, ', glow: '#8B5CF6' },
      { fill: 'rgba(245, 158, 11, ', glow: '#F59E0B' },
    ];

    const colorsLight = [
      { fill: 'rgba(16, 163, 127, ', glow: '#10A37F' },
      { fill: 'rgba(26, 115, 232, ', glow: '#1A73E8' },
      { fill: 'rgba(124, 58, 237, ', glow: '#7C3AED' },
    ];

    const colorPalette = isDark ? colorsDark : colorsLight;

    for (let i = 0; i < count; i++) {
      const c = colorPalette[Math.floor(Math.random() * colorPalette.length)];
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.35,
        vy: (Math.random() - 0.5) * 0.35,
        radius: Math.random() * 1.5 + 0.8,
        color: c.fill,
        glowColor: c.glow,
      });
    }

    // Mouse coordinates
    let mouseX = -1000;
    let mouseY = -1000;

    const handleMouseMove = (e: MouseEvent) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
    };

    const handleMouseLeave = () => {
      mouseX = -1000;
      mouseY = -1000;
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    document.addEventListener('mouseleave', handleMouseLeave);

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      // Render connections
      for (let i = 0; i < particles.length; i++) {
        const p1 = particles[i];

        // Move
        p1.x += p1.vx;
        p1.y += p1.vy;

        // Bounce boundaries
        if (p1.x < 0) p1.x = width;
        if (p1.x > width) p1.x = 0;
        if (p1.y < 0) p1.y = height;
        if (p1.y > height) p1.y = 0;

        // Mouse interaction (gentle attraction / hover push)
        const dxMouse = mouseX - p1.x;
        const dyMouse = mouseY - p1.y;
        const distMouse = Math.hypot(dxMouse, dyMouse);
        if (distMouse < 160) {
          const force = (1 - distMouse / 160) * 0.02;
          p1.x += dxMouse * force;
          p1.y += dyMouse * force;
        }

        // Draw particle point
        ctx.beginPath();
        ctx.arc(p1.x, p1.y, p1.radius, 0, Math.PI * 2);
        ctx.fillStyle = `${p1.color}${isDark ? '0.75)' : '0.45)'}`;
        if (isDark) {
          ctx.shadowBlur = 6;
          ctx.shadowColor = p1.glowColor;
        } else {
          ctx.shadowBlur = 0;
        }
        ctx.fill();

        // Connect to neighbors
        for (let j = i + 1; j < particles.length; j++) {
          const p2 = particles[j];
          const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
          const maxDist = 135;

          if (dist < maxDist) {
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            const alpha = (1 - dist / maxDist) * (isDark ? 0.18 : 0.08);
            ctx.strokeStyle = isDark
              ? `rgba(0, 240, 255, ${alpha})`
              : `rgba(16, 163, 127, ${alpha})`;
            ctx.lineWidth = 0.8;
            ctx.shadowBlur = 0;
            ctx.stroke();
          }
        }
      }

      animId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [isDark]);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-0"
      style={{ opacity: isDark ? 0.85 : 0.45 }}
    />
  );
}
