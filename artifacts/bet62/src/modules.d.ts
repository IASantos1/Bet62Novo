declare module "@workspace/api-client-react" {
  export const setBaseUrl: any; export const setAuthTokenGetter: any;
  export type AuthTokenGetter = any;
  export function createQueryClient(opts?: any): any;
  export class QueryClient { constructor(opts?: any); setQueryData: any; getQueryData: any; invalidateQueries: any; resetQueries: any; refetchQueries: any; fetchQuery: any; prefetchQuery: any; isFetching: any; isMutating: any; removeQueries: any; clear: any; on: any; }
  export const QueryClientProvider: any; export const HydrationBoundary: any;
  export function useQueryClient<T1 = any, T2 = any>(...args: any[]): any; export function useQuery<T1 = any, T2 = any>(...args: any[]): any; export function useQueries<T1 = any, T2 = any>(...args: any[]): any;
  export function useMutation<T1 = any, T2 = any>(...args: any[]): any; export function useMutationState<T1 = any, T2 = any>(...args: any[]): any;
  export function useInfiniteQuery<T1 = any, T2 = any>(...args: any[]): any; export function useSuspenseQuery<T1 = any, T2 = any>(...args: any[]): any;
  export const keepPreviousData: any; export const skipToken: any;
  export const dehydrate: any; export const hydrate: any;
  export const MutationCache: any; export const QueryCache: any;
  export const onlineManager: any; export const focusManager: any;
  export const hashKey: any; export const notifyManager: any;
  export type UseQueryResult<T> = any; export type UseMutationResult<TData, TError, TVariables> = any;
  export type QueryKey = any; export type QueryClientConfig = any;
  export type UseQueryOptions = any; export type UseMutationOptions = any;
  export type InfiniteData<T> = any;
}

