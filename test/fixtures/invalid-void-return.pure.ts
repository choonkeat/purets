type User = {
  name: string
}

const bad = (u: User): void => { u.name }

const alice: User = { name: "Alice" }
