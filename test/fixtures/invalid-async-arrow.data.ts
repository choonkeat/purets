type User = {
  name: string
}

const fetchUser = async (id: number): Promise<User> => ({ name: "Alice" })

const alice: User = { name: "Alice" }
