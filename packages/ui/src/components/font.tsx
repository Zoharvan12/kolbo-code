import { onMount } from "solid-js"

export const FontLoader = () => {
  onMount(() => {
    const existing = document.getElementById("kolbo-google-fonts")
    if (existing) return
    const link = document.createElement("link")
    link.id = "kolbo-google-fonts"
    link.rel = "stylesheet"
    link.href =
      "https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&family=Heebo:wght@400;500;700&display=swap"
    document.head.appendChild(link)
  })
  return null
}

export { FontLoader as Font }
export default FontLoader
