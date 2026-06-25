import { join } from 'path';
import { DataSource, DataSourceOptions } from 'typeorm';
import { envs } from '../../config/envs';
import { FoundPet } from '../../found-pets/found-pet.entity';
import { LostPet } from '../../lost-pets/lost-pet.entity';

export const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  host: envs.DB_HOST,
  port: envs.DB_PORT,
  username: envs.DB_USER,
  password: envs.DB_PASSWORD,
  database: envs.DB_NAME,
  entities: [LostPet, FoundPet],
  migrations: [join(__dirname, 'migrations', '*.js')],
  synchronize: false,
};

const dataSource = new DataSource(dataSourceOptions);

export default dataSource;  // ← default export, no named export