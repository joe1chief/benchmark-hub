export interface StageModule {
  id: string;
  nodes?: string[];
  nodeIds?: string[];
}

interface StageNode {
  id: string;
  module?: string;
}

type Stage = 'construction' | 'evaluation' | 'unassigned';

// Exact module IDs are structural identifiers; never infer from translated text.
function moduleStage(id: string): Stage {
  if (['construction_track', 'construction', 'build'].includes(id)) return 'construction';
  if (['evaluation_track', 'evaluation', 'evaluate'].includes(id)) return 'evaluation';
  return 'unassigned';
}

export function partitionBuildProcess<N extends StageNode, E>(arch: {
  nodes: N[];
  edges?: E[];
  modules?: StageModule[];
} | null) {
  const allNodes = arch?.nodes ?? [];
  const modules = arch?.modules ?? [];
  const membership = new Map<string, Set<Stage>>();
  for (const module of modules) {
    for (const id of [...(module.nodes ?? []), ...(module.nodeIds ?? [])]) {
      const stages = membership.get(id) ?? new Set<Stage>();
      stages.add(moduleStage(module.id));
      membership.set(id, stages);
    }
  }
  const constructionNodes: N[] = [];
  const evaluationNodes: N[] = [];
  const unassignedNodes: N[] = [];
  for (const node of allNodes) {
    // Explicit member lists take precedence over legacy node.module references.
    const stages = membership.get(node.id);
    const stage = stages
      ? (stages.size === 1 ? Array.from(stages)[0] : 'unassigned')
      : (modules.some(module => module.id === node.module)
        ? moduleStage(node.module!) : 'unassigned');
    if (stage === 'construction') constructionNodes.push(node);
    else if (stage === 'evaluation') evaluationNodes.push(node);
    else unassignedNodes.push(node);
  }
  return {
    constructionNodes, evaluationNodes, unassignedNodes, allNodes,
    nodeMap: new Map(allNodes.map(node => [node.id, node])),
    edges: arch?.edges ?? [],
  };
}
