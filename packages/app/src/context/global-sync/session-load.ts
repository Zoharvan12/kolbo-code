import type { RootLoadArgs } from "./types"

export async function loadRootSessionsWithFallback(input: RootLoadArgs) {
  try {
    // Always ask for archived — sidebar toggle filters visibility in the UI.
    // Without this the server omits them (archived defaults false) and the
    // "Show archived" switch has nothing to reveal.
    const result = await input.list({
      directory: input.directory,
      roots: true,
      limit: input.limit,
      archived: true,
    })
    return {
      data: result.data,
      limit: input.limit,
      limited: true,
    } as const
  } catch {
    const result = await input.list({ directory: input.directory, roots: true, archived: true })
    return {
      data: result.data,
      limit: input.limit,
      limited: false,
    } as const
  }
}

export function estimateRootSessionTotal(input: { count: number; limit: number; limited: boolean }) {
  if (!input.limited) return input.count
  if (input.count < input.limit) return input.count
  return input.count + 1
}
