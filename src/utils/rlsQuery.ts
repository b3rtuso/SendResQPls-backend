import { prisma } from '../config/db';

/**
 * withRLS — wraps a Prisma query in a transaction that:
 * 1. Temporarily switches to app_role (which respects Supabase RLS)
 * 2. Sets app.current_user_id + app.current_user_role as session variables
 * 3. Executes your query under those constraints
 * 4. Role reverts automatically when the transaction ends
 *
 * Use this for any citizen-facing query that must be row-filtered.
 * Admin queries can use prisma directly (postgres superuser bypasses RLS).
 */
export async function withRLS<T>(
  userId: string,
  role: 'CITIZEN' | 'ADMIN',
  query: (tx: Omit<typeof prisma, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>) => Promise<T>
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    // Drop into the restricted role that respects RLS policies
    await tx.$executeRaw`SET LOCAL ROLE app_role`;
    // Set session variables that the RLS policies read via current_setting()
    await tx.$executeRaw`SELECT set_config('app.current_user_id', ${userId}, true)`;
    await tx.$executeRaw`SELECT set_config('app.current_user_role', ${role}, true)`;
    // Run the actual Prisma query under the restricted role
    return query(tx);
  });
}
