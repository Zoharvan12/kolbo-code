import fs from "node:fs/promises"
import path from "node:path"
import { Hono } from "hono"
import { describeRoute, validator } from "hono-openapi"
import { resolver } from "hono-openapi"
import { Instance } from "../../project/instance"
import { Project } from "../../project/project"
import z from "zod"
import { ProjectID } from "../../project/schema"
import { errors } from "../error"
import { lazy } from "../../util/lazy"
import { InstanceBootstrap } from "../../project/bootstrap"

// Windows-reserved chars + separators + traversal. One folder segment only —
// the New Project dialog supplies the parent separately.
export function validateNewProjectName(name: string): string | undefined {
  const trimmed = name.trim()
  if (!trimmed) return "Project name is required"
  if (trimmed === "." || trimmed === "..") return "Invalid project name"
  if (/[<>:"/\\|?*\x00-\x1f]/.test(trimmed)) return 'Name cannot contain \\ / : * ? " < > |'
  return undefined
}

export const ProjectRoutes = lazy(() =>
  new Hono()
    .get(
      "/",
      describeRoute({
        summary: "List all projects",
        description: "Get a list of projects that have been opened with Kolbo.",
        operationId: "project.list",
        responses: {
          200: {
            description: "List of projects",
            content: {
              "application/json": {
                schema: resolver(Project.Info.array()),
              },
            },
          },
        },
      }),
      async (c) => {
        const projects = Project.list()
        return c.json(projects)
      },
    )
    .get(
      "/current",
      describeRoute({
        summary: "Get current project",
        description: "Retrieve the currently active project that Kolbo is working with.",
        operationId: "project.current",
        responses: {
          200: {
            description: "Current project information",
            content: {
              "application/json": {
                schema: resolver(Project.Info),
              },
            },
          },
        },
      }),
      async (c) => {
        return c.json(Instance.project)
      },
    )
    .post(
      "/git/init",
      describeRoute({
        summary: "Initialize git repository",
        description: "Create a git repository for the current project and return the refreshed project info.",
        operationId: "project.initGit",
        responses: {
          200: {
            description: "Project information after git initialization",
            content: {
              "application/json": {
                schema: resolver(Project.Info),
              },
            },
          },
        },
      }),
      async (c) => {
        const dir = Instance.directory
        const prev = Instance.project
        const next = await Project.initGit({
          directory: dir,
          project: prev,
        })
        if (next.id === prev.id && next.vcs === prev.vcs && next.worktree === prev.worktree) return c.json(next)
        await Instance.reload({
          directory: dir,
          worktree: dir,
          project: next,
          init: InstanceBootstrap,
        })
        return c.json(next)
      },
    )
    .post(
      "/create",
      describeRoute({
        summary: "Create a new project folder",
        description:
          "Creates <parent>/<name> on the server's filesystem (mkdir -p) and returns the absolute path. Used by the New Project dialog; the client then opens the returned directory as a workspace.",
        operationId: "project.create",
        responses: {
          200: {
            description: "Folder created (or already existed and is empty)",
            content: { "application/json": { schema: resolver(z.object({ directory: z.string() })) } },
          },
          ...errors(400),
        },
      }),
      validator("json", z.object({ parent: z.string(), name: z.string() })),
      async (c) => {
        const { parent, name } = c.req.valid("json")
        const invalid = validateNewProjectName(name)
        if (invalid) return c.json({ error: invalid }, 400)
        const parentResolved = path.resolve(parent)
        const directory = path.join(parentResolved, name.trim())
        // join() with a validated single segment cannot escape parent, but keep
        // the invariant explicit — this route writes to disk.
        if (path.dirname(directory) !== parentResolved) return c.json({ error: "Invalid path" }, 400)
        const existing = await fs.readdir(directory).catch(() => undefined)
        if (existing && existing.length > 0)
          return c.json({ error: "A non-empty folder with this name already exists" }, 400)
        await fs.mkdir(directory, { recursive: true })
        return c.json({ directory })
      },
    )
    .patch(
      "/:projectID",
      describeRoute({
        summary: "Update project",
        description: "Update project properties such as name, icon, and commands.",
        operationId: "project.update",
        responses: {
          200: {
            description: "Updated project information",
            content: {
              "application/json": {
                schema: resolver(Project.Info),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator("param", z.object({ projectID: ProjectID.zod })),
      validator("json", Project.UpdateInput.omit({ projectID: true })),
      async (c) => {
        const projectID = c.req.valid("param").projectID
        const body = c.req.valid("json")
        const project = await Project.update({ ...body, projectID })
        return c.json(project)
      },
    ),
)
