import { MigrationInterface, QueryRunner } from "typeorm";

export class InitCars1718000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "cars" (
        "id" SERIAL PRIMARY KEY,
        "name" character varying NOT NULL,
        "type" character varying NOT NULL,
        "photoUrl" character varying
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "cars"`);
  }
}
