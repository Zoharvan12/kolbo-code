declare module "bidi-js" {
  export interface EmbeddingLevels {
    levels: Uint8Array
    paragraphLevel: number
  }
  interface BidiInstance {
    getEmbeddingLevels(text: string, defaultLevel?: "ltr" | "rtl"): EmbeddingLevels
    getReorderedString(text: string, embeddingLevels: EmbeddingLevels, mirrorBrackets?: boolean): string
    getReorderedIndices(text: string, embeddingLevels: EmbeddingLevels): number[]
  }
  function bidiFactory(): BidiInstance
  export default bidiFactory
}
