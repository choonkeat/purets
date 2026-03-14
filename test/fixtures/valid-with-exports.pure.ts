export type User = {
  name: string
  age: number
}

export const mkUser = (name: string, age: number): User => ({ name, age })

export const alice: User = { name: "Alice", age: 30 }
