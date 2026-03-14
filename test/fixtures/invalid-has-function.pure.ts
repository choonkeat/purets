type User = {
  name: string
  age: number
}

function greet(user: User) {
  return "Hello " + user.name
}

const alice: User = { name: "Alice", age: 30 }
