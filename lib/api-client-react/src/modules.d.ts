declare module "react" {
  export default function(...args: any[]): any;
  export function useState<T = any>(...args: any[]): any;
  export function useEffect<T = any>(...args: any[]): any;
  export function useMemo<T = any>(...args: any[]): any;
  export function useCallback<T = any>(...args: any[]): any;
  export function useRef<T = any>(...args: any[]): any;
  export function useContext<T = any>(...args: any[]): any;
  export function useReducer<T = any>(...args: any[]): any;
  export function useLayoutEffect<T = any>(...args: any[]): any;
  export function useId<T = any>(...args: any[]): any;
  export function useSyncExternalStore<T = any>(...args: any[]): any;
  export function createContext<T = any>(...args: any[]): any;
  export function createElement<T = any>(...args: any[]): any;
  export const Children: any;
  export function memo<T = any>(...args: any[]): any;
  export function forwardRef<T = any>(...args: any[]): any;
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
declare module "@tanstack/react-query" {
  export default function(...args: any[]): any;
  export class QueryClient { constructor(opts?: any); setQueryData: any; getQueryData: any; invalidateQueries: any; resetQueries: any; refetchQueries: any; fetchQuery: any; prefetchQuery: any; }
  export const QueryClientProvider: any; export const HydrationBoundary: any;
  export const useQueryClient: any; export const useQuery: any;
  export const useMutation: any; export const useMutationState: any;
  export const useInfiniteQuery: any; export const useSuspenseQuery: any;
  export const keepPreviousData: any; export const skipToken: any;
  export const dehydrate: any; export const hydrate: any;
  export const MutationCache: any; export const QueryCache: any;
  export const onlineManager: any; export const hashKey: any;
  export type UseQueryResult<T> = any; export type UseMutationResult<TData, TError, TVariables> = any;
  export type QueryKey = any; export type QueryClientConfig = any;
  export type UseQueryOptions = any; export type UseMutationOptions = any;
}
declare module "@tanstack/query-core" {
  export default function(...args: any[]): any;
  export class QueryClient { constructor(opts?: any); }
  export const MutationObserver: any; export const QueryObserver: any;
  export const QueryCache: any; export const MutationCache: any;
  export const hashKey: any;
}
declare module "zod" {
  export default function(...args: any[]): any;
  export const z: any; export const ZodError: any; export type ZodSchema = any;
  export type ZodTypeAny = any; export type infer<T> = any;
}
declare module "zod/v4" {
  export default function(...args: any[]): any;
  export const z: any; export const ZodError: any; export type ZodSchema = any; export type infer<T> = any;
}
declare module "axios" {
  export default function(...args: any[]): any;
  export const get: any; export const post: any; export const put: any; export const delete_: any; export const patch: any;
  export const AxiosError: any; export const isAxiosError: any;
  export type AxiosInstance = any; export type AxiosRequestConfig = any;
  export type AxiosResponse = any; export type AxiosError = any;
}
declare module "node-fetch" { export default function(...args: any[]): any; }
declare module "jose" {
  export default function(...args: any[]): any;
  export const SignJWT: any; export const jwtVerify: any; export const createRemoteJWKSet: any; export const importJWK: any; export const importSPKI: any; export const importX509: any; export const exportJWK: any; export const generateKeyPair: any; export const generateSecret: any;
}
declare module "superjson" {
  export default function(...args: any[]): any;
  export const SuperJSON: any; export const serialize: any; export const deserialize: any; export const stringify: any; export const parse: any;
}
declare module "zustand" {
  export default function(...args: any[]): any;
  export function create<T = any>(...args: any[]): any;
}
declare module "immer" {
  export default function(...args: any[]): any;
  export const produce: any; export const current: any; export const original: any; export const isDraft: any; export const nothing: any;
}
declare module "dequal" {
  export default function(...args: any[]): any;
  export const dequal: any; export const dequalLite: any;
}
declare module "mitt" {
  export default function(...args: any[]): any;
  export type Emitter = any;
}
declare module "ts-pattern" {
  export default function(...args: any[]): any;
  export const match: any;
}
declare module "url"; declare module "events"; declare module "stream"; declare module "util";
declare module "crypto"; declare module "process"; declare module "buffer";
declare module "node:url"; declare module "node:events"; declare module "node:stream";
declare module "node:util"; declare module "node:crypto"; declare module "node:process";
declare module "node:buffer";
