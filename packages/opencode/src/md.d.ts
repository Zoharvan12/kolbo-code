// Allow `import KOLBO_SKILL_MD from "...md" with { type: "text" }`
// in both src/mcp/wire.ts and src/cli/cmd/providers.ts so that the
// canonical SKILL.md at packages/opencode/skills/kolbo/SKILL.md is the
// single source of truth — both files write the SAME content to disk
// at user-setup time. Matches the pattern of src/sql.d.ts for .sql.
declare module "*.md" {
  const content: string
  export default content
}
