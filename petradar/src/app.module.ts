import { CacheModule } from '@nestjs/cache-manager';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { createKeyv } from '@keyv/redis';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { envs } from './config/envs';
import { dataSourceOptions } from './core/db/data-source';
import { EmailModule } from './email/email.module';
import { FoundPetsModule } from './found-pets/found-pets.module';
import { LostPetsModule } from './lost-pets/lost-pets.module';

function redisConnectionUrl(): string {
  const { REDIS_HOST, REDIS_PORT, REDIS_PASSWORD } = envs;
  if (REDIS_PASSWORD) {
    return `redis://:${encodeURIComponent(REDIS_PASSWORD)}@${REDIS_HOST}:${REDIS_PORT}`;
  }
  return `redis://${REDIS_HOST}:${REDIS_PORT}`;
}

@Module({
  imports: [
    CacheModule.registerAsync({
      isGlobal: true,
      useFactory: () => ({
        stores: [
          createKeyv(redisConnectionUrl(), {
            namespace: 'petradar',
          }),
        ],
        ttl: 60_000, // ms
      }),
    }),

    EmailModule,
    TypeOrmModule.forRoot(dataSourceOptions),
    LostPetsModule,
    FoundPetsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
