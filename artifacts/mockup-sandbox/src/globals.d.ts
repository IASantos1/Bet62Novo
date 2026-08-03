declare global {
  var process: { env: Record<string, string | undefined>; [k: string]: any };
  var Buffer: any;
  var console: any;
  var setTimeout: any; var setInterval: any; var clearTimeout: any; var clearInterval: any;
  var setImmediate: any; var clearImmediate: any;
  var TextDecoder: any; var TextEncoder: any;
  var URL: any; var URLSearchParams: any;
  var ReadableStream: any; var WritableStream: any; var TransformStream: any;
  var Blob: any; var File: any;
  var Headers: any; var Request: any; var Response: any; var fetch: any; var FormData: any;
  var AbortController: any; var AbortSignal: any;
  var Event: any; var EventEmitter: any; var EventTarget: any; var CustomEvent: any;
  var Symbol: any; var queueMicrotask: any;
  var WeakRef: any; var FinalizationRegistry: any; var AggregateError: any;
  var Uint8Array: any; var ArrayBuffer: any; var SharedArrayBuffer: any;
  var Atomics: any; var BigInt: any; var BigInt64Array: any; var BigUint64Array: any;
  var DataView: any; var Map: any; var Set: any; var WeakMap: any; var WeakSet: any;
  var Promise: any; var Proxy: any; var Reflect: any;
  var JSON: any; var Math: any; var Date: any; var RegExp: any;
  var Object: any; var Array: any; var Function: any; var Number: any; var String: any; var Boolean: any;
  var parseInt: any; var parseFloat: any; var isNaN: any; var isFinite: any;
  var requestAnimationFrame: any; var cancelAnimationFrame: any;
  var performance: any; var crypto: any;
  var window: any; var document: any; var navigator: any; var location: any;
  var history: any; var localStorage: any; var sessionStorage: any;
  var FSWatcher: any;
  namespace React {
    export type ReactNode = any; export type ReactElement = any;
    export type ComponentType<P = any> = any; export type FC<P = any> = any; export type FunctionComponent<P = any> = any;
    export type ComponentProps<T> = any; export type ComponentPropsWithRef<T> = any;
    export type ComponentPropsWithoutRef<T> = any; export type ElementRef<T> = any;
    export type ElementType = any; export type CSSProperties = any;
    export type RefObject<T> = any; export type MutableRefObject<T> = any; export type Ref<T> = any;
    export type AriaAttributes = any; export type DOMAttributes<T = any> = any;
    export type HTMLAttributes<T = any> = any;
    export type AnchorHTMLAttributes<T = any> = any;
    export type AudioHTMLAttributes<T = any> = any;
    export type ButtonHTMLAttributes<T = any> = any;
    export type CanvasHTMLAttributes<T = any> = any;
    export type ColHTMLAttributes<T = any> = any;
    export type ColgroupHTMLAttributes<T = any> = any;
    export type DelHTMLAttributes<T = any> = any;
    export type DialogHTMLAttributes<T = any> = any;
    export type EmbedHTMLAttributes<T = any> = any;
    export type FieldsetHTMLAttributes<T = any> = any;
    export type FormHTMLAttributes<T = any> = any;
    export type HtmlHTMLAttributes<T = any> = any;
    export type IframeHTMLAttributes<T = any> = any;
    export type ImgHTMLAttributes<T = any> = any;
    export type InputHTMLAttributes<T = any> = any;
    export type InsHTMLAttributes<T = any> = any;
    export type LabelHTMLAttributes<T = any> = any;
    export type LiHTMLAttributes<T = any> = any;
    export type LinkHTMLAttributes<T = any> = any;
    export type MapHTMLAttributes<T = any> = any;
    export type MetaHTMLAttributes<T = any> = any;
    export type ObjectHTMLAttributes<T = any> = any;
    export type OlHTMLAttributes<T = any> = any;
    export type OptionHTMLAttributes<T = any> = any;
    export type OutputHTMLAttributes<T = any> = any;
    export type ParamHTMLAttributes<T = any> = any;
    export type ProgressHTMLAttributes<T = any> = any;
    export type QuoteHTMLAttributes<T = any> = any;
    export type ScriptHTMLAttributes<T = any> = any;
    export type SelectHTMLAttributes<T = any> = any;
    export type SourceHTMLAttributes<T = any> = any;
    export type StyleHTMLAttributes<T = any> = any;
    export type TableHTMLAttributes<T = any> = any;
    export type TbodyHTMLAttributes<T = any> = any;
    export type TdHTMLAttributes<T = any> = any;
    export type TemplateHTMLAttributes<T = any> = any;
    export type TextareaHTMLAttributes<T = any> = any;
    export type TfootHTMLAttributes<T = any> = any;
    export type ThHTMLAttributes<T = any> = any;
    export type TheadHTMLAttributes<T = any> = any;
    export type TimeHTMLAttributes<T = any> = any;
    export type TrHTMLAttributes<T = any> = any;
    export type TrackHTMLAttributes<T = any> = any;
    export type UlHTMLAttributes<T = any> = any;
    export type VideoHTMLAttributes<T = any> = any;
    export type SVGAttributes<T = any> = any;
    export type DetailedHTMLProps<E, T> = any;
    export const useState: any; export const useEffect: any; export const useMemo: any;
    export const useCallback: any; export const useRef: any; export const useContext: any;
    export const createContext: any; export const createElement: any;
    export const memo: any; export const forwardRef: any;
    export const Suspense: any; export const lazy: any; export const Fragment: any;
    export class Component<P = any, S = any> { props: P; state: S; setState: any; forceUpdate: any; }
    export class PureComponent<P = any, S = any> { props: P; state: S; setState: any; forceUpdate: any; }
  }
  namespace JSX {
    interface IntrinsicElements { [elem: string]: any; }
    interface IntrinsicAttributes { [key: string]: any; }
    interface Element { [key: string]: any; }
    interface ElementAttributesProperty { props: any; }
    interface ElementChildrenAttribute { children: any; }
  }
  interface ImportMetaEnv { readonly [key: string]: any }
  interface ImportMeta { readonly url: string; readonly env: ImportMetaEnv; readonly hot?: any; readonly glob?: any; readonly resolve?: any }
  type Buffer = any;
}
type FSWatcher = any;
type EventEmitter = any;
export {};
