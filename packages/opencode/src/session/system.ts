import { execSync } from "child_process"

import { Ripgrep } from "../file/ripgrep"

import { Instance } from "../project/instance"

import PROMPT_ANTHROPIC from "./prompt/anthropic.txt"
import PROMPT_DEFAULT from "./prompt/default.txt"
import PROMPT_BEAST from "./prompt/beast.txt"
import PROMPT_GEMINI from "./prompt/gemini.txt"
import PROMPT_GPT from "./prompt/gpt.txt"
import PROMPT_KIMI from "./prompt/kimi.txt"
import PROMPT_KOLBO_IDENTITY from "./prompt/kolbo-identity.txt"

import PROMPT_CODEX from "./prompt/codex.txt"
import PROMPT_TRINITY from "./prompt/trinity.txt"
import type { Provider } from "@/provider/provider"
import type { Agent } from "@/agent/agent"
import { Permission } from "@/permission"
import { Skill } from "@/skill"

export namespace SystemPrompt {
  export function provider(model: Provider.Model) {
    if (model.api.id.includes("gpt-4") || model.api.id.includes("o1") || model.api.id.includes("o3"))
      return [PROMPT_KOLBO_IDENTITY, PROMPT_BEAST]
    if (model.api.id.includes("gpt")) {
      if (model.api.id.includes("codex")) {
        return [PROMPT_KOLBO_IDENTITY, PROMPT_CODEX]
      }
      return [PROMPT_KOLBO_IDENTITY, PROMPT_GPT]
    }
    if (model.api.id.includes("gemini-")) return [PROMPT_KOLBO_IDENTITY, PROMPT_GEMINI]
    if (model.api.id.includes("claude")) return [PROMPT_KOLBO_IDENTITY, PROMPT_ANTHROPIC]
    if (model.api.id.toLowerCase().includes("trinity")) return [PROMPT_KOLBO_IDENTITY, PROMPT_TRINITY]
    if (model.api.id.toLowerCase().includes("kimi")) return [PROMPT_KOLBO_IDENTITY, PROMPT_KIMI]
    return [PROMPT_KOLBO_IDENTITY, PROMPT_DEFAULT]
  }

  function gitSnapshot(cwd: string): { branch: string; dirty: boolean } | undefined {
    try {
      const branch = execSync("git rev-parse --abbrev-ref HEAD", {
        cwd,
        stdio: ["ignore", "pipe", "ignore"],
        timeout: 1500,
      })
        .toString()
        .trim()
      const porcelain = execSync("git status --porcelain", {
        cwd,
        stdio: ["ignore", "pipe", "ignore"],
        timeout: 1500,
      }).toString()
      return { branch: branch || "(detached)", dirty: porcelain.trim().length > 0 }
    } catch {
      return undefined
    }
  }

  export async function environment(model: Provider.Model, agent?: Agent.Info) {
    const project = Instance.project
    const isGit = project.vcs === "git"
    const snap = isGit ? gitSnapshot(Instance.directory) : undefined
    const envLines = [
      `  Working directory: ${Instance.directory}`,
      `  Workspace root folder: ${Instance.worktree}`,
      `  Is directory a git repo: ${isGit ? "yes" : "no"}`,
    ]
    if (snap) {
      envLines.push(`  Git branch: ${snap.branch}`)
      envLines.push(`  Worktree dirty: ${snap.dirty ? "yes" : "no"}`)
    }
    if (agent) {
      envLines.push(`  Agent mode: ${agent.name}`)
    }
    envLines.push(`  Platform: ${process.platform}`)
    envLines.push(`  Today's date: ${new Date().toDateString()}`)

    // Keep Ripgrep import referenced so the unused-import check doesn't break if we
    // re-enable the <directories> tree later. The block itself is intentionally
    // disabled for now — enabling it would inject a repo file tree at session start.
    void Ripgrep

    return [
      [
        `You are powered by the model named ${model.api.id}. The exact model ID is ${model.providerID}/${model.api.id}`,
        `Here is some useful information about the environment you are running in:`,
        `<env>`,
        ...envLines,
        `</env>`,
      ].join("\n"),
    ]
  }

  export async function skills(agent: Agent.Info) {
    if (Permission.disabled(["skill"], agent.permission).has("skill")) return

    const list = await Skill.available(agent)

    return [
      "Skills provide specialized instructions and workflows for specific tasks.",
      "Use the skill tool to load a skill when a task matches its description.",
      // the agents seem to ingest the information about skills a bit better if we present a more verbose
      // version of them here and a less verbose version in tool description, rather than vice versa.
      Skill.fmt(list, { verbose: true }),
    ].join("\n")
  }
}
