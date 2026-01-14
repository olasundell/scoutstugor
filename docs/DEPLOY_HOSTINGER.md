# Deploy / hosting

Det här projektet använder nu **SvelteKit + adapter-netlify**, vilket innebär att bygget producerar **serverless-funktioner** (inte en ren statisk sajt).

## Bygg lokalt

```sh
nvm install
nvm use

bun install
bun run build
```

Efter bygget finns statiska filer i `build/` och Netlify-funktioner i `.netlify/`.

## Miljövariabler

För reseplanering (bil + kollektivtrafik) behövs:

- `GRAPHHOPPER_API_KEY`
- `TRAFIKLAB_RESROBOT_ACCESS_ID`

## Hostinger

Om du använder Hostinger “vanligt webbhotell” (endast statiska filer) kan du **inte** köra Node-servern direkt.
Alternativ:

- Flytta till en plattform som kör Node (t.ex. Render/Fly.io/DigitalOcean App Platform).
- Eller behåll statisk hosting och lägg API-proxy på t.ex. Cloudflare Workers (inte valt i denna implementation).

## BASE_PATH (undermapp)

Bygg med `BASE_PATH` som matchar undermappen, utan avslutande snedstreck:

- `https://example.se/scoutstugor/` → `BASE_PATH=/scoutstugor`
- `https://example.se/min-sida/` → `BASE_PATH=/min-sida`
