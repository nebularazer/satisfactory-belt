/** Longest-path stages of the component graph. Cyclic production recipes share
 * a stage; a recycled byproduct must not push the factory infinitely right. */
export function graphStages(
  ids: readonly string[],
  edges: readonly { from: string; to: string }[],
): Map<string, number> {
  const successors = new Map(
    ids.map((id) => [
      id,
      edges.filter((edge) => edge.from === id).map((edge) => edge.to),
    ]),
  );
  let next = 0;
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const active = new Set<string>();
  const stack: string[] = [];
  const component = new Map<string, number>();
  let count = 0;
  function visit(id: string) {
    index.set(id, next);
    low.set(id, next++);
    active.add(id);
    stack.push(id);
    for (const target of successors.get(id) ?? []) {
      if (!index.has(target)) {
        visit(target);
        low.set(id, Math.min(low.get(id)!, low.get(target)!));
      } else if (active.has(target))
        low.set(id, Math.min(low.get(id)!, index.get(target)!));
    }
    if (low.get(id) !== index.get(id)) return;
    let member: string;
    do {
      member = stack.pop()!;
      active.delete(member);
      component.set(member, count);
    } while (member !== id);
    count++;
  }
  for (const id of ids) if (!index.has(id)) visit(id);
  const stages = new Map<number, number>();
  function stage(id: number): number {
    if (stages.has(id)) return stages.get(id)!;
    const parents = edges
      .filter(
        (edge) =>
          component.get(edge.to) === id && component.get(edge.from) !== id,
      )
      .map((edge) => component.get(edge.from)!);
    const value = Math.max(0, ...parents.map((parent) => stage(parent) + 1));
    stages.set(id, value);
    return value;
  }
  return new Map(ids.map((id) => [id, stage(component.get(id)!)]));
}
