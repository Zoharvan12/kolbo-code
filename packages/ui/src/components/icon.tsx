import { splitProps, type Component, type ComponentProps } from "solid-js"
import { Dynamic } from "solid-js/web"
import {
  AlignJustify,
  AlertTriangle,
  Archive,
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  ArrowRightToLine,
  ArrowUp,
  Atom,
  Ban,
  Brain,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsRight,
  ChevronsUpDown,
  CircleCheck,
  CircleHelp,
  CircleSlash,
  CircleX,
  ClipboardList,
  CloudUpload,
  Code,
  Columns3,
  Copy,
  CornerDownLeft,
  Download,
  Ellipsis,
  Expand,
  Eye,
  Film,
  Folder,
  FolderPlus,
  FolderTree,
  GitBranch,
  GitFork,
  Glasses,
  Grid3x3,
  Image as ImageIcon,
  Keyboard,
  LayoutPanelTop,
  Link2,
  List,
  ListChecks,
  ListFilter,
  Maximize2,
  Menu,
  MessageCircle,
  MessageSquare,
  MessageSquareText,
  Minimize2,
  Minus,
  MousePointerClick,
  Music,
  AppWindow,
  PanelBottom,
  PanelBottomClose,
  PanelLeft,
  PanelLeftClose,
  PanelRight,
  PanelRightClose,
  PenLine,
  Pencil,
  Plus,
  X,
  RotateCcw,
  Search,
  Server,
  Settings,
  Share,
  ShieldCheck,
  SlidersHorizontal,
  Square,
  SquareArrowOutUpRight,
  SquarePen,
  SquareTerminal,
  Terminal,
  Trash2,
} from "lucide-solid"

