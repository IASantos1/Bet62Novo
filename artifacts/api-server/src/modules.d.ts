declare module "@workspace/db" {
  export const pool: any; export const db: any; export const initDb: any;
  export const usersTable: any; export const betsTable: any;
  export const paymentsTable: any; export const withdrawalsTable: any;
  export const adminAuditLogTable: any; export const platformSettingsTable: any;
  export const suspendedMatchesTable: any; export const settlementLogsTable: any;
  export const matchResultsTable: any; export const cashoutStatesTable: any;
  export const kycDocumentsTable: any; export const ledgerEntriesTable: any;
  export const competitionsTable: any; export const providerCompetitionsTable: any;
  export const competitionConfigsTable: any; export const competitionAliasesTable: any;
  export const eventRuntimeStatesTable: any; export const eventAdminOverridesTable: any;
  export const settlementIdempotencyTable: any; export const manualReviewQueueTable: any;
  export const settlementReplayLogTable: any; export const sportscoreMatchMapTable: any;
  export const casinoGamesTable: any; export const casinoBannersTable: any;
  export const liveStreamMappingsTable: any;
}
declare module "@workspace/db/schema" {
  export const usersTable: any; export const betsTable: any;
  export const paymentsTable: any; export const withdrawalsTable: any;
  export const adminAuditLogTable: any; export const platformSettingsTable: any;
  export const suspendedMatchesTable: any; export const settlementLogsTable: any;
  export const matchResultsTable: any; export const cashoutStatesTable: any;
  export const kycDocumentsTable: any; export const ledgerEntriesTable: any;
  export const competitionsTable: any; export const providerCompetitionsTable: any;
  export const competitionConfigsTable: any; export const competitionAliasesTable: any;
  export const eventRuntimeStatesTable: any; export const eventAdminOverridesTable: any;
  export const settlementIdempotencyTable: any; export const manualReviewQueueTable: any;
  export const settlementReplayLogTable: any; export const sportscoreMatchMapTable: any;
  export const casinoGamesTable: any; export const casinoBannersTable: any;
  export const liveStreamMappingsTable: any;
}
declare module "@workspace/api-zod" {
  export default function(...args: any[]): any;
  export type ZodSchema = any; export type ZodType = any; export type ZodTypeAny = any;
  export type ZodString = any; export type ZodNumber = any; export type ZodBoolean = any;
  export type ZodObject = any; export type ZodArray = any; export type ZodEnum = any;
  export type ZodUnion = any; export type ZodNullable = any; export type ZodOptional = any;
  export type ZodLiteral = any; export type ZodEffects = any; export type ZodLazy = any;
  export type infer<T> = any; export type input<T> = any; export type output<T> = any;
  export const z: any; export const ZodError: any;
}

