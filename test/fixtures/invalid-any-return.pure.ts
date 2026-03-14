type User = {
  name: string
}

const bad = (x: User): any => x

const alice: User = { name: "Alice" }
