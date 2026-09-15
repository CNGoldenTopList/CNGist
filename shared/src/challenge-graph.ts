import type { Challenge } from "./types";

export type ChallengeRelation = { from: number; to: number };

const conditionPatterns = [
  /no\s+dts/i,
  /no\s+major\s+skips?/i,
  /no\s+bmit\s+skips?/i,
];

function variant(name: string) {
  const normalized = name.toUpperCase();
  if (/C\s*\/\s*FC/.test(normalized)) return "C/FC";
  if (/(?:^|[^A-Z])FC(?:[^A-Z]|$)/.test(normalized)) return "FC";
  if (/(?:^|[^A-Z])C(?:[^A-Z]|$)/.test(normalized)) return "C";
  return "OTHER";
}

function qualifierKey(name: string) {
  return name
    .replace(/C\s*\/\s*FC/gi, "")
    .replace(/(?:^|[^A-Za-z])FC(?:[^A-Za-z]|$)/gi, " ")
    .replace(/(?:^|[^A-Za-z])C(?:[^A-Za-z]|$)/gi, " ")
    .replace(/[\[\]()（）]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function hasRestriction(name: string) {
  return conditionPatterns.some((pattern) => pattern.test(name));
}

function isSegment(name: string) {
  return /(?:^|\s|\[)(?:golden|silver|berry)\s*\d+\b/i.test(name);
}

function relationKey(edge: ChallengeRelation) {
  return `${edge.from}>${edge.to}`;
}

export function buildDefaultChallengeRelations(items: Challenge[]): ChallengeRelation[] {
  const edges: ChallengeRelation[] = [];
  const add = (from: Challenge, to: Challenge) => {
    if (from.id !== to.id) edges.push({ from: from.id, to: to.id });
  };

  for (const from of items) {
    for (const to of items) {
      if (from.id === to.id) continue;
      const fromVariant = variant(from.name);
      const toVariant = variant(to.name);
      const sameQualifier = qualifierKey(from.name) === qualifierKey(to.name);

      // C -> FC under the same rule set. A C/FC challenge is already a merged node.
      if (sameQualifier && fromVariant === "C" && toVariant === "FC") add(from, to);

      // Normal C/FC -> the corresponding No DTS / No Major Skips form.
      if (!hasRestriction(from.name) && hasRestriction(to.name) && fromVariant === toVariant && fromVariant !== "OTHER") add(from, to);

      // A numbered segment is a prerequisite of a whole-map clear/full-clear.
      if (isSegment(from.name) && !isSegment(to.name) && ["C", "FC", "C/FC"].includes(toVariant)) add(from, to);
    }
  }

  return ensureDag(items.map((item) => item.id), Array.from(new Map(edges.map((edge) => [relationKey(edge), edge])).values()));
}

export function ensureDag(nodeIds: number[], edges: ChallengeRelation[]) {
  const allowed = new Set(nodeIds);
  const output: ChallengeRelation[] = [];
  for (const edge of edges) {
    if (!allowed.has(edge.from) || !allowed.has(edge.to) || edge.from === edge.to) continue;
    const candidate = [...output, edge];
    if (isDag(nodeIds, candidate)) output.push(edge);
  }
  return output;
}

export function isDag(nodeIds: number[], edges: ChallengeRelation[]) {
  const indegree = new Map(nodeIds.map((id) => [id, 0]));
  const next = new Map<number, number[]>();
  for (const edge of edges) {
    if (!indegree.has(edge.from) || !indegree.has(edge.to)) continue;
    indegree.set(edge.to, (indegree.get(edge.to) || 0) + 1);
    next.set(edge.from, [...(next.get(edge.from) || []), edge.to]);
  }
  const queue = [...indegree].filter(([, degree]) => degree === 0).map(([id]) => id);
  let visited = 0;
  while (queue.length) {
    const id = queue.shift()!;
    visited += 1;
    for (const target of next.get(id) || []) {
      const degree = (indegree.get(target) || 0) - 1;
      indegree.set(target, degree);
      if (degree === 0) queue.push(target);
    }
  }
  return visited === nodeIds.length;
}

function reachable(start: number, edges: ChallengeRelation[], direction: "forward" | "backward") {
  const result = new Set<number>();
  const queue = [start];
  while (queue.length) {
    const current = queue.shift()!;
    for (const edge of edges) {
      const next = direction === "forward"
        ? edge.from === current ? edge.to : undefined
        : edge.to === current ? edge.from : undefined;
      if (next && !result.has(next)) {
        result.add(next);
        queue.push(next);
      }
    }
  }
  return result;
}

export const descendantsOf = (challengeId: number, edges: ChallengeRelation[]) => reachable(challengeId, edges, "forward");
export const ancestorsOf = (challengeId: number, edges: ChallengeRelation[]) => reachable(challengeId, edges, "backward");
export const relationExists = (from: number, to: number, edges: ChallengeRelation[]) => descendantsOf(from, edges).has(to);


/** 不同 Tier 的同限定 C / FC 是分别展示的成绩，仍保留 DAG 继承。 */
export function preservesClearRecord(from: { name: string; tier?: string | null }, to: { name: string; tier?: string | null }) {
  return variant(from.name) === "C" && variant(to.name) === "FC"
    && qualifierKey(from.name) === qualifierKey(to.name) && from.tier !== to.tier;
}
