import "reflect-metadata";
import "dotenv/config";
import { DataSource } from "typeorm";
import { Car } from "./entity/Car";

// In production the schema is owned by migrations; we must never auto-mutate
// it (synchronize: true) there, as that risks destructive changes.
const isProd = process.env.NODE_ENV === "production";

export const AppDataSource = new DataSource({
  type: "postgres",
  host: process.env.PG_HOST,
  port: Number(process.env.PG_PORT),
  username: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  database: process.env.PG_DATABASE,
  synchronize: !isProd,
  migrationsRun: isProd,
  entities: [Car],
  migrations: [__dirname + "/migration/*.{ts,js}"],
});
