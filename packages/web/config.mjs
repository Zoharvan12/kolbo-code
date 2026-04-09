const stage = process.env.SST_STAGE || "dev"

export default {
  url: stage === "production" ? "https://kodu.ai" : `https://${stage}.kodu.ai`,
  console: stage === "production" ? "https://kodu.ai/auth" : `https://${stage}.kodu.ai/auth`,
  email: "contact@anoma.ly",
  socialCard: "https://social-cards.sst.dev",
  github: "https://github.com/anomalyco/kodu",
  discord: "https://kodu.ai/discord",
  headerLinks: [
    { name: "app.header.home", url: "/" },
    { name: "app.header.docs", url: "/docs/" },
  ],
}
