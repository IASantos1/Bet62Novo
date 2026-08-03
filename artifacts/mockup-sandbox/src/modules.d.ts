declare module "@workspace/api-client-react" {
  export const setBaseUrl: any; export const setAuthTokenGetter: any;
  export type AuthTokenGetter = any;
  export class QueryClient { constructor(opts?: any); setQueryData: any; getQueryData: any; invalidateQueries: any; resetQueries: any; clear: any; }
  export const QueryClientProvider: any; export const HydrationBoundary: any;
  export function useQueryClient<T1 = any, T2 = any>(...args: any[]): any; export function useQuery<T1 = any, T2 = any>(...args: any[]): any;
  export function useMutation<T1 = any, T2 = any>(...args: any[]): any; export const keepPreviousData: any;
  export type UseQueryResult<T> = any; export type QueryKey = any;
  export function createQueryClient(opts?: any): any;
}

declare module "react" {
  export default function(...args: any[]): any;
  export function useState<T1 = any, T2 = any>(...args: any[]): any; export function useEffect<T1 = any, T2 = any>(...args: any[]): any; export function useMemo<T1 = any, T2 = any>(...args: any[]): any;
  export function useCallback<T1 = any, T2 = any>(...args: any[]): any; export function useRef<T1 = any, T2 = any>(...args: any[]): any; export function useContext<T1 = any, T2 = any>(...args: any[]): any;
  export function useReducer<T1 = any, T2 = any>(...args: any[]): any; export function useLayoutEffect<T1 = any, T2 = any>(...args: any[]): any;
  export function useId<T1 = any, T2 = any>(...args: any[]): any; export function createContext<T1 = any, T2 = any>(...args: any[]): any; export function createElement<T1 = any, T2 = any>(...args: any[]): any;
  export const Children: any; export function memo<T1 = any, T2 = any>(...args: any[]): any; export function forwardRef<T1 = any, T2 = any>(...args: any[]): any;
  export const Suspense: any; export const lazy: any; export const Fragment: any;
  export class Component<P = any, S = any> { props: P; state: S; setState: any; }
  export class PureComponent<P = any, S = any> { props: P; state: S; setState: any; }
  export type ReactNode = any; export type ReactElement = any;
  export type FC<P = any> = any; export type FunctionComponent<P = any> = any;
  export type ComponentProps<T> = any; export type ComponentPropsWithRef<T> = any;
  export type ComponentPropsWithoutRef<T> = any; export type ElementRef<T> = any;
  export type CSSProperties = any; export type RefObject<T> = any; export type MutableRefObject<T> = any;
  export type Context<T> = any; export type Dispatch<T> = any; export type SetStateAction<T> = any;
}
declare module "react/jsx-runtime" {
  export const Fragment: any; export const jsx: any; export const jsxs: any;
  export default function(...args: any[]): any;
}
declare module "react-dom" {
  export default function(...args: any[]): any;
  export const createPortal: any; export const flushSync: any; export const version: any;
}
declare module "react-dom/client" {
  export default function(...args: any[]): any;
  export const createRoot: any; export const hydrateRoot: any;
}
declare module "@tanstack/react-query" {
  export default function(...args: any[]): any;
  export class QueryClient { constructor(opts?: any); }
  export const QueryClientProvider: any; export const HydrationBoundary: any;
  export function useQueryClient<T1 = any, T2 = any>(...args: any[]): any; export function useQuery<T1 = any, T2 = any>(...args: any[]): any; export function useQueries<T1 = any, T2 = any>(...args: any[]): any;
  export function useMutation<T1 = any, T2 = any>(...args: any[]): any; export function useMutationState<T1 = any, T2 = any>(...args: any[]): any;
  export function useInfiniteQuery<T1 = any, T2 = any>(...args: any[]): any; export function useSuspenseQuery<T1 = any, T2 = any>(...args: any[]): any;
  export const keepPreviousData: any; export const skipToken: any;
  export const dehydrate: any; export const hydrate: any;
  export const MutationCache: any; export const QueryCache: any;
  export const onlineManager: any; export const hashKey: any;
}
declare module "@tanstack/react-query-devtools" {
  export default function(...args: any[]): any;
  export const ReactQueryDevtools: any;
}
declare module "wouter" {
  export default function(...args: any[]): any;
  export const Router: any; export const Route: any; export const Switch: any;
  export const Link: any; export const Redirect: any;
  export function useLocation<T1 = any, T2 = any>(...args: any[]): any;
  export function useRouter<T1 = any, T2 = any>(...args: any[]): any;
  export function useRoute<T1 = any, T2 = any>(...args: any[]): any;
  export function useParams<T1 = any, T2 = any>(...args: any[]): any;
  export function useNavigate<T1 = any, T2 = any>(...args: any[]): any;
}
declare module "wouter/use-location" {
  export function useLocation<T1 = any, T2 = any>(...args: any[]): any;
  export default function(...args: any[]): any;
}
declare module "clsx" {
  export const clsx: any;
  export default function(...args: any[]): any;
}
declare module "class-variance-authority" {
  export default function(...args: any[]): any;
  export type VariantProps<T> = any; export const cx: any;
}
declare module "tailwind-merge" {
  export default function(...args: any[]): any;
  export const twMerge: any; export const extendTailwindMerge: any; export const twJoin: any;
}
declare module "lucide-react" {
  export default function(...args: any[]): any;
  export const Home: any; export const Menu: any; export const X: any; export const Check: any;
  export const ChevronLeft: any; export const ChevronRight: any; export const ChevronUp: any; export const ChevronDown: any;
  export const Settings: any; export const User: any; export const Search: any; export const Plus: any;
  export const ArrowLeft: any; export const ArrowRight: any; export const ArrowUp: any; export const ArrowDown: any;
  export const Eye: any; export const EyeOff: any; export const Lock: any; export const Unlock: any;
  export const Play: any; export const Pause: any; export const RefreshCw: any; export const RotateCcw: any;
  export const Sun: any; export const Moon: any; export const Monitor: any;
  export const Trophy: any; export const DollarSign: any; export const Wallet: any; export const Sparkles: any;
  export const BarChart3: any; export const PieChart: any; export const TrendingUp: any; export const TrendingDown: any;
  export const Info: any; export const AlertCircle: any; export const HelpCircle: any;
  export const Loader2: any; export const Spinner: any;
  export const Video: any; export const Tv: any; export const Radio: any; export const CircleDot: any;
  export const LogIn: any; export const LogOut: any; export const Bell: any;
  export const Download: any; export const Upload: any; export const Copy: any; export const ExternalLink: any;
  export const FileText: any; export const FileJson: any; export const File: any;
  export const Folder: any; export const FolderOpen: any; export const Database: any; export const Server: any;
  export const Globe: any; export const Languages: any; export const Hash: any;
  export const Edit: any; export const Trash: any; export const MoreVertical: any; export const MoreHorizontal: any;
  export const Minimize: any; export const Maximize: any;
  export const Dice1: any; export const Dice2: any; export const Dice3: any; export const Dice4: any;
  export const Dice5: any; export const Dice6: any; export const SlotMachine: any;
  export const Layers: any; export const CheckCircle2: any; export const BarChart2: any;
  export const GripVertical: any; export const Loader2Icon: any; export const PanelLeftIcon: any;
  export const ChevronDownIcon: any; export const ChevronLeftIcon: any; export const ChevronRightIcon: any;
  export const AlertTriangle: any; export const Circle: any; export const ChevronUp: any;
}
declare module "framer-motion" {
  export default function(...args: any[]): any;
  export const motion: any; export const AnimatePresence: any;
  export function useMotionValue<T1 = any, T2 = any>(...args: any[]): any; export function useTransform<T1 = any, T2 = any>(...args: any[]): any;
  export function useSpring<T1 = any, T2 = any>(...args: any[]): any; export function useInView<T1 = any, T2 = any>(...args: any[]): any;
  export const LayoutGroup: any; export const MotionConfig: any;
  export const domAnimation: any;
  export const animate: any; export const stagger: any;
  export type Variants = any; export type Transition = any; export type MotionProps = any;
}
declare module "react-hook-form" {
  export default function(...args: any[]): any;
  export function useForm<T1 = any, T2 = any>(...args: any[]): any; export function useController<T1 = any, T2 = any>(...args: any[]): any;
  export function useFormContext<T1 = any, T2 = any>(...args: any[]): any; export const FormProvider: any; export const Controller: any;
  export type Control = any; export type FieldValues = any;
  export type FieldErrors = any; export type FieldError = any;
  export type UseFormRegisterReturn = any; export type SubmitHandler = any;
}
declare module "@hookform/resolvers" {
  export default function(...args: any[]): any;
  export const zodResolver: any; export const yupResolver: any;
}
declare module "@hookform/resolvers/zod" {
  export const zodResolver: any;
  export default function(...args: any[]): any;
}
declare module "zod" {
  export default function(...args: any[]): any;
  export const z: any; export const ZodError: any; export type ZodSchema = any;
  export type ZodTypeAny = any; export type ZodObject<T = any> = any;
  export type infer<T> = any; export type input<T> = any; export type output<T> = any;
}
declare module "date-fns" {
  export default function(...args: any[]): any;
  export const format: any; export const parseISO: any;
  export const addDays: any; export const addHours: any; export const differenceInDays: any;
  export const isAfter: any; export const isBefore: any; export const isValid: any;
  export const isSameDay: any; export const isToday: any; export const isPast: any; export const isFuture: any;
  export const formatDistanceToNow: any; export const startOfDay: any; export const endOfDay: any;
}
declare module "date-fns/locale" {
  export default function(...args: any[]): any;
  export const ptBR: any; export const enUS: any; export const es: any;
}
declare module "react-day-picker" {
  export default function(...args: any[]): any;
  export const DayPicker: any; export type DayPickerProps = any;
}
declare module "next-themes" {
  export default function(...args: any[]): any;
  export const ThemeProvider: any; export function useTheme<T1 = any, T2 = any>(...args: any[]): any;
}
declare module "embla-carousel-react" {
  export function useEmblaCarousel<T1 = any, T2 = any>(...args: any[]): any;
  export default function(...args: any[]): any;
}
declare module "react-resizable-panels" {
  export default function(...args: any[]): any;
  export const PanelGroup: any; export const Panel: any; export const PanelResizeHandle: any;
}
declare module "recharts" {
  export default function(...args: any[]): any;
  export const LineChart: any; export const BarChart: any; export const PieChart: any;
  export const AreaChart: any; export const ComposedChart: any;
  export const Line: any; export const Bar: any; export const Pie: any; export const Area: any;
  export const XAxis: any; export const YAxis: any; export const CartesianGrid: any;
  export const Tooltip: any; export const Legend: any; export const ResponsiveContainer: any;
  export const ReferenceLine: any; export const Cell: any;
}
declare module "sonner" {
  export default function(...args: any[]): any;
  export const Toaster: any; export const toast: any;
}
declare module "vaul" {
  export default function(...args: any[]): any;
  export const Drawer: any;
  export namespace Drawer {
    export const Portal: any; export const Overlay: any; export const Trigger: any;
    export const Close: any; export const Content: any; export const Header: any;
    export const Title: any; export const Description: any; export const Footer: any; export const Handle: any;
  }
}
declare module "input-otp" {
  export default function(...args: any[]): any;
  export const OTPInput: any; export const Slot: any;
}
declare module "cmdk" {
  export default function(...args: any[]): any;
  export const Command: any;
  export namespace Command {
    export const Dialog: any; export const Input: any; export const List: any; export const Empty: any; export const Group: any; export const Item: any; export const Separator: any; export const Loading: any;
  }
}
declare module "hls.js" {
  export default function(...args: any[]): any;
  export class Hls { constructor(config?: any); loadSource: any; attachMedia: any; on: any; destroy: any; }
  export const Events: any; export const ErrorTypes: any; export const ErrorDetails: any;
  export const isSupported: any;
}

