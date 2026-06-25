# PetRadar API

API REST en NestJS para reportar y encontrar mascotas perdidas, con búsqueda geoespacial por radio usando PostGIS.

## Stack

- **NestJS** — framework principal
- **PostgreSQL 16 + PostGIS 3.4** — base de datos con soporte geoespacial
- **Redis 7** — caché de endpoints GET
- **Azure Application Insights** — telemetría y monitoreo (opcional)
- **Docker + GitHub Actions** — contenerización y CI/CD hacia GHCR

---

## Endpoints

| Método | Ruta | Caché | Descripción |
|--------|------|-------|-------------|
| `GET` | `/lost-pets` | ✅ Redis 60 s | Mascotas perdidas activas |
| `POST` | `/lost-pets` | ❌ | Registrar mascota perdida (invalida caché) |
| `GET` | `/lost-pets/nearby` | ❌ | Búsqueda por radio (ST_DWithin + ::geography) |
| `GET` | `/found-pets` | ✅ Redis 60 s | Mascotas encontradas |
| `POST` | `/found-pets` | ❌ | Registrar mascota encontrada + búsqueda automática 500 m |

### POST /found-pets — Búsqueda por radio automática

Al crear un registro en `found_pets`, el sistema busca automáticamente en `lost_pets` todas las mascotas perdidas activas (`is_active = true`) dentro de **500 metros** del punto encontrado, usando `ST_DWithin` con cast `::geography` para que la distancia sea en metros reales.

**Request:**
```json
{
  "name": "Pelusa",
  "description": "Gato blanco encontrado en el parque",
  "longitude": -103.3496,
  "latitude": 20.6597,
  "foundAt": "2025-05-14T10:00:00Z"
}
```

**Response:**
```json
{
  "foundPet": { "id": "...", "name": "Pelusa", "location": {...}, ... },
  "lostPetsWithin500Meters": [
    {
      "id": "...",
      "name": "Michi",
      "species": "gato",
      "distanceMeters": 120.5,
      ...
    }
  ]
}
```

### GET /lost-pets/nearby — Búsqueda manual por radio

```
GET /lost-pets/nearby?longitude=-103.3496&latitude=20.6597&radiusMeters=500
```

---

## Desarrollo local

### Prerrequisitos

- Docker y Docker Compose
- Node.js 22+

### 1. Clonar y configurar variables de entorno

```bash
cp petradar/.env.example petradar/.env
# Editar petradar/.env con tus valores
```

### 2. Levantar servicios con Docker Compose

```bash
# Levanta PostgreSQL+PostGIS, Redis, y la app
docker compose up -d

# Solo la base de datos y Redis (para desarrollo con hot-reload)
docker compose up db redis -d
```

### 3. Ejecutar migraciones

```bash
cd petradar
npm install
npm run migration:run
```

### 4. Iniciar en modo desarrollo

```bash
cd petradar
npm run start:dev
```

La API estará disponible en `http://localhost:3000`.

---

## Docker

### Build manual

```bash
docker build -t petradar ./petradar
docker run -p 3000:3000 --env-file petradar/.env petradar
```

### Imagen en GHCR

La imagen se publica automáticamente en `ghcr.io/<owner>/<repo>:latest` al hacer push a `main`/`master`.

```bash
docker pull ghcr.io/<github-user>/<repo>:latest
```

---

## CI/CD — GitHub Actions

El workflow `.github/workflows/docker-ghcr.yml` se dispara en:

- Push a `main` o `master`
- Push de tags `v*` (ej. `v1.0.0`)
- Ejecución manual (`workflow_dispatch`)

Construye y publica la imagen en **GitHub Container Registry (GHCR)** con tags:
- `latest` (en rama principal)
- SHA del commit
- Versión semver (si es un tag `v*`)

**No se requieren secrets adicionales** — usa `GITHUB_TOKEN` automático.

---

## Application Insights

Configurar la variable de entorno:

```env
APPLICATIONINSIGHTS_CONNECTION_STRING=InstrumentationKey=xxx;IngestionEndpoint=https://...
```

Obtener el Connection String desde: **Azure Portal → Application Insights → Overview → Connection String**

Sin esta variable, la telemetría no se inicializa y la app funciona normalmente.

---

## Migraciones

```bash
cd petradar
npm run migration:run
```

Crea las tablas `lost_pets` y `found_pets` con índices GIST para búsquedas geoespaciales eficientes, y habilita la extensión `postgis`.
