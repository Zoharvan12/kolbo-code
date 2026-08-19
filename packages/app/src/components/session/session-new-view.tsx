import { For, Show, createMemo, createSignal, type JSX } from "solid-js"
import { useSync } from "@/context/sync"
import { useLanguage } from "@/context/language"
import { usePrompt, type Prompt } from "@/context/prompt"
import { Icon } from "@opencode-ai/ui/icon"
import { Kobi } from "@opencode-ai/ui/kobi"

const ROOT_CLASS = "size-full flex flex-col"

interface NewSessionViewProps {
  /** The session composer, rendered inline right under the hero — quick start
   *  is the primary action on this page, not a dock at the bottom of a void. */
  composer?: JSX.Element
}

type StarterCategory = "marketing" | "film" | "images" | "web"

type Starter = {
  key:
    | "fashionCampaign"
    | "scene"
    | "ugc"
    | "presentation"
    | "landing"
    | "video"
    | "productPhotoshoot"
    | "productAnimation"
    | "aiInfluencer"
  categories: StarterCategory[]
  /** i18n suffix for the small corner tag (session.new.tag.*); omit = no tag */
  tag?: "guided" | "seedance" | "needsRefs"
  /** Demo input assets auto-attached on click (public CDN URLs) so the preset
   *  works instantly — the prompt tells the user they can swap in their own. */
  media?: { url: string; filename: string; mime: string }[]
  /** Full-URL override for the card still (art iterations use new immutable keys). */
  thumb?: string
  /** "contain" letterboxes the still over the gradient (vertical 9:16 art in a
   *  16:10 card) instead of the default cover-crop. */
  fit?: "contain"
  /** Fallback tile when the CDN still is missing/unreachable — never a broken image. */
  gradient: string
}

// Real card art lives on the shared env-agnostic CDN bucket (kolbo-general-media,
// the documented home for hardcoded product assets): keyed by starter key so it
// can be redrawn without shipping a new build. Assets are cached immutable — on
// any redraw upload a NEW key (-v2) and update this base or the key names.
// Gradient tile carries the card if an asset is missing/unreachable.
const THUMB_CDN = "https://kolbo-general-media.fra1.cdn.digitaloceanspaces.com/kolbo-code/starters-v2"
const THUMB_CDN_V3 = "https://kolbo-general-media.fra1.cdn.digitaloceanspaces.com/kolbo-code/starters-v3"
const DEMO_CDN = "https://kolbo-general-media.fra1.cdn.digitaloceanspaces.com/kolbo-code/demo-assets"

// Each preset's demo assets MATCH its card art — a card showing a woman with
// a cream jar must attach exactly that woman-type creator ref and that jar.
const DEMO_CREAM_JAR = { url: `${DEMO_CDN}/demo-cream-jar.jpg`, filename: "demo-product.jpg", mime: "image/jpeg" }
const DEMO_CREATOR_WOMAN = { url: `${DEMO_CDN}/demo-creator-woman.jpg`, filename: "demo-creator.jpg", mime: "image/jpeg" }
const DEMO_SUNGLASSES = { url: `${DEMO_CDN}/demo-sunglasses.jpg`, filename: "demo-product.jpg", mime: "image/jpeg" }
const DEMO_SNEAKER = { url: `${DEMO_CDN}/demo-sneaker.jpg`, filename: "demo-product.jpg", mime: "image/jpeg" }
// Fashion campaign set — ORDER IS THE CONTRACT: attachment order defines the
// @ImageN numbering the preset prompt references (1=model, 2-5=outfits, 6=env).
const DEMO_FASHION: { url: string; filename: string; mime: string }[] = [
  { url: `${DEMO_CDN}/demo-fashion-model.jpg`, filename: "model.jpg", mime: "image/jpeg" },
  { url: `${DEMO_CDN}/demo-fashion-outfit-red.jpg`, filename: "outfit-red.jpg", mime: "image/jpeg" },
  { url: `${DEMO_CDN}/demo-fashion-outfit-cream.jpg`, filename: "outfit-cream.jpg", mime: "image/jpeg" },
  { url: `${DEMO_CDN}/demo-fashion-outfit-black.jpg`, filename: "outfit-black.jpg", mime: "image/jpeg" },
  { url: `${DEMO_CDN}/demo-fashion-outfit-blue.jpg`, filename: "outfit-blue.jpg", mime: "image/jpeg" },
  { url: `${DEMO_CDN}/demo-fashion-environment.jpg`, filename: "environment.jpg", mime: "image/jpeg" },
]

