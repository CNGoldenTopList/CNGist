/**
 * 挑战关系图的分层布局。
 *
 * 秩 = 最长前置链长度，秩即行、自上而下。方向不是随便选的：记录沿 DAG 向
 * 上游投影（`submissionsForChallenge` 取的是后代记录），所以「往上传」在画
 * 布上就是字面意义的往上，读图时不需要再换算一次方向。
 *
 * 行内顺序做两轮重心排序减少交叉。位置不入库 —— 边一变就重算，
 * 因此永远不会出现「库里存的坐标和实际关系对不上」的漂移。
 */
import type { ChallengeRelation } from "@shared/challenge-graph";

export const NODE_W = 188;
export const NODE_H = 64;
const COL_GAP = 18;
const ROW_GAP = 78;
const PAD_X = 28;
const PAD_Y = 22;

export type PlacedNode = { id: number; rank: number; x: number; y: number };
export type Point = { x: number; y: number };
export type GraphLayout = {
  place: Map<number, PlacedNode>;
  /** 每条边的出入点，键为 `from>to`。同一节点上的多条边已经沿边缘扇开。 */
  link: Map<string, { from: Point; to: Point }>;
  rows: { rank: number; y: number }[];
  width: number;
  height: number;
};

/** 秩：无前置为 0，否则取所有前置的最大秩加一。边已保证无环。 */
function ranksOf(nodeIds: number[], edges: ChallengeRelation[]) {
  const rank = new Map(nodeIds.map((id) => [id, 0]));
  const indegree = new Map(nodeIds.map((id) => [id, 0]));
  const next = new Map<number, number[]>();
  for (const edge of edges) {
    indegree.set(edge.to, (indegree.get(edge.to) || 0) + 1);
    next.set(edge.from, [...(next.get(edge.from) || []), edge.to]);
  }
  const queue = nodeIds.filter((id) => !indegree.get(id));
  while (queue.length) {
    const id = queue.shift()!;
    for (const target of next.get(id) || []) {
      rank.set(target, Math.max(rank.get(target) || 0, (rank.get(id) || 0) + 1));
      const degree = (indegree.get(target) || 0) - 1;
      indegree.set(target, degree);
      if (degree === 0) queue.push(target);
    }
  }
  return rank;
}

/** 相邻两层之间按邻居平均位置排序；来回各扫一轮，够用且稳定。 */
function orderRows(rows: number[][], edges: ChallengeRelation[]) {
  const sweep = (rowIndex: number, reference: number[], pick: (edge: ChallengeRelation) => [number, number]) => {
    const slot = new Map(reference.map((id, index) => [id, index]));
    const weight = new Map<number, number>();
    for (const edge of edges) {
      const [own, other] = pick(edge);
      if (!slot.has(other)) continue;
      const current = weight.get(own);
      weight.set(own, current === undefined ? slot.get(other)! : (current + slot.get(other)!) / 2);
    }
    rows[rowIndex] = [...rows[rowIndex]].sort((a, b) =>
      (weight.get(a) ?? Number.POSITIVE_INFINITY) - (weight.get(b) ?? Number.POSITIVE_INFINITY));
  };
  for (let index = 1; index < rows.length; index += 1) sweep(index, rows[index - 1], (edge) => [edge.to, edge.from]);
  for (let index = rows.length - 2; index >= 0; index -= 1) sweep(index, rows[index + 1], (edge) => [edge.from, edge.to]);
  return rows;
}

export function layoutChallengeGraph(nodeIds: number[], edges: ChallengeRelation[]): GraphLayout {
  const known = new Set(nodeIds);
  const live = edges.filter((edge) => known.has(edge.from) && known.has(edge.to));
  const rank = ranksOf(nodeIds, live);
  const depth = nodeIds.length ? Math.max(...nodeIds.map((id) => rank.get(id) || 0)) + 1 : 0;
  const rows = orderRows(
    Array.from({ length: depth }, (_, index) => nodeIds.filter((id) => (rank.get(id) || 0) === index)),
    live,
  );

  const widest = rows.reduce((max, row) => Math.max(max, row.length * NODE_W + (row.length - 1) * COL_GAP), 0);
  const place = new Map<number, PlacedNode>();
  rows.forEach((row, index) => {
    const rowWidth = row.length * NODE_W + (row.length - 1) * COL_GAP;
    const left = PAD_X + (widest - rowWidth) / 2;
    const y = PAD_Y + index * (NODE_H + ROW_GAP);
    row.forEach((id, column) => place.set(id, { id, rank: index, x: left + column * (NODE_W + COL_GAP), y }));
  });

  return {
    place,
    link: anchorEdges(place, live),
    rows: rows.map((_, index) => ({ rank: index, y: PAD_Y + index * (NODE_H + ROW_GAP) })),
    width: widest + PAD_X * 2,
    height: depth ? PAD_Y * 2 + depth * NODE_H + (depth - 1) * ROW_GAP : 0,
  };
}

/**
 * 边一律自上而下，接在下沿与上沿。四条入边全部落在顶边中点会叠成一坨，
 * 谁连谁就看不出来了，所以按对端的横向位置沿边缘排开。
 */
const EDGE_INSET = 26;
function spread(count: number, index: number, left: number) {
  return left + EDGE_INSET + ((NODE_W - EDGE_INSET * 2) * (index + 1)) / (count + 1);
}

function anchorEdges(place: Map<number, PlacedNode>, edges: ChallengeRelation[]) {
  const out = new Map<number, number[]>();
  const into = new Map<number, number[]>();
  const centre = (id: number) => (place.get(id)?.x ?? 0) + NODE_W / 2;
  for (const edge of edges) {
    out.set(edge.from, [...(out.get(edge.from) || []), edge.to]);
    into.set(edge.to, [...(into.get(edge.to) || []), edge.from]);
  }
  for (const list of out.values()) list.sort((a, b) => centre(a) - centre(b));
  for (const list of into.values()) list.sort((a, b) => centre(a) - centre(b));

  const link = new Map<string, { from: Point; to: Point }>();
  for (const edge of edges) {
    const from = place.get(edge.from)!;
    const to = place.get(edge.to)!;
    const exits = out.get(edge.from)!;
    const entries = into.get(edge.to)!;
    link.set(`${edge.from}>${edge.to}`, {
      from: { x: spread(exits.length, exits.indexOf(edge.to), from.x), y: from.y + NODE_H },
      to: { x: spread(entries.length, entries.indexOf(edge.from), to.x), y: to.y },
    });
  }
  return link;
}

export const nodeExit = (node: PlacedNode) => ({ x: node.x + NODE_W / 2, y: node.y + NODE_H });

export function curveBetween(from: { x: number; y: number }, to: { x: number; y: number }) {
  const reach = Math.max(26, (to.y - from.y) * 0.42);
  return `M ${from.x} ${from.y} C ${from.x} ${from.y + reach}, ${to.x} ${to.y - reach}, ${to.x} ${to.y}`;
}
