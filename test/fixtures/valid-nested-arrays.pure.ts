type Coordinate = [number, number]

type Polygon = {
  name: string
  points: Coordinate[]
}

type Drawing = {
  title: string
  layers: Polygon[][]
  tags: string[][]
}

const triangle: Polygon = { name: "triangle", points: [[0, 0], [1, 0], [0, 1]] }

const art: Drawing = { title: "My Art", layers: [[{ name: "bg", points: [[0, 0], [10, 10]] }]], tags: [["art", "geo"], ["draft"]] }
