/**
 * Poll a generation until it reaches a terminal state
 */

class PollingTimeoutError extends Error {
  constructor(generationId, timeoutMs) {
    const seconds = Math.round(timeoutMs / 1000);
    super(
      `Generation timed out after ${seconds}s of polling. The generation may STILL be running on the server — ` +
      `call get_generation_status with generation_id="${generationId}" to check its current state. ` +
      `Videos, deep-think chat, and large batches can take longer than the default polling window.`
    );
    this.name = 'PollingTimeoutError';
    this.generationId = generationId;
    this.timeoutMs = timeoutMs;
    this.timedOut = true;
  }
}

class GenerationFailedError extends Error {
  constructor(generationId, reason) {
    super(`Generation failed: ${reason || 'unknown error'} (generation_id="${generationId}")`);
    this.name = 'GenerationFailedError';
    this.generationId = generationId;
  }
}

// HTTP status codes / fetch failure modes we treat as transient when
// polling. The job is almost always still running on the server (or about
// to come back up) — bailing out makes the agent give up on a generation
// that completes 2 seconds later.
const TRANSIENT_STATUS_CODES = new Set([0, 408, 425, 429, 500, 502, 503, 504, 522, 524]);

function isTransientPollError(err) {
  if (!err) return false;
  // fetch() rejects with a TypeError on network failure (ECONNREFUSED,
  // ECONNRESET, DNS failure, kolbo-api restart, etc.) — no `status` on
  // the error object.
  if (err.name === 'TypeError') return true;
  if (err.code === 'ECONNRESET' || err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT' || err.code === 'EPIPE') return true;
  // KolboApiError tags status on the options object.
  const status = err.status ?? err.options?.status;
  if (typeof status === 'number' && TRANSIENT_STATUS_CODES.has(status)) return true;
  return false;
}

async function pollUntilDone(client, generationId, options = {}) {
  const {
    interval = 5000,
    timeout = 300000, // 5 minutes default
    statusUrl
  } = options;

  const startTime = Date.now();
  const url = statusUrl || `/v1/generate/${encodeURIComponent(generationId)}/status`;
  let transientFailures = 0;

  while (true) {
    if (Date.now() - startTime > timeout) {
      throw new PollingTimeoutError(generationId, timeout);
    }

    let result;
    try {
      result = await client.get(url);
      transientFailures = 0; // reset on successful poll
    } catch (err) {
      // kolbo-api restart, transient network blip, rate-limit, 5xx —
      // the job is still alive on the server (or coming back). Don't
      // abandon the polling loop just because one status check failed:
      // wait a bit longer and try again. After ~30 consecutive failures
      // (~2.5 minutes at the 5s base interval) we still surface the
      // last error so a truly dead backend doesn't loop forever.
      if (isTransientPollError(err)) {
        transientFailures++;
        if (transientFailures > 30) {
          throw err;
        }
        const backoff = Math.min(interval * Math.pow(1.5, Math.min(transientFailures - 1, 5)), 30000);
        await new Promise((resolve) => setTimeout(resolve, backoff));
        continue;
      }
      // Non-transient (auth, 4xx other than 408/425/429) — bubble up.
      throw err;
    }

    if (result.state === 'completed') {
      return result;
    }

    if (result.state === 'failed') {
      throw new GenerationFailedError(generationId, result.error);
    }

    if (result.state === 'cancelled') {
      throw new GenerationFailedError(generationId, 'generation was cancelled');
    }

    // Wait before next poll
    await new Promise(resolve => setTimeout(resolve, interval));
  }
}

module.exports = { pollUntilDone, PollingTimeoutError, GenerationFailedError };