const STARTERS: Starter[] = [
  { key: "fashionCampaign", categories: ["marketing", "images"], tag: "guided", thumb: `${THUMB_CDN_V3}/fashionCampaign.webp`, media: DEMO_FASHION, gradient: "linear-gradient(140deg,#ff4dd8,#6a00b8)" },
  { key: "scene", categories: ["film"], tag: "seedance", gradient: "linear-gradient(140deg,#ff2d78,#7b2dff)" },
  { key: "ugc", categories: ["marketing", "film"], tag: "needsRefs", thumb: `${THUMB_CDN_V3}/ugc-v2.webp`, fit: "contain", media: [DEMO_CREAM_JAR, DEMO_CREATOR_WOMAN], gradient: "linear-gradient(140deg,#ff8a00,#ff2d55)" },
  { key: "presentation", categories: ["web"], gradient: "linear-gradient(140deg,#ffd200,#ff6a00)" },
  { key: "landing", categories: ["web", "marketing"], gradient: "linear-gradient(140deg,#00c2ff,#0037ff)" },
  { key: "video", categories: ["film"], gradient: "linear-gradient(140deg,#00e58f,#00707a)" },
  { key: "productPhotoshoot", categories: ["marketing", "images"], thumb: `${THUMB_CDN_V3}/productPhotoshoot.webp`, media: [DEMO_SUNGLASSES], gradient: "linear-gradient(140deg,#8f5bff,#2d0f66)" },
  { key: "productAnimation", categories: ["marketing", "film"], media: [DEMO_SNEAKER], gradient: "linear-gradient(140deg,#ff5e3a,#b8003e)" },
  { key: "aiInfluencer", categories: ["marketing", "images"], gradient: "linear-gradient(140deg,#b84dff,#3a0ca3)" },
]

const CATEGORIES: ("all" | StarterCategory)[] = ["all", "marketing", "film", "images", "web"]

