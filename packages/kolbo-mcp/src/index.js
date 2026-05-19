/* ============================================================================
 * @kolbo/mcp — Kolbo AI MCP Server
 *
 *   ⛔  STOP.  READ THIS BEFORE TOUCHING ANY TOOL REGISTRATION.  ⛔
 *
 * This package is published to npm and installed via `npx -y @kolbo/mcp`.
 * Thousands of users have it CACHED on their machines, pinned to old versions
 * by npx's cache. Every tool name, every arg name, every response shape
 * registered below is a PUBLIC CONTRACT. Breaking it silently strands users
 * whose LLM will keep calling tool names their cached server no longer
 * registers — or worse, calls new-style args that the old server can't parse.
 *
 * THE THREE COMMANDMENTS
 *
 *   1. NEVER RENAME AN EXISTING TOOL.
 *      Not `generate_image` → `create_image`. Not `list_models` → `get_models`.
 *      Not "just cleaning up the name." Old cached clients break the instant
 *      you rename. If you must rename, keep the OLD name as an alias that
 *      forwards to the new implementation for at least one full major version.
 *
 *   2. NEVER REMOVE AN EXISTING TOOL.
 *      Deprecate it in the description ("[DEPRECATED: use X]") and keep it
 *      working. Only remove in a major version bump with release notes.
 *
 *   3. NEVER CHANGE AN EXISTING TOOL'S ARG NAMES, TYPES, OR REQUIRED STATUS
 *      IN A BACKWARD-INCOMPATIBLE WAY.
 *      Adding a new OPTIONAL arg with a sensible default is fine. Everything
 *      else below is forbidden in a minor release:
 *        - renaming `prompt` to `text`
 *        - making a previously-optional arg required
 *        - changing `aspect_ratio: string` to `aspect_ratio: { w, h }`
 *        - removing an arg (even one you think nobody uses)
 *
 * VERSION BUMPS
 *
 *   - minor (1.1.0 → 1.2.0): new tool, new optional arg, description tweak
 *   - patch (1.1.0 → 1.1.1): internal refactor, bug fix with no user impact
 *   - major (1.1.0 → 2.0.0): ANY breaking change from commandments 1–3 above,
 *     AND only after going through the deprecation path in CLAUDE.md.
 *
 * WHY THIS MATTERS
 *
 *   Users install via `npx -y @kolbo/mcp` — npx CACHES packages. A user who
 *   installed 3 months ago may still be running v1.0 until their cache
 *   invalidates. When their Claude Desktop starts the MCP server, it
 *   registers whatever tools ITS VERSION knows about. Their LLM sees that
 *   list and calls those names. You cannot force-update them.
 *
 *   The matching backend SDK routes in
 *   `kolbo-api/src/modules/sdk/index.js` are the same kind of public
 *   contract and follow the same rules — never rename, never remove.
 *
 * Full rules, deprecation path, and parity-audit instructions: CLAUDE.md
 *
 * If you are a coding agent about to rename/remove a tool or arg: STOP and
 * ask the human first. This is not optional.
 * ==========================================================================*/

const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const KolboClient = require('./client');
const { registerGenerateTools } = require('./tools/generate');
const { registerModelTools } = require('./tools/models');
const { registerChatTools } = require('./tools/chat');
const { registerVisualDnaTools } = require('./tools/visual_dna');
const { registerMoodboardTools } = require('./tools/moodboards');
const { registerMediaTools } = require('./tools/media');
const { registerPresetTools } = require('./tools/presets');
const { registerAppBuilderTools } = require('./tools/app_builder');
const { registerArtifactTools } = require('./tools/artifacts');

async function main() {
  const client = new KolboClient();

  const server = new McpServer({
    name: 'kolbo',
    version: '1.0.0'
  });

  // Register all tools
  registerGenerateTools(server, client);
  registerModelTools(server, client);
  registerChatTools(server, client);
  registerVisualDnaTools(server, client);
  registerMoodboardTools(server, client);
  registerMediaTools(server, client);
  registerPresetTools(server, client);
  registerAppBuilderTools(server, client);
  registerArtifactTools(server, client);

  // Start the server with stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

module.exports = { main };

// Auto-run when invoked directly (e.g. `node src/index.js` or via the published
// bin/kolbo-mcp.js wrapper). Consumers that `require()` this module to embed it
// inside another process (the Kolbo Code CLI's `kolbo mcp serve` subcommand)
// should call `main()` themselves.
if (require.main === module || require.main?.filename?.endsWith('kolbo-mcp.js')) {
  main().catch(err => {
    console.error('Failed to start Kolbo MCP server:', err);
    process.exit(1);
  });
}
