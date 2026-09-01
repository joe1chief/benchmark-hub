import React, { useMemo } from 'react';
import type { Benchmark } from '@/types/benchmark';
import { useTheme } from '@/contexts/ThemeContext';
import { useLang } from '@/contexts/LangContext';
import {
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Legend,
  Tooltip,
} from 'recharts';
import { X, ExternalLink, ShieldAlert, Lock, Unlock, Plus, Sparkles, Scale, FileText } from 'lucide-react';
import { canonicalizeOpenness } from '@/lib/openness';

interface Props {
  benchmarks: Benchmark[];
  allBenchmarks: Benchmark[];
  onRemoveBenchmark: (id: string) => void;
  onAddBenchmark: (b: Benchmark) => void;
  onSelectBenchmark: (b: Benchmark) => void;
}

const COLORS = ['#00F0FF', '#10A37F', '#8B5CF6', '#F59E0B'];

function calculateScores(b: Benchmark) {
  // 1. Difficulty score (0-100)
  let difficultyScore = 50;
  const diff = (b.difficulty || '').toLowerCase();
  if (diff.includes('前沿') || diff.includes('frontier')) difficultyScore = 95;
  else if (diff.includes('专家') || diff.includes('expert')) difficultyScore = 80;
  else if (diff.includes('进阶') || diff.includes('advanced')) difficultyScore = 60;
  else if (diff.includes('基础') || diff.includes('basic')) difficultyScore = 35;

  // 2. Industry Adoption / Medal
  const adoptionScore = b.widely_tested ? 95 : (b.has_leaderboard ? 70 : 45);

  // 3. Modality Complexity
  const mod = (b.modality || '').toLowerCase();
  let modalityScore = 35;
  if (mod.includes('3d') || mod.includes('空间') || mod.includes('spatial')) modalityScore = 95;
  else if (mod.includes('video') || mod.includes('视频')) modalityScore = 85;
  else if (mod.includes('audio') || mod.includes('音频') || mod.includes('多模态') || mod.includes('multimodal') || mod.includes('image') || mod.includes('图像')) modalityScore = 70;
  else if (mod.includes('code') || mod.includes('代码')) modalityScore = 65;

  // 4. Agentic Depth & Tool Use
  const task = `${b.task_type || ''} ${b.l1 || ''} ${b.l2 || ''}`.toLowerCase();
  let agenticScore = 30;
  if (task.includes('agent') || task.includes('智能体') || task.includes('swe') || task.includes('tool') || task.includes('工具') || task.includes('environment')) agenticScore = 95;
  else if (task.includes('code') || task.includes('reasoning') || task.includes('推理') || task.includes('math')) agenticScore = 70;
  else if (task.includes('long') || task.includes('长文本')) agenticScore = 60;

  // 5. Openness & Verifiability
  const open = canonicalizeOpenness(b.openness);
  let openScore = 30;
  if (open === 'public' && b.has_leaderboard) openScore = 95;
  else if (open === 'public') openScore = 80;
  else if (open === 'partly public') openScore = 55;
  else openScore = 25;

  // 6. Architectural Richness
  const archScore = (b.drawio_flowchart_en || b.drawio_flowchart_zh || b.mermaid_flowchart) ? 90 : 50;

  return {
    difficultyScore,
    adoptionScore,
    modalityScore,
    agenticScore,
    openScore,
    archScore,
  };
}

