type Status = "active" | "inactive" | "pending"

type Account = {
  id: number
  status: Status
}

const a1: Account = { id: 1, status: "active" }

const a2: Account = { id: 2, status: "deleted" }