declare module "express" {
  export default function(...args: any[]): any;
  export const json: any; export const urlencoded: any; export const static: any;
  export const Router: any; export const Route: any; export const application: any;
  export type Express = any; export type Request<P = any, ResBody = any, ReqBody = any, ReqQuery = any, Locals = Record<string, any>> = any; export type Response<T = any, ResBody = any, Locals = Record<string, any>> = any;
  export type NextFunction = any; export type Application = any;
  export type RouterOptions = any; export type RequestHandler = any;
  export type ErrorRequestHandler = any; export type Handler = any;
  export type IRouter = any; export type IRoute = any;
}
declare module "cors" {
  export default function(...args: any[]): any;
  export type CorsOptions = any; export type CorsOptionsDelegate = any;
}
declare module "pino-http" {
  export default function(...args: any[]): any;
  export const stdSerializers: any; export type Options = any;
  export type HttpLogger = any; export type Logger = any;
}
declare module "pino" {
  export default function(...args: any[]): any;
  export type Logger = any; export type LoggerOptions = any; export type DestinationStream = any;
  export const stdSerializers: any; export const stdTimeFunctions: any; export const levels: any;
  export type Level = any; export type LogDescriptor = any;
}
declare module "stripe" {
  export default class { constructor(...args: any[]); [k: string]: any }
  export type Stripe = any; export type Event = any; export type Webhook = any;
  export namespace webhooks { export const constructEvent: any; export const generateTestHeaderString: any; }
  export namespace errors {
    export const StripeError: any; export const StripeCardError: any; export const StripeInvalidRequestError: any;
    export const StripeAPIError: any; export const StripeAuthenticationError: any;
    export const StripePermissionError: any; export const StripeRateLimitError: any;
    export const StripeConnectionError: any; export const StripeSignatureVerificationError: any;
    export const StripeIdempotencyError: any; export const StripeInvalidGrantError: any;
  }
  export namespace resources { export const Customers: any; export const Charges: any; export const PaymentIntents: any; }
  export type Checkout = any; export namespace Checkout { export type Session = any; }
  export type PaymentIntent = any; export type PaymentMethod = any;
  export type Customer = any; export type Charge = any; export type Refund = any;
  export type Invoice = any; export type Subscription = any; export type Product = any;
  export type Price = any; export type SetupIntent = any; export type Balance = any;
  export type Transfer = any; export type Payout = any; export type Account = any;
  export namespace Stripe { export type Event = any; export type Webhook = any; export namespace errors { export const StripeError: any; export const StripeCardError: any; export const StripeInvalidRequestError: any; export const StripeAPIError: any; export const StripeAuthenticationError: any; export const StripePermissionError: any; export const StripeRateLimitError: any; export const StripeConnectionError: any; export const StripeSignatureVerificationError: any; export const StripeIdempotencyError: any; export const StripeInvalidGrantError: any; } export type Checkout = any; export namespace Checkout { export type Session = any; } export type PaymentIntent = any; export type PaymentMethod = any; export type Customer = any; export type Charge = any; export type Refund = any; export type Invoice = any; export type Subscription = any; export type Product = any; export type Price = any; export type SetupIntent = any; export type Balance = any; export type Transfer = any; export type Payout = any; export type Account = any; }
  export const webhooks: any;
}
declare module "drizzle-orm" {
  export default function(...args: any[]): any;
  export const eq: any; export const ne: any; export const and: any; export const or: any;
  export const not: any; export const lt: any; export const lte: any; export const gt: any;
  export const gte: any; export const isNull: any; export const isNotNull: any;
  export const inArray: any; export const notInArray: any; export const exists: any;
  export const notExists: any; export const between: any; export const notBetween: any;
  export const like: any; export const ilike: any; export const notIlike: any;
  export const notLike: any; export const asc: any; export const desc: any;
  export const sql: any; export const placeholder: any; export const count: any;
  export const countDistinct: any; export const avg: any; export const avgDistinct: any;
  export const sum: any; export const sumDistinct: any; export const max: any;
  export const min: any; export const stddev: any; export const variance: any;
  export const abs: any; export const round: any; export const floor: any;
  export const ceil: any; export const sqrt: any;
  export const concat: any; export const lower: any; export const upper: any;
  export const substring: any; export const length: any; export const now: any;
  export const array: any; export const jsonObject: any; export const jsonArray: any;
  export const jsonBuildObject: any; export const jsonBuildArray: any;
  export const all: any; export const any: any; export const coalesce: any;
  export type SQL = any; export type SQLWrapper = any;
  export type Table = any; export type Column = any; export type ColumnBase = any;
  export type View = any; export type SelectedFields = any;
  export type SelectedFieldsFlat = any; export type SelectedFieldsOrdered = any;
  export type Query = any; export type Subquery = any; export type WithSubquery = any;
  export type InsertTableConfig = any; export type UpdateTableConfig = any;
  export type DBQueryConfig = any; export type PgColumn = any;
  export const drizzle: any; export const alias: any;
  export type InferSelectModel<T> = any; export type InferInsertModel<T> = any;
}
declare module "drizzle-orm/pg-core" {
  export default function(...args: any[]): any;
  export const pgTable: any; export const pgTableCreator: any;
  export const pgView: any; export const pgMaterializedView: any;
  export const pgEnum: any;
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
  export const macaddr: any; export const macaddr8: any;
  export const point: any; export const line: any; export const lseg: any;
  export const box: any; export const path: any; export const polygon: any; export const circle: any;
  export const blob: any; export const bytea: any; export const bit: any; export const varbit: any;
  export const tsvector: any; export const tsquery: any;
  export const vector: any; export const halfvec: any; export const sparsevec: any;
  export const uniqueIndex: any; export const index: any;
  export const primaryKey: any; export const foreignKey: any;
  export const check: any; export const unique: any;
  export const PgTimestampString: any; export const PgDateString: any;
  export type PgTableWithColumns = any; export type PgColumnBuilders = any;
  export type AnyPgTable = any; export type AnyPgColumn = any;
}
declare module "drizzle-orm/node-postgres" {
  export default function(...args: any[]): any;
  export const drizzle: any; export type NodePgClient = any; export type NodePgDatabase = any; export type NodePgSession = any;
}
declare module "drizzle-zod" {
  export default function(...args: any[]): any;
  export const createInsertSchema: any; export const createSelectSchema: any;
  export const createUpdateSchema: any;
}
declare module "pg" {
  export default function(...args: any[]): any;
  export class Pool { constructor(config?: any); connect: any; query: any; end: any; on: any; totalCount: any; idleCount: any; waitingCount: any; }
  export class Client { constructor(config?: any); connect: any; query: any; end: any; }
  export const types: any; export const DatabaseError: any;
  export type PoolConfig = any; export type ClientConfig = any;
  export type QueryResult = any; export type QueryResultRow = any;
  export type QueryArrayResult = any; export type Submittable = any;
  export class Query { constructor(config?: any); }
  export const native: any;
}
declare module "nodemailer" {
  export default function(...args: any[]): any;
  export const createTransport: any; export const createTestAccount: any;
  export const getTestMessageUrl: any;
  export type Transporter = any; export type SendMailOptions = any;
  export type SentMessageInfo = any; export type Transport = any;
  export type TestAccount = any;
}
declare module "ioredis" {
  export default function(...args: any[]): any;
  export class Redis { constructor(...args: any[]); on: any; get: any; set: any; del: any; exists: any; expire: any; publish: any; subscribe: any; }
  export class Cluster { constructor(nodes: any, options?: any); on: any; }
  export type RedisOptions = any; export type ClusterOptions = any;
  export type RedisKey = any; export type RedisValue = any;
}
declare module "jsonwebtoken" {
  export default function(...args: any[]): any;
  export const sign: any; export const verify: any; export const decode: any;
  export type Jwt = any; export type JwtPayload = any; export type SignOptions = any;
  export type VerifyOptions = any; export type DecodeOptions = any;
  export const JsonWebTokenError: any; export const NotBeforeError: any; export const TokenExpiredError: any;
  export namespace jwt { export type JwtPayload = any; export type Jwt = any; export type SignOptions = any; export type VerifyOptions = any; export type DecodeOptions = any; }
}
declare module "bcryptjs" {
  export default function(...args: any[]): any;
  export const hash: any; export const compare: any; export const hashSync: any;
  export const compareSync: any; export const getSalt: any; export const genSalt: any;
  export const genSaltSync: any; export const setRandomFallback: any;
}
declare module "bullmq" {
  export default function(...args: any[]): any;
  export class Queue<T = any, R = any, N extends string = string> { constructor(name: string, opts?: any); add: any; getJobs: any; }
  export class Worker<T = any, R = any, N extends string = string> { constructor(name: string, processor?: any, opts?: any); on: any; }
  export class QueueEvents { constructor(name: string, opts?: any); on: any; }
  export class Job<T = any, R = any, N extends string = string> { id: any; data: any; returnvalue: any; update: any; moveToCompleted: any; }
  export class FlowProducer { constructor(opts?: any); add: any; }
  export type QueueOptions = any; export type WorkerOptions = any;
  export type JobsOptions = any; export type QueueEventsOptions = any;
}
declare module "cookie-parser" {
  export default function(...args: any[]): any;
  export type CookieParseOptions = any;
}
declare module "ws" {
  export default function(...args: any[]): any;
  export class WebSocket { constructor(address: any, opts?: any); on: any; send: any; close: any; readyState: any; CONNECTING: any; OPEN: any; CLOSING: any; CLOSED: any; }
  export class Server { constructor(opts: any); on: any; clients: any; close: any; handleUpgrade: any; }
  export const WebSocketServer: any;
  export type Event = any; export type ErrorEvent = any; export type MessageEvent = any;
  export type CloseEvent = any; export type ServerOptions = any;
  export type ClientOptions = any; export const RawData: any;
}
declare module "zod" {
  export default function(...args: any[]): any;
  export const z: any; export const ZodError: any; export type ZodError = any;
  export type ZodSchema = any; export type ZodTypeAny = any;
  export type ZodString = any; export type ZodNumber = any; export type ZodBoolean = any;
  export type ZodObject<T = any> = any; export type ZodArray = any;
  export type infer<T> = any; export type input<T> = any; export type output<T> = any;
  export type SafeParseReturnType<T, U> = any; export type SafeParseSuccess<T> = any;
  export type SafeParseError<T> = any;
}
declare module "zod/v4" {
  export default function(...args: any[]): any;
  export const z: any; export const ZodError: any; export type ZodSchema = any;
  export type ZodTypeAny = any; export type infer<T> = any;
}
declare module "http" {
  const CallableWithProps: {
    (...args: any[]): any;
    [k: string]: any;
  };
  export default CallableWithProps;
  export const createServer: any; export const get: any; export const request: any;
  export const STATUS_CODES: any; export const Agent: any; export const globalAgent: any;
  export const maxHeaderSize: any;
  export type Server = any; export type IncomingMessage = any; export type ServerResponse = any;
  export type RequestOptions = any; export type AgentOptions = any;
}
declare module "https" {
  const CallableWithProps: {
    (...args: any[]): any;
    [k: string]: any;
  };
  export default CallableWithProps;
  export const createServer: any; export const get: any; export const request: any;
  export const Agent: any; export const globalAgent: any;
  export type Server = any; export type RequestOptions = any;
}
declare module "fs" {
  const CallableWithProps: {
    (...args: any[]): any;
    [k: string]: any;
  };
  export default CallableWithProps;
  export const readFile: any; export const readFileSync: any;
  export const writeFile: any; export const writeFileSync: any;
  export const appendFile: any; export const appendFileSync: any;
  export const unlink: any; export const unlinkSync: any;
  export const mkdir: any; export const mkdirSync: any;
  export const rm: any; export const rmSync: any; export const rmdir: any; export const rmdirSync: any;
  export const readdir: any; export const readdirSync: any;
  export const exists: any; export const existsSync: any;
  export const stat: any; export const statSync: any; export const lstat: any; export const lstatSync: any;
  export const copyFile: any; export const copyFileSync: any;
  export const rename: any; export const renameSync: any;
  export const access: any; export const accessSync: any;
  export const createReadStream: any; export const createWriteStream: any;
  export const constants: any;
  export const promises: any; export const FSWatcher: any;
}
declare module "path" {
  const CallableWithProps: {
    (...args: any[]): any;
    [k: string]: any;
  };
  export default CallableWithProps;
  export const join: any; export const resolve: any; export const dirname: any;
  export const basename: any; export const extname: any; export const relative: any;
  export const normalize: any; export const isAbsolute: any; export const sep: any;
  export const delimiter: any; export const posix: any; export const win32: any;
  export const parse: any; export const format: any;
  export const toNamespacedPath: any;
}
declare module "crypto" {
  const CallableWithProps: {
    (...args: any[]): any;
    [k: string]: any;
  };
  export default CallableWithProps;
  export const createHash: any; export const createHmac: any;
  export const createCipheriv: any; export const createDecipheriv: any;
  export const randomBytes: any; export const randomFill: any; export const randomFillSync: any;
  export const randomUUID: any; export const pbkdf2: any; export const pbkdf2Sync: any;
  export const scrypt: any; export const scryptSync: any;
  export const createSign: any; export const createVerify: any;
  export const publicEncrypt: any; export const privateDecrypt: any;
  export const privateEncrypt: any; export const publicDecrypt: any;
  export const timingSafeEqual: any; export const generateKeyPair: any;
  export const generateKeyPairSync: any; export const generateKey: any;
  export const generateKeySync: any; export const subtle: any; export const webcrypto: any;
}
declare module "dotenv" {
  export default function(...args: any[]): any;
  export const config: any; export const parse: any;
}
declare module "esbuild" {
  export default function(...args: any[]): any;
  export const build: any; export const buildSync: any; export const context: any;
  export const transform: any; export const transformSync: any;
  export const analyzeMetafile: any; export const formatMessages: any;
  export const version: any;
}
declare module "tsx" {
  export default function(...args: any[]): any;
  export const load: any; export const installSourceMapSupport: any;
}