declare module "react" {
  export default function(...args: any[]): any;
  export function useState<T1 = any, T2 = any>(...args: any[]): any; export function useEffect<T1 = any, T2 = any>(...args: any[]): any; export function useMemo<T1 = any, T2 = any>(...args: any[]): any;
  export function useCallback<T1 = any, T2 = any>(...args: any[]): any; export function useRef<T1 = any, T2 = any>(...args: any[]): any; export function useContext<T1 = any, T2 = any>(...args: any[]): any;
  export function useReducer<T1 = any, T2 = any>(...args: any[]): any; export function useLayoutEffect<T1 = any, T2 = any>(...args: any[]): any;
  export function useImperativeHandle<T1 = any, T2 = any>(...args: any[]): any; export function useId<T1 = any, T2 = any>(...args: any[]): any;
  export function useSyncExternalStore<T1 = any, T2 = any>(...args: any[]): any; export function useDeferredValue<T1 = any, T2 = any>(...args: any[]): any;
  export function useTransition<T1 = any, T2 = any>(...args: any[]): any; export function useInsertionEffect<T1 = any, T2 = any>(...args: any[]): any;
  export function useOptimistic<T1 = any, T2 = any>(...args: any[]): any; export function useActionState<T1 = any, T2 = any>(...args: any[]): any;
  export function createContext<T1 = any, T2 = any>(...args: any[]): any; export function createElement<T1 = any, T2 = any>(...args: any[]): any;
  export function cloneElement<T1 = any, T2 = any>(...args: any[]): any; export const isValidElement: any;
  export const Children: any;
  export function memo<T1 = any, T2 = any>(...args: any[]): any; export function forwardRef<T1 = any, T2 = any>(...args: any[]): any;
  export function startTransition<T1 = any, T2 = any>(...args: any[]): any; export const cache: any;
  export const Suspense: any; export const lazy: any; export const Fragment: any;
  export const StrictMode: any; export const Profiler: any;
  export const version: any;
  export class Component<P = any, S = any> { props: P; state: S; setState: any; forceUpdate: any; }
  export class PureComponent<P = any, S = any> { props: P; state: S; setState: any; forceUpdate: any; }
  export type ReactNode = any; export type ReactElement = any; export type ReactFragment = any;
  export type ReactPortal = any; export type ComponentType<P = any> = any;
  export type FC<P = any> = any; export type FunctionComponent<P = any> = any;
  export type ComponentProps<T> = any; export type ComponentPropsWithRef<T> = any;
  export type ComponentPropsWithoutRef<T> = any; export type ElementRef<T> = any;
  export type ElementType = any; export type CSSProperties = any;
  export type RefObject<T> = any; export type MutableRefObject<T> = any; export type Ref<T> = any;
  export type Key = any; export type Context<T> = any; export type ProviderProps<T> = any;
  export type Dispatch<T> = any; export type SetStateAction<T> = any;
}
declare module "react/jsx-runtime" {
  export const Fragment: any; export const jsx: any; export const jsxs: any; export const jsxDEV: any;
  export default function(...args: any[]): any;
}
declare module "react/jsx-dev-runtime" {
  export const Fragment: any; export const jsxDEV: any; export const jsxs: any;
  export default function(...args: any[]): any;
}
declare module "react-dom" {
  export default function(...args: any[]): any;
  export const createPortal: any; export const flushSync: any;
  export const render: any; export const hydrate: any;
  export const unmountComponentAtNode: any; export const version: any;
}
declare module "react-dom/client" {
  export default function(...args: any[]): any;
  export const createRoot: any; export const hydrateRoot: any;
}
declare module "react-dom/server" {
  export default function(...args: any[]): any;
  export const renderToString: any; export const renderToStaticMarkup: any;
  export const renderToNodeStream: any; export const renderToReadableStream: any;
}
declare module "@tanstack/react-query" {
  export default function(...args: any[]): any;
  export class QueryClient { constructor(opts?: any); setQueryData: any; getQueryData: any; invalidateQueries: any; resetQueries: any; refetchQueries: any; fetchQuery: any; prefetchQuery: any; clear: any; }
  export const QueryClientProvider: any; export const HydrationBoundary: any;
  export function useQueryClient<T1 = any, T2 = any>(...args: any[]): any; export function useQuery<T1 = any, T2 = any>(...args: any[]): any; export function useQueries<T1 = any, T2 = any>(...args: any[]): any;
  export function useMutation<T1 = any, T2 = any>(...args: any[]): any; export function useMutationState<T1 = any, T2 = any>(...args: any[]): any;
  export function useInfiniteQuery<T1 = any, T2 = any>(...args: any[]): any; export function useSuspenseQuery<T1 = any, T2 = any>(...args: any[]): any;
  export function useSuspenseInfiniteQuery<T1 = any, T2 = any>(...args: any[]): any; export function useSuspenseQueries<T1 = any, T2 = any>(...args: any[]): any;
  export const keepPreviousData: any; export const skipToken: any;
  export const dehydrate: any; export const hydrate: any;
  export const MutationCache: any; export const QueryCache: any;
  export const onlineManager: any; export const focusManager: any;
  export const hashKey: any; export const notifyManager: any;
  export const isFetching: any; export const isMutating: any;
  export type UseQueryResult<T> = any; export type UseMutationResult<TData, TError, TVariables> = any;
  export type QueryObserverResult<T> = any; export type QueryKey = any;
  export type QueryClientConfig = any; export type DefaultOptions = any;
  export type UseQueryOptions = any; export type UseMutationOptions = any;
  export type UseInfiniteQueryOptions = any; export type InfiniteData<T> = any;
}
declare module "@tanstack/react-query-devtools" {
  export default function(...args: any[]): any;
  export const ReactQueryDevtools: any; export const ReactQueryDevtoolsPanel: any;
}
declare module "@tanstack/query-core" {
  export default function(...args: any[]): any;
  export class QueryClient { constructor(opts?: any); }
  export const MutationObserver: any; export const QueryObserver: any;
  export const InfiniteQueryObserver: any; export const QueriesObserver: any;
  export const MutationCache: any; export const QueryCache: any;
  export const hashKey: any; export const onlineManager: any; export const focusManager: any;
}
declare module "wouter" {
  export default function(...args: any[]): any;
  export const Router: any; export const Route: any; export const Switch: any;
  export const Link: any; export const Redirect: any; export function useLocation<T1 = any, T2 = any>(...args: any[]): any;
  export function useRouter<T1 = any, T2 = any>(...args: any[]): any; export function useRoute<T1 = any, T2 = any>(...args: any[]): any;
  export function useParams<T1 = any, T2 = any>(...args: any[]): any; export function useNavigate<T1 = any, T2 = any>(...args: any[]): any;
}
declare module "wouter/use-location" {
  export function useLocation<T1 = any, T2 = any>(...args: any[]): any;
  export default function(...args: any[]): any;
}
declare module "wouter/matcher" {
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
  export const twMerge: any; export const extendTailwindMerge: any;
  export const twJoin: any; export const createTailwindMerge: any;
  export const getDefaultConfig: any; export const mergeConfigs: any;
  export const fromTheme: any; export const mergeClassLists: any;
}
declare module "lucide-react" {
  export default function(...args: any[]): any;
  export const ArrowLeft: any; export const ArrowRight: any; export const ArrowUp: any; export const ArrowDown: any;
  export const Home: any; export const Menu: any; export const X: any; export const Check: any;
  export const ChevronLeft: any; export const ChevronRight: any; export const ChevronUp: any; export const ChevronDown: any;
  export const Settings: any; export const User: any; export const Users: any; export const Search: any;
  export const Plus: any; export const Minus: any; export const Edit: any; export const Trash: any;
  export const Eye: any; export const EyeOff: any; export const Lock: any; export const Unlock: any;
  export const Mail: any; export const Phone: any; export const Calendar: any; export const Clock: any;
  export const DollarSign: any; export const CreditCard: any; export const Wallet: any; export const Banknote: any;
  export const Trophy: any; export const Medal: any; export const Star: any; export const Crown: any;
  export const Ticket: any; export const Dice1: any; export const Dice2: any; export const Dice3: any;
  export const Dice4: any; export const Dice5: any; export const Dice6: any; export const SlotMachine: any;
  export const BarChart3: any; export const PieChart: any; export const TrendingUp: any; export const TrendingDown: any;
  export const Info: any; export const AlertCircle: any; export const AlertTriangle: any; export const AlertOctagon: any;
  export const HelpCircle: any; export const MessageCircle: any; export const Send: any; export const Share: any;
  export const Download: any; export const Upload: any; export const Copy: any; export const ExternalLink: any;
  export const LogIn: any; export const LogOut: any; export const RefreshCw: any; export const RotateCcw: any;
  export const Play: any; export const Pause: any; export const Volume2: any; export const VolumeX: any;
  export const Maximize: any; export const Minimize: any; export const MoreVertical: any; export const MoreHorizontal: any;
  export const Loader2: any; export const Spinner: any;
  export const Sun: any; export const Moon: any; export const Monitor: any; export const Palette: any;
  export const ShoppingCart: any; export const Package: any; export const Gift: any; export const Sparkles: any;
  export const Zap: any; export const Flame: any; export const Heart: any; export const ThumbsUp: any;
  export const Filter: any; export const SortAsc: any; export const SortDesc: any; export const Grid3X3: any;
  export const List: any; export const LayoutDashboard: any; export const Flag: any; export const Bell: any;
  export const Gamepad2: any; export const Target: any; export const Percent: any; export const BadgePercent: any;
  export const Shield: any; export const ShieldCheck: any; export const ShieldAlert: any; export const ShieldX: any;
  export const Video: any; export const Radio: any; export const Tv: any; export const CircleDot: any;
  export const Circle: any; export const Activity: any; export const HeartPulse: any;
  export const LineChart: any; export const Gauge: any; export const Timer: any; export const Hourglass: any;
  export const FileText: any; export const FileSpreadsheet: any; export const FileJson: any; export const File: any;
  export const Folder: any; export const FolderOpen: any; export const Database: any; export const Server: any;
  export const Globe: any; export const MapPin: any; export const Languages: any; export const Hash: any;
  export const AtSign: any; export const Key: any; export const KeyRound: any; export const Ban: any;
  export const FileCheck: any; export const CheckCircle: any; export const XCircle: any;
  export const Pencil: any; export const Eraser: any; export const Clipboard: any; export const ClipboardCopy: any;
  export const QrCode: any; export const Scan: any; export const ScanLine: any;
  export const Camera: any; export const Image: any; export const Images: any;
  export const Sword: any; export const Swords: any;
  export const Wine: any; export const Beer: any; export const Coffee: any; export const Cake: any;
  export const Car: any; export const Plane: any; export const Bike: any; export const Truck: any;
  export const Leaf: any; export const TreePine: any; export const Flower: any; export const Shell: any;
  export const Layers: any; export const CheckCircle2: any; export const BarChart2: any;
  export const GripVertical: any; export const Loader2Icon: any; export const PanelLeftIcon: any;
  export const ChevronDownIcon: any; export const ChevronLeftIcon: any; export const ChevronRightIcon: any;
}
declare module "framer-motion" {
  export default function(...args: any[]): any;
  export const motion: any; export const AnimatePresence: any;
  export const motionValue: any; export function useMotionValue<T1 = any, T2 = any>(...args: any[]): any;
  export function useTransform<T1 = any, T2 = any>(...args: any[]): any; export function useSpring<T1 = any, T2 = any>(...args: any[]): any;
  export function useTime<T1 = any, T2 = any>(...args: any[]): any; export function useAnimationFrame<T1 = any, T2 = any>(...args: any[]): any;
  export function useInView<T1 = any, T2 = any>(...args: any[]): any; export function useReducedMotion<T1 = any, T2 = any>(...args: any[]): any;
  export function useScroll<T1 = any, T2 = any>(...args: any[]): any; export function useElementScroll<T1 = any, T2 = any>(...args: any[]): any;
  export function useVelocity<T1 = any, T2 = any>(...args: any[]): any; export function useCycle<T1 = any, T2 = any>(...args: any[]): any;
  export function useAnimation<T1 = any, T2 = any>(...args: any[]): any; export function useDragControls<T1 = any, T2 = any>(...args: any[]): any;
  export function useMotionTemplate<T1 = any, T2 = any>(...args: any[]): any;
  export const Reorder: any; export const LayoutGroup: any;
  export const MotionConfig: any; export const LazyMotion: any;
  export const domAnimation: any; export const domMax: any;
  export const m: any; export const animate: any; export const timeline: any; export const stagger: any;
  export const transform: any; export const clamp: any; export const wrap: any; export const interpolate: any;
  export type Variants = any; export type Transition = any; export type MotionProps = any;
}
declare module "framer-motion/client" {
  export default function(...args: any[]): any;
  export const motion: any; export const AnimatePresence: any;
}
declare module "framer-motion/dom" {
  export default function(...args: any[]): any;
  export const motion: any; export const AnimatePresence: any; export const domAnimation: any;
}
declare module "react-hook-form" {
  export default function(...args: any[]): any;
  export function useForm<T1 = any, T2 = any>(...args: any[]): any; export function useController<T1 = any, T2 = any>(...args: any[]): any;
  export function useFormContext<T1 = any, T2 = any>(...args: any[]): any; export const useFieldArray: any;
  export const useFormState: any; export const useWatch: any;
  export const FormProvider: any; export const Controller: any;
  export type UseFormReturn = any; export type UseFormProps = any;
  export type Control = any; export type FieldValues = any;
  export type FieldErrors = any; export type FieldError = any;
  export type UseFormRegisterReturn = any;
  export type UseFieldArrayReturn = any;
  export type SubmitHandler = any;
  export const append: any; export const prepend: any; export const remove: any;
  export const insert: any; export const swap: any; export const move: any;
}
declare module "@hookform/resolvers" {
  export default function(...args: any[]): any;
  export const zodResolver: any; export const yupResolver: any;
  export const joiResolver: any; export const valibotResolver: any;
}
declare module "@hookform/resolvers/zod" {
  export const zodResolver: any;
  export default function(...args: any[]): any;
}
declare module "zod" {
  export default function(...args: any[]): any;
  export const z: any; export const ZodError: any; export type ZodError = any;
  export type ZodSchema = any; export type ZodTypeAny = any;
  export type ZodString = any; export type ZodNumber = any; export type ZodBoolean = any;
  export type ZodObject<T = any> = any; export type ZodArray = any;
  export type infer<T> = any; export type input<T> = any; export type output<T> = any;
  export type SafeParseReturnType<T, U> = any;
}
declare module "zod/v4" {
  export default function(...args: any[]): any;
  export const z: any; export const ZodError: any; export type ZodSchema = any; export type infer<T> = any;
}
declare module "date-fns" {
  export default function(...args: any[]): any;
  export const format: any; export const parse: any; export const parseISO: any;
  export const addDays: any; export const addHours: any; export const addMinutes: any;
  export const addMonths: any; export const addWeeks: any; export const addYears: any;
  export const subDays: any; export const subHours: any; export const differenceInDays: any;
  export const differenceInHours: any; export const differenceInMinutes: any;
  export const isAfter: any; export const isBefore: any; export const isEqual: any;
  export const isValid: any; export const isSameDay: any; export const isSameMonth: any;
  export const isToday: any; export const isPast: any; export const isFuture: any;
  export const endOfDay: any; export const endOfMonth: any; export const endOfWeek: any; export const endOfYear: any;
  export const startOfDay: any; export const startOfMonth: any; export const startOfWeek: any; export const startOfYear: any;
  export const formatDistance: any; export const formatDistanceToNow: any;
  export const formatRelative: any; export const max: any; export const min: any;
  export const getHours: any; export const getMinutes: any; export const getSeconds: any;
  export const getDay: any; export const getMonth: any; export const getYear: any; export const getDate: any;
  export const setHours: any; export const setMinutes: any;
  export const setDate: any; export const setMonth: any; export const setYear: any;
  export const toDate: any; export const eachDayOfInterval: any;
}
declare module "date-fns/locale" {
  export default function(...args: any[]): any;
  export const ptBR: any; export const enUS: any; export const es: any;
}
declare module "react-day-picker" {
  export default function(...args: any[]): any;
  export const DayPicker: any; export const useDayPicker: any; export type DayPickerProps = any; export type Mode = any;
}
declare module "next-themes" {
  export default function(...args: any[]): any;
  export const ThemeProvider: any; export function useTheme<T1 = any, T2 = any>(...args: any[]): any; export type ThemeProviderProps = any;
}
declare module "embla-carousel-react" {
  export function useEmblaCarousel<T1 = any, T2 = any>(...args: any[]): any;
  export default function(...args: any[]): any;
}
declare module "embla-carousel-autoplay" {
  export const Autoplay: any;
  export default function(...args: any[]): any;
}
declare module "embla-carousel-fade" {
  export const Fade: any;
  export default function(...args: any[]): any;
}
declare module "react-resizable-panels" {
  export default function(...args: any[]): any;
  export const PanelGroup: any; export const Panel: any;
  export const PanelResizeHandle: any; export const PanelCollapse: any;
  export const ImperativePanelHandle: any; export const ImperativePanelGroupHandle: any;
}
declare module "recharts" {
  export default function(...args: any[]): any;
  export const LineChart: any; export const BarChart: any; export const PieChart: any;
  export const AreaChart: any; export const ScatterChart: any; export const ComposedChart: any;
  export const RadarChart: any; export const RadialBarChart: any;
  export const Line: any; export const Bar: any; export const Pie: any; export const Area: any;
  export const Scatter: any; export const Radar: any; export const RadialBar: any;
  export const XAxis: any; export const YAxis: any; export const CartesianGrid: any;
  export const Tooltip: any; export const Legend: any; export const ResponsiveContainer: any;
  export const Brush: any; export const ReferenceLine: any; export const ReferenceDot: any;
  export const ReferenceArea: any; export const Label: any; export const LabelList: any;
  export const Cell: any; export const PolarAngleAxis: any; export const PolarRadiusAxis: any; export const PolarGrid: any;
}
declare module "sonner" {
  export default function(...args: any[]): any;
  export const Toaster: any; export const toast: any; export const useToast: any;
  export type ToasterProps = any; export type ToastT = any;
}
declare module "vaul" {
  export default function(...args: any[]): any;
  export const Drawer: any;
  export namespace Drawer {
    export const Portal: any; export const Overlay: any; export const Trigger: any;
    export const Close: any; export const Content: any; export const Header: any;
    export const Title: any; export const Description: any; export const Footer: any;
    export const Handle: any;
  }
}
declare module "input-otp" {
  export default function(...args: any[]): any;
  export const OTPInput: any; export const Slot: any;
  export type OTPInputProps = any;
}
declare module "cmdk" {
  export default function(...args: any[]): any;
  export const Command: any;
  export namespace Command {
    export const Dialog: any; export const Input: any; export const List: any;
    export const Empty: any; export const Group: any; export const Item: any;
    export const Shortcut: any; export const Separator: any; export const Label: any;
    export const Loading: any;
  }
}
declare module "hls.js" {
  export default function(...args: any[]): any;
  export class Hls { constructor(config?: any); loadSource: any; attachMedia: any; on: any; off: any; destroy: any; recoverMediaError: any; startLoad: any; stopLoad: any; levels: any; currentLevel: any; }
  export const Events: any; export const ErrorTypes: any; export const ErrorDetails: any;
  export const isSupported: any; export const version: any; export const Loader: any;
}
declare module "@stripe/stripe-js" {
  export default function(...args: any[]): any;
  export const loadStripe: any; export type Stripe = any; export type StripeElementsOptions = any;
}
declare module "@stripe/react-stripe-js" {
  export default function(...args: any[]): any;
  export const Elements: any; export const ElementsConsumer: any;
  export const useStripe: any; export const useElements: any;
  export const CardElement: any; export const CardNumberElement: any;
  export const CardExpiryElement: any; export const CardCvcElement: any;
  export const PaymentElement: any; export const LinkAuthenticationElement: any;
}
declare module "vite/client" {
  interface ImportMetaEnv { readonly [key: string]: any }
  interface ImportMetaHot { accept: any; dispose: any; prune: any; decline: any; invalidate: any; on: any; send: any; data: any; }
  interface ImportMeta { readonly url: string; readonly env: ImportMetaEnv; readonly hot?: ImportMetaHot; readonly glob: any; readonly globEager: any; readonly resolve: any; }
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
declare module "@radix-ui/react-calendar" {
  export default function(...args: any[]): any;
  export const Root: any; export const Cell: any; export const CellTrigger: any;
  export const Day: any; export const Grid: any; export const GridBody: any;
  export const Head: any; export const Header: any; export const Months: any;
  export const Next: any; export const Prev: any; export const Row: any;
  export const GridHead: any; export const GridRow: any; export const Caption: any;
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
declare module "@radix-ui/react-context-menu" {
  export default function(...args: any[]): any;
  export const Root: any; export const Trigger: any; export const Portal: any; export const Content: any;
  export const Arrow: any; export const Item: any; export const Group: any; export const Label: any;
  export const Separator: any; export const CheckboxItem: any; export const RadioGroup: any;
  export const RadioItem: any; export const ItemIndicator: any; export const Sub: any;
  export const SubTrigger: any; export const SubContent: any;
}
declare module "@radix-ui/react-dialog" {
  export default function(...args: any[]): any;
  export const Root: any; export const Trigger: any; export const Portal: any;
  export const Overlay: any; export const Close: any; export const Content: any;
  export const Title: any; export const Description: any; export const Arrow: any;
}
declare module "@radix-ui/react-dropdown-menu" {
  export default function(...args: any[]): any;
  export const Root: any; export const Trigger: any; export const Portal: any; export const Content: any;
  export const Arrow: any; export const Item: any; export const Group: any; export const Label: any;
  export const Separator: any; export const CheckboxItem: any; export const RadioGroup: any;
  export const RadioItem: any; export const ItemIndicator: any; export const Sub: any;
  export const SubTrigger: any; export const SubContent: any;
}
declare module "@radix-ui/react-form" {
  export default function(...args: any[]): any;
  export const Root: any; export const Field: any; export const Label: any;
  export const Control: any; export const Message: any; export const Submit: any;
  export const ServerMessage: any;
}
declare module "@radix-ui/react-hover-card" {
  export default function(...args: any[]): any;
  export const Root: any; export const Trigger: any; export const Portal: any;
  export const Content: any; export const Arrow: any;
}
declare module "@radix-ui/react-label" {
  export default function(...args: any[]): any;
  export const Root: any;
}
declare module "@radix-ui/react-menubar" {
  export default function(...args: any[]): any;
  export const Root: any; export const Menu: any; export const Portal: any; export const Content: any;
  export const Arrow: any; export const Item: any; export const Group: any; export const Label: any;
  export const Separator: any; export const CheckboxItem: any; export const RadioGroup: any;
  export const RadioItem: any; export const Trigger: any;
}
declare module "@radix-ui/react-navigation-menu" {
  export default function(...args: any[]): any;
  export const Root: any; export const List: any; export const Item: any; export const Link: any;
  export const Trigger: any; export const Content: any; export const Viewport: any;
  export const Indicator: any; export const Portal: any; export const CaretIndicator: any;
}
declare module "@radix-ui/react-popover" {
  export default function(...args: any[]): any;
  export const Root: any; export const Trigger: any; export const Anchor: any;
  export const Portal: any; export const Content: any; export const Arrow: any;
  export const Close: any;
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
  export const Root: any; export const Viewport: any; export const Scrollbar: any;
  export const Thumb: any; export const Corner: any;
}
declare module "@radix-ui/react-select" {
  export default function(...args: any[]): any;
  export const Root: any; export const Trigger: any; export const Portal: any;
  export const Content: any; export const Viewport: any; export const Group: any;
  export const Label: any; export const Item: any; export const ItemText: any;
  export const ItemIndicator: any; export const Separator: any; export const Arrow: any;
  export const Value: any; export const Icon: any; export const ScrollUpButton: any;
  export const ScrollDownButton: any;
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
  export const Root: any; export const Thumb: any; export type CheckedState = any;
}
declare module "@radix-ui/react-table" {
  export default function(...args: any[]): any;
  export const Table: any; export const Header: any; export const Body: any; export const Footer: any;
  export const Head: any; export const Row: any; export const Cell: any; export const Caption: any;
}
declare module "@radix-ui/react-tabs" {
  export default function(...args: any[]): any;
  export const Root: any; export const List: any; export const Trigger: any;
  export const Content: any;
}
declare module "@radix-ui/react-textarea" {
  export default function(...args: any[]): any;
  export const Textarea: any;
}
declare module "@radix-ui/react-toast" {
  export default function(...args: any[]): any;
  export const Provider: any; export const Viewport: any; export const Root: any;
  export const Title: any; export const Description: any; export const Action: any;
  export const Close: any;
  export const Toast: any; export const ToastProvider: any; export const ToastViewport: any;
  export const ToastTitle: any; export const ToastDescription: any;
  export const ToastClose: any; export const ToastAction: any;
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
  export const Root: any; export const Button: any; export const Link: any;
  export const Separator: any; export const ToggleGroup: any; export const ToggleItem: any;
}
declare module "@radix-ui/react-tooltip" {
  export default function(...args: any[]): any;
  export const Provider: any; export const Root: any; export const Trigger: any;
  export const Portal: any; export const Content: any; export const Arrow: any;
}
declare module "@radix-ui/react-slot" {
  export const Slot: any; export const Slottable: any;
  export default function(...args: any[]): any;
}
declare module "@radix-ui/react-presence" {
  export const Presence: any;
  export default function(...args: any[]): any;
}
declare module "@radix-ui/react-compose-refs" {
  export const composeRefs: any; export const useComposedRefs: any;
  export default function(...args: any[]): any;
}
declare module "@radix-ui/react-primitive" {
  export default function(...args: any[]): any;
  export const Primitive: any;
  export namespace Primitive { export const Root: any; }
}
declare module "@radix-ui/react-use-controllable-state" {
  export const useControllableState: any;
  export default function(...args: any[]): any;
}
declare module "@radix-ui/react-direction" {
  export const DirectionProvider: any; export const useDirection: any;
  export default function(...args: any[]): any;
}
declare module "@radix-ui/react-roving-focus" {
  export default function(...args: any[]): any;
  export const RovingFocusGroup: any; export const RovingFocusItem: any;
}
declare module "@radix-ui/react-dismissable-layer" {
  export const DismissableLayer: any;
  export default function(...args: any[]): any;
}
declare module "@radix-ui/react-focus-guards" {
  export const FocusGuards: any;
  export default function(...args: any[]): any;
}
declare module "@radix-ui/react-focus-scope" {
  export const FocusScope: any;
  export default function(...args: any[]): any;
}
declare module "@radix-ui/react-id" {
  export const useId: any; export const createId: any; export const IdProvider: any; export const generateId: any;
  export default function(...args: any[]): any;
}
declare module "@radix-ui/react-portal" {
  export default function(...args: any[]): any;
  export const Portal: any;
}
declare module "@radix-ui/react-use-callback-ref" {
  export const useCallbackRef: any;
  export default function(...args: any[]): any;
}
declare module "@radix-ui/react-use-layout-effect" {
  export const useLayoutEffect: any;
  export default function(...args: any[]): any;
}
declare module "@radix-ui/react-use-previous" {
  export const usePrevious: any;
  export default function(...args: any[]): any;
}
declare module "@radix-ui/react-use-size" {
  export const useSize: any;
  export default function(...args: any[]): any;
}
declare module "@radix-ui/react-arrow" {
  export const Arrow: any;
  export default function(...args: any[]): any;
}
declare module "@radix-ui/react-collection" {
  export const createCollection: any;
  export default function(...args: any[]): any;
}
declare module "@radix-ui/react-menu" {
  export default function(...args: any[]): any;
  export const Root: any; export const Trigger: any; export const Portal: any; export const Content: any;
  export const Arrow: any; export const Item: any; export const Group: any; export const Label: any;
  export const Separator: any; export const CheckboxItem: any; export const RadioGroup: any;
  export const RadioItem: any;
}

declare module "vite"; declare module "@vitejs/plugin-react"; declare module "@vitejs/plugin-react-swc";
declare module "fast-glob"; declare module "chokidar"; declare module "picomatch"; declare module "glob"; declare module "minimatch"; declare module "brace-expansion"; declare module "balanced-match";
declare module "react-is"; declare module "nanoid"; declare module "uuid"; declare module "immer"; declare module "zustand"; declare module "axios"; declare module "jose"; declare module "superjson";
declare module "dequal"; declare module "mitt"; declare module "tiny-invariant"; declare module "tiny-warning";
declare module "ts-pattern"; declare module "valibot"; declare module "type-fest"; declare module "ts-toolbelt"; declare module "utility-types";
declare module "ms"; declare module "pretty-ms"; declare module "byte-size"; declare module "filesize"; declare module "humanize-duration";
declare module "qs"; declare module "query-string"; declare module "cookie-es"; declare module "cookie"; declare module "destr"; declare module "defu";
declare module "ufo"; declare module "ohash"; declare module "uncrypto"; declare module "scule"; declare module "pathe"; declare module "mlly";
declare module "pkg-types"; declare module "jsonc-parser"; declare module "acorn"; declare module "esrap"; declare module "magic-string";
declare module "source-map"; declare module "source-map-js"; declare module "strip-literal"; declare module "parse-ms";
declare module "chalk"; declare module "colorette"; declare module "kleur"; declare module "ansi-colors"; declare module "ora"; declare module "prompts";
declare module "execa"; declare module "open"; declare module "dotenv"; declare module "dotenv-expand"; declare module "jiti"; declare module "sucrase";
declare module "esbuild"; declare module "rollup"; declare module "@rollup/pluginutils"; declare module "resolve.exports"; declare module "escalade";
declare module "node-fetch"; declare module "undici"; declare module "happy-dom"; declare module "jsdom";
declare module "debounce"; declare module "throttle";

declare module "*.svg"; declare module "*.png"; declare module "*.jpg"; declare module "*.jpeg"; declare module "*.gif";
declare module "*.webp"; declare module "*.avif"; declare module "*.ico"; declare module "*.bmp";
declare module "*.module.css"; declare module "*.module.scss"; declare module "*.module.sass";
declare module "*.module.less"; declare module "*.module.styl"; declare module "*.css";
declare module "*.scss"; declare module "*.sass"; declare module "*.less"; declare module "*.styl";
declare module "*.json"; declare module "*.json5"; declare module "*.yaml"; declare module "*.yml";
declare module "*.toml"; declare module "*.md"; declare module "*.mdx";
declare module "*.graphql"; declare module "*.gql"; declare module "*.wasm"; declare module "*.txt";
declare module "*.woff"; declare module "*.woff2"; declare module "*.ttf"; declare module "*.eot"; declare module "*.otf";
declare module "*.mp4"; declare module "*.webm"; declare module "*.ogg";
declare module "*.mp3"; declare module "*.wav"; declare module "*.flac"; declare module "*.aac";
declare module "*.pdf";
declare module "*.svg?react"; declare module "*.svg?component"; declare module "*.svg?url";
declare module "*.png?url"; declare module "*.jpg?url"; declare module "*.webp?url";
declare module "url:*"; declare module "data:*"; declare module "virtual:*";
declare module "\0*";
