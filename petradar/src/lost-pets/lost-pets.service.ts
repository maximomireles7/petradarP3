import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable } from '@nestjs/common';
import type { Cache } from 'cache-manager';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CACHE_KEY_LOST_PETS_ACTIVE } from '../cache/cache-keys';
import { CreateLostPetDto } from './dto/create-lost-pet.dto';
import { LostPet } from './lost-pet.entity';

@Injectable()
export class LostPetsService {
  constructor(
    @InjectRepository(LostPet)
    private readonly lostPetRepo: Repository<LostPet>,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  /**
   * Devuelve todas las mascotas perdidas activas (is_active = true).
   * Usado por GET /lost-pets (con caché en el controlador).
   */
  async findAllActive(): Promise<unknown[]> {
    return this.lostPetRepo
      .createQueryBuilder('lp')
      .select('lp.id', 'id')
      .addSelect('lp.name', 'name')
      .addSelect('lp.description', 'description')
      .addSelect('lp.species', 'species')
      .addSelect('lp.contact_email', 'contactEmail')
      .addSelect('lp.is_active', 'isActive')
      .addSelect(`ST_AsGeoJSON(lp.location)::json`, 'location')
      .addSelect('lp.created_at', 'createdAt')
      .where('lp.is_active = :active', { active: true })
      .orderBy('lp.created_at', 'DESC')
      .getRawMany();
  }

  /**
   * Búsqueda por radio usando PostGIS ST_DWithin + cast ::geography.
   * El cast ::geography es obligatorio para que la distancia sea en metros.
   *
   * Usado por GET /lost-pets/nearby (sin caché: depende de lat/lng/radio).
   */
  async findActiveNearby(
    longitude: number,
    latitude: number,
    radiusMeters: number,
  ): Promise<unknown[]> {
    return this.lostPetRepo.query(
      `
      SELECT
        lp.id,
        lp.name,
        lp.description,
        lp.species,
        lp.contact_email                    AS "contactEmail",
        lp.is_active                        AS "isActive",
        ST_AsGeoJSON(lp.location)::json     AS location,
        lp.created_at                       AS "createdAt",
        ST_Distance(
          lp.location::geography,
          ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
        )                                   AS "distanceMeters"
      FROM lost_pets lp
      WHERE lp.is_active = true
        AND ST_DWithin(
          lp.location::geography,
          ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
          $3
        )
      ORDER BY "distanceMeters" ASC
      `,
      [longitude, latitude, radiusMeters],
    );
  }

  /**
   * Registra una mascota perdida e invalida la caché de GET /lost-pets.
   */
  async create(dto: CreateLostPetDto): Promise<unknown> {
    const rows = await this.lostPetRepo.query(
      `
      INSERT INTO lost_pets (name, description, species, contact_email, location)
      VALUES ($1, $2, $3, $4, ST_SetSRID(ST_MakePoint($5, $6), 4326))
      RETURNING
        id,
        name,
        description,
        species,
        contact_email   AS "contactEmail",
        is_active       AS "isActive",
        ST_AsGeoJSON(location)::json AS location,
        created_at      AS "createdAt"
      `,
      [
        dto.name,
        dto.description ?? null,
        dto.species ?? null,
        dto.contactEmail,
        dto.longitude,
        dto.latitude,
      ],
    );

    await this.cacheManager.del(CACHE_KEY_LOST_PETS_ACTIVE);

    return rows[0];
  }
}
