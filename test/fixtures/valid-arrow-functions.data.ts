type User = {
  name: string
  age: number
}

const mkUser = (name: string, age: number): User => ({ name, age })

const greet = (u: User): string => `Hello, ${u.name}`

const adults = (users: User[]): User[] => users.filter(u => u.age >= 18)

const alice: User = mkUser("Alice", 30)

const bob: User = { name: "Bob", age: 25 }

const greeting: string = greet(alice)
