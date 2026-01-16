# Scoutstuga

En liten webbapp som listar scoutstugor i Stockholms län (default), baserat på datafiler i `data/`.

## Data

- Canonical data finns i `data/scoutstugor*.json` (default `data/scoutstugor.stockholm.json`).
- Varje post har ett **stabilt `id`**. Ändra inte `id` när du rättar stavning/byter namn — behåll `id` och ändra övriga fält.
- Efter ändring i JSON-data, kör `bun run data:validate`.

### Data + region (valfritt)

- `SCOUTSTUGOR_DATA_FILES`: kommaseparerad lista av datafiler som ska laddas.
- `SCOUTSTUGOR_REGION_LABEL`: rubrik/regiontext i UI (t.ex. `Sverige`).

### Avstånd till badplats/mataffär

Avstånd beräknas via OSM (Overpass) + egenhostad OSRM och skrivs tillbaka till JSON.

```sh
bun run avstand:poi -- --radius 20000 --candidates 5 --sleep 400 \
  --osrm-driving http://localhost:5005 \
  --osrm-foot http://localhost:5006
```

Scriptet uppdaterar fälten `avstandBadplatsBilM`, `avstandBadplatsGangM`, `avstandMataffarBilM` och `avstandMataffarGangM`.

#### OSRM Docker (lokalt)

1. Starta OSRM (compose laddar ner PBF och kör extract/partition/customize automatiskt):

```sh
mkdir -p osrm-car osrm-foot
docker compose up -d
```

Om du uppdaterar PBF-filen, ta bort genererade `.osrm*`-filer i respektive katalog och kör `docker compose up -d` igen.
Om du stöter på fel om saknade `.datasource_names`, ta bort `.osrm*`-filerna och starta om compose.

## Krav

- Node via `nvm` (se `.nvmrc`)
- `bun`

## Utveckling

```sh
nvm install
nvm use

bun install
bun run dev
```

## Kvalitet

```sh
bun run check
bun run lint
bun run format
```

## E2E (Playwright)

Installera Chromium en gång:

```sh
bun run test:e2e:install
```

Kör tester (startar `bun run dev` automatiskt om den inte redan kör):

```sh
bun run test:e2e
```

## Bygg & deploy

```sh
bun run build
```

- Bygget skapar en **Netlify-app** (SvelteKit + adapter-netlify).
- Kräver miljövariabler för reseplanering (se nedan).

## Miljövariabler (reseplanering)

För att kunna beräkna restider krävs API-nycklar:

- `GRAPHHOPPER_API_KEY` (GraphHopper Routing + Geocoding)
- `TRAFIKLAB_RESROBOT_ACCESS_ID` (Trafiklab ResRobot)

Du kan lägga dessa i en lokal `.env` när du kör i dev.

## Deploy

Se `docs/DEPLOY_NETLIFY.md` för Netlify och `docs/DEPLOY_HOSTINGER.md` för bakgrund och alternativ.
