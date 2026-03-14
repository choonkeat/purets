type Address = {
  street: string
  city: string
}

type User = {
  name: string
  age: number
  address: Address
}

type Config = {
  debug: boolean
  maxRetries: number
}

const alice: User = { name: "Alice", age: 30, address: { street: "123 Main", city: "Springfield" } }

const bob: User = { name: "Bob", age: 25, address: { street: "456 Oak", city: "Shelbyville" } }

const config: Config = { debug: false, maxRetries: 3 }
