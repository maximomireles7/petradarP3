import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UseInterceptors,
} from '@nestjs/common';
import {
  CacheInterceptor,
  CacheKey,
  CacheTTL,
} from '@nestjs/cache-manager';
import { CACHE_KEY_LOST_PETS_ACTIVE } from '../cache/cache-keys';
import { CreateLostPetDto } from './dto/create-lost-pet.dto';
import { NearbyQueryDto } from './dto/nearby-query.dto';
import { LostPetsService } from './lost-pets.service';

@Controller('lost-pets')
export class LostPetsController {
  constructor(private readonly lostPetsService: LostPetsService) {}

  /**
   * GET /lost-pets
   * Listado de mascotas perdidas activas.
   * Respuesta cacheada en Redis por 60 segundos.
   * La caché se invalida automáticamente al crear una nueva mascota perdida (POST /lost-pets)
   * o al registrar una mascota encontrada (POST /found-pets).
   */
  @Get()
  @UseInterceptors(CacheInterceptor)
  @CacheKey(CACHE_KEY_LOST_PETS_ACTIVE)
  @CacheTTL(60_000)
  findAllActive() {
    return this.lostPetsService.findAllActive();
  }

  /**
   * GET /lost-pets/nearby?longitude=X&latitude=Y&radiusMeters=500
   * Búsqueda por radio usando PostGIS ST_DWithin + ::geography.
   * Sin caché: los resultados dependen de los parámetros lat/lng/radio.
   */
  @Get('nearby')
  findNearby(@Query() query: NearbyQueryDto) {
    const radius = query.radiusMeters ?? 500;
    return this.lostPetsService.findActiveNearby(
      query.longitude,
      query.latitude,
      radius,
    );
  }

  /**
   * POST /lost-pets
   * Registra una mascota perdida.
   * Invalida la caché de GET /lost-pets.
   */
  @Post()
  create(@Body() dto: CreateLostPetDto) {
    return this.lostPetsService.create(dto);
  }
}
