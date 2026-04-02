type User = { name: string; age: number }

const parseUser = (s: string): User | null => {
  const x: unknown = JSON.parse(s)
  if (
    typeof x === "object" && x !== null &&
    "name" in x && typeof x.name === "string" &&
    "age" in x && typeof x.age === "number"
  ) {
    return { name: x.name, age: x.age }
  }
  return null
}
