type Box = { n: number }

export function bump(b: Box): Box {
  return Object.assign(b, { n: 2 })
}
