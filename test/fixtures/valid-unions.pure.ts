type Role = "admin" | "user" | "guest"

type User = {
  name: string
  role: Role
  tags: string[]
}

const alice: User = { name: "Alice", role: "admin", tags: ["staff", "eng"] }

const bob: User = { name: "Bob", role: "guest", tags: [] }
