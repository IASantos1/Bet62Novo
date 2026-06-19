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

  let useOptimisticLocking = false;
  let currentVersion: number | undefined;

  try {
    // Check if version column exists
    const [user] = await txDb
      .select({ version: usersTable.version })
      .from(usersTable)
      .where(eq(usersTable.id, args.userId));
    
    useOptimisticLocking = user !== undefined && user.version !== null && user.version !== undefined;
    currentVersion = user?.version;
  } catch (e) {
    useOptimisticLocking = false;
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

  let where;
  let updateValues;

  if (useOptimisticLocking && currentVersion !== undefined) {
    const baseWhere = and(
      eq(usersTable.id, args.userId),
      eq(usersTable.version, currentVersion) // Optimistic lock check
    );

    where = args.enforceNonNegative
      ? and(
          baseWhere,
          sql`${usersTable.balance}::numeric + ${amountStr}::numeric >= 0`,
        )
      : baseWhere;

    updateValues = {
      balance: sql`${usersTable.balance} + ${amountStr}::numeric`,
      version: sql`${usersTable.version} + 1` // Increment version on update
    };
  } else {
    // Fallback to original behavior without optimistic locking
    where = args.enforceNonNegative
      ? and(
          eq(usersTable.id, args.userId),
          sql`${usersTable.balance}::numeric + ${amountStr}::numeric >= 0`,
        )
      : eq(usersTable.id, args.userId);
    
    updateValues = {
      balance: sql`${usersTable.balance} + ${amountStr}::numeric`
    };
  }

  const updated = await txDb
    .update(usersTable)
    .set(updateValues)
    .where(where)
    .returning({ id: usersTable.id });

  if (updated.length === 0) {
    // Check if it's a balance issue or optimistic lock failure
    try {
      const [currentUser] = await txDb
        .select({ version: usersTable.version, balance: usersTable.balance })
        .from(usersTable)
        .where(eq(usersTable.id, args.userId));

      if (!currentUser) {
        throw new Error("User not found");
      }

      if (useOptimisticLocking && currentVersion !== undefined && currentUser.version !== currentVersion) {
        throw Object.assign(new Error("Concurrent update detected"), { 
          status: 409, 
          code: "CONCURRENT_UPDATE" 
        });
      }

      throw Object.assign(new Error("Insufficient balance"), { status: 400 });
    } catch (e) {
      // If we can't get the user, just throw insufficient balance
      throw Object.assign(new Error("Insufficient balance"), { status: 400 });
    }
  }

  return true;
}