// Inline SVGs for icons Lucide doesn't ship: kolbo-specific glyphs, our
// 3-state layout pickers (partial/full fills), brand marks (GitHub/Discord)
// removed in newer Lucide releases, and the *-active pairs that need a
// subtle fill backing. All render into a 20×20 viewBox.
const customIcons: Record<string, string> = {
  mcp: `<g><path d="M0.972656 9.37176L9.5214 1.60019C10.7018 0.527151 12.6155 0.527151 13.7957 1.60019C14.9761 2.67321 14.9761 4.41295 13.7957 5.48599L7.3397 11.3552" stroke="currentColor" stroke-linecap="round"/><path d="M7.42871 11.2747L13.7957 5.48643C14.9761 4.41338 16.8898 4.41338 18.0702 5.48643L18.1147 5.52688C19.2951 6.59993 19.2951 8.33966 18.1147 9.4127L10.3831 16.4414C9.98966 16.7991 9.98966 17.379 10.3831 17.7366L11.9707 19.1799" stroke="currentColor" stroke-linecap="round"/><path d="M11.6587 3.54346L5.33619 9.29119C4.15584 10.3642 4.15584 12.1039 5.33619 13.177C6.51649 14.25 8.43019 14.25 9.61054 13.177L15.9331 7.42923" stroke="currentColor" stroke-linecap="round"/></g>`,
  github: `<path d="M10.0001 1.62549C14.6042 1.62549 18.3334 5.35465 18.3334 9.95882C18.333 11.7049 17.785 13.4068 16.7666 14.8251C15.7482 16.2434 14.3107 17.3066 12.6563 17.8651C12.2397 17.9484 12.0834 17.688 12.0834 17.4692C12.0834 17.188 12.0938 16.2922 12.0938 15.1776C12.0938 14.3963 11.8334 13.8963 11.5313 13.6359C13.3855 13.4276 15.3334 12.7192 15.3334 9.52132C15.3334 8.60465 15.0105 7.86507 14.4792 7.28174C14.5626 7.0734 14.8542 6.21924 14.3959 5.0734C14.3959 5.0734 13.698 4.84424 12.1042 5.92757C11.4376 5.74007 10.7292 5.64632 10.0209 5.64632C9.31258 5.64632 8.60425 5.74007 7.93758 5.92757C6.34383 4.85465 5.64592 5.0734 5.64592 5.0734C5.18758 6.21924 5.47925 7.0734 5.56258 7.28174C5.03133 7.86507 4.70842 8.61507 4.70842 9.52132C4.70842 12.7088 6.64592 13.4276 8.50008 13.6359C8.2605 13.8442 8.04175 14.2088 7.96883 14.7505C7.48967 14.9692 6.29175 15.3234 5.54175 14.063C5.3855 13.813 4.91675 13.1984 4.2605 13.2088C3.56258 13.2192 3.97925 13.6047 4.27092 13.7609C4.62508 13.9588 5.03133 14.6984 5.12508 14.938C5.29175 15.4067 5.83342 16.3026 7.92717 15.9172C7.92717 16.6151 7.93758 17.2713 7.93758 17.4692C7.93758 17.688 7.78133 17.938 7.36467 17.8651C5.70491 17.3126 4.26126 16.2515 3.23851 14.8324C2.21576 13.4133 1.66583 11.7081 1.66675 9.95882C1.66675 5.35465 5.39592 1.62549 10.0001 1.62549Z" fill="currentColor"/>`,
  discord: `<path d="M16.0742 4.45014C14.9244 3.92097 13.7106 3.54556 12.4638 3.3335C12.2932 3.64011 12.1388 3.95557 12.0013 4.27856C10.6732 4.07738 9.32261 4.07738 7.99451 4.27856C7.85694 3.9556 7.70257 3.64014 7.53203 3.3335C6.28441 3.54735 5.06981 3.92365 3.91889 4.45291C1.63401 7.85128 1.01462 11.1652 1.32431 14.4322C2.6624 15.426 4.16009 16.1819 5.7523 16.6668C6.11082 16.1821 6.42806 15.6678 6.70066 15.1295C6.18289 14.9351 5.68315 14.6953 5.20723 14.4128C5.33249 14.3215 5.45499 14.2274 5.57336 14.136C6.95819 14.7907 8.46965 15.1302 9.99997 15.1302C11.5303 15.1302 13.0418 14.7907 14.4266 14.136C14.5463 14.2343 14.6688 14.3284 14.7927 14.4128C14.3159 14.6957 13.8152 14.9361 13.2965 15.1309C13.5688 15.669 13.8861 16.1828 14.2449 16.6668C15.8385 16.1838 17.3373 15.4283 18.6756 14.4335C19.039 10.645 18.0549 7.36145 16.0742 4.45014ZM7.09294 12.423C6.22992 12.423 5.51693 11.6357 5.51693 10.6671C5.51693 9.69852 6.20514 8.90427 7.09019 8.90427C7.97524 8.90427 8.68272 9.69852 8.66758 10.6671C8.65244 11.6357 7.97248 12.423 7.09294 12.423ZM12.907 12.423C12.0426 12.423 11.3324 11.6357 11.3324 10.6671C11.3324 9.69852 12.0206 8.90427 12.907 8.90427C13.7934 8.90427 14.4954 9.69852 14.4803 10.6671C14.4651 11.6357 13.7865 12.423 12.907 12.423Z" fill="currentColor"/>`,

  "terminal-active": `<path d="M2 18H18V2H2V18Z" fill="currentColor" fill-opacity="0.1"/><path d="M6.5 8L8.64286 10L6.5 12M10.9286 12H13.5M2 18H18V2H2V18Z" stroke="currentColor" stroke-linecap="square"/>`,
  "review-active": `<path d="M18 18V2L2 2L2 18H18Z" fill="currentColor" fill-opacity="0.1"/><path d="M7 14.5H13M7 7.99512H10.0049M10.0049 7.99512H13M10.0049 7.99512V5M10.0049 7.99512V11M18 18V2L2 2L2 18H18Z" stroke="currentColor"/>`,
  "canvas-active": `<path d="M2 3.5h16v13H2z" fill="currentColor" fill-opacity="0.1"/><path d="M2 3.5h16v13H2zM2 12.5l4-4 3 3 3.5-3.5 5.5 5.5" stroke="currentColor" stroke-linecap="square"/><circle cx="6.5" cy="7" r="1.1" fill="currentColor"/>`,
  "file-tree-active": `<path d="M2 2L2 18H5L6.5 8.5H18V5H9.5L7.5 2H2Z" fill="currentColor" fill-opacity="0.1"/><path d="M5 18H18L19.5 8.5H18M5 18H2L2 2H7.5L9.5 5H18V8.5M5 18L6.5 8.5H18" stroke="currentColor" stroke-linecap="square"/>`,
  "new-session-active": `<path d="M6 11.3818V14H8.61818L18 4.61818L15.3818 2L6 11.3818Z" fill="currentColor" fill-opacity="0.1"/><path d="M12 2H2V18H18V8M6 11.3818V14H8.61818L18 4.61818L15.3818 2L6 11.3818Z" stroke="currentColor"/>`,
  "status-active": `<path d="M18 2H2V10H18V2Z" fill="currentColor" fill-opacity="0.1"/><path d="M2 18H18V10H2V18Z" fill="currentColor" fill-opacity="0.1"/><path d="M2 10V18H18V10M2 10V2H18V10M2 10H18M5 6H9M5 14H9" stroke="currentColor"/>`,
  "sidebar-active": `<path d="M2 2V18H5.2H7.86667V2H5.2H2Z" fill="currentColor" fill-opacity="0.1"/><path d="M7.86667 2H5.2H2V18H5.2H7.86667M7.86667 2H18V18H7.86667M7.86667 2V18" stroke="currentColor"/>`,

  "layout-left-partial": `<path d="M2.91732 2.91602L7.91732 2.91602L7.91732 17.0827H2.91732L2.91732 2.91602Z" fill="currentColor" fill-opacity="16%"/><path d="M2.91732 2.91602L17.084 2.91602M2.91732 2.91602L2.91732 17.0827M2.91732 2.91602L7.91732 2.91602M17.084 2.91602L17.084 17.0827M17.084 2.91602L7.91732 2.91602M17.084 17.0827L2.91732 17.0827M17.084 17.0827L7.91732 17.0827M2.91732 17.0827H7.91732M7.91732 17.0827L7.91732 2.91602" stroke="currentColor" stroke-linecap="square"/>`,
  "layout-left-full": `<path d="M2.91732 2.91602L7.91732 2.91602L7.91732 17.0827H2.91732L2.91732 2.91602Z" fill="currentColor"/><path d="M2.91732 2.91602L17.084 2.91602M2.91732 2.91602L2.91732 17.0827M2.91732 2.91602L7.91732 2.91602M17.084 2.91602L17.084 17.0827M17.084 2.91602L7.91732 2.91602M17.084 17.0827L2.91732 17.0827M17.084 17.0827L7.91732 17.0827M2.91732 17.0827H7.91732M7.91732 17.0827L7.91732 2.91602" stroke="currentColor" stroke-linecap="square"/>`,
  "layout-right-partial": `<path d="M17.082 17.0807L6.9987 17.0807V2.91406H17.082V17.0807Z" fill="currentColor" fill-opacity="16%"/><path d="M2.91536 2.91406H17.082V17.0807H2.91536V2.91406ZM6.9987 2.91406V17.0807" stroke="currentColor" stroke-linecap="square"/>`,
  "layout-right-full": `<path d="M17.082 17.0807L6.9987 17.0807V2.91406H17.082V17.0807Z" fill="currentColor"/><path d="M2.91536 2.91406H17.082V17.0807H2.91536V2.91406ZM6.9987 2.91406V17.0807" stroke="currentColor" stroke-linecap="square"/>`,
  "layout-bottom-partial": `<path d="M2.91732 12.0827L17.084 12.0827L17.084 17.0827H2.91732L2.91732 12.0827Z" fill="currentColor" fill-opacity="16%"/><path d="M2.91732 2.91602L17.084 2.91602M2.91732 2.91602L2.91732 17.0827M17.084 2.91602L17.084 17.0827M17.084 17.0827L2.91732 17.0827M2.91732 12.0827L17.084 12.0827" stroke="currentColor" stroke-linecap="square"/>`,
  "layout-bottom-full": `<path d="M2.91732 12.0827L17.084 12.0827L17.084 17.0827H2.91732L2.91732 12.0827Z" fill="currentColor"/><path d="M2.91732 2.91602L17.084 2.91602M2.91732 2.91602L2.91732 17.0827M17.084 2.91602L17.084 17.0827M17.084 17.0827L2.91732 17.0827M2.91732 12.0827L17.084 12.0827" stroke="currentColor" stroke-linecap="square"/>`,
}

