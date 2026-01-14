# Deploy till Hostinger (statisk sajt)

Det här projektet bygger en statisk sajt till mappen `build/` (ingen server/databas behövs på Hostinger).

## Bygg lokalt

```sh
nvm install
nvm use

bun install
# eller: bun run build:hostinger
BASE_PATH=/scoutstugor bun run build
```

Efter bygget finns färdiga filer i `build/`.

## Ladda upp till Hostinger

1. Logga in i Hostinger (hPanel).
2. Gå till din webbplats → **Files** → **File Manager**.
3. Öppna webbplatsens dokumentrot (oftast `public_html/`) och skapa/öppna mappen `scoutstugor/`.
4. Ladda upp innehållet i `build/` (t.ex. `index.html`, `__data.json`, `_app/`, `robots.txt`) till `public_html/scoutstugor/`.
5. Besök domänen och verifiera att sidan laddar.

## Om sajten ska ligga i en undermapp

Bygg med `BASE_PATH` som matchar undermappen, utan avslutande snedstreck:

- `https://example.se/scoutstugor/` → `BASE_PATH=/scoutstugor`
- `https://example.se/min-sida/` → `BASE_PATH=/min-sida`