declare module "@radix-ui/react-accordion" {
  export default function(...args: any[]): any;
  export const Root: any; export const Item: any; export const Header: any; export const Trigger: any; export const Content: any;
}
declare module "@radix-ui/react-alert-dialog" {
  export default function(...args: any[]): any;
  export const Root: any; export const Trigger: any; export const Portal: any; export const Overlay: any; export const Content: any; export const Action: any; export const Cancel: any; export const Title: any; export const Description: any;
}
declare module "@radix-ui/react-aspect-ratio" {
  export default function(...args: any[]): any;
  export const Root: any;
}
declare module "@radix-ui/react-avatar" {
  export default function(...args: any[]): any;
  export const Root: any; export const Image: any; export const Fallback: any;
}
declare module "@radix-ui/react-card" {
  export default function(...args: any[]): any;
  export const Root: any; export const Header: any; export const Footer: any; export const Title: any; export const Description: any; export const Action: any; export const Content: any;
}
declare module "@radix-ui/react-checkbox" {
  export default function(...args: any[]): any;
  export const Root: any; export const Indicator: any; export type CheckedState = any;
}
declare module "@radix-ui/react-collapsible" {
  export default function(...args: any[]): any;
  export const Root: any; export const Trigger: any; export const Content: any;
}
declare module "@radix-ui/react-dialog" {
  export default function(...args: any[]): any;
  export const Root: any; export const Trigger: any; export const Portal: any; export const Overlay: any; export const Close: any; export const Content: any; export const Title: any; export const Description: any;
}
declare module "@radix-ui/react-dropdown-menu" {
  export default function(...args: any[]): any;
  export const Root: any; export const Trigger: any; export const Portal: any; export const Content: any; export const Arrow: any; export const Item: any; export const Group: any; export const Label: any; export const Separator: any; export const CheckboxItem: any; export const RadioGroup: any; export const RadioItem: any; export const Sub: any; export const SubTrigger: any; export const SubContent: any;
}
declare module "@radix-ui/react-form" {
  export default function(...args: any[]): any;
  export const Root: any; export const Field: any; export const Label: any; export const Control: any; export const Message: any; export const Submit: any;
}
declare module "@radix-ui/react-hover-card" {
  export default function(...args: any[]): any;
  export const Root: any; export const Trigger: any; export const Portal: any; export const Content: any;
}
declare module "@radix-ui/react-label" {
  export default function(...args: any[]): any;
  export const Root: any;
}
declare module "@radix-ui/react-navigation-menu" {
  export default function(...args: any[]): any;
  export const Root: any; export const List: any; export const Item: any; export const Link: any; export const Trigger: any; export const Content: any; export const Viewport: any; export const Indicator: any;
}
declare module "@radix-ui/react-popover" {
  export default function(...args: any[]): any;
  export const Root: any; export const Trigger: any; export const Anchor: any; export const Portal: any; export const Content: any; export const Arrow: any; export const Close: any;
}
declare module "@radix-ui/react-progress" {
  export default function(...args: any[]): any;
  export const Root: any; export const Indicator: any;
}
declare module "@radix-ui/react-radio-group" {
  export default function(...args: any[]): any;
  export const Root: any; export const Item: any; export const Indicator: any;
}
declare module "@radix-ui/react-scroll-area" {
  export default function(...args: any[]): any;
  export const Root: any; export const Viewport: any; export const Scrollbar: any; export const Thumb: any; export const Corner: any;
}
declare module "@radix-ui/react-select" {
  export default function(...args: any[]): any;
  export const Root: any; export const Trigger: any; export const Portal: any; export const Content: any; export const Viewport: any; export const Group: any; export const Label: any; export const Item: any; export const ItemText: any; export const ItemIndicator: any; export const Separator: any; export const Arrow: any; export const Value: any; export const Icon: any; export const ScrollUpButton: any; export const ScrollDownButton: any;
}
declare module "@radix-ui/react-separator" {
  export default function(...args: any[]): any;
  export const Root: any;
}
declare module "@radix-ui/react-slider" {
  export default function(...args: any[]): any;
  export const Root: any; export const Track: any; export const Range: any; export const Thumb: any;
}
declare module "@radix-ui/react-switch" {
  export default function(...args: any[]): any;
  export const Root: any; export const Thumb: any;
}
declare module "@radix-ui/react-table" {
  export default function(...args: any[]): any;
  export const Table: any; export const Header: any; export const Body: any; export const Footer: any; export const Head: any; export const Row: any; export const Cell: any;
}
declare module "@radix-ui/react-tabs" {
  export default function(...args: any[]): any;
  export const Root: any; export const List: any; export const Trigger: any; export const Content: any;
}
declare module "@radix-ui/react-textarea" {
  export default function(...args: any[]): any;
  export const Textarea: any;
}
declare module "@radix-ui/react-toast" {
  export default function(...args: any[]): any;
  export const Provider: any; export const Viewport: any; export const Root: any; export const Title: any; export const Description: any; export const Action: any; export const Close: any;
}
declare module "@radix-ui/react-toggle" {
  export default function(...args: any[]): any;
  export const Root: any;
}
declare module "@radix-ui/react-toggle-group" {
  export default function(...args: any[]): any;
  export const Root: any; export const Item: any;
}
declare module "@radix-ui/react-toolbar" {
  export default function(...args: any[]): any;
  export const Root: any; export const Button: any; export const Separator: any;
}
declare module "@radix-ui/react-tooltip" {
  export default function(...args: any[]): any;
  export const Provider: any; export const Root: any; export const Trigger: any; export const Portal: any; export const Content: any; export const Arrow: any;
}
declare module "@radix-ui/react-slot" {
  export const Slot: any; export const Slottable: any;
  export default function(...args: any[]): any;
}
declare module "@radix-ui/react-presence" {
  export const Presence: any;
  export default function(...args: any[]): any;
}
declare module "@radix-ui/react-primitive" {
  export default function(...args: any[]): any;
  export const Primitive: any;
  export namespace Primitive { export const Root: any; }
}
declare module "@radix-ui/react-use-controllable-state" {
  export function useControllableState<T1 = any, T2 = any>(...args: any[]): any;
  export default function(...args: any[]): any;
}
declare module "@radix-ui/react-direction" {
  export const DirectionProvider: any; export function useDirection<T1 = any, T2 = any>(...args: any[]): any;
  export default function(...args: any[]): any;
}
declare module "@radix-ui/react-dismissable-layer" {
  export const DismissableLayer: any;
  export default function(...args: any[]): any;
}
declare module "@radix-ui/react-focus-scope" {
  export const FocusScope: any;
  export default function(...args: any[]): any;
}
declare module "@radix-ui/react-id" {
  export function useId<T1 = any, T2 = any>(...args: any[]): any; export const createId: any;
  export default function(...args: any[]): any;
}
declare module "@radix-ui/react-portal" {
  export default function(...args: any[]): any;
  export const Portal: any;
}
declare module "@radix-ui/react-menu" {
  export default function(...args: any[]): any;
  export const Root: any; export const Trigger: any; export const Portal: any; export const Content: any; export const Arrow: any; export const Item: any; export const Group: any; export const Label: any; export const Separator: any; export const CheckboxItem: any; export const RadioGroup: any; export const RadioItem: any;
}

