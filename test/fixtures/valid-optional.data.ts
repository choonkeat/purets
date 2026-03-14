type User = {
  name: string
  age: number
  email?: string
  nickname?: string
}

const alice: User = { name: "Alice", age: 30, email: "alice@example.com" }

const bob: User = { name: "Bob", age: 25 }

const carol: User = { name: "Carol", age: 35, email: "carol@example.com", nickname: "CC" }
