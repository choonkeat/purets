type Result<T> = {
  ok: boolean
  data: T
  error: string | null
}

type Paginated<T> = {
  items: T[]
  total: number
  page: number
}

type User = {
  name: string
  age: number
}

const userResult: Result<User> = { ok: true, data: { name: "Alice", age: 30 }, error: null }

const stringResult: Result<string> = { ok: false, data: "fallback", error: "not found" }

const userPage: Paginated<User> = { items: [{ name: "Alice", age: 30 }, { name: "Bob", age: 25 }], total: 50, page: 1 }
