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
  var Event: any; var EventTarget: any; var CustomEvent: any;
  var Symbol: any; var queueMicrotask: any;
  var WeakRef: any; var FinalizationRegistry: any; var AggregateError: any;
  var Uint8Array: any; var ArrayBuffer: any; var SharedArrayBuffer: any;
  var Atomics: any; var BigInt: any; var BigInt64Array: any; var BigUint64Array: any;
  var DataView: any; var Map: any; var Set: any; var WeakMap: any; var WeakSet: any;
  var Promise: any; var Proxy: any; var Reflect: any;
  var JSON: any; var Math: any; var Date: any; var RegExp: any;
  var Object: any; var Array: any; var Function: any; var Number: any; var String: any; var Boolean: any;
  var parseInt: any; var parseFloat: any; var isNaN: any; var isFinite: any;
  var __dirname: string; var __filename: string;
  type Buffer = any;
}
export {};
