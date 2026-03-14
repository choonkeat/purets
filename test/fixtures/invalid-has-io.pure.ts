type User = {
  name: string
}

const logUser = (u: User) => console.log(u.name)

const alice: User = { name: "Alice" }
