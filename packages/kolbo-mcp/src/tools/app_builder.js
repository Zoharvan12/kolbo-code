/* ⛔ BACKWARD COMPATIBILITY: Tool names and arg names below are a PUBLIC
 * CONTRACT. Never rename, remove, or break an existing tool/arg — old cached
 * `npx @kolbo/mcp` installs in the wild will break silently. Add new tools or
 * new OPTIONAL args only. Full rules: ../index.js top-of-file and CLAUDE.md. */

const { z } = require('zod');
const { PollingTimeoutError } = require('../polling');

// ─── Build-status polling (App Builder uses a different endpoint than /v1/generate) ──
async function pollBuildStatus(client, sessionId, options = {}) {
  const {
    interval = 5000,
    timeout = 300000 // 5 minutes
  } = options;

  const startTime = Date.now();
  const url = `/app-builder/${encodeURIComponent(sessionId)}/build-status`;

  while (true) {
    if (Date.now() - startTime > timeout) {
      throw new PollingTimeoutError(sessionId, timeout);
    }

    const result = await client.get(url);

    if (result.buildStatus === 'deployed') {
      return result;
    }

    if (result.buildStatus === 'failed') {
      throw new Error(
        `App build failed for session_id="${sessionId}". ` +
        `Call app_builder_get_build_status to check the current state.`
      );
    }

    await new Promise(resolve => setTimeout(resolve, interval));
  }
}

