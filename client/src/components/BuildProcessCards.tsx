import React from 'react';
import { Database, Cpu, GitBranch, ShieldCheck, Users, FileText } from 'lucide-react';
import { partitionBuildProcess, type StageModule } from '@/lib/buildProcessStages';

export interface ProcessNode { id: string; label: string; type: string; module?: string }
export interface ProcessEdge { from: string; to: string; label?: string; type?: string }
export interface ProcessGraph { nodes: ProcessNode[]; edges: ProcessEdge[]; modules?: StageModule[] }

export function processNodeTitle(node: ProcessNode | undefined, isEn: boolean) {
  return node?.label.split('\n').find(line => line.trim())?.trim() || (isEn ? 'Unnamed step' : '未命名步骤');
}

export function ProcessTransitions({ nodeId, edges, nodeMap, isEn, onSelect }: {
  nodeId: string; edges: ProcessEdge[]; nodeMap: Map<string, ProcessNode>; isEn: boolean;
  onSelect?: (id: string) => void;
}) {
  return <ul className="space-y-2 text-xs">
    {edges.filter(edge => edge.from === nodeId).map((edge, index) => (
      <li key={index} className="flex items-start gap-2 break-words">
        <svg width="28" height="14" viewBox="0 0 28 14" aria-hidden="true"
          className="shrink-0 mt-0.5 text-cyan-500" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M1 7H25" strokeDasharray={edge.type === 'primary' ? undefined : '3 3'} />
          <path d="m21 3 4 4-4 4" />
        </svg>
        <div>
          {edge.label && <span className="font-semibold mr-2">{edge.label}</span>}
          <button type="button" className="text-cyan-600 dark:text-cyan-300 underline decoration-dotted text-left"
            onClick={() => onSelect?.(edge.to)}>
            {processNodeTitle(nodeMap.get(edge.to), isEn)}
          </button>
        </div>
      </li>
    ))}
  </ul>;
}

// Shape & Theme configurations for HTML+CSS flowchart nodes
export const SHAPE_CONFIG: Record<string, {
  nameEn: string;
  nameZh: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  borderClass: string;
  bgClass: string;
  accentColor: string;
  shapeStyle: string;
}> = {
  database: {
    nameEn: 'DATA SOURCE / REPO',
    nameZh: '数据源 / 语料库',
    icon: Database,
    borderClass: 'border-cyan-500/50 hover:border-cyan-400',
    bgClass: 'bg-cyan-500/[0.07] hover:bg-cyan-500/[0.12]',
    accentColor: '#06B6D4',
    shapeStyle: 'rounded-xl border-t-4 border-t-cyan-400',
  },
  document: {
    nameEn: 'SPEC / CANDIDATE',
    nameZh: '候选集 / 规约文档',
    icon: FileText,
    borderClass: 'border-blue-500/50 hover:border-blue-400',
    bgClass: 'bg-blue-500/[0.07] hover:bg-blue-500/[0.12]',
    accentColor: '#3B82F6',
    shapeStyle: 'rounded-xl',
  },
  process: {
    nameEn: 'PROCESS / EXECUTION',
    nameZh: '处理阶段 / 执行管道',
    icon: Cpu,
    borderClass: 'border-emerald-500/50 hover:border-emerald-400',
    bgClass: 'bg-emerald-500/[0.07] hover:bg-emerald-500/[0.12]',
    accentColor: '#10B981',
    shapeStyle: 'rounded-xl',
  },
  decision: {
    nameEn: 'DECISION / BRANCH',
    nameZh: '分支 / 条件判断',
    icon: GitBranch,
    borderClass: 'border-amber-500/50 hover:border-amber-400',
    bgClass: 'bg-amber-500/[0.07] hover:bg-amber-500/[0.12]',
    accentColor: '#F59E0B',
    shapeStyle: 'rounded-2xl border-l-4 border-l-amber-400',
  },
  user: {
    nameEn: 'HUMAN REVIEW / AUDIT',
    nameZh: '人工复核 / 专家标注',
    icon: Users,
    borderClass: 'border-purple-500/50 hover:border-purple-400',
    bgClass: 'bg-purple-500/[0.07] hover:bg-purple-500/[0.12]',
    accentColor: '#8B5CF6',
    shapeStyle: 'rounded-xl border-t-4 border-t-purple-400',
  },
  terminal: {
    nameEn: 'END / OUTPUT',
    nameZh: '终点 / 产物',
    icon: ShieldCheck,
    borderClass: 'border-pink-500/50 hover:border-pink-400',
    bgClass: 'bg-pink-500/[0.07] hover:bg-pink-500/[0.12]',
    accentColor: '#EC4899',
    shapeStyle: 'rounded-2xl border-r-4 border-r-pink-400',
  },
};

