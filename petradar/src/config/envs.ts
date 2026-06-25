import 'dotenv/config';
import * as env from 'env-var';

export const envs = {
  PORT: env.get('PORT').default(3000).asPortNumber(),
  MAPBOX_TOKEN: env.get('MAPBOX_TOKEN').required().asString(),
  MAILER_EMAIL: env.get('MAILER_EMAIL').required().asString(),
  MAILER_PASSWORD: env.get('MAILER_PASSWORD').required().asString(),
  MAILER_SERVICE: env.get('MAILER_SERVICE').required().asString(),
  DB_PASSWORD: env.get('DB_PASSWORD').required().asString(),
  DB_NAME: env.get('DB_NAME').required().asString(),
  DB_PORT: env.get('DB_PORT').required().asPortNumber(),
  DB_HOST: env.get('DB_HOST').required().asString(),
  DB_USER: env.get('DB_USER').required().asString(),
  REDIS_HOST: env.get('REDIS_HOST').default('localhost').asString(),
  REDIS_PORT: env.get('REDIS_PORT').default(6379).asPortNumber(),
  REDIS_PASSWORD: env.get('REDIS_PASSWORD').default('').asString(),
  APPLICATIONINSIGHTS_CONNECTION_STRING: env
    .get('APPLICATIONINSIGHTS_CONNECTION_STRING')
    .default('')
    .asString(),
};
