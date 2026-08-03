declare global {
  var process: { env: Record<string, string | undefined>; [k: string]: any };
  var console: any;
  var setTimeout: any; var setInterval: any; var clearTimeout: any; var clearInterval: any;
  var TextDecoder: any; var TextEncoder: any;
  var URL: any; var URLSearchParams: any;
  var Blob: any; var File: any;
  var Headers: any; var Request: any; var Response: any; var fetch: any; var FormData: any;
  var AbortController: any; var AbortSignal: any;
  var Event: any; var EventTarget: any; var CustomEvent: any;
  var Symbol: any; var queueMicrotask: any;
  var Uint8Array: any; var ArrayBuffer: any; var Map: any; var Set: any; var Promise: any; var Date: any; var JSON: any;
  namespace React {
    export type ReactNode = any; export type ReactElement = any;
    export type ComponentType<P = any> = any; export type FC<P = any> = any; export type FunctionComponent<P = any> = any;
    export type ComponentProps<T> = any; export type ComponentPropsWithRef<T> = any;
    export type ComponentPropsWithoutRef<T> = any; export type ElementRef<T> = any;
    export type ElementType = any; export type CSSProperties = any;
    export type RefObject<T> = any; export type MutableRefObject<T> = any; export type Ref<T> = any;
    export const useState: any; export const useEffect: any; export const useMemo: any;
    export const useCallback: any; export const useRef: any; export const useContext: any;
    export const createContext: any; export const createElement: any;
    export const memo: any; export const forwardRef: any;
    export const Suspense: any; export const lazy: any; export const Fragment: any;
    export class Component<P = any, S = any> { props: P; state: S; setState: any; }
    export class PureComponent<P = any, S = any> { props: P; state: S; setState: any; }
  }
  namespace JSX {
    interface IntrinsicElements { [elem: string]: any; }
    interface IntrinsicAttributes { [key: string]: any; }
    interface Element { [key: string]: any; }
    interface ElementAttributesProperty { props: any; }
    interface ElementChildrenAttribute { children: any; }
  }
}
export {};
