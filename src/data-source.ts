import "reflect-metadata";
import "dotenv/config";
import { DataSource } from "typeorm";
import { Car } from "./entity/Car";

export const AppDataSource = new DataSource({
  type: "postgres",
  host: process.env.PG_HOST,
  port: Number(process.env.PG_PORT),
  username: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  database: process.env.PG_DATABASE,
  synchronize: true,
  entities: [Car],
});