export default function BenchmarkArena({
  benchmarks,
  allBenchmarks,
  onRemoveBenchmark,
  onAddBenchmark,
  onSelectBenchmark,
}: Props) {
  const { theme } = useTheme();
  const { t, lang } = useLang();
  const isDark = theme === 'dark';

  const radarData = useMemo(() => {
    const axes = [
      { subject: lang === 'zh' ? '前沿难度' : 'Difficulty', key: 'difficultyScore' },
      { subject: lang === 'zh' ? '顶流采纳度' : 'Industry Adoption', key: 'adoptionScore' },
      { subject: lang === 'zh' ? '模态跨度' : 'Modality Scope', key: 'modalityScore' },
      { subject: lang === 'zh' ? '智能体/环境执行' : 'Agentic Depth', key: 'agenticScore' },
      { subject: lang === 'zh' ? '开放与榜单' : 'Openness & Board', key: 'openScore' },
      { subject: lang === 'zh' ? '架构流图完备' : 'Pipeline Specs', key: 'archScore' },
    ];

    return axes.map(axis => {
      const row: any = { subject: axis.subject };
      benchmarks.forEach(b => {
        const scores = calculateScores(b);
        row[b.id] = (scores as any)[axis.key];
      });
      return row;
    });
  }, [benchmarks, lang]);

  // Recommended benchmarks to add if fewer than 4
  const recommendedCandidates = useMemo(() => {
    const currentIds = new Set(benchmarks.map(b => b.id));
    return allBenchmarks
      .filter(b => !currentIds.has(b.id) && b.widely_tested)
      .slice(0, 6);
  }, [allBenchmarks, benchmarks]);

  if (benchmarks.length === 0) {
    return (
      <div className="p-12 text-center rounded-2xl bg-slate-950/80 border border-cyan-500/30 backdrop-blur-xl">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-cyan-950/80 border border-cyan-400 flex items-center justify-center text-cyan-400 text-2xl shadow-[0_0_20px_rgba(0,240,255,0.3)]">
          <Scale size={28} />
        </div>
        <h3 className="text-xl font-bold font-hud text-white mb-2">
          MULTI-BENCHMARK RADAR ARENA 对决工作台
        </h3>
        <p className="text-slate-400 text-sm max-w-md mx-auto mb-6">
          暂未选择对比项。请在卡片上点击对决按钮，或从下方推荐的前沿基准中添加以生成六维全息雷达图。
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2 max-w-xl mx-auto">
          {recommendedCandidates.slice(0, 4).map(b => (
            <button
              key={b.id}
              onClick={() => onAddBenchmark(b)}
              className="px-3 py-1.5 rounded-lg bg-cyan-950/60 hover:bg-cyan-900/60 border border-cyan-500/40 text-cyan-300 text-xs font-mono-tech flex items-center gap-1.5 transition-all hover:scale-105"
            >
              <span>+</span> {b.name}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Telemetry Bar */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-slate-950 via-slate-900 to-indigo-950/40 border border-cyan-500/30 backdrop-blur-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 font-mono-tech text-xs text-cyan-400 mb-1">
            <span className="w-2 h-2 rounded-full bg-cyan-400 pulse-dot"></span>
            <span>RADAR MATRIX ANALYZER // ACTIVE</span>
          </div>
          <h2 className="text-2xl font-bold font-hud text-white">
            全息多维基准对决战力图
          </h2>
        </div>

        {/* Selected benchmarks chips */}
        <div className="flex flex-wrap items-center gap-2">
          {benchmarks.map((b, i) => (
            <div
              key={b.id}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-mono-tech shadow-sm transition-all"
              style={{
                backgroundColor: isDark ? '#090E1A' : '#FFFFFF',
                borderColor: COLORS[i % COLORS.length],
                color: isDark ? '#E2E8F0' : '#1E293B',
              }}
            >
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: COLORS[i % COLORS.length] }}
              />
              <span className="font-bold">{b.name}</span>
              <button
                onClick={() => onRemoveBenchmark(b.id)}
                className="text-slate-400 hover:text-rose-400 transition-colors ml-1"
                title="Remove"
              >
                <X size={12} />
              </button>
            </div>
          ))}

          {benchmarks.length < 4 && (
            <div className="relative group">
              <button
                className="px-3 py-1.5 rounded-xl border border-dashed border-cyan-500/40 bg-cyan-950/20 hover:bg-cyan-900/30 text-cyan-400 text-xs font-mono-tech flex items-center gap-1.5 transition-all"
              >
                <Plus size={12} /> 添加对比项 ({benchmarks.length}/4)
              </button>
              {/* Dropdown candidates */}
              <div className="absolute right-0 top-full mt-2 w-64 p-2 rounded-xl bg-slate-950 border border-slate-800 shadow-2xl hidden group-hover:block z-30 space-y-1">
                <div className="text-[10px] font-mono-tech text-slate-500 px-2 py-1">推荐前沿基准</div>
                {recommendedCandidates.map(c => (
                  <button
                    key={c.id}
                    onClick={() => onAddBenchmark(c)}
                    className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-slate-900 text-xs font-mono-tech text-slate-300 flex items-center justify-between transition-colors"
                  >
                    <span>{c.name}</span>
                    <span className="text-[10px] text-cyan-400">{c.l1}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Radar Chart + Matrix Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Recharts Holographic Radar Chart */}
        <div className="lg:col-span-6 p-6 rounded-2xl bg-slate-950/80 border border-cyan-500/20 backdrop-blur-xl flex flex-col items-center justify-center min-h-[440px]">
          <h4 className="text-xs font-mono-tech text-cyan-400 font-bold uppercase tracking-wider mb-2 self-start">
            // SIX-AXIS CAPABILITY RADAR (六维战力雷达)
          </h4>
          <div className="w-full h-[360px]">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData}>
                <PolarGrid stroke={isDark ? '#1E293B' : '#E2E8F0'} strokeDasharray="3 3" />
                <PolarAngleAxis
                  dataKey="subject"
                  tick={{ fill: isDark ? '#94A3B8' : '#64748B', fontSize: 11, fontFamily: 'JetBrains Mono' }}
                />
                <PolarRadiusAxis
                  angle={30}
                  domain={[0, 100]}
                  tick={{ fill: isDark ? '#475569' : '#94A3B8', fontSize: 9 }}
                />
                {benchmarks.map((b, i) => (
                  <Radar
                    key={b.id}
                    name={b.name}
                    dataKey={b.id}
                    stroke={COLORS[i % COLORS.length]}
                    fill={COLORS[i % COLORS.length]}
                    fillOpacity={0.25}
                  />
                ))}
                <Legend
                  wrapperStyle={{
                    fontFamily: 'JetBrains Mono',
                    fontSize: '11px',
                    paddingTop: '12px',
                  }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#030712',
                    borderColor: '#1E293B',
                    borderRadius: '8px',
                    fontFamily: 'JetBrains Mono',
                    fontSize: '11px',
                  }}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Right: Side-by-Side Spec Matrix */}
        <div className="lg:col-span-6 p-6 rounded-2xl bg-slate-950/80 border border-cyan-500/20 backdrop-blur-xl overflow-x-auto">
          <h4 className="text-xs font-mono-tech text-cyan-400 font-bold uppercase tracking-wider mb-4">
            // SPECIFICATION COMPARISON MATRIX (参数横向对比)
          </h4>

          <table className="w-full text-xs font-mono-tech border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-left">
                <th className="py-2.5 px-3 text-slate-500 font-medium">SPEC DIMS</th>
                {benchmarks.map((b, i) => (
                  <th key={b.id} className="py-2.5 px-3 font-bold" style={{ color: COLORS[i % COLORS.length] }}>
                    {b.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              <tr>
                <td className="py-2.5 px-3 text-slate-500">L1 DOMAIN</td>
                {benchmarks.map(b => (
                  <td key={b.id} className="py-2.5 px-3 text-slate-200">{b.l1}</td>
                ))}
              </tr>
              <tr>
                <td className="py-2.5 px-3 text-slate-500">DIFFICULTY</td>
                {benchmarks.map(b => (
                  <td key={b.id} className="py-2.5 px-3 text-rose-400 font-semibold">{b.difficulty}</td>
                ))}
              </tr>
              <tr>
                <td className="py-2.5 px-3 text-slate-500">SCALE</td>
                {benchmarks.map(b => (
                  <td key={b.id} className="py-2.5 px-3 text-slate-300">{b.scale || 'N/A'}</td>
                ))}
              </tr>
              <tr>
                <td className="py-2.5 px-3 text-slate-500">METRIC</td>
                {benchmarks.map(b => (
                  <td key={b.id} className="py-2.5 px-3 text-cyan-300">{b.metric || 'Accuracy'}</td>
                ))}
              </tr>
              <tr>
                <td className="py-2.5 px-3 text-slate-500">TASK TYPE</td>
                {benchmarks.map(b => (
                  <td key={b.id} className="py-2.5 px-3 text-slate-300">{b.task_type || 'Reasoning'}</td>
                ))}
              </tr>
              <tr>
                <td className="py-2.5 px-3 text-slate-500">OPENNESS</td>
                {benchmarks.map(b => (
                  <td key={b.id} className="py-2.5 px-3 text-emerald-400 font-semibold uppercase">{b.openness}</td>
                ))}
              </tr>
              <tr>
                <td className="py-2.5 px-3 text-slate-500">FLOWCHART</td>
                {benchmarks.map(b => {
                  const hasFlow = !!(b.drawio_flowchart_en || b.drawio_flowchart_zh || b.mermaid_flowchart);
                  return (
                    <td key={b.id} className="py-2.5 px-3">
                      {hasFlow ? (
                        <span className="text-cyan-400 flex items-center gap-1">⚡ Pipeline</span>
                      ) : (
                        <span className="text-slate-600">Pending</span>
                      )}
                    </td>
                  );
                })}
              </tr>
              <tr>
                <td className="py-2.5 px-3 text-slate-500">ACTION</td>
                {benchmarks.map(b => (
                  <td key={b.id} className="py-2.5 px-3">
                    <button
                      onClick={() => onSelectBenchmark(b)}
                      className="px-2.5 py-1 rounded bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 text-[11px] transition-all"
                    >
                      详情抽屉 &gt;
                    </button>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
