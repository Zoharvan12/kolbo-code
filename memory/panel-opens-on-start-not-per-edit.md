---
name: panel-opens-on-start-not-per-edit
description: Auto-surfacing panels (canvas, artifact/HTML preview) open once when work starts — never re-open or re-render on every edit
metadata:
  type: feedback
---

A side panel that reveals agent work opens **when the work starts** and then stays put. It must not pop open, re-render or steal focus again on each subsequent edit.

**Why:** Two opposite complaints in the same session. The canvas only opened when the user clicked "open in canvas" — too late, since its whole job is showing progress cards while generations run. Meanwhile the HTML artifact re-surfaced after every single edit: "ITS very problematic that the html show up after each edit its spamming as hell."

**How to apply:** Trigger the panel on generation/task *start*, not completion and not per-write. After the first open, later edits update content in place (debounced) with no re-open, no scroll jump, no focus grab. Same rule for the canvas view and the artifact/HTML preview.
