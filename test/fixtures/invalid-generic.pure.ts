type Result<T> = {
  ok: boolean
  data: T
  error: string | null
}

type User = {
  name: string
  age: number
}

const r: Result<User> = { ok: true, data: { name: "Alice", age: "thirty" }, error: null }
