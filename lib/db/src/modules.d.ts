declare module "drizzle-orm" {
  export default function(...args: any[]): any;
  export const eq: any; export const ne: any; export const and: any; export const or: any;
  export const not: any; export const lt: any; export const lte: any; export const gt: any;
  export const gte: any; export const isNull: any; export const isNotNull: any;
  export const inArray: any; export const notInArray: any; export const exists: any;
  export const notExists: any; export const between: any;
  export const asc: any; export const desc: any;
  export const sql: any; export const count: any; export const avg: any; export const sum: any;
  export const max: any; export const min: any; export const now: any;
  export type SQL = any; export type Table = any; export type Column = any;
  export const drizzle: any;
  export type InferSelectModel<T> = any; export type InferInsertModel<T> = any;
}
declare module "drizzle-orm/pg-core" {
  export default function(...args: any[]): any;
  export const pgTable: any; export const pgView: any; export const pgEnum: any;
  export const pgMaterializedView: any; export const pgTableCreator: any;
  export const boolean: any; export const int: any; export const integer: any;
  export const smallint: any; export const bigint: any; export const serial: any;
  export const smallserial: any; export const bigserial: any;
  export const text: any; export const varchar: any; export const char: any;
  export const numeric: any; export const decimal: any; export const real: any;
  export const doublePrecision: any; export const float4: any; export const float8: any;
  export const json: any; export const jsonb: any;
  export const time: any; export const timestamp: any; export const date: any;
  export const interval: any; export const timetz: any; export const timestamptz: any;
  export const uuid: any; export const inet: any; export const cidr: any;
  export const bytea: any; export const uniqueIndex: any; export const index: any;
  export const primaryKey: any; export const foreignKey: any;
  export const check: any; export const unique: any;
  export const vector: any; export const halfvec: any; export const sparsevec: any;
  export type PgTableWithColumns = any; export type AnyPgTable = any; export type AnyPgColumn = any;
}
declare module "drizzle-orm/node-postgres" {
  export default function(...args: any[]): any;
  export const drizzle: any; export type NodePgClient = any; export type NodePgDatabase = any;
}
declare module "drizzle-zod" {
  export default function(...args: any[]): any;
  export const createInsertSchema: any; export const createSelectSchema: any;
  export const createUpdateSchema: any;
}
declare module "pg" {
  export default function(...args: any[]): any;
  export class Pool { constructor(config?: any); connect: any; query: any; end: any; on: any; }
  export class Client { constructor(config?: any); connect: any; query: any; end: any; }
  export const types: any; export const DatabaseError: any;
  export type PoolConfig = any; export type ClientConfig = any;
  export type QueryResult = any; export type QueryResultRow = any;
  export const native: any;
}
declare module "pg-native" { export default function(...args: any[]): any; }
declare module "pg-protocol" { export default function(...args: any[]): any; }
declare module "pg-types" { export default function(...args: any[]): any; }
declare module "pg-cursor" { export default function(...args: any[]): any; }
declare module "pg-query-stream" { export default function(...args: any[]): any; }
declare module "postgres-array" { export default function(...args: any[]): any; }
declare module "postgres-bytea" { export default function(...args: any[]): any; }
declare module "postgres-date" { export default function(...args: any[]): any; }
declare module "postgres-interval" { export default function(...args: any[]): any; }
declare module "postgres-range" { export default function(...args: any[]): any; }
declare module "zod" {
  export default function(...args: any[]): any;
  export const z: any; export const ZodError: any; export type ZodError = any;
  export type ZodSchema = any; export type ZodTypeAny = any;
  export type ZodString = any; export type ZodNumber = any; export type ZodBoolean = any;
  export type ZodObject<T = any> = any;
  export type infer<T> = any; export type input<T> = any; export type output<T> = any;
}
declare module "zod/v4" {
  export default function(...args: any[]): any;
  export const z: any; export const ZodError: any; export type ZodSchema = any;
  export type ZodTypeAny = any; export type infer<T> = any;
}
declare module "bcryptjs" {
  export default function(...args: any[]): any;
  export const hash: any; export const compare: any; export const hashSync: any; export const compareSync: any; export const genSalt: any; export const genSaltSync: any;
}
declare module "jsonwebtoken" {
  export default function(...args: any[]): any;
  export const sign: any; export const verify: any; export const decode: any; export const JsonWebTokenError: any; export const TokenExpiredError: any; export type JwtPayload = any;
}
declare module "uuid" {
  export default function(...args: any[]): any;
  export const v1: any; export const v3: any; export const v4: any; export const v5: any; export const v6: any; export const v7: any; export const NIL: any; export const version: any; export const validate: any; export const stringify: any; export const parse: any;
}
declare module "nanoid" {
  export default function(...args: any[]): any;
  export const nanoid: any; export const customAlphabet: any; export const customRandom: any; export const urlAlphabet: any; export const random: any;
}

declare module "dotenv"; declare module "esbuild"; declare module "tsx";
declare module "http"; declare module "https"; declare module "url";
declare module "events"; declare module "os"; declare module "stream";
declare module "util"; declare module "path"; declare module "fs";
declare module "fs/promises"; declare module "crypto"; declare module "buffer";
declare module "process"; declare module "timers"; declare module "tty";
declare module "net"; declare module "tls"; declare module "dgram";
declare module "dns"; declare module "child_process"; declare module "worker_threads";

declare module "node:fs"; declare module "node:fs/promises";
declare module "node:path"; declare module "node:crypto"; declare module "node:events";
declare module "node:http"; declare module "node:https"; declare module "node:url";
declare module "node:stream"; declare module "node:util"; declare module "node:buffer";
declare module "node:process"; declare module "node:os"; declare module "node:timers";
declare module "node:tty"; declare module "node:net"; declare module "node:tls";
declare module "node:dgram"; declare module "node:dns"; declare module "node:child_process";
declare module "node:worker_threads"; declare module "node:pg";
