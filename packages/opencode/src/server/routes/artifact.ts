import { Hono } from "hono"
import { describeRoute, validator } from "hono-openapi"
import { resolver } from "hono-openapi"
import z from "zod"
import { errors } from "../error"
import { Auth } from "../../auth"
import { Partner } from "../../brand/partner"
import { lazy } from "../../util/lazy"

export const ArtifactRoutes = lazy(() =>
  new Hono().post(
    "/share",
    describeRoute({
      summary: "Share HTML artifact",
      description: "Upload an HTML/SVG/Mermaid artifact to Kolbo and return a public URL.",
      operationId: "artifact.share",
      responses: {
        200: {
          description: "Artifact shared successfully",
          content: {
            "application/json": {
              schema: resolver(z.object({ url: z.string() })),
            },
          },
        },
        ...errors(400, 401, 502),
      },
    }),
    validator(
      "json",
      z.object({
        content: z.string(),
        type: z.enum(["html", "svg", "mermaid"]),
        title: z.string().optional(),
        sessionId: z.string().optional(),
      }),
    ),
    async (c) => {
      const auth = await Auth.get("kolbo")
      const apiKey =
        auth?.type === "oauth" ? auth.access : auth?.type === "api" ? auth.key : undefined

      if (!apiKey) {
        return c.json({ error: "Not authenticated. Run `kolbo auth login`." }, 401)
      }

      const base = Partner.apiBase

      const projectsRes = await fetch(`${base}/project`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      })
      if (!projectsRes.ok) {
        return c.json({ error: "Failed to fetch projects from Kolbo API." }, 502)
      }
      const projectsData = (await projectsRes.json()) as any
      const projects: any[] = Array.isArray(projectsData)
        ? projectsData
        : Array.isArray(projectsData?.data)
          ? projectsData.data
          : []
      const projectId = projects[0]?._id
      if (!projectId) {
        return c.json({ error: "No project found in your Kolbo account." }, 502)
      }

      const { content, type, title, sessionId } = c.req.valid("json")

      const artifactRes = await fetch(`${base}/artifact/${projectId}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          content,
          type,
          title: title ?? "Untitled",
          allowJs: true,
          ...(sessionId ? { sessionId } : {}),
        }),
      })

      if (!artifactRes.ok) {
        const text = await artifactRes.text()
        return c.json({ error: `Kolbo API error: ${text}` }, 502)
      }

      const result = (await artifactRes.json()) as any
      const shareToken = result?.data?.shareToken
      if (!shareToken) {
        return c.json({ error: "No share token returned from Kolbo API." }, 502)
      }

      return c.json({ url: `${base}/shared-artifact-raw/${shareToken}` })
    },
  ),
)
