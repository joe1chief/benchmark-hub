// LLM Benchmark Costco — BenchmarkDrawer (English)
import React, { useState, useEffect, useCallback } from 'react';
import type { Benchmark } from '@/types/benchmark';
import {
  X, ExternalLink, FileText, Calendar, Building2,
  BarChart3, Globe, Layers, ChevronRight, BookOpen,
  Maximize2, Download, RefreshCw, AlertTriangle,
  Award, Lock, Unlock, ShieldAlert, Link2, Users,
  Home as HomeIcon, ChevronRight as ChevronRightIcon
} from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';

interface Props {
  benchmark: Benchmark | null;
  allBenchmarks: Benchmark[];
  onClose: () => void;
  onSelectBenchmark: (b: Benchmark) => void;
}

function InfoRow({ label, value, isDark }: { label: string; value: string; isDark: boolean }) {
  if (!value || value === 'nan' || value === 'None' || value === 'NaN') return null;
  return (
    <div className={`flex gap-3 py-2.5 border-b last:border-0 transition-colors ${isDark ? 'border-gray-800' : 'border-gray-100'}`}>
      <span className={`text-[12px] w-24 shrink-0 pt-0.5 transition-colors ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{label}</span>
      <span className={`text-[13px] leading-relaxed transition-colors ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>{value}</span>
    </div>
  );
}

const OPENNESS_CONFIG: Record<string, { icon: typeof Unlock; color: string; label: string; bg: string; bgDark: string }> = {
  'public':        { icon: Unlock,      color: '#10A37F', label: 'Public',        bg: 'bg-emerald-50 border-emerald-200',  bgDark: 'bg-emerald-950/30 border-emerald-900/50' },
  'partly public': { icon: ShieldAlert, color: '#F59E0B', label: 'Partly Public', bg: 'bg-amber-50 border-amber-200',      bgDark: 'bg-amber-950/30 border-amber-900/50' },
  'in-house':      { icon: Lock,        color: '#EF4444', label: 'In-house',      bg: 'bg-red-50 border-red-200',          bgDark: 'bg-red-950/30 border-red-900/50' },
};

// Map Chinese difficulty → English
const DIFFICULTY_EN: Record<string, string> = {
  '前沿': 'Frontier', '专家': 'Expert', '进阶': 'Advanced', '基础': 'Basic',
};

// Map Chinese L1 → English
const L1_EN_MAP: Record<string, string> = {
  '通用语言能力': 'General Language', 'Agent能力': 'Agent Capability',
  '多模态理解': 'Multimodal', '代码能力': 'Code',
  '科学推理': 'Science & Reasoning', '安全对齐': 'Safety & Alignment',
  '数学推理': 'Math', '长文本理解': 'Long Context',
  '医疗健康': 'Medical & Health', '视频理解': 'Video Understanding',
  '图表与文档理解': 'Chart & Document', '空间与3D理解': 'Spatial & 3D',
};

type PdfStrategy = 'direct' | 'google' | 'pdfjs';

function getPdfStrategies(pdfUrl: string): { strategy: PdfStrategy; url: string; label: string }[] {
  const strategies: { strategy: PdfStrategy; url: string; label: string }[] = [];
  if (pdfUrl) {
    // Google Docs viewer first — handles CORS transparently, avoids
    // the cross-origin SecurityError that mozilla.github.io/pdf.js emits
    // when loading arxiv / CDN PDFs from a different origin.
    strategies.push({
      strategy: 'google',
      url: `https://docs.google.com/viewer?url=${encodeURIComponent(pdfUrl)}&embedded=true`,
      label: 'Google Docs',
    });
    // PDF.js viewer as fallback
    strategies.push({
      strategy: 'pdfjs',
      url: `https://mozilla.github.io/pdf.js/web/viewer.html?file=${encodeURIComponent(pdfUrl)}`,
      label: 'PDF.js Viewer',
    });
    if (!pdfUrl.includes('arxiv.org')) {
      strategies.push({ strategy: 'direct', url: pdfUrl, label: 'Direct Embed' });
    }
  }
  return strategies;
}

export default function BenchmarkDrawer({ benchmark: b, allBenchmarks, onClose, onSelectBenchmark }: Props) {
  const [tab, setTab] = useState<'info' | 'pdf'>('info');
  const [pdfFullscreen, setPdfFullscreen] = useState(false);
  const [pdfLoaded, setPdfLoaded] = useState(false);
  const [pdfError, setPdfError] = useState(false);
  const [strategyIndex, setStrategyIndex] = useState(0);
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  useEffect(() => {
    if (b) {
      setTab('info');
      setPdfLoaded(false);
      setPdfError(false);
      setStrategyIndex(0);
      setPdfFullscreen(false);
    }
  }, [b?.id]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const handlePdfError = useCallback(() => {
    const rawPdfUrl = b?.pdf_cdn_url || b?.arxiv_pdf_url || '';
    const strategies = getPdfStrategies(rawPdfUrl);
    if (strategyIndex < strategies.length - 1) {
      setStrategyIndex(prev => prev + 1);
      setPdfLoaded(false);
      setPdfError(false);
    } else {
      setPdfError(true);
    }
  }, [strategyIndex, b]);

  if (!b) return null;

  const rawPdfUrl = b.pdf_cdn_url || b.arxiv_pdf_url || '';
  const hasPdf = !!rawPdfUrl;
  const strategies = getPdfStrategies(rawPdfUrl);
  const currentStrategy = strategies[strategyIndex];
  const embedUrl = currentStrategy?.url || '';
  const opennessInfo = OPENNESS_CONFIG[b.openness];
  const diffLabel = DIFFICULTY_EN[b.difficulty] || b.difficulty;
  const l1Label = L1_EN_MAP[b.l1] || b.l1;

  const familyMembers = b.family
    ? allBenchmarks.filter(x => x.family === b.family && x.id !== b.id)
    : [];

  const relatedBenchmarks = (b.related_benchmarks || [])
    .map(name => allBenchmarks.find(x => x.name === name))
    .filter((x): x is Benchmark => !!x)
    .slice(0, 6);

  const drawerBg = isDark ? 'bg-[#111111]' : 'bg-white';
  const borderColor = isDark ? 'border-gray-800' : 'border-gray-100';

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-40" onClick={onClose} />

      {/* Drawer */}
      <div
        className={`fixed right-0 top-0 bottom-0 shadow-2xl z-50 flex flex-col transition-all duration-300 ${drawerBg} ${
          pdfFullscreen ? 'w-full max-w-full' : 'w-full max-w-[720px]'
        }`}
        style={{ animation: 'slideInRight 0.25s ease-out' }}
      >
        {/* Header */}
        <div className={`flex items-start gap-3 px-6 py-5 border-b shrink-0 transition-colors ${borderColor} ${drawerBg}`}>
          <div className="w-1 h-12 rounded-full shrink-0 mt-0.5" style={{ backgroundColor: b.l1_color }} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5">
              <h2 className={`text-[17px] font-semibold leading-snug transition-colors ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                {b.name}
              </h2>
              {b.widely_tested && (
                <span title="Widely adopted by major AI labs" className="shrink-0">
                  <Award size={16} className="text-amber-500" />
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-0.5 rounded-full"
                style={{ backgroundColor: b.l1_color + '22', color: b.l1_color, fontFamily: 'var(--font-mono)' }}>
                <Layers size={9} />{l1Label}
              </span>
              {b.l2 && b.l2 !== b.l1 && b.l2 !== 'nan' && (
                <span className={`inline-flex items-center text-[11px] font-medium px-2.5 py-0.5 rounded-full transition-colors ${isDark ? 'bg-gray-800 text-gray-400' : 'bg-gray-100 text-gray-500'}`}
                  style={{ fontFamily: 'var(--font-mono)' }}>{b.l2}</span>
              )}
              {b.difficulty && b.difficulty !== 'nan' && (
                <span className={`inline-flex items-center text-[11px] font-medium px-2.5 py-0.5 rounded-full border transition-colors ${isDark ? 'bg-orange-950/40 text-orange-400 border-orange-900/50' : 'bg-orange-50 text-orange-600 border-orange-100'}`}
                  style={{ fontFamily: 'var(--font-mono)' }}>{diffLabel}</span>
              )}
              {b.published && (
                <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 transition-colors ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                  <Calendar size={10} />{b.published}
                </span>
              )}
              {opennessInfo && (
                <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border ${isDark ? opennessInfo.bgDark : opennessInfo.bg}`}
                  style={{ color: opennessInfo.color }}>
                  <opennessInfo.icon size={10} />{opennessInfo.label}
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose}
            className={`p-1.5 rounded-lg transition-colors shrink-0 ${isDark ? 'text-gray-500 hover:text-gray-300 hover:bg-gray-800' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`}>
            <X size={18} />
          </button>
        </div>

        {/* Tabs */}
        <div className={`flex border-b px-6 shrink-0 transition-colors ${borderColor} ${drawerBg}`}>
          {[
            { key: 'info', icon: BookOpen, label: 'Details' },
            { key: 'pdf',  icon: FileText, label: 'Full Paper', disabled: !hasPdf },
          ].map(({ key, icon: Icon, label, disabled }) => (
            <button key={key}
              className={`flex items-center gap-1.5 px-1 py-3 text-[13px] font-medium border-b-2 mr-6 transition-colors ${
                tab === key ? 'border-[#10A37F] text-[#10A37F]'
                  : isDark ? 'border-transparent text-gray-500 hover:text-gray-300'
                  : 'border-transparent text-gray-400 hover:text-gray-600'
              } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
              onClick={() => !disabled && setTab(key as 'info' | 'pdf')}
              disabled={disabled}>
              <Icon size={13} />{label}
              {key === 'pdf' && !hasPdf && <span className="text-[10px] ml-1">(N/A)</span>}
            </button>
          ))}
          {tab === 'pdf' && hasPdf && (
            <button
              onClick={() => setPdfFullscreen(v => !v)}
              title={pdfFullscreen ? 'Collapse' : 'Fullscreen'}
              className={`ml-auto flex items-center gap-1 px-2 py-1 my-auto rounded-lg text-[11px] transition-colors ${
                isDark ? 'text-gray-500 hover:text-gray-300 hover:bg-gray-800' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
              }`}>
              <Maximize2 size={12} />
              {pdfFullscreen ? 'Collapse' : 'Fullscreen'}
            </button>
          )}
        </div>

        {/* Content */}
        <div className={`flex-1 overflow-hidden ${tab === 'pdf' ? 'flex flex-col' : ''}`}>
          {tab === 'info' ? (
            <div className="h-full overflow-y-auto px-6 py-5 space-y-5">
              {/* Widely adopted notice */}
              {b.widely_tested && (
                <div className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border transition-colors ${
                  isDark ? 'bg-amber-950/20 border-amber-900/30' : 'bg-amber-50 border-amber-100'
                }`}>
                  <Award size={16} className="text-amber-500 shrink-0" />
                  <span className={`text-[13px] ${isDark ? 'text-amber-300/80' : 'text-amber-700'}`}>
                    This benchmark is widely cited and tested by major AI labs including OpenAI, Google, Anthropic, and Meta.
                  </span>
                </div>
              )}

              {/* Description */}
              <p className={`text-[14px] leading-relaxed transition-colors ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>{b.intro}</p>

              {/* Action buttons */}
              <div className="flex flex-wrap gap-2">
                {b.homepage && (
                  <a href={b.homepage} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3.5 py-2 text-[13px] font-medium rounded-lg text-white transition-colors"
                    style={{ backgroundColor: '#10A37F' }}
                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#0D8F6F')}
                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#10A37F')}>
                    <HomeIcon size={13} />Homepage<ExternalLink size={11} />
                  </a>
                )}
                {hasPdf && (
                  <button onClick={() => setTab('pdf')}
                    className={`flex items-center gap-1.5 px-3.5 py-2 text-[13px] font-medium rounded-lg border transition-colors ${
                      b.homepage
                        ? isDark ? 'border-gray-700 text-gray-300 hover:border-gray-600 hover:bg-gray-800' : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                        : 'text-white'
                    }`}
                    style={!b.homepage ? { backgroundColor: '#10A37F' } : {}}>
                    <FileText size={13} />Read Full Paper<ChevronRightIcon size={13} />
                  </button>
                )}
                {b.paper_url && b.paper_url !== 'nan' && b.paper_url !== 'None' && (
                  <a href={b.paper_url} target="_blank" rel="noopener noreferrer"
                    className={`flex items-center gap-1.5 px-3.5 py-2 text-[13px] font-medium rounded-lg border transition-colors ${
                      isDark ? 'border-gray-700 text-gray-300 hover:border-gray-600 hover:bg-gray-800' : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                    }`}>
                    <Globe size={13} />Paper Page
                  </a>
                )}
                {rawPdfUrl && (
                  <a href={rawPdfUrl} target="_blank" rel="noopener noreferrer"
                    className={`flex items-center gap-1.5 px-3.5 py-2 text-[13px] font-medium rounded-lg border transition-colors ${
                      isDark ? 'border-gray-700 text-gray-300 hover:border-gray-600 hover:bg-gray-800' : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                    }`}>
                    <Download size={13} />Download PDF
                  </a>
                )}
              </div>

              {/* Basic Info */}
              <div className={`rounded-xl border overflow-hidden transition-colors ${isDark ? 'border-gray-800' : 'border-gray-100'}`}>
                <div className={`px-4 py-2.5 border-b transition-colors ${isDark ? 'bg-gray-800/50 border-gray-800' : 'bg-gray-50/80 border-gray-100'}`}>
                  <span className={`text-[11px] font-semibold uppercase tracking-wider transition-colors ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Basic Info</span>
                </div>
                <div className="px-4">
                  <InfoRow label="Published"   value={b.published}   isDark={isDark} />
                  <InfoRow label="Institution" value={b.org}         isDark={isDark} />
                  <InfoRow label="Modality"    value={b.modality}    isDark={isDark} />
                  <InfoRow label="Language"    value={b.language}    isDark={isDark} />
                  <InfoRow label="Task Type"   value={b.task_type}   isDark={isDark} />
                  <InfoRow label="Scale"       value={b.scale}       isDark={isDark} />
                </div>
              </div>

              {/* Evaluation Info */}
              <div className={`rounded-xl border overflow-hidden transition-colors ${isDark ? 'border-gray-800' : 'border-gray-100'}`}>
                <div className={`px-4 py-2.5 border-b transition-colors ${isDark ? 'bg-gray-800/50 border-gray-800' : 'bg-gray-50/80 border-gray-100'}`}>
                  <span className={`text-[11px] font-semibold uppercase tracking-wider transition-colors ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Evaluation</span>
                </div>
                <div className="px-4">
                  <InfoRow label="Build Method" value={b.build_method}  isDark={isDark} />
                  <InfoRow label="Metric"        value={b.metric}        isDark={isDark} />
                  <InfoRow label="Eval Feature"  value={b.eval_feature}  isDark={isDark} />
                  <InfoRow label="Data Access"   value={opennessInfo?.label || b.openness} isDark={isDark} />
                  <div className={`flex gap-3 py-2.5 transition-colors`}>
                    <span className={`text-[12px] w-24 shrink-0 pt-0.5 transition-colors ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Leaderboard</span>
                    <span className={`text-[13px] font-medium flex items-center gap-1 ${b.has_leaderboard ? 'text-[#10A37F]' : isDark ? 'text-gray-600' : 'text-gray-400'}`}>
                      {b.has_leaderboard ? (<><BarChart3 size={13} /> Public Leaderboard</>) : 'None'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Family members */}
              {familyMembers.length > 0 && (
                <div className={`rounded-xl border overflow-hidden transition-colors ${isDark ? 'border-gray-800' : 'border-gray-100'}`}>
                  <div className={`px-4 py-2.5 border-b transition-colors ${isDark ? 'bg-gray-800/50 border-gray-800' : 'bg-gray-50/80 border-gray-100'}`}>
                    <span className={`text-[11px] font-semibold uppercase tracking-wider transition-colors ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                      <Users size={11} className="inline mr-1" />
                      {b.family} Family
                    </span>
                  </div>
                  <div className="px-4 py-3 space-y-1.5">
                    {familyMembers.map(member => (
                      <button
                        key={member.id}
                        onClick={() => onSelectBenchmark(member)}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-left transition-all group/member ${
                          isDark ? 'hover:bg-gray-800' : 'hover:bg-gray-50'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: member.l1_color }} />
                          <span className={`text-[13px] font-medium truncate group-hover/member:text-[#10A37F] transition-colors ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                            {member.name}
                          </span>
                          {member.widely_tested && <Award size={12} className="text-amber-500 shrink-0" />}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={`text-[11px] ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>{member.published}</span>
                          <ChevronRight size={12} className={isDark ? 'text-gray-600' : 'text-gray-400'} />
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Related benchmarks */}
              {relatedBenchmarks.length > 0 && (
                <div className={`rounded-xl border overflow-hidden transition-colors ${isDark ? 'border-gray-800' : 'border-gray-100'}`}>
                  <div className={`px-4 py-2.5 border-b transition-colors ${isDark ? 'bg-gray-800/50 border-gray-800' : 'bg-gray-50/80 border-gray-100'}`}>
                    <span className={`text-[11px] font-semibold uppercase tracking-wider transition-colors ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                      <Link2 size={11} className="inline mr-1" />
                      Related Benchmarks
                    </span>
                  </div>
                  <div className="px-4 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      {relatedBenchmarks.map(rel => (
                        <button
                          key={rel.id}
                          onClick={() => onSelectBenchmark(rel)}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] font-medium border transition-all ${
                            isDark
                              ? 'border-gray-700 text-gray-400 hover:border-[#10A37F] hover:text-[#10A37F] hover:bg-[#10A37F]/10'
                              : 'border-gray-200 text-gray-600 hover:border-[#10A37F] hover:text-[#10A37F] hover:bg-[#10A37F]/5'
                          }`}
                        >
                          <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: rel.l1_color }} />
                          {rel.name}
                          {rel.widely_tested && <Award size={10} className="text-amber-500" />}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* PDF Reader */
            <div className={`flex-1 flex flex-col transition-colors ${isDark ? 'bg-[#0A0A0A]' : 'bg-gray-50'}`} style={{ minHeight: 0 }}>
              {/* PDF toolbar */}
              <div className={`flex items-center justify-between px-4 py-2 border-b shrink-0 transition-colors ${isDark ? 'bg-[#111111] border-gray-800' : 'bg-white border-gray-100'}`}>
                <div className="flex items-center gap-2 min-w-0">
                  <FileText size={13} className="text-[#10A37F] shrink-0" />
                  <span className={`text-[12px] truncate max-w-[300px] font-medium transition-colors ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                    {b.name}
                  </span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {strategies.length > 1 && (
                    <div className={`flex items-center gap-1 mr-2 px-2 py-1 rounded-lg text-[11px] transition-colors ${isDark ? 'bg-gray-800 text-gray-400' : 'bg-gray-100 text-gray-500'}`}>
                      <span>via {currentStrategy?.label}</span>
                      {strategyIndex < strategies.length - 1 && (
                        <button onClick={() => { setStrategyIndex(prev => prev + 1); setPdfLoaded(false); setPdfError(false); }}
                          className={`ml-1 transition-colors ${isDark ? 'hover:text-gray-200' : 'hover:text-gray-700'}`} title="Switch loader">
                          <RefreshCw size={10} />
                        </button>
                      )}
                    </div>
                  )}
                  <button onClick={() => { setPdfLoaded(false); setPdfError(false); setStrategyIndex(0); }} title="Reload"
                    className={`p-1.5 rounded-lg transition-colors ${isDark ? 'text-gray-500 hover:text-gray-300 hover:bg-gray-800' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`}>
                    <RefreshCw size={13} />
                  </button>
                  <a href={rawPdfUrl} target="_blank" rel="noopener noreferrer" title="Open in new tab"
                    className={`p-1.5 rounded-lg transition-colors ${isDark ? 'text-gray-500 hover:text-gray-300 hover:bg-gray-800' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`}>
                    <Maximize2 size={13} />
                  </a>
                  <a href={rawPdfUrl} download title="Download PDF"
                    className={`p-1.5 rounded-lg transition-colors ${isDark ? 'text-gray-500 hover:text-gray-300 hover:bg-gray-800' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`}>
                    <Download size={13} />
                  </a>
                </div>
              </div>

              {/* PDF iframe */}
              <div className="flex-1 relative overflow-hidden">
                {!pdfLoaded && !pdfError && (
                  <div className={`absolute inset-0 flex flex-col items-center justify-center gap-3 z-10 transition-colors ${isDark ? 'bg-[#0A0A0A]' : 'bg-gray-50'}`}>
                    <div className="w-8 h-8 border-2 border-gray-700 border-t-[#10A37F] rounded-full animate-spin" />
                    <span className={`text-[13px] transition-colors ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                      Loading paper{strategies.length > 1 && <span className="ml-1 text-[11px] opacity-60">({currentStrategy?.label})</span>}…
                    </span>
                  </div>
                )}
                {pdfError && (
                  <div className={`absolute inset-0 flex flex-col items-center justify-center gap-4 z-10 px-8 transition-colors ${isDark ? 'bg-[#0A0A0A]' : 'bg-gray-50'}`}>
                    <AlertTriangle size={32} className="text-amber-500" />
                    <div className="text-center">
                      <p className={`text-[14px] font-medium mb-1 transition-colors ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>Failed to load PDF</p>
                      <p className={`text-[12px] mb-4 transition-colors ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>All loaders failed. Try opening directly.</p>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => { setStrategyIndex(0); setPdfLoaded(false); setPdfError(false); }}
                        className={`flex items-center gap-1.5 px-3 py-1.5 text-[12px] rounded-lg border transition-colors ${
                          isDark ? 'border-gray-700 text-gray-400 hover:border-gray-600 hover:bg-gray-800' : 'border-gray-200 text-gray-600 hover:bg-gray-100'
                        }`}>
                        <RefreshCw size={12} />Retry
                      </button>
                      <a href={rawPdfUrl} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] rounded-lg text-white transition-colors"
                        style={{ backgroundColor: '#10A37F' }}>
                        <ExternalLink size={12} />Open Directly
                      </a>
                    </div>
                  </div>
                )}
                {!pdfError && (
                  <iframe key={`${b.id}-${strategyIndex}`} src={embedUrl} className="w-full h-full border-0"
                    title={`${b.name} PDF`} onLoad={() => setPdfLoaded(true)} onError={handlePdfError}
                    style={{ display: pdfError ? 'none' : 'block' }} />
                )}
              </div>

              {pdfLoaded && !pdfError && (
                <div className={`flex items-center justify-between px-4 py-1.5 border-t shrink-0 transition-colors ${isDark ? 'bg-[#111111] border-gray-800' : 'bg-white border-gray-100'}`}>
                  <span className={`text-[11px] transition-colors ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>
                    {currentStrategy?.label} · If display is broken, open in a new tab.
                  </span>
                  <a href={rawPdfUrl} target="_blank" rel="noopener noreferrer"
                    className="text-[11px] text-[#10A37F] hover:underline flex items-center gap-1">
                    <ExternalLink size={10} />Original link
                  </a>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </>
  );
}
