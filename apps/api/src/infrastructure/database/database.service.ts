import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private pool!: Pool;
  db!: NodePgDatabase<typeof schema>;

  onModuleInit() {
    const url = process.env.DATABASE_URL ?? "postgresql://adgenda:adgenda@localhost:5432/adgenda";
    this.pool = new Pool({ connectionString: url });
    this.db = drizzle(this.pool, { schema });
  }

  async onModuleDestroy() {
    await this.pool.end();
  }
}
