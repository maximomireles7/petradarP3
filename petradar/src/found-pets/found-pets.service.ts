import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable } from '@nestjs/common';
import type { Cache } from 'cache-manager';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { CreateFoundPetDto } from './dto/create-found-pet.dto';
import { FoundPet } from './found-pet.entity';
import {
  CACHE_KEY_FOUND_PETS_ALL,
  CACHE_KEY_LOST_PETS_ACTIVE,
} from '../cache/cache-keys';
import { EmailService } from '../email/email.service';

export type CreateFoundPetResult = {
  foundPet: Record<string, unknown>;
  /**
   * Mascotas perdidas activas encontradas en un radio de 500 m del punto
   * donde se encontró la mascota, ordenadas por distancia ascendente.
   * Búsqueda realizada con PostGIS ST_DWithin + cast ::geography (metros reales).
   * Los dueños de cada mascota reciben un correo de notificación automáticamente.
   */
  lostPetsWithin500Meters: Record<string, unknown>[];
};

@Injectable()
export class FoundPetsService {
  constructor(
    @InjectRepository(FoundPet)
    private readonly foundPetRepo: Repository<FoundPet>,
    private readonly dataSource: DataSource,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    private readonly emailService: EmailService,
  ) {}

  /**
   * Devuelve todas las mascotas encontradas registradas.
   * Usado por GET /found-pets (con caché en el controlador).
   */
  async findAll(): Promise<unknown[]> {
    return this.foundPetRepo
      .createQueryBuilder('fp')
      .select('fp.id', 'id')
      .addSelect('fp.name', 'name')
      .addSelect('fp.description', 'description')
      .addSelect(`ST_AsGeoJSON(fp.location)::json`, 'location')
      .addSelect('fp.found_at', 'foundAt')
      .addSelect('fp.created_at', 'createdAt')
      .orderBy('fp.created_at', 'DESC')
      .getRawMany();
  }

