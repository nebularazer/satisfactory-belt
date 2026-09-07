const TOLERANCE = 1e-8;

export type LinearSystemResult = Readonly<{
  status: "feasible" | "infeasible" | "underdetermined" | "unbounded";
  values: readonly number[];
}>;

export function solveNonNegativeLinearSystem(
  matrix: readonly (readonly number[])[],
  rightHandSide: readonly number[],
  variableCount: number,
): LinearSystemResult {
  const rows = matrix.map((row, index) => [...row, rightHandSide[index] ?? 0]);
  const pivots: number[] = [];
  let pivotRow = 0;

  for (
    let column = 0;
    column < variableCount && pivotRow < rows.length;
    column += 1
  ) {
    let candidate = pivotRow;
    for (let row = pivotRow + 1; row < rows.length; row += 1) {
      if (Math.abs(rows[row]![column]!) > Math.abs(rows[candidate]![column]!)) {
        candidate = row;
      }
    }
    if (Math.abs(rows[candidate]![column]!) <= TOLERANCE) continue;
    [rows[pivotRow], rows[candidate]] = [rows[candidate]!, rows[pivotRow]!];
    const divisor = rows[pivotRow]![column]!;
    for (let entry = column; entry <= variableCount; entry += 1) {
      rows[pivotRow]![entry] = rows[pivotRow]![entry]! / divisor;
    }
    for (let row = 0; row < rows.length; row += 1) {
      if (row === pivotRow) continue;
      const factor = rows[row]![column]!;
      if (Math.abs(factor) <= TOLERANCE) continue;
      for (let entry = column; entry <= variableCount; entry += 1) {
        rows[row]![entry] =
          rows[row]![entry]! - factor * rows[pivotRow]![entry]!;
      }
    }
    pivots[pivotRow] = column;
    pivotRow += 1;
  }

  for (const row of rows) {
    if (
      row
        .slice(0, variableCount)
        .every((value) => Math.abs(value) <= TOLERANCE) &&
      Math.abs(row[variableCount]!) > TOLERANCE
    ) {
      return { status: "infeasible", values: [] };
    }
  }
  const values = Array.from({ length: variableCount }, () => 0);
  for (let row = 0; row < pivots.length; row += 1) {
    values[pivots[row]!] = rows[row]![variableCount]!;
  }
  if (values.some((value) => value < -TOLERANCE || !Number.isFinite(value))) {
    return { status: "infeasible", values: [] };
  }
  if (pivots.length < variableCount) {
    const pivotColumns = new Set(pivots);
    const freeColumns = Array.from(
      { length: variableCount },
      (_, index) => index,
    ).filter((column) => !pivotColumns.has(column));
    const hasNonNegativeNullDirection = freeColumns.some((freeColumn) => {
      const direction = Array.from({ length: variableCount }, () => 0);
      direction[freeColumn] = 1;
      for (let row = 0; row < pivots.length; row += 1) {
        direction[pivots[row]!] = -rows[row]![freeColumn]!;
      }
      return direction.every((value) => value >= -TOLERANCE);
    });
    return {
      status: hasNonNegativeNullDirection ? "unbounded" : "underdetermined",
      values: values.map((value) => Math.max(0, value)),
    };
  }
  return {
    status: "feasible",
    values: values.map((value) => Math.max(0, value)),
  };
}
