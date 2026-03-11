import { useState, useEffect, useCallback, useRef } from 'react';
import type { Benchmark } from '@/types/benchmark';
import {
  X, ExternalLink, FileText, Calendar, Building2,
  BarChart3, Globe, Layers, ChevronRight, BookOpen,
  Maximize2, Download, RefreshCw, AlertTriangle,
  Award, Lock, Unlock, ShieldAlert, Link2, Users,
  Home as HomeIcon, ChevronRight as ChevronRightIcon,
  GitBranch, ZoomIn, ZoomOut, RotateCcw
} from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import { useLang } from '@/contexts/LangContext';

interface Props {
  benchmark: Benchmark | null;
  allBenchmarks: Benchmark[];
  onClose: () => void;
  onSelectBenchmark: (b: Benchmark) => void;
}

function InfoRow({ label, value, isDark }: { label: string; value: string | undefined | null; isDark: boolean }) {
  if (!value || value === 'nan' || value === 'None' || value === 'NaN' || value === 'N/A' || value === 'Not mentioned') return null;
  return (
    <div className={`flex gap-3 py-2.5 border-b last:border-0 transition-colors ${isDark ? 'border-gray-800' : 'border-gray-100'}`}>
      <span className={`text-[12px] w-24 shrink-0 pt-0.5 transition-colors ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{label}</span>
      <span className={`text-[13px] leading-relaxed transition-colors ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>{value}</span>
    </div>
  );
}

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
      strategies.push({ strategy: 'direct', url: pdfUrl, label: 'Direct' });
    }
  }
  return strategies;
}

// Load mermaid from CDN (bypasses Vite bundle issues)
function loadMermaidFromCDN(): Promise<any> {
  return new Promise((resolve, reject) => {
    if ((window as any).mermaid && (window as any).mermaid.render) {
      resolve((window as any).mermaid);
      return;
    }
    const existing = document.getElementById('mermaid-cdn');
    if (existing) {
      const check = setInterval(() => {
        if ((window as any).mermaid && (window as any).mermaid.render) {
          clearInterval(check);
          resolve((window as any).mermaid);
        }
      }, 100);
      setTimeout(() => { clearInterval(check); reject(new Error('Mermaid CDN timeout')); }, 15000);
      return;
    }
    const script = document.createElement('script');
    script.id = 'mermaid-cdn';
    script.src = 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js';
    script.onload = () => {
      if ((window as any).mermaid) resolve((window as any).mermaid);
      else reject(new Error('Mermaid not found after CDN load'));
    };
    script.onerror = () => reject(new Error('Failed to load Mermaid CDN'));
    document.head.appendChild(script);
  });
}

