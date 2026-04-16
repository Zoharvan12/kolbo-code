// Copyright 2019-2024 Tauri Programme within The Commons Conservancy
// SPDX-License-Identifier: Apache-2.0
// SPDX-License-Identifier: MIT

import { createSignal } from "solid-js"

const OS_NAME = (() => {
  if (navigator.userAgent.includes("Mac")) return "macos"
  if (navigator.userAgent.includes("Windows")) return "windows"
  if (navigator.userAgent.includes("Linux")) return "linux"
  return "unknown"
})()

const [webviewZoom, setWebviewZoom] = createSignal(1)

const MAX_ZOOM_LEVEL = 10
const MIN_ZOOM_LEVEL = 0.2

const clamp = (value: number) => Math.min(Math.max(value, MIN_ZOOM_LEVEL), MAX_ZOOM_LEVEL)

const ZOOM_STEP = 0.2

const applyZoom = (next: number) => {
  setWebviewZoom(next)
  void window.api.setZoomFactor(next)
}

const zoomIn = () => applyZoom(clamp(webviewZoom() + ZOOM_STEP))
const zoomOut = () => applyZoom(clamp(webviewZoom() - ZOOM_STEP))

window.addEventListener("keydown", (event) => {
  if (!(OS_NAME === "macos" ? event.metaKey : event.ctrlKey)) return

  let newZoom = webviewZoom()

  if (event.key === "-") newZoom -= ZOOM_STEP
  if (event.key === "=" || event.key === "+") newZoom += ZOOM_STEP
  if (event.key === "0") newZoom = 1

  applyZoom(clamp(newZoom))
})

export { webviewZoom, zoomIn, zoomOut }
