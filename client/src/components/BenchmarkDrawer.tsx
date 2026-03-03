// OpenAI 风格右侧抽屉 - 展示 Benchmark 详情 + PDF 阅读器增强版
// 设计：深色模式适配，PDF 多策略加载，工具栏增强
import React, { useState, useEffect, useCallback } from 'react';
import type { Benchmark } from '@/types/benchmark';
import {
  X, ExternalLink, FileText, Calendar, Building2,
  BarChart3, Globe, Layers, ChevronRight, BookOpen,
  Maximize2, Download, RefreshCw, ZoomIn, ZoomOut,
  AlertTriangle, ChevronLeft, ChevronRight as ChevronRightIcon
} from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';

interface Props {
  benchmark: Benchmark | null;
  onClose: () => void;
}

function InfoRow({ label, value, isDark }: { label: string; value: string; isDark: boolean }) {
  if (!value || value === 'nan' || value === 'None' || value === 'NaN') return null;
  return (
    <div className={`flex gap-3 py-2.5 border-b last:border-0 transition-colors ${isDark ? 'border-gray-800' : 'border-gray-100'}`}>
      <span className={`text-[12px] w-20 shrink-0 pt-0.5 transition-colors ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{label}</span>
      <span className={`text-[13px] leading-relaxed transition-colors ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>{value}</span>
    </div>
  );
}

// PDF 加载策略
type PdfStrategy = 'direct' | 'google' | 'pdfjs';

function getPdfStrategies(pdfUrl: string): { strategy: PdfStrategy; url: string; label: string }[] {
  const strategies: { strategy: PdfStrategy; url: string; label: string }[] = [];

  if (pdfUrl) {
    // 策略1：PDF.js 官方 viewer（最佳体验）
    strategies.push({
      strategy: 'pdfjs',
      url: `https://mozilla.github.io/pdf.js/web/viewer.html?file=${encodeURIComponent(pdfUrl)}`,
      label: 'PDF.js Viewer',
    });

    // 策略2：Google Docs Viewer（备用）
    strategies.push({
      strategy: 'google',
      url: `https://docs.google.com/viewer?url=${encodeURIComponent(pdfUrl)}&embedded=true`,
      label: 'Google Docs',
    });

    // 策略3：直接嵌入（仅对非 arXiv 有效）
    if (!pdfUrl.includes('arxiv.org')) {
      strategies.push({
        strategy: 'direct',
        url: pdfUrl,
        label: '直接嵌入',
      });
    }
  }

  return strategies;
}

export default function BenchmarkDrawer({ benchmark: b, onClose }: Props) {
  const [tab, setTab] = useState<'info' | 'pdf'>('info');
  const [pdfLoaded, setPdfLoaded] = useState(false);
  const [pdfError, setPdfError] = useState(false);
  const [strategyIndex, setStrategyIndex] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  useEffect(() => {
    if (b) {
      setTab('info');
      setPdfLoaded(false);
      setPdfError(false);
      setStrategyIndex(0);
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
      // 自动切换到下一个策略
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

  const drawerBg = isDark ? 'bg-[#111111]' : 'bg-white';
  const borderColor = isDark ? 'border-gray-800' : 'border-gray-100';
  const headerBg = isDark ? 'bg-[#111111]' : 'bg-white';

  return (
    <>
      {/* 遮罩 */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-40"
        onClick={onClose}
      />

      {/* 抽屉主体 */}
      <div
        className={`fixed right-0 top-0 bottom-0 w-full max-w-[680px] shadow-2xl z-50 flex flex-col transition-colors duration-200 ${drawerBg}`}
        style={{ animation: 'slideInRight 0.25s ease-out' }}
      >
        {/* 头部 */}
        <div className={`flex items-start gap-3 px-6 py-5 border-b shrink-0 transition-colors ${borderColor} ${headerBg}`}>
          <div
            className="w-1 h-12 rounded-full shrink-0 mt-0.5"
            style={{ backgroundColor: b.l1_color }}
          />
          <div className="flex-1 min-w-0">
            <h2 className={`text-[17px] font-semibold leading-snug mb-1.5 transition-colors ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
              {b.name}
            </h2>
            <div className="flex flex-wrap items-center gap-1.5">
              <span
                className="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-0.5 rounded-full"
                style={{ backgroundColor: b.l1_color + '22', color: b.l1_color, fontFamily: 'var(--font-mono)' }}
              >
                <Layers size={9} />
                {b.l1}
              </span>
              {b.l2 && b.l2 !== b.l1 && b.l2 !== 'nan' && (
                <span className={`inline-flex items-center text-[11px] font-medium px-2.5 py-0.5 rounded-full transition-colors ${isDark ? 'bg-gray-800 text-gray-400' : 'bg-gray-100 text-gray-500'}`}
                  style={{ fontFamily: 'var(--font-mono)' }}>
                  {b.l2}
                </span>
              )}
              {b.difficulty && b.difficulty !== 'nan' && (
                <span className={`inline-flex items-center text-[11px] font-medium px-2.5 py-0.5 rounded-full border transition-colors ${isDark ? 'bg-orange-950/40 text-orange-400 border-orange-900/50' : 'bg-orange-50 text-orange-600 border-orange-100'}`}
                  style={{ fontFamily: 'var(--font-mono)' }}>
                  {b.difficulty}
                </span>
              )}
              {b.year && (
                <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 transition-colors ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                  <Calendar size={10} />
                  {b.published || b.year}
                </span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className={`p-1.5 rounded-lg transition-colors shrink-0 ${isDark ? 'text-gray-500 hover:text-gray-300 hover:bg-gray-800' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`}
          >
            <X size={18} />
          </button>
        </div>

        {/* Tab 切换 */}
        <div className={`flex border-b px-6 shrink-0 transition-colors ${borderColor} ${isDark ? 'bg-[#111111]' : 'bg-white'}`}>
          {[
            { key: 'info', icon: BookOpen, label: '详细信息' },
            { key: 'pdf', icon: FileText, label: '完整论文', disabled: !hasPdf },
          ].map(({ key, icon: Icon, label, disabled }) => (
            <button
              key={key}
              className={`flex items-center gap-1.5 px-1 py-3 text-[13px] font-medium border-b-2 mr-6 transition-colors ${
                tab === key
                  ? 'border-[#10A37F] text-[#10A37F]'
                  : isDark
                    ? 'border-transparent text-gray-500 hover:text-gray-300'
                    : 'border-transparent text-gray-400 hover:text-gray-600'
              } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
              onClick={() => !disabled && setTab(key as 'info' | 'pdf')}
              disabled={disabled}
            >
              <Icon size={13} />
              {label}
              {key === 'pdf' && !hasPdf && <span className="text-[10px] ml-1">(暂无)</span>}
            </button>
          ))}
        </div>

        {/* 内容区 */}
        <div className="flex-1 overflow-hidden">
          {tab === 'info' ? (
            <div className="h-full overflow-y-auto px-6 py-5 space-y-5">
              {/* 简介 */}
              <p className={`text-[14px] leading-relaxed transition-colors ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>{b.intro}</p>

              {/* 操作按钮 */}
              <div className="flex flex-wrap gap-2">
                {hasPdf && (
                  <button
                    onClick={() => setTab('pdf')}
                    className="flex items-center gap-1.5 px-3.5 py-2 text-[13px] font-medium rounded-lg text-white transition-colors"
                    style={{ backgroundColor: '#10A37F' }}
                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#0D8F6F')}
                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#10A37F')}
                  >
                    <FileText size={13} />
                    阅读完整论文
                    <ChevronRightIcon size={13} />
                  </button>
                )}
                {rawPdfUrl && (
                  <a
                    href={rawPdfUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`flex items-center gap-1.5 px-3.5 py-2 text-[13px] font-medium rounded-lg border transition-colors ${
                      isDark
                        ? 'border-gray-700 text-gray-300 hover:border-gray-600 hover:bg-gray-800'
                        : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <Download size={13} />
                    下载 PDF
                  </a>
                )}
                {b.paper_url && b.paper_url !== 'nan' && b.paper_url !== 'None' && (
                  <a
                    href={b.paper_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`flex items-center gap-1.5 px-3.5 py-2 text-[13px] font-medium rounded-lg border transition-colors ${
                      isDark
                        ? 'border-gray-700 text-gray-300 hover:border-gray-600 hover:bg-gray-800'
                        : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <Globe size={13} />
                    项目主页
                  </a>
                )}
              </div>

              {/* 基本信息 */}
              <div className={`rounded-xl border overflow-hidden transition-colors ${isDark ? 'border-gray-800' : 'border-gray-100'}`}>
                <div className={`px-4 py-2.5 border-b transition-colors ${isDark ? 'bg-gray-800/50 border-gray-800' : 'bg-gray-50/80 border-gray-100'}`}>
                  <span className={`text-[11px] font-semibold uppercase tracking-wider transition-colors ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>基本信息</span>
                </div>
                <div className="px-4">
                  <InfoRow label="发布时间" value={b.published} isDark={isDark} />
                  <InfoRow label="发布机构" value={b.org} isDark={isDark} />
                  <InfoRow label="模态" value={b.modality} isDark={isDark} />
                  <InfoRow label="语言" value={b.language} isDark={isDark} />
                  <InfoRow label="任务类型" value={b.task_type} isDark={isDark} />
                  <InfoRow label="数据规模" value={b.scale} isDark={isDark} />
                </div>
              </div>

              {/* 评测信息 */}
              <div className={`rounded-xl border overflow-hidden transition-colors ${isDark ? 'border-gray-800' : 'border-gray-100'}`}>
                <div className={`px-4 py-2.5 border-b transition-colors ${isDark ? 'bg-gray-800/50 border-gray-800' : 'bg-gray-50/80 border-gray-100'}`}>
                  <span className={`text-[11px] font-semibold uppercase tracking-wider transition-colors ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>评测信息</span>
                </div>
                <div className="px-4">
                  <InfoRow label="构建方法" value={b.build_method} isDark={isDark} />
                  <InfoRow label="评估指标" value={b.metric} isDark={isDark} />
                  <InfoRow label="评测特性" value={b.eval_feature} isDark={isDark} />
                  <InfoRow label="数据公开" value={b.openness} isDark={isDark} />
                  <div className={`flex gap-3 py-2.5 transition-colors`}>
                    <span className={`text-[12px] w-20 shrink-0 pt-0.5 transition-colors ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>排行榜</span>
                    <span className={`text-[13px] font-medium flex items-center gap-1 ${b.has_leaderboard ? 'text-[#10A37F]' : isDark ? 'text-gray-600' : 'text-gray-400'}`}>
                      {b.has_leaderboard ? (
                        <><BarChart3 size={13} /> 有公开排行榜</>
                      ) : '暂无'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* PDF 阅读器增强版 */
            <div className={`h-full flex flex-col transition-colors ${isDark ? 'bg-[#0A0A0A]' : 'bg-gray-50'}`}>
              {/* PDF 工具栏 */}
              <div className={`flex items-center justify-between px-4 py-2 border-b shrink-0 transition-colors ${isDark ? 'bg-[#111111] border-gray-800' : 'bg-white border-gray-100'}`}>
                <div className="flex items-center gap-2 min-w-0">
                  <FileText size={13} className="text-[#10A37F] shrink-0" />
                  <span className={`text-[12px] truncate max-w-[300px] font-medium transition-colors ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                    {b.name}
                  </span>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {/* 策略切换 */}
                  {strategies.length > 1 && (
                    <div className={`flex items-center gap-1 mr-2 px-2 py-1 rounded-lg text-[11px] transition-colors ${isDark ? 'bg-gray-800 text-gray-400' : 'bg-gray-100 text-gray-500'}`}>
                      <span>via {currentStrategy?.label}</span>
                      {strategyIndex < strategies.length - 1 && (
                        <button
                          onClick={() => {
                            setStrategyIndex(prev => prev + 1);
                            setPdfLoaded(false);
                            setPdfError(false);
                          }}
                          className={`ml-1 transition-colors ${isDark ? 'hover:text-gray-200' : 'hover:text-gray-700'}`}
                          title="切换加载方式"
                        >
                          <RefreshCw size={10} />
                        </button>
                      )}
                    </div>
                  )}

                  {/* 刷新 */}
                  <button
                    onClick={() => {
                      setPdfLoaded(false);
                      setPdfError(false);
                      setStrategyIndex(0);
                    }}
                    title="重新加载"
                    className={`p-1.5 rounded-lg transition-colors ${isDark ? 'text-gray-500 hover:text-gray-300 hover:bg-gray-800' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`}
                  >
                    <RefreshCw size={13} />
                  </button>

                  {/* 在新标签页打开 */}
                  <a
                    href={rawPdfUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="在新标签页打开"
                    className={`p-1.5 rounded-lg transition-colors ${isDark ? 'text-gray-500 hover:text-gray-300 hover:bg-gray-800' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`}
                  >
                    <Maximize2 size={13} />
                  </a>

                  {/* 下载 */}
                  <a
                    href={rawPdfUrl}
                    download
                    title="下载 PDF"
                    className={`p-1.5 rounded-lg transition-colors ${isDark ? 'text-gray-500 hover:text-gray-300 hover:bg-gray-800' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`}
                  >
                    <Download size={13} />
                  </a>
                </div>
              </div>

              {/* PDF 内容区 */}
              <div className="flex-1 relative overflow-hidden">
                {/* 加载中 */}
                {!pdfLoaded && !pdfError && (
                  <div className={`absolute inset-0 flex flex-col items-center justify-center gap-3 z-10 transition-colors ${isDark ? 'bg-[#0A0A0A]' : 'bg-gray-50'}`}>
                    <div className="w-8 h-8 border-2 border-gray-700 border-t-[#10A37F] rounded-full animate-spin" />
                    <span className={`text-[13px] transition-colors ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                      加载论文中
                      {strategies.length > 1 && <span className="ml-1 text-[11px] opacity-60">({currentStrategy?.label})</span>}
                      ...
                    </span>
                  </div>
                )}

                {/* 加载失败 */}
                {pdfError && (
                  <div className={`absolute inset-0 flex flex-col items-center justify-center gap-4 z-10 px-8 transition-colors ${isDark ? 'bg-[#0A0A0A]' : 'bg-gray-50'}`}>
                    <AlertTriangle size={32} className="text-amber-500" />
                    <div className="text-center">
                      <p className={`text-[14px] font-medium mb-1 transition-colors ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                        PDF 加载失败
                      </p>
                      <p className={`text-[12px] mb-4 transition-colors ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                        所有加载方式均失败，请尝试直接下载
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setStrategyIndex(0);
                          setPdfLoaded(false);
                          setPdfError(false);
                        }}
                        className={`flex items-center gap-1.5 px-3 py-1.5 text-[12px] rounded-lg border transition-colors ${
                          isDark
                            ? 'border-gray-700 text-gray-400 hover:border-gray-600 hover:bg-gray-800'
                            : 'border-gray-200 text-gray-600 hover:bg-gray-100'
                        }`}
                      >
                        <RefreshCw size={12} />
                        重试
                      </button>
                      <a
                        href={rawPdfUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] rounded-lg text-white transition-colors"
                        style={{ backgroundColor: '#10A37F' }}
                      >
                        <ExternalLink size={12} />
                        直接打开
                      </a>
                    </div>
                  </div>
                )}

                {/* iframe */}
                {!pdfError && (
                  <iframe
                    key={`${b.id}-${strategyIndex}`}
                    src={embedUrl}
                    className="w-full h-full border-0"
                    title={`${b.name} PDF`}
                    onLoad={() => setPdfLoaded(true)}
                    onError={handlePdfError}
                    style={{ display: pdfError ? 'none' : 'block' }}
                  />
                )}
              </div>

              {/* PDF 底部信息栏 */}
              {pdfLoaded && !pdfError && (
                <div className={`flex items-center justify-between px-4 py-1.5 border-t shrink-0 transition-colors ${isDark ? 'bg-[#111111] border-gray-800' : 'bg-white border-gray-100'}`}>
                  <span className={`text-[11px] transition-colors ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>
                    {currentStrategy?.label} · 如显示异常，请点击右上角"在新标签页打开"
                  </span>
                  <a
                    href={rawPdfUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] text-[#10A37F] hover:underline flex items-center gap-1"
                  >
                    <ExternalLink size={10} />
                    原始链接
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
