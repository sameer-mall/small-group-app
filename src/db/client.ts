import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const url = process.env.DATABASE_URL!;
const isLocal = /localhost|127\.0\.0\.1/.test(url);

// Neon (prod) requires TLS; local Docker Postgres doesn't speak it.
const pool = new Pool({ connectionString: url, ssl: isLocal ? undefined : true });

export const db = drizzle(pool);
