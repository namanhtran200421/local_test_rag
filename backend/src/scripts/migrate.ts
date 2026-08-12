import "dotenv/config";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pool } from "../config/db.js";

if (!pool) throw new Error("DATABASE_URL is required to run migrations");
const schema = await readFile(resolve(process.cwd(), "database/schema.sql"), "utf8");
await pool.query(schema);
await pool.end();
console.log(JSON.stringify({ event: "database_migration_complete" }));
