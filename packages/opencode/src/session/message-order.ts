type Chronological = { id: string; time: { created: number } }

export const messageCreatedBefore = (left: Chronological, right: Chronological) =>
  left.time.created < right.time.created || (left.time.created === right.time.created && left.id < right.id)

export const insertChronologicalIndex = <T extends Chronological>(items: readonly T[], item: T) => {
  let left = 0
  let right = items.length
  while (left < right) {
    const middle = Math.floor((left + right) / 2)
    if (messageCreatedBefore(items[middle], item)) left = middle + 1
    else right = middle
  }
  return left
}

export const itemsBeforeID = <T extends { id: string }>(items: readonly T[], id: string) => {
  const index = items.findIndex((item) => item.id === id)
  return index < 0 ? [...items] : items.slice(0, index)
}

export const itemsFromID = <T extends { id: string }>(items: readonly T[], id: string) => {
  const index = items.findIndex((item) => item.id === id)
  return index < 0 ? [] : items.slice(index)
}

export const itemAfterID = <T extends { id: string }>(items: readonly T[], id: string) => {
  const index = items.findIndex((item) => item.id === id)
  return index < 0 ? undefined : items[index + 1]
}
