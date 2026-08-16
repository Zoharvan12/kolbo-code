const { describe, it } = require("node:test")
const assert = require("node:assert/strict")
const { SCHEMA, describe: describeOp, complete, finish, operation } = require("./operation")

describe("kolbo.operation/1", () => {
  it("describe emits the envelope for every generation tool", () => {
    const tools = [
      "generate_image",
      "generate_image_edit",
      "generate_creative_director",
      "generate_video",
      "generate_video_from_image",
      "generate_video_from_video",
      "generate_elements",
      "generate_first_last_frame",
      "generate_lipsync",
      "generate_music",
      "generate_speech",
      "generate_sound",
      "generate_3d",
      "edit_image",
      "edit_video",
      "get_generation_status",
      "kolbo_generate_image",
      "mcp__kolbo__generate_video",
    ]
    for (const tool of tools) {
      const env = describeOp(tool, { prompt: "a cat", model: "flux", aspect_ratio: "16:9" })
      assert.equal(env.schema, SCHEMA)
      assert.ok(env.kind)
      assert.ok(env.route)
      assert.equal(env.phase, "review")
      assert.ok(Array.isArray(env.params))
      assert.ok(Array.isArray(env.outputs))
      assert.ok(Array.isArray(env.actions))
    }
  })

  it("describe ignores discovery tools", () => {
    assert.equal(describeOp("list_models", {}), null)
    assert.equal(describeOp("check_credits", {}), null)
  })

  it("complete includes id, cost, outputs, and actions", () => {
    const env = complete(
      "generate_image",
      { prompt: "a cat", model: "flux" },
      { generation_id: "gen_1", credits_used: 12, result: { urls: ["https://cdn.example/a.png"], model: "flux" } },
      { urls: ["https://cdn.example/a.png"], credits_used: 12, model: "flux" },
    )
    assert.equal(env.schema, SCHEMA)
    assert.equal(env.id, "gen_1")
    assert.equal(env.cost, 12)
    assert.equal(env.phase, "completed")
    assert.equal(env.outputs[0].url, "https://cdn.example/a.png")
    assert.ok(env.actions.length > 0)
    assert.equal(env.actions[0].tool, "generate_image_edit")
  })

  it("finish keeps legacy fields for old clients", () => {
    const reply = finish(
      "generate_video",
      { prompt: "rain" },
      { generation_id: "v1", credits_used: 40, result: { urls: ["https://cdn.example/a.mp4"] } },
      { urls: ["https://cdn.example/a.mp4"], credits_used: 40, _followup_hint: "edit next" },
    )
    const body = JSON.parse(reply.content[0].text)
    assert.equal(body.schema, SCHEMA)
    assert.equal(body.generation_id, "v1")
    assert.equal(body.credits_used, 40)
    assert.equal(body.cost_credits, 40)
    assert.deepEqual(body.urls, ["https://cdn.example/a.mp4"])
    assert.equal(body._followup_hint, "edit next")
    assert.equal(body.kind, "video")
  })

  it("status recovery uses the same envelope and keeps raw result", () => {
    const result = {
      generation_id: "abc",
      type: "image",
      state: "completed",
      credits_used: 8,
      result: { urls: ["https://cdn.example/b.png"], model: "flux" },
    }
    const reply = finish("get_generation_status", { generation_id: "abc" }, result, { ...result })
    const body = JSON.parse(reply.content[0].text)
    assert.equal(body.schema, SCHEMA)
    assert.equal(body.id, "abc")
    assert.equal(body.cost, 8)
    assert.equal(body.result.urls[0], "https://cdn.example/b.png")
  })

  it("operation() is additive and host-agnostic", () => {
    const env = operation({
      phase: "completed",
      id: "x",
      kind: "audio",
      route: "custom",
      title: "Custom",
      model: { id: "m" },
      params: [{ id: "note", type: "string", value: "rain" }],
      outputs: [{ url: "https://cdn.example/s.mp3", kind: "audio" }],
      actions: [{ id: "remix", label: "Remix", tool: "remix_custom" }],
    })
    assert.equal(env.schema, SCHEMA)
    assert.equal(env.kind, "audio")
    assert.equal(env.actions[0].label, "Remix")
  })
})
