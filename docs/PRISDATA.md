## Prisdata: källa + återkontroll

Målet är att `data/scoutstugor.stockholm.json` ska vara single source of truth.

### Fält (per stuga)

- **`prisinfo`**: fri text med pris/regel eller “hyrs ej ut”.
- **`prisKallaUrl`**: URL till sidan där `prisinfo` kommer ifrån.
- **`prisKallaNotering`**: *hur* vi hittade källan (sökterm, menyväg, etc).
- **`bokningslank`** / **`bokningsKallaUrl`** / **`bokningsKallaNotering`**: motsvarande för bokning.
- **`senastKontrollerad`**: datum (ISO 8601, `YYYY-MM-DD`) när vi senast verifierade uppgiften.

### Arbetsflöde när du uppdaterar priser

1. Hitta källa (kår-sajt, PDF, `scoutstuga.se`, etc).
2. Uppdatera stugan i JSON:
   - skriv/uppdatera `prisinfo`
   - sätt `prisKallaUrl`
   - skriv `prisKallaNotering` (t.ex. “Hittat via scoutstuga.se: sökterm ‘Bygget’ → Pris-sektionen.”)
   - uppdatera `senastKontrollerad` till dagens datum

### Återkontroll (recheck)

Skriv ut en lista över stugor som har källor och behöver kontrolleras igen:

```bash
bun run pris:recheck
```

Visa bara de som saknar prisinfo eller pris-källa:

```bash
bun run pris:recheck -- --missing-only
```

Visa bara de som är äldre än t.ex. 180 dagar (eller saknar `senastKontrollerad`):

```bash
bun run pris:recheck -- --older-than-days 180
```

Maskinläsbar output:

```bash
bun run pris:recheck -- --json
```

