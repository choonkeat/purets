type Box = { n: number }

export function bump(b: Box): number {
  b.n = b.n + 1
  return b.n
}
