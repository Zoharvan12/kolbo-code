import type { z } from "zod"
import type { Config } from "../config/config"

type McpLocal = z.infer<typeof Config.McpLocal>

export const DEFAULT_MCPS: Record<string, McpLocal> = {
  playwright: {
    type: "local",
    command: ["npx", "-y", "@playwright/mcp@latest"],
    enabled: false,
  },
}