function registerAppBuilderTools(server, client) {
  // ─── app_builder_list_projects ─────────────────────────────────────────────
  server.tool(
    'app_builder_list_projects',
    'List all Kolbo projects for the authenticated user. Use this to find the project_id required by app_builder_create_session and app_builder_list_sessions. Projects are the top-level containers — each project can hold multiple App Builder sessions.',
    {},
    async () => {
      const res = await client.get('/project/lightweight');
      const projects = (Array.isArray(res) ? res : (res.data || [])).map(p => ({
        project_id: p._id,
        name: p.name,
        description: p.description || '',
        created_at: p.createdAt
      }));
      return {
        content: [{ type: 'text', text: JSON.stringify(projects, null, 2) }]
      };
    }
  );

  // ─── app_builder_create_session ────────────────────────────────────────────
  server.tool(
    'app_builder_create_session',
    'Create a new App Builder session inside a Kolbo project. Returns a session_id to pass to app_builder_generate_app. Sessions hold the full app state across multiple generations and edits.',
    {
      project_id: z.string().describe('Kolbo project ID to scope this session. Use app_builder_list_projects to find your project_id.'),
      name: z.string().optional().describe('Optional initial session name. The backend will auto-generate a name on first generation if omitted.')
    },
    async ({ project_id, name }) => {
      const body = name ? { name } : {};
      const res = await client.post(`/app-builder/session/${encodeURIComponent(project_id)}`, body);
      const session = res.data || res;
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            session_id: session._id,
            name: session.name,
            build_status: session.buildStatus,
            deployment_url: session.deploymentUrl || null
          }, null, 2)
        }]
      };
    }
  );

  // ─── app_builder_generate_app ──────────────────────────────────────────────
  server.tool(
    'app_builder_generate_app',
    'Generate a React app from a text prompt inside an App Builder session. On the FIRST call the backend auto-generates a punchy app name, URL slug, GitHub repo, and (if needed) a Supabase database. The build runs in the background — this tool polls until the app is deployed (up to 5 minutes) then returns the live deployment_url. Always show the user the deployment_url when done.',
    {
      session_id: z.string().describe('Session ID from app_builder_create_session.'),
      prompt: z.string().describe('Natural language description of the app to build (e.g. "a todo app with drag-and-drop and Supabase persistence").')
    },
    async ({ session_id, prompt }) => {
      await client.post(`/app-builder/generation/${encodeURIComponent(session_id)}`, { userPrompt: prompt });
      const status = await pollBuildStatus(client, session_id);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            session_id,
            build_status: status.buildStatus,
            deployment_url: status.deploymentUrl || null,
            app_name: status.appName || null
          }, null, 2)
        }]
      };
    }
  );

  // ─── app_builder_edit_app ──────────────────────────────────────────────────
  server.tool(
    'app_builder_edit_app',
    'Edit an existing generated app with a natural language instruction — "add a dark mode toggle", "change the color scheme to blue", "add a contact form". Like app_builder_generate_app but for modifications. Use app_builder_list_generations to get the current generation_id before calling this.',
    {
      session_id: z.string().describe('Session ID of the app to edit.'),
      generation_id: z.string().describe('The generation to edit. Use app_builder_list_generations to find the latest generation_id.'),
      edit_prompt: z.string().describe('Natural language instruction describing the change to make.')
    },
    async ({ session_id, generation_id, edit_prompt }) => {
      await client.put(
        `/app-builder/generation/${encodeURIComponent(session_id)}/${encodeURIComponent(generation_id)}`,
        { editPrompt: edit_prompt }
      );
      const status = await pollBuildStatus(client, session_id);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            session_id,
            build_status: status.buildStatus,
            deployment_url: status.deploymentUrl || null,
            app_name: status.appName || null
          }, null, 2)
        }]
      };
    }
  );

  // ─── app_builder_get_build_status ──────────────────────────────────────────
  server.tool(
    'app_builder_get_build_status',
    'Check the current build status of an App Builder session. Use this to manually poll after app_builder_generate_app or app_builder_edit_app, or to check on an app at any time. Returns "deployed" when the live URL is ready.',
    {
      session_id: z.string().describe('Session ID to check.')
    },
    async ({ session_id }) => {
      const result = await client.get(`/app-builder/${encodeURIComponent(session_id)}/build-status`);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            build_status: result.buildStatus,
            deployment_url: result.deploymentUrl || null,
            deployed_at: result.deployedAt || null
          }, null, 2)
        }]
      };
    }
  );

  // ─── app_builder_get_session ───────────────────────────────────────────────
  server.tool(
    'app_builder_get_session',
    'Get full details of an App Builder session including metadata, build status, deployment URL, and GitHub/Supabase integration info. Use this when the user wants to clone the app locally — it returns the GitHub repo URL and Supabase connection details needed for local development.',
    {
      session_id: z.string().describe('Session ID to retrieve.')
    },
    async ({ session_id }) => {
      const res = await client.get(`/app-builder/session/${encodeURIComponent(session_id)}`);
      const session = res.data || res;
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            session_id: session._id,
            name: session.name,
            build_status: session.buildStatus,
            deployment_url: session.deploymentUrl || null,
            github_repo_url: session.githubRepoUrl || null,
            supabase_url: session.supabaseUrl || null,
            supabase_anon_key: session.supabaseAnonKey || null,
            created_at: session.createdAt
          }, null, 2)
        }]
      };
    }
  );

  // ─── app_builder_list_sessions ─────────────────────────────────────────────
  server.tool(
    'app_builder_list_sessions',
    'List all App Builder sessions in a project. Use this to find existing sessions before creating a new one, or to pick a session_id to continue working on.',
    {
      project_id: z.string().describe('Kolbo project ID. Use app_builder_list_projects to find it.')
    },
    async ({ project_id }) => {
      const res = await client.get(`/app-builder/sessions/${encodeURIComponent(project_id)}`);
      const sessions = (Array.isArray(res) ? res : (res.data || [])).map(s => ({
        session_id: s._id,
        name: s.name,
        build_status: s.buildStatus,
        deployment_url: s.deploymentUrl || null,
        created_at: s.createdAt
      }));
      return {
        content: [{ type: 'text', text: JSON.stringify(sessions, null, 2) }]
      };
    }
  );

  // ─── app_builder_list_generations ──────────────────────────────────────────
  server.tool(
    'app_builder_list_generations',
    'List all generations for an App Builder session, newest first. Use this to find the current generation_id before calling app_builder_edit_app.',
    {
      session_id: z.string().describe('Session ID to list generations for.')
    },
    async ({ session_id }) => {
      const res = await client.get(`/app-builder/generations/${encodeURIComponent(session_id)}`);
      const generations = (Array.isArray(res) ? res : (res.data || [])).map(g => ({
        generation_id: g._id,
        user_prompt: g.userPrompt || g.editPrompt || '',
        build_status: g.buildStatus,
        created_at: g.createdAt
      }));
      return {
        content: [{ type: 'text', text: JSON.stringify(generations, null, 2) }]
      };
    }
  );

  // ─── app_builder_delete_session ────────────────────────────────────────────
  server.tool(
    'app_builder_delete_session',
    'Permanently delete an App Builder session and ALL associated resources: GitHub repo, Supabase database (unless user-connected), deployed files, generation history, messages, and form submissions. THIS IS IRREVERSIBLE — always confirm with the user before calling.',
    {
      session_id: z.string().describe('Session ID to permanently delete. This cannot be undone.')
    },
    async ({ session_id }) => {
      await client.delete(`/app-builder/session/${encodeURIComponent(session_id)}`);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ success: true }, null, 2)
        }]
      };
    }
  );
}

module.exports = { registerAppBuilderTools };
