export function positive(n: number): number {
  if (n < 0) {
    throw "negative"
  }
  return n
}
