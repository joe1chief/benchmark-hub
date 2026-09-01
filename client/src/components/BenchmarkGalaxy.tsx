import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import type { Benchmark } from '@/types/benchmark';
import { useTheme } from '@/contexts/ThemeContext';
import { useLang } from '@/contexts/LangContext';
import { ZoomIn, ZoomOut, RotateCcw, Sparkles, Filter, Info } from 'lucide-react';

interface Props {
  benchmarks: Benchmark[];
  onSelectBenchmark: (b: Benchmark) => void;
  selectedBenchmark?: Benchmark | null;
  searchQuery?: string;
  activeCategory?: string;
}

interface Node {
  id: string;
  name: string;
  benchmark: Benchmark;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  category: string;
  family: string;
  isMedal: boolean;
  clusterIndex: number;
}

interface Link {
  source: string;
  target: string;
  color: string;
}

export default function BenchmarkGalaxy({
  benchmarks,
  onSelectBenchmark,
  selectedBenchmark,
  searchQuery = '',
  activeCategory = '',
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { theme } = useTheme();
  const { t, lang } = useLang();
  const isDark = theme === 'dark';

  const [hoveredNode, setHoveredNode] = useState<Node | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Transform state for pan/zoom
  const transformRef = useRef({ x: 0, y: 0, scale: 1 });
  const [currentScale, setCurrentScale] = useState(1);
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });

  // Categorize & build cluster nodes
  const categories = useMemo(() => {
    return Array.from(new Set(benchmarks.map(b => b.l1))).filter(Boolean);
  }, [benchmarks]);

  const { nodes, links } = useMemo(() => {
    if (!benchmarks.length) return { nodes: [], links: [] };

    const catAngles: Record<string, number> = {};
    categories.forEach((cat, idx) => {
      catAngles[cat] = (idx / categories.length) * Math.PI * 2;
    });

    const nodeList: Node[] = [];
    const nodeMap = new Map<string, Node>();

    benchmarks.forEach((b, i) => {
      const cat = b.l1 || 'Other';
      const angle = catAngles[cat] || (i / benchmarks.length) * Math.PI * 2;
      const baseDistance = 280 + Math.random() * 240;
      
      // Random cluster offset
      const spreadAngle = angle + (Math.random() - 0.5) * 0.5;
      const initX = Math.cos(spreadAngle) * baseDistance;
      const initY = Math.sin(spreadAngle) * baseDistance;

      const isMedal = !!b.widely_tested;
      const radius = isMedal ? 8 : (b.family ? 5.5 : 4);

      const node: Node = {
        id: b.id,
        name: b.name,
        benchmark: b,
        x: initX,
        y: initY,
        vx: 0,
        vy: 0,
        radius,
        color: b.l1_color || '#00F0FF',
        category: cat,
        family: b.family || '',
        isMedal,
        clusterIndex: categories.indexOf(cat),
      };

      nodeList.push(node);
      nodeMap.set(b.id, node);
    });

    // Generate links for Family & Related
    const linkList: Link[] = [];
    benchmarks.forEach(b => {
      if (b.related_benchmarks && Array.isArray(b.related_benchmarks)) {
        b.related_benchmarks.forEach(targetId => {
          if (nodeMap.has(targetId) && targetId !== b.id) {
            linkList.push({
              source: b.id,
              target: targetId,
              color: b.l1_color || '#00F0FF',
            });
          }
        });
      }
    });

    return { nodes: nodeList, links: linkList };
  }, [benchmarks, categories]);

  // Simulation step
  const nodesRef = useRef<Node[]>([]);
  nodesRef.current = nodes;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;

    const resize = () => {
      if (!canvas || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      canvas.width = rect.width * window.devicePixelRatio;
      canvas.height = rect.height * window.devicePixelRatio;
    };

    resize();
    window.addEventListener('resize', resize);

    // Initial center
    transformRef.current.x = (canvas.width / (2 * window.devicePixelRatio));
    transformRef.current.y = (canvas.height / (2 * window.devicePixelRatio));

    let tick = 0;

    const render = () => {
      tick++;
      const w = canvas.width / window.devicePixelRatio;
      const h = canvas.height / window.devicePixelRatio;

      ctx.save();
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
      ctx.clearRect(0, 0, w, h);

      const { x: panX, y: panY, scale } = transformRef.current;

      ctx.translate(panX, panY);
      ctx.scale(scale, scale);

      // Draw subtle orbital rings for categories
      categories.forEach((cat, idx) => {
        const angle = (idx / categories.length) * Math.PI * 2;
        const cx = Math.cos(angle) * 380;
        const cy = Math.sin(angle) * 380;

        ctx.beginPath();
        ctx.arc(0, 0, 380, 0, Math.PI * 2);
        ctx.strokeStyle = isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Category hub label
        const catLabel = (t.l1 as any)[cat] || cat;
        ctx.font = '10px "Chakra Petch", sans-serif';
        ctx.fillStyle = isDark ? 'rgba(255, 255, 255, 0.25)' : 'rgba(0, 0, 0, 0.35)';
        ctx.textAlign = 'center';
        ctx.fillText(catLabel, cx, cy);
      });

      // Simple physics relaxation (stops after ~120 ticks)
      if (tick < 150) {
        for (let i = 0; i < nodesRef.current.length; i++) {
          const n1 = nodesRef.current[i];
          for (let j = i + 1; j < nodesRef.current.length; j++) {
            const n2 = nodesRef.current[j];
            const dx = n2.x - n1.x;
            const dy = n2.y - n1.y;
            const dist = Math.hypot(dx, dy) || 1;
            if (dist < 45) {
              const f = (45 - dist) / dist * 0.15;
              n1.x -= dx * f;
              n1.y -= dy * f;
              n2.x += dx * f;
              n2.y += dy * f;
            }
          }
        }
      }

      // Draw links
      const nodeMap = new Map<string, Node>();
      nodesRef.current.forEach(n => nodeMap.set(n.id, n));

      links.forEach(l => {
        const s = nodeMap.get(l.source);
        const target = nodeMap.get(l.target);
        if (!s || !target) return;

        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(target.x, target.y);
        ctx.strokeStyle = isDark ? 'rgba(0, 240, 255, 0.18)' : 'rgba(16, 163, 127, 0.15)';
        ctx.lineWidth = 0.8;
        ctx.stroke();
      });

      // Draw nodes
      const q = searchQuery.toLowerCase().trim();

      nodesRef.current.forEach(node => {
        const isMatched =
          (!q || node.name.toLowerCase().includes(q) || node.benchmark.intro?.toLowerCase().includes(q)) &&
          (!activeCategory || node.category === activeCategory);

        const isSelected = selectedBenchmark?.id === node.id;
        const isHovered = hoveredNode?.id === node.id;

        const opacity = isMatched ? 1 : 0.15;

        // Outer glow halo for selected or medals
        if (node.isMedal || isSelected || isHovered) {
          ctx.beginPath();
          ctx.arc(node.x, node.y, node.radius + (isSelected || isHovered ? 6 : 4), 0, Math.PI * 2);
          ctx.fillStyle = isDark
            ? (isSelected ? 'rgba(0, 240, 255, 0.35)' : `${node.color}33`)
            : `${node.color}22`;
          ctx.fill();
        }

        // Main node core
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
        ctx.fillStyle = node.color;
        ctx.globalAlpha = opacity;
        ctx.fill();

        // Medal icon or border
        if (node.isMedal) {
          ctx.lineWidth = 1.5;
          ctx.strokeStyle = '#F59E0B';
          ctx.stroke();
        }

        // Node label
        if (node.isMedal || scale > 1.2 || isHovered || isSelected) {
          ctx.font = `${isHovered || isSelected ? 'bold 11px' : '10px'} "JetBrains Mono", monospace`;
          ctx.fillStyle = isDark
            ? (isSelected ? '#00F0FF' : '#E2E8F0')
            : (isSelected ? '#0D9488' : '#334155');
          ctx.textAlign = 'center';
          ctx.fillText(node.name, node.x, node.y + node.radius + 12);
        }

        ctx.globalAlpha = 1;
      });

      ctx.restore();
      animId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
    };
  }, [categories, links, searchQuery, activeCategory, isDark, selectedBenchmark, hoveredNode, t.l1]);

  // Pan & Zoom Handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    isDraggingRef.current = true;
    dragStartRef.current = { x: e.clientX - transformRef.current.x, y: e.clientY - transformRef.current.y };
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (isDraggingRef.current) {
      transformRef.current.x = e.clientX - dragStartRef.current.x;
      transformRef.current.y = e.clientY - dragStartRef.current.y;
      return;
    }

    // Hit test hovered node
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const { x: panX, y: panY, scale } = transformRef.current;
    const worldX = (mouseX - panX) / scale;
    const worldY = (mouseY - panY) / scale;

    let found: Node | null = null;
    for (const node of nodesRef.current) {
      const dist = Math.hypot(node.x - worldX, node.y - worldY);
      if (dist <= node.radius + 4) {
        found = node;
        break;
      }
    }

    if (found) {
      setHoveredNode(found);
      setTooltipPos({ x: e.clientX, y: e.clientY });
    } else {
      setHoveredNode(null);
    }
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.88;
    const nextScale = Math.min(Math.max(transformRef.current.scale * zoomFactor, 0.35), 4);
    transformRef.current.scale = nextScale;
    setCurrentScale(nextScale);
  };

  const handleClick = () => {
    if (hoveredNode) {
      onSelectBenchmark(hoveredNode.benchmark);
    }
  };

  const handleResetZoom = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const w = canvas.width / (2 * window.devicePixelRatio);
    const h = canvas.height / (2 * window.devicePixelRatio);
    transformRef.current = { x: w, y: h, scale: 1 };
    setCurrentScale(1);
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-[680px] rounded-2xl overflow-hidden border border-cyan-500/20 bg-slate-950/90 shadow-[0_4px_30px_rgba(0,0,0,0.8)] select-none"
    >
      {/* Telemetry HUD top bar */}
      <div className="absolute top-4 left-4 z-20 flex items-center gap-3 px-3 py-1.5 rounded-lg bg-slate-900/80 border border-cyan-500/30 backdrop-blur-md text-xs font-mono-tech text-cyan-300">
        <span className="w-2 h-2 rounded-full bg-cyan-400 pulse-dot"></span>
        <span>◈ GALAXY CONSTELLATION GRAPH</span>
        <span className="text-slate-500">|</span>
        <span className="text-slate-400">{benchmarks.length} EVAL NODES</span>
      </div>

      {/* Floating Zoom & Control Bar */}
      <div className="absolute top-4 right-4 z-20 flex items-center gap-1.5 p-1 rounded-xl bg-slate-900/80 border border-cyan-500/30 backdrop-blur-md text-xs font-mono-tech">
        <button
          onClick={() => {
            const nextScale = Math.min(transformRef.current.scale * 1.25, 4);
            transformRef.current.scale = nextScale;
            setCurrentScale(nextScale);
          }}
          className="p-2 rounded-lg text-slate-300 hover:text-cyan-300 hover:bg-cyan-950/40 transition-all"
          title="Zoom In"
        >
          <ZoomIn size={14} />
        </button>
        <span className="px-2 text-[11px] text-cyan-400 font-semibold">
          {Math.round(currentScale * 100)}%
        </span>
        <button
          onClick={() => {
            const nextScale = Math.max(transformRef.current.scale * 0.8, 0.35);
            transformRef.current.scale = nextScale;
            setCurrentScale(nextScale);
          }}
          className="p-2 rounded-lg text-slate-300 hover:text-cyan-300 hover:bg-cyan-950/40 transition-all"
          title="Zoom Out"
        >
          <ZoomOut size={14} />
        </button>
        <button
          onClick={handleResetZoom}
          className="p-2 rounded-lg text-slate-300 hover:text-cyan-300 hover:bg-cyan-950/40 transition-all"
          title="Reset Zoom"
        >
          <RotateCcw size={14} />
        </button>
      </div>

      {/* Bottom Hint */}
      <div className="absolute bottom-4 left-4 z-20 flex items-center gap-2 text-[11px] font-mono-tech text-slate-500 bg-slate-950/70 px-3 py-1 rounded-md border border-slate-800">
        <Info size={12} className="text-cyan-400" />
        <span>可按住鼠标左键平移星图，滚轮缩放，点击任意星点展开战术终端抽屉</span>
      </div>

      {/* Interactive Canvas */}
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
        onClick={handleClick}
        className="w-full h-full cursor-grab active:cursor-grabbing"
      />

      {/* Holographic Hover Tooltip */}
      {hoveredNode && (
        <div
          className="fixed z-50 pointer-events-none p-3.5 rounded-xl bg-slate-950/95 border border-cyan-400/50 shadow-[0_0_25px_rgba(0,240,255,0.25)] text-xs font-mono-tech backdrop-blur-xl transition-all"
          style={{
            left: `${tooltipPos.x + 16}px`,
            top: `${tooltipPos.y + 16}px`,
            maxWidth: '300px',
          }}
        >
          <div className="flex items-center justify-between gap-2 mb-1">
            <div className="flex items-center gap-1.5">
              {hoveredNode.isMedal && <span className="text-amber-400">🏅</span>}
              <span className="font-hud font-bold text-sm text-white tracking-wide">
                {hoveredNode.name}
              </span>
            </div>
            <span
              className="px-1.5 py-0.5 rounded text-[10px] font-semibold"
              style={{
                backgroundColor: `${hoveredNode.color}22`,
                color: hoveredNode.color,
                border: `1px solid ${hoveredNode.color}44`,
              }}
            >
              {hoveredNode.category}
            </span>
          </div>

          <div className="text-slate-400 text-[11px] mb-2">
            {hoveredNode.benchmark.org || 'Unknown Org'} &bull; {hoveredNode.benchmark.year}
          </div>

          <p className="text-slate-300 text-[11px] line-clamp-2 leading-relaxed font-sans mb-2">
            {hoveredNode.benchmark.intro || 'No description available.'}
          </p>

          <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-[10px] text-cyan-400">
            <span>DIFFICULTY: {hoveredNode.benchmark.difficulty}</span>
            <span className="text-emerald-400 font-bold uppercase">CLICK TO INSPECT &gt;</span>
          </div>
        </div>
      )}
    </div>
  );
}
