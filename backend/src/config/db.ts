import pg from "pg";

const { Pool } = pg;

export const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL })
  : null;

export async function databaseStatus(): Promise<"connected" | "not_configured" | "unavailable"> {
  if (!pool) return "not_configured";
  try {
    await pool.query("select 1");
    return "connected";
  } catch {
    return "unavailable";
  }
}