// Map our internal icon names to lucide-solid components. Kolbo's product
// (kolbo-map) uses lucide-react with the same names, so keeping the mapping
// here gives us one source of truth across the two codebases.
type LucideLike = Component<ComponentProps<"svg"> & { size?: number | string }>
const lucideIcons: Record<string, LucideLike> = {
  "align-right": ArrowRightToLine,
  "arrow-up": ArrowUp,
  "arrow-left": ArrowLeft,
  "arrow-right": ArrowRight,
  "arrow-down-to-line": ArrowDownToLine,
  archive: Archive,
  "bubble-5": MessageCircle,
  prompt: MessageSquareText,
  brain: Brain,
  skill: Brain,
  fork: GitFork,
  "bullet-list": List,
  "check-small": Check,
  check: Check,
  "chevron-down": ChevronDown,
  "chevron-left": ChevronLeft,
  "chevron-right": ChevronRight,
  "chevron-grabber-vertical": ChevronsUpDown,
  "chevron-double-right": ChevronsRight,
  "circle-x": CircleX,
  close: X,
  "close-small": X,
  checklist: ListChecks,
  console: SquareTerminal,
  terminal: Terminal,
  review: ClipboardList,
  canvas: ImageIcon,
  expand: Maximize2,
  collapse: Minimize2,
  code: Code,
  "code-lines": AlignJustify,
  "circle-ban-sign": CircleSlash,
  "edit-small-2": SquarePen,
  eye: Eye,
  enter: CornerDownLeft,
  folder: Folder,
  "file-tree": FolderTree,
  "magnifying-glass": Search,
  "plus-small": Plus,
  plus: Plus,
  "new-session": SquarePen,
  "pencil-line": PenLine,
  glasses: Glasses,
  "magnifying-glass-menu": ListFilter,
  "window-cursor": MousePointerClick,
  task: Columns3,
  stop: Square,
  status: LayoutPanelTop,
  sidebar: PanelLeft,
  "layout-left": PanelLeft,
  "layout-right": PanelRight,
  "layout-bottom": PanelBottom,
  "square-arrow-top-right": SquareArrowOutUpRight,
  "open-file": SquareArrowOutUpRight,
  "speech-bubble": MessageCircle,
  comment: MessageSquare,
  "folder-add-left": FolderPlus,
  "dot-grid": Ellipsis,
  "circle-check": CircleCheck,
  copy: Copy,
  photo: ImageIcon,
  share: Share,
  shield: ShieldCheck,
  download: Download,
  menu: Menu,
  server: Server,
  branch: GitBranch,
  edit: Pencil,
  help: CircleHelp,
  "settings-gear": Settings,
  dash: Minus,
  "cloud-upload": CloudUpload,
  trash: Trash2,
  sliders: SlidersHorizontal,
  keyboard: Keyboard,
  selector: ChevronsUpDown,
  warning: AlertTriangle,
  reset: RotateCcw,
  link: Link2,
  providers: Grid3x3,
  models: Atom,
  video: Film,
  music: Music,
  "app-window": AppWindow,

  "panel-left-close": PanelLeftClose,
  "panel-right-close": PanelRightClose,
  "panel-bottom-close": PanelBottomClose,
}

