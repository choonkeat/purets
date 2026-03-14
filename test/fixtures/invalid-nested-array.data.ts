type Point = {
  x: number
  y: number
}

type Shape = {
  points: Point[]
}

const s: Shape = { points: [{ x: 1, y: 2 }, { x: "three", y: 4 }] }