declare module "url"; declare module "events"; declare module "os"; declare module "stream";
declare module "util"; declare module "zlib"; declare module "querystring"; declare module "timers";
declare module "timers/promises"; declare module "tty"; declare module "net"; declare module "tls";
declare module "dgram"; declare module "dns"; declare module "dns/promises";
declare module "child_process"; declare module "cluster"; declare module "worker_threads";
declare module "perf_hooks"; declare module "async_hooks"; declare module "readline";
declare module "readline/promises"; declare module "repl"; declare module "domain";
declare module "punycode"; declare module "string_decoder"; declare module "sys";
declare module "assert"; declare module "assert/strict"; declare module "console";
declare module "constants"; declare module "diagnostics_channel"; declare module "module";
declare module "trace_events"; declare module "v8"; declare module "vm"; declare module "wasi";
declare module "inspector"; declare module "inspector/promises";
declare module "http2"; declare module "fs/promises";
declare module "path/posix"; declare module "path/win32"; declare module "crypto/webcrypto";
declare module "buffer"; declare module "process";

declare module "node:fs"; declare module "node:fs/promises";
declare module "node:path"; declare module "node:path/posix"; declare module "node:path/win32";
declare module "node:crypto"; declare module "node:crypto/webcrypto";
declare module "node:events"; declare module "node:http"; declare module "node:https";
declare module "node:http2"; declare module "node:url";
declare module "node:stream"; declare module "node:stream/consumers";
declare module "node:stream/promises"; declare module "node:stream/web";
declare module "node:util"; declare module "node:util/types";
declare module "node:buffer"; declare module "node:process";
declare module "node:os"; declare module "node:timers"; declare module "node:timers/promises";
declare module "node:tty"; declare module "node:net"; declare module "node:tls";
declare module "node:dgram"; declare module "node:dns"; declare module "node:dns/promises";
declare module "node:child_process"; declare module "node:cluster";
declare module "node:worker_threads"; declare module "node:perf_hooks";
declare module "node:async_hooks"; declare module "node:readline";
declare module "node:readline/promises"; declare module "node:zlib";
declare module "node:querystring"; declare module "node:assert";
declare module "node:assert/strict"; declare module "node:console";
declare module "node:constants"; declare module "node:v8";
declare module "node:vm"; declare module "node:module";

declare module "net" {
  const CallableWithProps: {
    (...args: any[]): any;
    [k: string]: any;
  };
  export default CallableWithProps;
  export class Socket { constructor(...args: any[]); [k: string]: any; }
  export class Server { constructor(...args: any[]); [k: string]: any; }
  export function createServer(...args: any[]): any;
  export function connect(...args: any[]): any;
  export type Socket = any;
  export type Server = any;
  export type AddressInfo = any;
  export type ListenOptions = any;
}

declare module "url" {
  const CallableWithProps: {
    (...args: any[]): any;
    [k: string]: any;
  };
  export default CallableWithProps;
  export const URL: any; export const URLSearchParams: any;
  export function parse(...args: any[]): any;
  export function format(...args: any[]): any;
  export function resolve(...args: any[]): any;
  export function resolveObject(...args: any[]): any;
  export type UrlWithParsedQuery = any;
  export type Url = any;
}
declare module "node:url" { export * from "url"; }

declare module "node:net" { export * from "net"; }

declare module "dotenv/config" {}
