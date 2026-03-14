type User = {
  name: string
  age: number
}

function greet(user: User): string {
  return "Hello " + user.name
}

function adults(users: User[]): User[] {
  return users.filter(u => u.age >= 18)
}

const alice: User = { name: "Alice", age: 30 }

const greeting: string = greet(alice)
