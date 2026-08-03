declare module "zod" {
  export default function(...args: any[]): any;
  export const z: any; export const ZodError: any; export type ZodError = any;
  export type ZodSchema = any; export type ZodTypeAny = any;
  export type ZodString = any; export type ZodNumber = any; export type ZodBoolean = any;
  export type ZodObject<T = any> = any; export type ZodArray = any;
  export type infer<T> = any; export type input<T> = any; export type output<T> = any;
}
declare module "zod/v4" {
  export default function(...args: any[]): any;
  export const z: any; export const ZodError: any; export type ZodSchema = any; export type infer<T> = any;
}
declare module "valibot" {
  export default function(...args: any[]): any;
  export const object: any; export const string: any; export const number: any; export const boolean: any; export const parse: any; export const safeParse: any; export type InferInput = any; export type InferOutput = any; export type GenericSchema = any;
}
