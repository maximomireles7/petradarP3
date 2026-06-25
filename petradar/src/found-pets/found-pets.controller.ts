import { Body, Controller, Get, Post, UseInterceptors } from '@nestjs/common';
import {
  CacheInterceptor,
  CacheKey,
  CacheTTL,
} from '@nestjs/cache-manager';
import { CACHE_KEY_FOUND_PETS_ALL } from '../cache/cache-keys';
import { CreateFoundPetDto } from './dto/create-found-pet.dto';
import { FoundPetsService } from './found-pets.service';

@Controller('found-pets')
export class FoundPetsController {
  constructor(private readonly foundPetsService: FoundPetsService) {}

  /**
   * GET /found-pets
   * Listado de todas las mascotas encontradas.
   * Respuesta cacheada en Redis por 60 segundos.
   * La caché se invalida al registrar una nueva mascota encontrada (POST /found-pets).
   */
  @Get()
  @UseInterceptors(CacheInterceptor)
  @CacheKey(CACHE_KEY_FOUND_PETS_ALL)
  @CacheTTL(60_000)
  findAll() {
    return this.foundPetsService.findAll();
  }

  /**
   * POST /found-pets
   * Registra una mascota encontrada.
   * Lanza automáticamente la búsqueda por radio (500 m) en lost_pets usando
   * ST_DWithin + ::geography para encontrar mascotas perdidas cercanas.
   * Invalida la caché de GET /found-pets y GET /lost-pets.
   */
  @Post()
  create(@Body() dto: CreateFoundPetDto) {
    return this.foundPetsService.create(dto);
  }
}
