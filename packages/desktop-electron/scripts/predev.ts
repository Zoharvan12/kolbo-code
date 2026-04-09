import { $ } from "bun"

await $`bun ./scripts/copy-icons.ts ${process.env.KODU_CHANNEL ?? "dev"}`

await $`cd ../kodu && bun script/build-node.ts`
