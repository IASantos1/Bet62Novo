import { ledgerEntriesTable, usersTable } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";

export async function insertLedgerEntry(
  tx: unknown,
  args: {
    userId: number;
    amount: string;
    kind: string;
    idempotencyKey: string;
    refType?: string | null;
    refId?: string | null;
    metadata?: unknown;
  },
): Promise<boolean> {
  const txDb = tx as {
    insert: typeof import("@workspace/db")["db"]["insert"];
  };

  // Validate amount string directly (avoid floating point conversion)
  const amountStr = args.amount;
  if (!/^-?\d+(\.\d{1,2})?$/.test(amountStr)) {
    throw new Error("Invalid amount format");
  }

  const inserted = await txDb
    .insert(ledgerEntriesTable)
    .values({
      userId: args.userId,
      amount: amountStr,
      currency: "EUR",
      kind: args.kind,
      refType: args.refType ?? null,
      refId: args.refId ?? null,
      idempotencyKey: args.idempotencyKey,
      metadata: (args.metadata ?? null) as never,
    })
    .onConflictDoNothing()
    .returning({ id: ledgerEntriesTable.id });

  return inserted.length > 0;
}

export async function applyBalanceDelta(
  tx: unknown,
  args: {
    userId: number;
    amount: string;
    kind: string;
    idempotencyKey: string;
    refType?: string | null;
    refId?: string | null;
    metadata?: unknown;
    enforceNonNegative?: boolean;
  },
): Promise<boolean> {
  const txDb = tx as {
    insert: typeof import("@workspace/db")["db"]["insert"];
    update: typeof import("@workspace/db")["db"]["update"];
    select: typeof import("@workspace/db")["db"]["select"];
  };

  // Validate amount string directly (avoid floating point conversion)
  const amountStr = args.amount;
  if (!/^-?\d+(\.\d{1,2})?$/.test(amountStr)) {
    throw new Error("Invalid amount format");
  }

  // First, get current user version for optimistic locking
  const [user] = await txDb
    .select({ version: usersTable.version })
    .from(usersTable)
    .where(eq(usersTable.id, args.userId));

  if (!user) {
    throw new Error("User not found");
  }

  const inserted = await txDb
    .insert(ledgerEntriesTable)
    .values({
      userId: args.userId,
      amount: amountStr,
      currency: "EUR",
      kind: args.kind,
      refType: args.refType ?? null,
      refId: args.refId ?? null,
      idempotencyKey: args.idempotencyKey,
      metadata: (args.metadata ?? null) as never,
    })
    .onConflictDoNothing()
    .returning({ id: ledgerEntriesTable.id });

  if (inserted.length === 0) return false;

  const baseWhere = and(
    eq(usersTable.id, args.userId),
    eq(usersTable.version, user.version) // Optimistic lock check
  );

  const where = args.enforceNonNegative
    ? and(
        baseWhere,
        sql`${usersTable.balance}::numeric + ${amountStr}::numeric >= 0`,
      )
    : baseWhere;

  const updated = await txDb
    .update(usersTable)
    .set({ 
      balance: sql`${usersTable.balance} + ${amountStr}::numeric`,
      version: sql`${usersTable.version} + 1` // Increment version on update
    })
    .where(where)
    .returning({ id: usersTable.id });

  if (updated.length === 0) {
    // Check if it's a balance issue or optimistic lock failure
    const [currentUser] = await txDb
      .select({ version: usersTable.version, balance: usersTable.balance })
      .from(usersTable)
      .where(eq(usersTable.id, args.userId));

    if (!currentUser) {
      throw new Error("User not found");
    }

    if (currentUser.version !== user.version) {
      throw Object.assign(new Error("Concurrent update detected"), { 
        status: 409, 
        code: "CONCURRENT_UPDATE" 
      });
    }

    throw Object.assign(new Error("Insufficient balance"), { status: 400 });
  }

  return true;
}
