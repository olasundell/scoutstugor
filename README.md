# Scoutstuga

En liten webbapp som listar scoutstugor i Stockholms län, baserat på `scoutstugor_stockholms_lan_masterlista_med_koordinater_semikolon.csv` (fallback: `scoutstugor_stockholms_lan_masterlista_semikolon.csv`).

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
# eller: bun run build:hostinger
BASE_PATH=/scoutstugor bun run build
```

- Färdiga statiska filer hamnar i `build/`
- Deploy-guide för Hostinger: `docs/DEPLOY_HOSTINGER.md`
