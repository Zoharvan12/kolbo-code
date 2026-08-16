/**
 * MCP progress notifications for a running generation.
 * Hosts read `generation_id` from the message payload to wire Cancel.
 */

async function notify(extra, id, phase, pct) {
  if (!extra || !id) return
  const token = extra._meta?.progressToken
  const message = JSON.stringify({
    generation_id: id,
    phase,
    ...(typeof pct === "number" ? { pct } : {}),
  })
  if (typeof extra.sendNotification !== "function" || token === undefined) return
  await extra.sendNotification({
    method: "notifications/progress",
    params: {
      progressToken: token,
      progress: typeof pct === "number" ? pct : 0,
      total: 100,
      message,
    },
  })
}

module.exports = { notify }
