type Status = "draft" | "live"

type Post = {
  title: string
  tags: string[]
  status: Status
}

const appendTag = (post: Post, tag: string): Post => ({
  ...post,
  tags: [...post.tags, tag],
})

function label(post: Post): string {
  switch (post.status) {
    case "draft":
      return "Draft: " + post.title
    case "live":
      return post.title
  }
}

function sortedTags(post: Post): string[] {
  const tags = post.tags
  if (tags.length === 0) {
    return []
  }
  return tags.toSorted()
}

const first: Post = { title: "Hello", tags: ["a"], status: "draft" }

const second: Post = appendTag(first, "b")

const heading: string = label(second)

const tags: string[] = sortedTags(second)