// Mermaid flowchart renderer component
function MermaidChart({ code, isDark }: { code: string; isDark: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [scale, setScale] = useState(0.85);
  const [svgContent, setSvgContent] = useState<string>('');

  useEffect(() => {
    if (!code) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    setSvgContent('');

    const renderChart = async () => {
      try {
        const mermaid = await loadMermaidFromCDN();
        mermaid.initialize({
          startOnLoad: false,
          theme: isDark ? 'dark' : 'default',
          themeVariables: isDark ? {
            primaryColor: '#1a2a1a',
            primaryTextColor: '#d1fae5',
            primaryBorderColor: '#10A37F',
            lineColor: '#10A37F',
            secondaryColor: '#0f1f0f',
            tertiaryColor: '#0a1a0a',
            background: '#111111',
            mainBkg: '#1a2a1a',
            nodeBorder: '#10A37F',
            clusterBkg: '#0f1f0f',
            titleColor: '#d1fae5',
            edgeLabelBackground: '#1a2a1a',
            fontFamily: 'Inter, sans-serif',
            fontSize: '13px',
          } : {
            primaryColor: '#f0fdf4',
            primaryTextColor: '#065f46',
            primaryBorderColor: '#10A37F',
            lineColor: '#10A37F',
            secondaryColor: '#ecfdf5',
            tertiaryColor: '#f0fdf4',
            background: '#ffffff',
            mainBkg: '#f0fdf4',
            nodeBorder: '#10A37F',
            clusterBkg: '#ecfdf5',
            titleColor: '#065f46',
            edgeLabelBackground: '#f0fdf4',
            fontFamily: 'Inter, sans-serif',
            fontSize: '13px',
          },
          flowchart: {
            htmlLabels: true,
            curve: 'basis',
            padding: 20,
          },
          securityLevel: 'loose',
        });

        const id = `mermaid-${Date.now()}`;
        const { svg } = await mermaid.render(id, code);
        setSvgContent(svg);
        setLoading(false);
      } catch (err) {
        console.error('Mermaid render error:', err);
        setError(String(err));
        setLoading(false);
      }
    };

    renderChart();
  }, [code, isDark]);

  if (loading) {
    return (
      <div className={`flex flex-col items-center justify-center h-48 gap-3 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
        <div className="w-7 h-7 border-2 border-gray-600 border-t-[#10A37F] rounded-full animate-spin" />
        <span className="text-[12px]">Rendering flowchart...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`flex flex-col items-center justify-center h-32 gap-2 px-4 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
        <AlertTriangle size={20} className="text-amber-500" />
        <span className="text-[12px] text-center">Failed to render flowchart</span>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Zoom controls */}
      <div className={`absolute top-2 right-2 z-10 flex items-center gap-1 rounded-lg border px-1.5 py-1 ${
        isDark ? 'bg-gray-900/90 border-gray-700' : 'bg-white/90 border-gray-200'
      } backdrop-blur-sm`}>
        <button
          onClick={() => setScale(s => Math.min(s + 0.15, 2.5))}
          className={`p-1 rounded transition-colors ${isDark ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700'}`}
          title="Zoom in"
        >
          <ZoomIn size={12} />
        </button>
        <span className={`text-[10px] w-8 text-center ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
          {Math.round(scale * 100)}%
        </span>
        <button
          onClick={() => setScale(s => Math.max(s - 0.15, 0.3))}
          className={`p-1 rounded transition-colors ${isDark ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700'}`}
          title="Zoom out"
        >
          <ZoomOut size={12} />
        </button>
        <button
          onClick={() => setScale(0.85)}
          className={`p-1 rounded transition-colors ${isDark ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700'}`}
          title="Reset zoom"
        >
          <RotateCcw size={12} />
        </button>
      </div>

      {/* SVG container */}
      <div
        ref={containerRef}
        className="overflow-auto"
        style={{ maxHeight: '600px' }}
      >
        <div
          style={{ transform: `scale(${scale})`, transformOrigin: 'top left', transition: 'transform 0.2s ease' }}
          dangerouslySetInnerHTML={{ __html: svgContent }}
        />
      </div>
    </div>
  );
}

export default function BenchmarkDrawer({ benchmark: b, allBenchmarks, onClose, onSelectBenchmark }: Props) {
  const [tab, setTab] = useState<'info' | 'flowchart' | 'pdf'>('info');
  const [pdfFullscreen, setPdfFullscreen] = useState(false);
  const [flowchartFullscreen, setFlowchartFullscreen] = useState(false);
  const [pdfLoaded, setPdfLoaded] = useState(false);
  const [pdfError, setPdfError] = useState(false);
  const [strategyIndex, setStrategyIndex] = useState(0);
  const { theme } = useTheme();
  const { t, lang } = useLang();
  const isDark = theme === 'dark';
  const isEn = lang === 'en';

  useEffect(() => {
    if (b) {
      setTab('info');
      setPdfLoaded(false);
      setPdfError(false);
      setStrategyIndex(0);
      setPdfFullscreen(false);
      setFlowchartFullscreen(false);
    }
  }, [b?.id]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (flowchartFullscreen) { setFlowchartFullscreen(false); return; }
        if (pdfFullscreen) { setPdfFullscreen(false); return; }
        onClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, flowchartFullscreen, pdfFullscreen]);

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

  // Flowchart data — safely handle null/undefined mermaid_flowchart
  const flowchartCode = isEn
    ? (b.flowchart_en || b.mermaid_flowchart || '')
    : (b.flowchart_zh || b.flowchart_en || b.mermaid_flowchart || '');
  const hasFlowchart = !!flowchartCode;

  const opennessConfig: Record<string, { icon: typeof Unlock; color: string; label: string; bg: string; bgDark: string }> = {
    'public':        { icon: Unlock,      color: '#10A37F', label: t.publicLabel,  bg: 'bg-emerald-50 border-emerald-200', bgDark: 'bg-emerald-950/30 border-emerald-900/50' },
    'partly public': { icon: ShieldAlert, color: '#F59E0B', label: t.partlyLabel,  bg: 'bg-amber-50 border-amber-200',    bgDark: 'bg-amber-950/30 border-amber-900/50' },
    'in-house':      { icon: Lock,        color: '#EF4444', label: t.privateLabel, bg: 'bg-red-50 border-red-200',        bgDark: 'bg-red-950/30 border-red-900/50' },
  };
  const opennessInfo = b.openness ? opennessConfig[b.openness] : undefined;

  const familyMembers = b.family
    ? allBenchmarks.filter(x => x.family === b.family && x.id !== b.id)
    : [];

  // Enhanced related benchmarks with similarity scoring
  const relatedBenchmarks = (() => {
    const directRelated = (b.related_benchmarks || [])
      .map(name => allBenchmarks.find(x => x.name === name))
      .filter((x): x is Benchmark => !!x);

    // Also find similar benchmarks by l1 category and task type
    const sameCategory = allBenchmarks
      .filter(x => x.id !== b.id && x.l1 === b.l1 && !directRelated.find(r => r.id === x.id))
      .sort((a, b_) => {
        // Prioritize same l2, same difficulty, same modality
        let score = 0;
        if (a.l2 === b.l2) score += 3;
        if (a.difficulty === b.difficulty) score += 2;
        if (a.modality === b.modality) score += 2;
        if (a.widely_tested) score += 1;
        let scoreB = 0;
        if (b_.l2 === b.l2) scoreB += 3;
        if (b_.difficulty === b.difficulty) scoreB += 2;
        if (b_.modality === b.modality) scoreB += 2;
        if (b_.widely_tested) scoreB += 1;
        return scoreB - score;
      })
      .slice(0, 4);

    return [...directRelated, ...sameCategory].slice(0, 8);
  })();

  const drawerBg = isDark ? 'bg-[#111111]' : 'bg-white';
  const borderColor = isDark ? 'border-gray-800' : 'border-gray-100';

  // Tab definitions
  const tabs = [
    { key: 'info', icon: BookOpen, label: t.detailsTab, disabled: false },
    { key: 'flowchart', icon: GitBranch, label: isEn ? 'Build Process' : '构建流程', disabled: !hasFlowchart },
    { key: 'pdf', icon: FileText, label: t.paperTab, disabled: !hasPdf && !b.paper_url },
  ];

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
          <div className="w-1 h-12 rounded-full shrink-0 mt-0.5" style={{ backgroundColor: b.l1_color || '#999' }} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <h2 className={`text-[17px] font-semibold leading-snug transition-colors ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                {b.name}
              </h2>
              {b.widely_tested && (
                <span title={t.widelyNotice} className="shrink-0">
                  <Award size={16} className="text-amber-500" />
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1.5">
              {/* Category tags group */}
              {b.l1 && (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-[3px] rounded-full"
                  style={{ backgroundColor: (b.l1_color || '#999') + '18', color: b.l1_color || '#999' }}>
                  <Layers size={9} />{t.l1[b.l1] || b.l1}
                </span>
              )}
              {b.l2 && b.l2 !== b.l1 && b.l2 !== 'nan' && (
                <span className={`inline-flex items-center text-[11px] font-medium px-2.5 py-[3px] rounded-full transition-colors ${isDark ? 'bg-gray-800 text-gray-400' : 'bg-gray-100 text-gray-500'}`}>
                  {isEn ? (b.l2_en || b.l2) : b.l2}
                </span>
              )}
              {b.difficulty && b.difficulty !== 'nan' && (
                <span className={`inline-flex items-center text-[11px] font-medium px-2.5 py-[3px] rounded-full border transition-colors ${isDark ? 'bg-orange-950/40 text-orange-400 border-orange-900/50' : 'bg-orange-50 text-orange-600 border-orange-100'}`}>
                  {t.difficulty[b.difficulty] || b.difficulty}
                </span>
              )}
              {/* Separator dot */}
              {(b.l1 || b.l2 || b.difficulty) && (b.published || opennessInfo) && (
                <span className={`text-[8px] mx-0.5 ${isDark ? 'text-gray-700' : 'text-gray-300'}`}>|</span>
              )}
              {/* Meta info group */}
              {b.published && (
                <span className={`inline-flex items-center gap-1 text-[11px] px-1.5 py-[3px] transition-colors ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                  <Calendar size={10} />{b.published}
                </span>
              )}
              {opennessInfo && (
                <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-[3px] rounded-full border ${isDark ? opennessInfo.bgDark : opennessInfo.bg}`}
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
          {tabs.map(({ key, icon: Icon, label, disabled }) => (
            <button key={key}
              className={`flex items-center gap-1.5 px-1 py-3 text-[13px] font-medium border-b-2 mr-6 transition-colors ${
                tab === key ? 'border-[#10A37F] text-[#10A37F]'
                  : isDark ? 'border-transparent text-gray-500 hover:text-gray-300'
                  : 'border-transparent text-gray-400 hover:text-gray-600'
              } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
              onClick={() => !disabled && setTab(key as 'info' | 'flowchart' | 'pdf')}
              disabled={disabled}>
              <Icon size={13} />{label}
              {key === 'pdf' && !hasPdf && !b.paper_url && <span className="text-[10px] ml-1">{t.paperNA}</span>}
              {key === 'flowchart' && !hasFlowchart && <span className="text-[10px] ml-1">N/A</span>}
            </button>
          ))}
          {tab === 'flowchart' && hasFlowchart && (
            <button
              onClick={() => setFlowchartFullscreen(v => !v)}
              title={flowchartFullscreen ? t.collapse : t.fullscreen}
              className={`ml-auto flex items-center gap-1 px-2 py-1 my-auto rounded-lg text-[11px] transition-colors ${
                isDark ? 'text-gray-500 hover:text-gray-300 hover:bg-gray-800' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
              }`}>
              <Maximize2 size={12} />
              {flowchartFullscreen ? t.collapse : t.fullscreen}
            </button>
          )}
          {tab === 'pdf' && hasPdf && (
            <button
              onClick={() => setPdfFullscreen(v => !v)}
              title={pdfFullscreen ? t.collapse : t.fullscreen}
              className={`ml-auto flex items-center gap-1 px-2 py-1 my-auto rounded-lg text-[11px] transition-colors ${
                isDark ? 'text-gray-500 hover:text-gray-300 hover:bg-gray-800' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
              }`}>
              <Maximize2 size={12} />
              {pdfFullscreen ? t.collapse : t.fullscreen}
            </button>
          )}
        </div>

        {/* Content */}
        <div className={`flex-1 overflow-hidden ${tab === 'pdf' ? 'flex flex-col' : ''}`}>
          {tab === 'info' && (
            <div className="h-full overflow-y-auto px-6 py-5 space-y-5">
              {/* Widely adopted notice */}
              {b.widely_tested && (
                <div className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border transition-colors ${
                  isDark ? 'bg-amber-950/20 border-amber-900/30' : 'bg-amber-50 border-amber-100'
                }`}>
                  <Award size={16} className="text-amber-500 shrink-0" />
                  <span className={`text-[13px] ${isDark ? 'text-amber-300/80' : 'text-amber-700'}`}>
                    {t.widelyNotice}
                  </span>
                </div>
              )}

              {/* Intro */}
              <p className={`text-[14px] leading-relaxed transition-colors ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                {isEn ? (b.intro_en || b.intro) : b.intro}
              </p>

              {/* Action buttons */}
              <div className="flex flex-wrap gap-2">
                {b.homepage && (
                  <a href={b.homepage} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3.5 py-2 text-[13px] font-medium rounded-lg text-white transition-colors"
                    style={{ backgroundColor: '#10A37F' }}
                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#0D8F6F')}
                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#10A37F')}>
                    <HomeIcon size={13} />{t.actionHomepage}<ExternalLink size={11} />
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
                    <FileText size={13} />{t.actionReadPaper}<ChevronRightIcon size={13} />
                  </button>
                )}
                {hasFlowchart && (
                  <button onClick={() => setTab('flowchart')}
                    className={`flex items-center gap-1.5 px-3.5 py-2 text-[13px] font-medium rounded-lg border transition-colors ${
                      isDark ? 'border-gray-700 text-gray-300 hover:border-gray-600 hover:bg-gray-800' : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                    }`}>
                    <GitBranch size={13} />{isEn ? 'View Build Process' : '查看构建流程'}<ChevronRightIcon size={13} />
                  </button>
                )}
                {b.paper_url && b.paper_url !== 'nan' && b.paper_url !== 'None' && (
                  <a href={b.paper_url} target="_blank" rel="noopener noreferrer"
                    className={`flex items-center gap-1.5 px-3.5 py-2 text-[13px] font-medium rounded-lg border transition-colors ${
                      isDark ? 'border-gray-700 text-gray-300 hover:border-gray-600 hover:bg-gray-800' : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                    }`}>
                    <Globe size={13} />{t.actionPaperPage}
                  </a>
                )}
                {rawPdfUrl && (
                  <a href={rawPdfUrl} target="_blank" rel="noopener noreferrer"
                    className={`flex items-center gap-1.5 px-3.5 py-2 text-[13px] font-medium rounded-lg border transition-colors ${
                      isDark ? 'border-gray-700 text-gray-300 hover:border-gray-600 hover:bg-gray-800' : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                    }`}>
                    <Download size={13} />{t.actionDownload}
                  </a>
                )}
              </div>

              {/* Basic info */}
              <div className={`rounded-xl border overflow-hidden transition-colors ${isDark ? 'border-gray-800' : 'border-gray-100'}`}>
                <div className={`px-4 py-2.5 border-b transition-colors ${isDark ? 'bg-gray-800/50 border-gray-800' : 'bg-gray-50/80 border-gray-100'}`}>
                  <span className={`text-[11px] font-semibold uppercase tracking-wider transition-colors ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{t.sectionBasic}</span>
                </div>
                <div className="px-4">
                  <InfoRow label={t.fieldPublished} value={b.published} isDark={isDark} />
                  <InfoRow label={t.fieldOrg}       value={b.org}       isDark={isDark} />
                  <InfoRow label={t.fieldModality}  value={isEn ? (b.modality_en || b.modality) : b.modality}  isDark={isDark} />
                  <InfoRow label={t.fieldLanguage}  value={isEn ? (b.language_en || b.language) : b.language}  isDark={isDark} />
                  <InfoRow label={t.fieldTaskType}  value={isEn ? (b.task_type_en || b.task_type) : b.task_type} isDark={isDark} />
                  <InfoRow label={t.fieldScale}     value={isEn ? (b.scale_en || b.scale) : b.scale}     isDark={isDark} />
                </div>
              </div>

              {/* Eval info */}
              <div className={`rounded-xl border overflow-hidden transition-colors ${isDark ? 'border-gray-800' : 'border-gray-100'}`}>
                <div className={`px-4 py-2.5 border-b transition-colors ${isDark ? 'bg-gray-800/50 border-gray-800' : 'bg-gray-50/80 border-gray-100'}`}>
                  <span className={`text-[11px] font-semibold uppercase tracking-wider transition-colors ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{t.sectionEval}</span>
                </div>
                <div className="px-4">
                  <InfoRow label={t.fieldBuildMethod}  value={isEn ? (b.build_method_en || b.build_method) : b.build_method} isDark={isDark} />
                  <InfoRow label={t.fieldMetric}       value={isEn ? (b.metric_en || b.metric) : b.metric}       isDark={isDark} />
                  <InfoRow label={t.fieldEvalFeature}  value={isEn ? (b.eval_feature_en || b.eval_feature) : b.eval_feature} isDark={isDark} />
                  <InfoRow label={t.fieldDataAccess}   value={opennessInfo?.label || b.openness} isDark={isDark} />
                  <div className="flex gap-3 py-2.5">
                    <span className={`text-[12px] w-24 shrink-0 pt-0.5 transition-colors ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{t.fieldLeaderboard}</span>
                    <span className={`text-[13px] font-medium flex items-center gap-1 ${b.has_leaderboard ? 'text-[#10A37F]' : isDark ? 'text-gray-600' : 'text-gray-400'}`}>
                      {b.has_leaderboard ? (<><BarChart3 size={13} /> {t.hasLeaderboard}</>) : t.noLeaderboard}
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
                      {b.family} {t.sectionFamily}
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
                          <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: member.l1_color || '#999' }} />
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

              {/* Related benchmarks — enhanced */}
              {relatedBenchmarks.length > 0 && (
                <div className={`rounded-xl border overflow-hidden transition-colors ${isDark ? 'border-gray-800' : 'border-gray-100'}`}>
                  <div className={`px-4 py-2.5 border-b transition-colors ${isDark ? 'bg-gray-800/50 border-gray-800' : 'bg-gray-50/80 border-gray-100'}`}>
                    <span className={`text-[11px] font-semibold uppercase tracking-wider transition-colors ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                      <Link2 size={11} className="inline mr-1" />
                      {t.sectionRelated}
                    </span>
                  </div>
                  <div className="px-4 py-3 space-y-1.5">
                    {relatedBenchmarks.map(rel => {
                      // Compute shared traits
                      const traits: string[] = [];
                      if (rel.l1 === b.l1) traits.push(isEn ? (t.l1[rel.l1] || rel.l1) : (t.l1[rel.l1] || rel.l1));
                      if (rel.l2 && rel.l2 === b.l2 && rel.l2 !== rel.l1) traits.push(isEn ? (rel.l2_en || rel.l2) : rel.l2);
                      if (rel.modality && rel.modality === b.modality) traits.push(isEn ? (rel.modality_en || rel.modality) : rel.modality);
                      if (rel.difficulty && rel.difficulty === b.difficulty) traits.push(t.difficulty[rel.difficulty] || rel.difficulty);

                      return (
                        <button
                          key={rel.id}
                          onClick={() => onSelectBenchmark(rel)}
                          className={`w-full flex items-start justify-between px-3 py-2.5 rounded-lg text-left transition-all group/rel ${
                            isDark ? 'hover:bg-gray-800/80' : 'hover:bg-gray-50'
                          }`}
                        >
                          <div className="flex items-start gap-2.5 min-w-0 flex-1">
                            <div className="w-1.5 h-1.5 rounded-full shrink-0 mt-1.5" style={{ backgroundColor: rel.l1_color || '#999' }} />
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className={`text-[13px] font-medium group-hover/rel:text-[#10A37F] transition-colors ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                                  {rel.name}
                                </span>
                                {rel.widely_tested && <Award size={11} className="text-amber-500 shrink-0" />}
                              </div>
                              {traits.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {traits.slice(0, 3).map((trait, i) => (
                                    <span key={i} className={`text-[10px] px-1.5 py-0.5 rounded-md ${
                                      isDark ? 'bg-gray-800 text-gray-500' : 'bg-gray-100 text-gray-400'
                                    }`}>{trait}</span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0 ml-2">
                            <span className={`text-[11px] ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>{rel.published}</span>
                            <ChevronRight size={12} className={`transition-colors ${isDark ? 'text-gray-700 group-hover/rel:text-gray-400' : 'text-gray-300 group-hover/rel:text-gray-500'}`} />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === 'flowchart' && (
            <div className={`overflow-y-auto transition-all duration-300 ease-in-out ${
              flowchartFullscreen
                ? 'fixed inset-0 z-[9999] px-8 py-6'
                : 'h-full px-6 py-5'
            } ${flowchartFullscreen ? (isDark ? 'bg-[#0A0A0A]' : 'bg-white') : ''}`}>
              {/* Fullscreen close bar */}
              {flowchartFullscreen && (
                <div className={`flex items-center justify-between mb-4 pb-3 border-b ${isDark ? 'border-gray-800' : 'border-gray-200'}`}>
                  <div className="flex items-center gap-3">
                    <GitBranch size={16} className="text-[#10A37F]" />
                    <span className={`text-[15px] font-semibold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                      {b.name} — {isEn ? 'Build Flowchart' : '构建流程图'}
                    </span>
                    <span className={`text-[11px] px-2 py-1 rounded-lg ${isDark ? 'bg-gray-800 text-gray-500' : 'bg-gray-100 text-gray-400'}`}>
                      {isEn ? lang === 'en' ? 'English' : 'Chinese' : lang === 'zh' ? '中文' : '英文'}
                    </span>
                  </div>
                  <button
                    onClick={() => setFlowchartFullscreen(false)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors ${
                      isDark ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-800 border border-gray-700' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100 border border-gray-200'
                    }`}>
                    <X size={14} />
                    {isEn ? 'Exit Fullscreen' : '退出全屏'}
                    <span className={`text-[10px] ml-1 px-1.5 py-0.5 rounded ${isDark ? 'bg-gray-800 text-gray-600' : 'bg-gray-200 text-gray-400'}`}>Esc</span>
                  </button>
                </div>
              )}

              {/* Header (non-fullscreen) */}
              {!flowchartFullscreen && (
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className={`text-[15px] font-semibold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                      {isEn ? 'Construction Process' : '构建流程图'}
                    </h3>
                    <p className={`text-[12px] mt-0.5 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                      {isEn ? 'How this benchmark was built, step by step' : '该基准的详细构建步骤'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[11px] px-2 py-1 rounded-lg ${isDark ? 'bg-gray-800 text-gray-500' : 'bg-gray-100 text-gray-400'}`}>
                      {isEn ? lang === 'en' ? 'English' : 'Chinese' : lang === 'zh' ? '中文' : '英文'}
                    </span>
                  </div>
                </div>
              )}

              {/* Mermaid chart */}
              <div className={`rounded-xl border overflow-hidden transition-colors ${isDark ? 'border-gray-800' : 'border-gray-100'}`}>
                <div className={`px-4 py-2 border-b flex items-center gap-2 transition-colors ${isDark ? 'bg-gray-800/50 border-gray-800' : 'bg-gray-50/80 border-gray-100'}`}>
                  <GitBranch size={12} className="text-[#10A37F]" />
                  <span className={`text-[11px] font-semibold uppercase tracking-wider transition-colors ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                    {b.name} — {isEn ? 'Build Flowchart' : '构建流程图'}
                  </span>
                </div>
                <div className={`p-4 transition-colors ${isDark ? 'bg-[#0d0d0d]' : 'bg-white'}`}>
                  <MermaidChart code={flowchartCode} isDark={isDark} />
                </div>
              </div>

              {/* Raw code toggle */}
              <details className="mt-4">
                <summary className={`cursor-pointer text-[12px] select-none transition-colors ${isDark ? 'text-gray-600 hover:text-gray-400' : 'text-gray-400 hover:text-gray-600'}`}>
                  {isEn ? 'View raw Mermaid code' : '查看原始 Mermaid 代码'}
                </summary>
                <pre className={`mt-2 p-3 rounded-lg text-[11px] overflow-auto max-h-60 leading-relaxed transition-colors ${isDark ? 'bg-gray-900 text-gray-400' : 'bg-gray-50 text-gray-600'}`}>
                  {flowchartCode}
                </pre>
              </details>
            </div>
          )}

          {tab === 'pdf' && !hasPdf && (
            /* No inline PDF — show fallback with external links */
            <div className={`flex-1 flex flex-col items-center justify-center gap-4 px-8 transition-colors ${isDark ? 'bg-[#0A0A0A]' : 'bg-gray-50'}`} style={{ minHeight: 0 }}>
              <FileText size={40} className={`${isDark ? 'text-gray-600' : 'text-gray-300'}`} />
              <div className="text-center">
                <p className={`text-[14px] font-medium mb-1 transition-colors ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>{t.noPdfInline}</p>
                <p className={`text-[12px] mb-4 transition-colors ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                  {b.paper_url ? t.noPdfButHasPaper : t.noPdfNoPaper}
                </p>
              </div>
              <div className="flex gap-3">
                {b.paper_url && (
                  <a href={b.paper_url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-4 py-2 text-[13px] rounded-lg text-white transition-colors"
                    style={{ backgroundColor: '#10A37F' }}>
                    <ExternalLink size={13} />{t.viewOnPublisher}
                  </a>
                )}
                {b.homepage && (
                  <a href={b.homepage} target="_blank" rel="noopener noreferrer"
                    className={`flex items-center gap-1.5 px-4 py-2 text-[13px] rounded-lg border transition-colors ${
                      isDark ? 'border-gray-700 text-gray-400 hover:border-gray-600 hover:bg-gray-800' : 'border-gray-200 text-gray-600 hover:bg-gray-100'
                    }`}>
                    <ExternalLink size={13} />{t.visitHomepage}
                  </a>
                )}
              </div>
            </div>
          )}

          {tab === 'pdf' && hasPdf && (
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
                      <span>{t.viaLabel} {currentStrategy?.label}</span>
                      {strategyIndex < strategies.length - 1 && (
                        <button onClick={() => { setStrategyIndex(prev => prev + 1); setPdfLoaded(false); setPdfError(false); }}
                          className={`ml-1 transition-colors ${isDark ? 'hover:text-gray-200' : 'hover:text-gray-700'}`} title={t.switchLoader}>
                          <RefreshCw size={10} />
                        </button>
                      )}
                    </div>
                  )}
                  <button onClick={() => { setPdfLoaded(false); setPdfError(false); setStrategyIndex(0); }}
                    className={`p-1.5 rounded-lg transition-colors ${isDark ? 'text-gray-500 hover:text-gray-300 hover:bg-gray-800' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`}>
                    <RefreshCw size={13} />
                  </button>
                  <a href={rawPdfUrl} target="_blank" rel="noopener noreferrer" title={t.openNewTab}
                    className={`p-1.5 rounded-lg transition-colors ${isDark ? 'text-gray-500 hover:text-gray-300 hover:bg-gray-800' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`}>
                    <Maximize2 size={13} />
                  </a>
                  <a href={rawPdfUrl} download title={t.downloadPdf}
                    className={`p-1.5 rounded-lg transition-colors ${isDark ? 'text-gray-500 hover:text-gray-300 hover:bg-gray-800' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`}>
                    <Download size={13} />
                  </a>
                </div>
              </div>

              {/* PDF content */}
              <div className="flex-1 relative overflow-hidden">
                {!pdfLoaded && !pdfError && (
                  <div className={`absolute inset-0 flex flex-col items-center justify-center gap-3 z-10 transition-colors ${isDark ? 'bg-[#0A0A0A]' : 'bg-gray-50'}`}>
                    <div className="w-8 h-8 border-2 border-gray-700 border-t-[#10A37F] rounded-full animate-spin" />
                    <span className={`text-[13px] transition-colors ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                      {t.pdfLoading}{strategies.length > 1 && <span className="ml-1 text-[11px] opacity-60">({currentStrategy?.label})</span>}...
                    </span>
                  </div>
                )}
                {pdfError && (
                  <div className={`absolute inset-0 flex flex-col items-center justify-center gap-4 z-10 px-8 transition-colors ${isDark ? 'bg-[#0A0A0A]' : 'bg-gray-50'}`}>
                    <AlertTriangle size={32} className="text-amber-500" />
                    <div className="text-center">
                      <p className={`text-[14px] font-medium mb-1 transition-colors ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>{t.pdfError}</p>
                      <p className={`text-[12px] mb-4 transition-colors ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{t.pdfErrorDesc}</p>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => { setStrategyIndex(0); setPdfLoaded(false); setPdfError(false); }}
                        className={`flex items-center gap-1.5 px-3 py-1.5 text-[12px] rounded-lg border transition-colors ${
                          isDark ? 'border-gray-700 text-gray-400 hover:border-gray-600 hover:bg-gray-800' : 'border-gray-200 text-gray-600 hover:bg-gray-100'
                        }`}>
                        <RefreshCw size={12} />{t.retry}
                      </button>
                      <a href={rawPdfUrl} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] rounded-lg text-white transition-colors"
                        style={{ backgroundColor: '#10A37F' }}>
                        <ExternalLink size={12} />{t.openDirectly}
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
                    {currentStrategy?.label} · {t.pdfFooterHint}
                  </span>
                  <a href={rawPdfUrl} target="_blank" rel="noopener noreferrer"
                    className="text-[11px] text-[#10A37F] hover:underline flex items-center gap-1">
                    <ExternalLink size={10} />{t.originalLink}
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
