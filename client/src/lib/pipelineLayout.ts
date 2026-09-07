interface PipelineNode { id: string }
interface PipelineEdge { from: string; to: string }
interface Coordinates { layer: number; column: number; row: number; x: number; y: number }

/** Rank strongly connected components, then position every original node.
 * Iterative Kosaraju + DAG longest paths: O(nodes + edges), including cycles.
 * Edges are returned unchanged; condensation is only used to compute columns.
 */
export function layoutPipeline<N extends PipelineNode, E extends PipelineEdge>(
  graph: { nodes: readonly N[]; edges: readonly E[] } | null,
) {
  const nodes = graph?.nodes ?? [];
  const edges = graph?.edges ?? [];
  const index = new Map(nodes.map((node, i) => [node.id, i]));
  const forward: number[][] = nodes.map(() => []);
  const reverse: number[][] = nodes.map(() => []);
  for (const edge of edges) {
    const from = index.get(edge.from);
    const to = index.get(edge.to);
    // Canonical models validate endpoints. Keep an unknown edge unchanged if
    // older data reaches the viewer, but do not invent a layout node for it.
    if (from === undefined || to === undefined) continue;
    forward[from].push(to);
    reverse[to].push(from);
  }

  const visited = nodes.map(() => false);
  const finished: number[] = [];
  for (let start = 0; start < nodes.length; start += 1) {
    if (visited[start]) continue;
    visited[start] = true;
    const stack = [{ node: start, next: 0 }];
    while (stack.length) {
      const frame = stack[stack.length - 1];
      if (frame.next < forward[frame.node].length) {
        const next = forward[frame.node][frame.next++];
        if (!visited[next]) {
          visited[next] = true;
          stack.push({ node: next, next: 0 });
        }
      } else {
        finished.push(frame.node);
        stack.pop();
      }
    }
  }

  const component = nodes.map(() => -1);
  let componentCount = 0;
  for (let i = finished.length - 1; i >= 0; i -= 1) {
    const start = finished[i];
    if (component[start] !== -1) continue;
    component[start] = componentCount;
    const stack = [start];
    while (stack.length) {
      const node = stack.pop()!;
      for (const previous of reverse[node]) {
        if (component[previous] === -1) {
          component[previous] = componentCount;
          stack.push(previous);
        }
      }
    }
    componentCount += 1;
  }

  const successors = Array.from({ length: componentCount }, () => new Set<number>());
  const inDegree = Array<number>(componentCount).fill(0);
  forward.forEach((targets, from) => {
    for (const to of targets) {
      const source = component[from];
      const target = component[to];
      if (source !== target && !successors[source].has(target)) {
        successors[source].add(target);
        inDegree[target] += 1;
      }
    }
  });
  const layers = Array<number>(componentCount).fill(0);
  const queue = inDegree.flatMap((degree, id) => degree === 0 ? [id] : []);
  for (let head = 0; head < queue.length; head += 1) {
    const source = queue[head];
    successors[source].forEach(target => {
      layers[target] = Math.max(layers[target], layers[source] + 1);
      inDegree[target] -= 1;
      if (inDegree[target] === 0) queue.push(target);
    });
  }

  // Preserve input order within each column, including members of a cycle.
  const rows = new Map<number, number>();
  let maxLayer = 0;
  let maxRows = 0;
  const laidOutNodes: (N & Coordinates)[] = nodes.map((node, i) => {
    const layer = layers[component[i]];
    const row = rows.get(layer) ?? 0;
    rows.set(layer, row + 1);
    maxLayer = Math.max(maxLayer, layer);
    maxRows = Math.max(maxRows, row + 1);
    return { ...node, layer, column: layer, row, x: layer * 290 + 40, y: row * 160 + 40 };
  });
  return {
    laidOutNodes,
    nodeMap: new Map(laidOutNodes.map(node => [node.id, node])),
    edges,
    maxLayers: graph ? maxLayer + 1 : 0,
    maxRowHeight: graph ? maxRows * 160 + 120 : 0,
  };
}

/** SVG routes use the viewer's existing 240 × 110 card footprint. */
export function pipelineEdgeGeometry(
  from: { id: string; x: number; y: number },
  to: { id: string; x: number; y: number },
) {
  const width = 240;
  const height = 110;
  const y1 = from.y + height / 2;
  const y2 = to.y + height / 2;
  if (from.id === to.id) {
    const x = from.x + width;
    const topPort = from.y + 30;
    const bottomPort = from.y + 80;
    return {
      d: `M ${x} ${bottomPort} C ${x + 40} ${bottomPort}, ${x + 40} ${topPort}, ${x} ${topPort}`,
      labelX: x + 32, labelY: y1 - 8,
    };
  }
  if (from.x === to.x) {
    const down = to.y > from.y;
    const x = from.x + (down ? width : 0);
    const outside = x + (down ? 24 : -24);
    return {
      d: `M ${x} ${y1} C ${outside} ${y1}, ${outside} ${y2}, ${x} ${y2}`,
      labelX: outside, labelY: (y1 + y2) / 2 - 8,
    };
  }
  // Preserve the original ordinary forward-edge curve exactly.
  const x1 = from.x + width;
  const x2 = to.x;
  const dx = Math.max((x2 - x1) * 0.5, 40);
  return {
    d: `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`,
    labelX: (x1 + x2) / 2, labelY: (y1 + y2) / 2 - 8,
  };
}
