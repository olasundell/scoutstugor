# Scoutstuga

En liten webbapp som listar scoutstugor i Stockholms län, baserat på `data/scoutstugor.stockholm.json`.

## Data

- Canonical data finns i `data/scoutstugor.stockholm.json`.
- Varje post har ett **stabilt `id`**. Ändra inte `id` när du rättar stavning/byter namn — behåll `id` och ändra övriga fält.

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