  /**
   * Registra una mascota encontrada y, dentro de la misma transacción,
   * busca mascotas perdidas activas en un radio de 500 metros usando
   * PostGIS ST_DWithin + cast ::geography (distancia en metros reales).
   *
   * Por cada mascota perdida encontrada en el radio, envía un correo al
   * dueño notificándole que puede haber aparecido su mascota.
   *
   * Al finalizar invalida:
   *  - La caché de GET /found-pets
   *  - La caché de GET /lost-pets (por si alguna se marcó como encontrada)
   */
  async create(dto: CreateFoundPetDto): Promise<CreateFoundPetResult> {
    const result = await this.dataSource.transaction(async (manager) => {
      // 1. Insertar la mascota encontrada
      const insertRows = await manager.query(
        `
        INSERT INTO found_pets (name, description, location, found_at)
        VALUES (
          $1,
          $2,
          ST_SetSRID(ST_MakePoint($3, $4), 4326),
          COALESCE($5::timestamptz, now())
        )
        RETURNING
          id,
          name,
          description,
          ST_AsGeoJSON(location)::json   AS location,
          found_at                       AS "foundAt",
          created_at                     AS "createdAt"
        `,
        [
          dto.name,
          dto.description ?? null,
          dto.longitude,
          dto.latitude,
          dto.foundAt ?? null,
        ],
      );

      const foundPet = insertRows[0] as Record<string, unknown>;

      // 2. Buscar mascotas perdidas activas dentro de 500 metros
      const lostPetsWithin500Meters = await manager.query(
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
            500
          )
        ORDER BY "distanceMeters" ASC
        `,
        [dto.longitude, dto.latitude],
      );

      // 3. Invalidar cachés
      await this.cacheManager.del(CACHE_KEY_FOUND_PETS_ALL);
      await this.cacheManager.del(CACHE_KEY_LOST_PETS_ACTIVE);

      return { foundPet, lostPetsWithin500Meters };
    });

    // 4. Enviar correos fuera de la transacción (fallo de email no revierte el INSERT)
    const petsWithEmail = result.lostPetsWithin500Meters.filter(
      (lp) => typeof lp['contactEmail'] === 'string' && lp['contactEmail'].trim() !== '',
    );

    console.log(
      '[PetRadar] lostPetsWithin500Meters:',
      JSON.stringify(result.lostPetsWithin500Meters, null, 2),
    );
    console.log(
      `[PetRadar] ${petsWithEmail.length} de ${result.lostPetsWithin500Meters.length} tienen contactEmail válido`,
    );

    if (petsWithEmail.length > 0) {
      await this.sendMatchEmails(result.foundPet, petsWithEmail);
    }

    return result;
  }

  // ---------------------------------------------------------------------------
  // Helpers privados
  // ---------------------------------------------------------------------------

  private async sendMatchEmails(
    foundPet: Record<string, unknown>,
    lostPets: Record<string, unknown>[],
  ): Promise<void> {
    const foundPetName = foundPet['name'] as string;
    const foundLocation = foundPet['location'] as { coordinates: [number, number] };
    const [foundLng, foundLat] = foundLocation.coordinates;

    const sendAll = lostPets.map((lostPet) => {
      const ownerEmail = lostPet['contactEmail'] as string;
      const lostPetName = lostPet['name'] as string;
      const distance = lostPet['distanceMeters']
        ? Math.round(lostPet['distanceMeters'] as number)
        : null;

      console.log(`[PetRadar] Intentando enviar correo a: "${ownerEmail}"`);

      return this.emailService.sendEmail({
        to: ownerEmail,
        subject: `🐾 ¡Puede que encontraron a ${lostPetName}!`,
        html: buildMatchEmailHtml({
          foundPetName,
          lostPetName,
          distance,
          longitude: foundLng,
          latitude: foundLat,
        }),
      });
    });

    const results = await Promise.allSettled(sendAll);
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') {
        console.log(`[PetRadar] Correo ${i + 1}: enviado=${r.value}`);
      } else {
        console.error(`[PetRadar] Correo ${i + 1}: ERROR`, r.reason);
      }
    });
  }
}

// ---------------------------------------------------------------------------
// Template del correo
// ---------------------------------------------------------------------------

const MAPBOX_TOKEN = process.env.MAPBOX_TOKEN || '';

function buildMatchEmailHtml(params: {
  foundPetName: string;
  lostPetName: string;
  distance: number | null;
  longitude: number;
  latitude: number;
}): string {
  const { foundPetName, lostPetName, distance, longitude, latitude } = params;
  const distanceText =
    distance !== null
      ? `a solo <strong>${distance} m</strong> de`
      : `cerca de`;

  // Mapbox Static Images — pin rojo en la ubicación encontrada
  const mapImgUrl =
    `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/` +
    `pin-l-paw+f97316(${longitude},${latitude})/` +
    `${longitude},${latitude},15,0/` +
    `520x200@2x` +
    `?access_token=${MAPBOX_TOKEN}`;

  // URL para abrir Google Maps en esa coordenada (funciona en móvil y desktop)
  const googleMapsUrl = `https://www.google.com/maps?q=${latitude},${longitude}`;

  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Posible coincidencia — PetRadar</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0"
               style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);">

          <!-- Header -->
          <tr>
            <td style="background:#f97316;padding:24px 32px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;">
                🐾 PetRadar
              </h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              <h2 style="margin:0 0 12px;color:#1a1a1a;font-size:18px;">
                ¡Posible avistamiento de <em>${lostPetName}</em>!
              </h2>
              <p style="margin:0 0 16px;color:#444;line-height:1.6;">
                Se reportó una mascota llamada <strong>${foundPetName}</strong>
                ${distanceText} la ubicación donde reportaste a <strong>${lostPetName}</strong> como perdida.
              </p>
              <p style="margin:0 0 20px;color:#444;line-height:1.6;">
                Te recomendamos revisar la zona lo antes posible y comparar
                con las fotos o descripción que tienes de tu mascota.
              </p>

              <!-- Mapa Mapbox -->
              <a href="${googleMapsUrl}" target="_blank"
                 style="display:block;margin:0 0 24px;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb;">
                <img src="${mapImgUrl}"
                     alt="Ubicación donde fue encontrada la mascota"
                     width="520"
                     style="display:block;width:100%;height:auto;" />
              </a>

              <!-- CTA -->
              <table cellpadding="0" cellspacing="0" style="margin:0 auto 24px;">
                <tr>
                  <td style="background:#f97316;border-radius:6px;padding:12px 28px;text-align:center;">
                    <a href="${googleMapsUrl}" target="_blank"
                       style="color:#ffffff;font-weight:700;font-size:15px;text-decoration:none;">
                      📍 Ver ubicación en el mapa
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:0;color:#888;font-size:13px;line-height:1.5;">
                Si ya encontraste a tu mascota, recuerda marcarla como
                recuperada para que otros usuarios lo sepan. 🐶🐱
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f9f9f9;padding:16px 32px;text-align:center;border-top:1px solid #eee;">
              <p style="margin:0;color:#aaa;font-size:12px;">
                Recibiste este correo porque registraste una mascota perdida en PetRadar.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}