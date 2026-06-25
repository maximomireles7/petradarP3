import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddContactEmailToLostPets1747200000001
  implements MigrationInterface
{
  name = 'AddContactEmailToLostPets1747200000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "lost_pets"
      ADD COLUMN "contact_email" varchar(255) NOT NULL DEFAULT ''
    `);
    // Quitar el DEFAULT después de agregar la columna
    // para que registros futuros no tengan string vacío accidentalmente
    await queryRunner.query(`
      ALTER TABLE "lost_pets"
      ALTER COLUMN "contact_email" DROP DEFAULT
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "lost_pets" DROP COLUMN "contact_email"
    `);
  }
}
