type User = { name: string; age: number }

const parseUser = (s: string): User => JSON.parse(s) as User
