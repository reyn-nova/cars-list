import "reflect-metadata";
import "dotenv/config";
import { DataSource } from "typeorm";
import { Car } from "./entity/Car";

const isProd = process.env.NODE_ENV === "production";

export const AppDataSource = new DataSource({
  type: "postgres",
  host: process.env.PG_HOST,
  port: Number(process.env.PG_PORT) || 5432,
  username: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  database: process.env.PG_DATABASE,
  synchronize: !isProd,
  migrationsRun: isProd,
  entities: [Car],
  migrations: [__dirname + "/migration/*.{ts,js}"],
});