export function NewSessionView(props: NewSessionViewProps) {
  const sync = useSync()
  const language = useLanguage()
  const prompt = usePrompt()

  // Kobi reacts to the composer: idle until you start describing something.
  const typing = createMemo(() => prompt.current().some((part) => "content" in part && part.content.trim().length > 0))

  const [category, setCategory] = createSignal<(typeof CATEGORIES)[number]>("all")
  const visible = createMemo(() =>
    STARTERS.filter((starter) => category() === "all" || starter.categories.includes(category() as StarterCategory)),
  )

  const seed = (starter: Starter) => {
    const text = language.t(`session.new.starter.${starter.key}.prompt`)
    const parts: Prompt = [{ type: "text", content: text, start: 0, end: text.length }]
    // Demo inputs ride as ready image attachments (public CDN URLs — publicUrl
    // is already set, so no upload round-trip), letting the preset run
    // instantly; the prompt copy invites swapping in real assets.
    for (const m of starter.media ?? []) {
      parts.push({
        type: "image",
        id: `demo-${starter.key}-${m.filename}-${Date.now()}`,
        filename: m.filename,
        mime: m.mime,
        dataUrl: m.url,
        publicUrl: m.url,
      })
    }
    prompt.set(parts, text.length)
    const editor = document.querySelector<HTMLElement>('[data-component="prompt-input"]')
    editor?.focus()
  }

  return (
    <div class={ROOT_CLASS} data-component="session-new-view">
      <div class="h-12 shrink-0" aria-hidden />
      <div class="flex-1 min-h-0 overflow-y-auto px-6 pb-10 flex items-start justify-center">
        <div class="w-full max-w-200 flex flex-col items-center text-center gap-7 pt-10">
          <div class="flex flex-col items-center gap-4" data-slot="new-session-hero">
            <div data-slot="new-session-mark">
              {import.meta.env.VITE_WHITELABEL_LOGO ? (
                <img src={import.meta.env.VITE_WHITELABEL_LOGO} class="w-10" alt="" />
              ) : (
                <Kobi state={typing() ? "thinking" : "idle"} size={84} />
              )}
            </div>
            <div class="flex flex-col items-center gap-1.5">
              <h1 data-slot="new-session-title">{language.t("session.new.title")}</h1>
              <p data-slot="new-session-subtitle">{language.t("session.new.subtitle")}</p>
            </div>
          </div>

          <Show when={props.composer}>
            <div data-slot="new-session-composer" class="w-full">{props.composer}</div>
          </Show>

          <Show
            when={sync.project}
            fallback={
              <div data-slot="new-session-no-project">
                <Icon name="folder" size="small" />
                <span>{language.t("prompt.noProject.description")}</span>
              </div>
            }
          >
            <>
                <div data-slot="new-session-divider" aria-hidden="true">
                  <span />
                  <span data-slot="new-session-divider-label">{language.t("session.new.jumpIn")}</span>
                  <span />
                </div>

                <div data-slot="new-session-chips" role="tablist">
                  <For each={CATEGORIES}>
                    {(cat) => (
                      <button
                        type="button"
                        role="tab"
                        data-slot="new-session-chip"
                        data-active={category() === cat}
                        aria-selected={category() === cat}
                        onClick={() => setCategory(cat)}
                      >
                        {language.t(`session.new.category.${cat}`)}
                      </button>
                    )}
                  </For>
                </div>

                <div data-slot="new-session-cards">
                  <For each={visible()}>
                    {(starter, i) => (
                      <button
                        type="button"
                        data-slot="new-session-card"
                        style={{ "--starter-delay": `${i() * 60}ms` }}
                        onClick={() => seed(starter)}
                      >
                        <span data-slot="new-session-card-thumb" style={{ background: starter.gradient }}>
                          {/* contain-fit art (9:16 in a 16:10 card) sits on a blurred
                              cover-fill of ITSELF — flat gradient bars read broken. */}
                          <Show when={starter.fit === "contain"}>
                            <img
                              src={starter.thumb ?? `${THUMB_CDN}/${starter.key}.webp`}
                              alt=""
                              aria-hidden="true"
                              loading="lazy"
                              referrerpolicy="no-referrer"
                              data-slot="new-session-card-thumb-blur"
                              onError={(e) => (e.currentTarget.style.display = "none")}
                            />
                          </Show>
                          <img
                            src={starter.thumb ?? `${THUMB_CDN}/${starter.key}.webp`}
                            alt=""
                            loading="lazy"
                            referrerpolicy="no-referrer"
                            style={starter.fit === "contain" ? { "object-fit": "contain" } : undefined}
                            onError={(e) => (e.currentTarget.style.display = "none")}
                          />
                          <Show when={starter.tag}>
                            <span data-slot="new-session-card-tag">{language.t(`session.new.tag.${starter.tag}`)}</span>
                          </Show>
                        </span>
                        <span data-slot="new-session-card-meta">
                          <span data-slot="new-session-card-title">
                            {language.t(`session.new.starter.${starter.key}.title`)}
                          </span>
                          <span data-slot="new-session-card-body">
                            {language.t(`session.new.starter.${starter.key}.body`)}
                          </span>
                        </span>
                      </button>
                    )}
                  </For>
                </div>
            </>
          </Show>
        </div>
      </div>
    </div>
  )
}
