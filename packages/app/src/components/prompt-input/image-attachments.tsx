import { Component, For, Show } from "solid-js"
import { Icon } from "@opencode-ai/ui/icon"
import { Tooltip } from "@opencode-ai/ui/tooltip"
import { firstFramePosterSrc, pauseOnFirstFrame } from "@opencode-ai/ui/kolbo-media"
import type { ImageAttachmentPart } from "@/context/prompt"

type PromptImageAttachmentsProps = {
  attachments: ImageAttachmentPart[]
  onOpen: (attachment: ImageAttachmentPart) => void
  onRemove: (id: string) => void
  onRetry?: (id: string) => void
  removeLabel: string
}

const fallbackClass = "size-16 rounded-md bg-surface-base flex items-center justify-center border border-border-base"
const imageClass =
  "size-16 rounded-md object-cover border border-border-base hover:border-border-strong-base transition-colors"
const removeClass =
  "absolute -top-1.5 -right-1.5 size-5 rounded-full bg-surface-raised-stronger-non-alpha border border-border-base flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-surface-raised-base-hover"
const nameClass = "absolute bottom-0 left-0 right-0 px-1 py-0.5 bg-black/50 rounded-b-md"

export const PromptImageAttachments: Component<PromptImageAttachmentsProps> = (props) => {
  return (
    <Show when={props.attachments.length > 0}>
      <div class="flex flex-wrap gap-2 px-3 pt-3">
        <For each={props.attachments}>
          {(attachment) => (
            <Tooltip value={attachment.filename} placement="top" contentClass="break-all">
              <div class="relative group">
                <Show
                  when={attachment.mime.startsWith("image/")}
                  fallback={
                    <Show
                      when={attachment.mime.startsWith("video/")}
                      fallback={
                        // Audio — music note icon
                        <div class={fallbackClass}>
                          <svg width="24" height="24" viewBox="0 0 20 20" fill="none" class="text-text-weak">
                            <path d="M7.5 15V5.833L15.833 4.167V13.333M7.5 15C7.5 16.381 6.381 17.5 5 17.5C3.619 17.5 2.5 16.381 2.5 15C2.5 13.619 3.619 12.5 5 12.5C6.381 12.5 7.5 13.619 7.5 15ZM15.833 13.333C15.833 14.714 14.714 15.833 13.333 15.833C11.952 15.833 10.833 14.714 10.833 13.333C10.833 11.952 11.952 10.833 13.333 10.833C14.714 10.833 15.833 11.952 15.833 13.333Z" stroke="currentColor" stroke-linecap="square"/>
                          </svg>
                        </div>
                      }
                    >
                      {/* Video — first-frame poster (no live decode). */}
                      <video
                        src={firstFramePosterSrc(attachment.dataUrl)}
                        ref={pauseOnFirstFrame}
                        autoplay
                        muted
                        playsinline
                        preload="auto"
                        disablepictureinpicture
                        controlslist="nodownload nofullscreen noremoteplayback noplaybackrate"
                        class={imageClass}
                        style="pointer-events:none;background:#0b0b0c"
                      />
                    </Show>
                  }
                >
                  <img
                    src={attachment.dataUrl}
                    alt={attachment.filename}
                    class={imageClass}
                    onClick={() => props.onOpen(attachment)}
                  />
                </Show>

                {/* Upload in-progress overlay */}
                <Show when={attachment.uploading}>
                  <div class="absolute inset-0 flex items-center justify-center bg-black/50 rounded-md pointer-events-none">
                    <div class="size-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  </div>
                </Show>

                {/* Upload error overlay — click to retry */}
                <Show when={!attachment.uploading && !!attachment.uploadError}>
                  <Tooltip value={`Upload failed: ${attachment.uploadError} — click to retry`} placement="top" contentClass="break-all max-w-64">
                    <button
                      type="button"
                      onClick={() => props.onRetry?.(attachment.id)}
                      class="absolute inset-0 flex items-center justify-center bg-red-900/60 rounded-md"
                    >
                      <Icon name="warning" class="size-5 text-red-300" />
                    </button>
                  </Tooltip>
                </Show>

                <button
                  type="button"
                  onClick={() => props.onRemove(attachment.id)}
                  class={removeClass}
                  aria-label={props.removeLabel}
                >
                  <Icon name="close" class="size-3 text-text-weak" />
                </button>
                <div class={nameClass}>
                  <span class="text-10-regular text-white truncate block">{attachment.filename}</span>
                </div>
              </div>
            </Tooltip>
          )}
        </For>
      </div>
    </Show>
  )
}