interface CardProps {
  nodes: ProcessNode[]; allNodes: ProcessNode[]; edges: ProcessEdge[];
  isDark: boolean; isEn: boolean; selectedNodeId: string | null; onSelect: (id: string) => void;
}

export function BuildProcessCards({ nodes, allNodes, edges, isDark, isEn, selectedNodeId, onSelect }: CardProps) {
  const nodeMap = new Map(allNodes.map(node => [node.id, node]));
  return <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 items-start">
    {nodes.map(node => {
      const cfg = SHAPE_CONFIG[node.type] || SHAPE_CONFIG.process;
      const Icon = cfg.icon;
      const selected = selectedNodeId === node.id;
      const details = node.label.split('\n').map(line => line.trim()).filter(Boolean).slice(1);
      return <article key={node.id} className={`min-w-0 rounded-xl border p-4 shadow-sm transition-all ${cfg.shapeStyle} ${cfg.borderClass} ${cfg.bgClass} ${selected ? 'ring-2 ring-cyan-400 shadow-lg' : ''} ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
        <button type="button" onClick={() => onSelect(node.id)} aria-pressed={selected} className="w-full text-left">
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold rounded border px-2 py-1 mb-3" style={{ color: cfg.accentColor, borderColor: `${cfg.accentColor}60` }}>
            <Icon size={12} />{isEn ? cfg.nameEn : cfg.nameZh}
          </span>
          <h5 className="font-bold text-sm leading-relaxed break-words">{processNodeTitle(node, isEn)}</h5>
        </button>
        {details.length > 0 && <ul className="list-disc pl-4 mt-3 space-y-2 text-xs leading-relaxed break-words">
          {details.map((detail, index) => <li key={index}>{detail}</li>)}
        </ul>}
        {edges.some(edge => edge.from === node.id) && <div className="mt-4 pt-3 border-t border-slate-500/20">
          <ProcessTransitions nodeId={node.id} edges={edges} nodeMap={nodeMap} isEn={isEn} onSelect={onSelect} />
        </div>}
      </article>;
    })}
  </div>;
}

export function BuildProcessLanes({ arch, ...props }: Omit<CardProps, 'nodes' | 'allNodes' | 'edges'> & { arch: ProcessGraph | null }) {
  const { constructionNodes, evaluationNodes, unassignedNodes, allNodes, edges } = partitionBuildProcess(arch);
  const allNeutral = unassignedNodes.length === allNodes.length;
  const lanes = [
    { title: props.isEn ? 'Dataset Construction Pipeline' : '数据集构建流程', nodes: constructionNodes },
    { title: props.isEn ? 'Evaluation & Scoring Protocol' : '评测与打分流程', nodes: evaluationNodes },
    { title: allNeutral ? (props.isEn ? 'Pipeline' : '流程') : (props.isEn ? 'Other pipeline steps' : '其他流程步骤'), nodes: unassignedNodes },
  ];
  return <div className="space-y-6 pb-10">
    {lanes.filter(lane => lane.nodes.length > 0).map(lane => <section key={lane.title} className={`rounded-xl border p-4 ${props.isDark ? 'bg-slate-950/70 border-slate-700' : 'bg-white/80 border-slate-200'}`}>
      <h4 className="font-bold text-sm mb-4">{lane.title} <span className="text-slate-500">({lane.nodes.length})</span></h4>
      <BuildProcessCards {...props} nodes={lane.nodes} allNodes={allNodes} edges={edges} />
    </section>)}
  </div>;
}
