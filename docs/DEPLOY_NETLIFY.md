# Deploy on Netlify

Det här projektet använder **SvelteKit + adapter-netlify** och kör serverless-funktioner på Netlify.

## Bygginställningar

- Build command: `bun run build`
- Publish directory: `build`

Netlify detekterar `bun.lock` och kör `bun install` automatiskt. Om du vill låsa Bun-versionen kan du sätta `BUN_VERSION=1.3.6` i Netlify.

## Miljövariabler (reseplanering)

Lägg till följande i Netlify (Site settings → Environment variables):

- `GRAPHHOPPER_API_KEY`
- `TRAFIKLAB_RESROBOT_ACCESS_ID`

## BASE_PATH (undermapp)

Netlify hostar normalt på root, så `BASE_PATH` behövs oftast inte. Om du proxyar sajten till en undermapp, bygg med `BASE_PATH` utan avslutande snedstreck:

- `https://example.se/scoutstugor/` → `BASE_PATH=/scoutstugor`
