import { MigrationInterface, QueryRunner } from 'typeorm';

export class PostgisPets1747200000000 implements MigrationInterface {
  name = 'PostgisPets1747200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS postgis`);
    await queryRunner.query(`
      CREATE TABLE "lost_pets" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "name" varchar(255) NOT NULL,
        "description" text,
        "species" varchar(100),
        "is_active" boolean NOT NULL DEFAULT true,
        "location" geometry(Point, 4326) NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_lost_pets_location" ON "lost_pets" USING GIST ("location")
    `);
    await queryRunner.query(`
      CREATE TABLE "found_pets" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "name" varchar(255) NOT NULL,
        "description" text,
        "location" geometry(Point, 4326) NOT NULL,
        "found_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_found_pets_location" ON "found_pets" USING GIST ("location")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "found_pets"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "lost_pets"`);
  }
}
