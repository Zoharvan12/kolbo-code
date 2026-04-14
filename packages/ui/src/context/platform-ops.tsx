import { createContext, useContext, type ParentProps } from "solid-js"

export type PlatformOps = {
  openPath?: (path: string) => Promise<void> | void
  openLink?: (url: string) => void
  fetch?: typeof window.fetch
  /** Show a native Save As dialog and return the chosen path, or null if cancelled */
  saveFilePickerDialog?: (opts?: { defaultPath?: string; title?: string }) => Promise<string | null>
  /** Write binary data to a local path */
  writeFile?: (path: string, data: Uint8Array) => Promise<void>
  /** Download a remote URL directly to the configured download folder; returns the saved path */
  downloadFile?: (url: string) => Promise<string>
  /** Read a local text file by path */
  readTextFile?: (path: string) => Promise<string>
  /** Reveal a file in the system file manager with the file pre-selected */
  revealFile?: (path: string) => Promise<void> | void
  /** Open a folder picker to change the configured download folder */
  changeDownloadFolder?: () => Promise<void>
}

const PlatformOpsCtx = createContext<PlatformOps>({})

export function PlatformOpsProvider(props: ParentProps<PlatformOps>) {
  const value: PlatformOps = {
    get openPath() {
      return props.openPath
    },
    get openLink() {
      return props.openLink
    },
    get fetch() {
      return props.fetch
    },
    get downloadFile() {
      return props.downloadFile
    },
    get readTextFile() {
      return props.readTextFile
    },
    get revealFile() {
      return props.revealFile
    },
    get changeDownloadFolder() {
      return props.changeDownloadFolder
    },
  }
  return <PlatformOpsCtx.Provider value={value}>{props.children}</PlatformOpsCtx.Provider>
}

export function usePlatformOps(): PlatformOps {
  return useContext(PlatformOpsCtx)
}
