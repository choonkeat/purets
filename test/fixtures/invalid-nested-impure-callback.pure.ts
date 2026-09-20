type Box = { n: number }

export function bumpAll(boxes: Box[]): Box[] {
  return boxes.map((b) => {
    b.n = b.n + 1
    return b
  })
}
