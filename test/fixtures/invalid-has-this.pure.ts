type User = {
  name: string
}

function greet() {
  return this.name
}

const alice: User = { name: "Alice" }