const allIconNames = {
  ...lucideIcons,
  ...customIcons,
} as const

export type IconName = keyof typeof allIconNames

export interface IconProps extends ComponentProps<"svg"> {
  name: IconName
  size?: "small" | "normal" | "medium" | "large"
}

const SIZE_PX: Record<NonNullable<IconProps["size"]>, number> = {
  small: 16,
  normal: 20,
  medium: 24,
  large: 24,
}

export function Icon(props: IconProps) {
  const [local, others] = splitProps(props, ["name", "size", "class", "classList"])
  const sizePx = () => SIZE_PX[local.size ?? "normal"]
  const lucide = () => lucideIcons[local.name as string]
  const custom = () => customIcons[local.name as string]

  return (
    <div data-component="icon" data-size={local.size || "normal"}>
      {lucide() ? (
        <Dynamic
          component={lucide()}
          size={sizePx()}
          class={local.class}
          classList={local.classList}
          aria-hidden="true"
          {...others}
        />
      ) : (
        <svg
          data-slot="icon-svg"
          classList={{
            ...(local.classList || {}),
            [local.class ?? ""]: !!local.class,
          }}
          fill="none"
          viewBox="0 0 20 20"
          innerHTML={custom() ?? ""}
          aria-hidden="true"
          {...others}
        />
      )}
    </div>
  )
}
