enum Status {
  Active,
  Inactive
}

type User = {
  name: string
  status: Status
}

const alice: User = { name: "Alice", status: 0 }