declare module "fast-glob"; declare module "chokidar"; declare module "picomatch"; declare module "glob"; declare module "minimatch";
declare module "fs"; declare module "fs/promises"; declare module "path"; declare module "path/posix"; declare module "path/win32";
declare module "events"; declare module "stream"; declare module "util"; declare module "crypto"; declare module "os";
declare module "process"; declare module "buffer"; declare module "url"; declare module "timers"; declare module "tty";
declare module "net"; declare module "tls"; declare module "dgram"; declare module "dns"; declare module "child_process";
declare module "worker_threads"; declare module "readline";
declare module "node:fs"; declare module "node:fs/promises";
declare module "node:path"; declare module "node:path/posix"; declare module "node:path/win32";
declare module "node:events"; declare module "node:stream"; declare module "node:util";
declare module "node:crypto"; declare module "node:os"; declare module "node:process";
declare module "node:buffer"; declare module "node:url"; declare module "node:timers";
declare module "node:tty"; declare module "node:net"; declare module "node:tls";
declare module "node:dgram"; declare module "node:dns"; declare module "node:child_process";
declare module "node:worker_threads"; declare module "node:readline";

declare module "vite"; declare module "@vitejs/plugin-react"; declare module "@vitejs/plugin-react-swc";
declare module "vite/client" {
  interface ImportMetaEnv { readonly [key: string]: any }
  interface ImportMeta { readonly url: string; readonly env: ImportMetaEnv; readonly hot?: any; readonly glob: any; readonly resolve: any; }
}
declare module "react-is"; declare module "nanoid"; declare module "uuid"; declare module "immer"; declare module "zustand";
declare module "axios"; declare module "jose"; declare module "superjson"; declare module "dequal"; declare module "mitt";
declare module "tiny-invariant"; declare module "ts-pattern"; declare module "valibot"; declare module "type-fest";
declare module "ms"; declare module "pretty-ms"; declare module "qs"; declare module "query-string";
declare module "cookie-es"; declare module "cookie"; declare module "debounce"; declare module "throttle";
declare module "dotenv"; declare module "esbuild"; declare module "rollup"; declare module "magic-string";

declare module "*.svg"; declare module "*.png"; declare module "*.jpg"; declare module "*.jpeg"; declare module "*.gif";
declare module "*.webp"; declare module "*.avif"; declare module "*.ico"; declare module "*.bmp";
declare module "*.module.css"; declare module "*.module.scss"; declare module "*.css";
declare module "*.scss"; declare module "*.sass"; declare module "*.less"; declare module "*.json";
declare module "*.json5"; declare module "*.yaml"; declare module "*.yml"; declare module "*.md";
declare module "*.txt"; declare module "*.woff"; declare module "*.woff2"; declare module "*.ttf";
declare module "*.pdf";
