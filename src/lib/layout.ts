export function checkLines(completed: boolean[][]) {
  const n = 4;

  // verifica linhas horizontais
  const rows = Array.from({ length: n }, (_, r) =>
    completed[r].every(Boolean)
  );

  // verifica colunas
  const cols = Array.from({ length: n }, (_, c) =>
    completed.map(r => r[c]).every(Boolean)
  );

  // verifica diagonais
  const d1 = Array.from({ length: n }, (_, i) => completed[i][i]).every(Boolean);
  const d2 = Array.from({ length: n }, (_, i) => completed[i][n - 1 - i]).every(Boolean);

  const hasLine = [...rows, ...cols, d1, d2].some(Boolean);
  const hasBingo = completed.flat().every(Boolean);

  return { hasLine, hasBingo };
}
