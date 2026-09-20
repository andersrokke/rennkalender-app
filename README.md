# Rennkalender 2026/27

Trener/løper-app for alpint rennplanlegging. React + Vite + Supabase, publisert
på Netlify.

Hele backenden ligger i `supabase/` — skjema, edge-funksjoner og cron-jobber.
Driftsdokumentasjonen står i **[docs/DRIFT.md](docs/DRIFT.md)**.

## Kom i gang

```bash
npm install
npm run dev
```

`.env` inneholder Supabase-URL og publishable key (prosjekt «Rennkalender»).
Se `.env.example` for hvilke variabler som trengs.

### Med lokal database

Krever Docker (eller OrbStack) og en innlogget Supabase CLI.

```bash
npm run db:login       # én gang
npm run db:link        # én gang
npm run db:start
npm run db:reset       # bygger skjemaet fra supabase/migrations/ + testbrukere
```

`db:reset` skal gi nøyaktig samme skjema som produksjon. Kontroller med
`npm run db:check` — tom utskrift betyr at de er like.

## Struktur

```
src/                        React-appen
supabase/
  config.toml               CLI-oppsett, inkl. verify_jwt per edge-funksjon
  migrations/               Skjemaet. Eneste lovlige vei til en endring.
  functions/                De fem edge-funksjonene
  seed.sql                  Testbrukere, kjøres av db:reset
scripts/
  bootstrap-cron-secrets.sql  Legger cron-nøkkelen i Vault (én gang per prosjekt)
  drop-test-users.sql         Fjerner testbrukerne før ekte brukere slippes inn
docs/DRIFT.md               Drift: cron, datakilder, hemmeligheter, feilsøking
```

## Skjemaendringer

**Aldri direkte i produksjon.** Endre lokalt, lag en migrasjonsfil, test at den
bygger fra bunnen, og send den ut:

```bash
npm run db:diff -- -f beskrivende_navn   # skriver ny fil i supabase/migrations/
npm run db:reset                         # test at alt bygger rent
npm run db:push                          # ut i produksjon
```

`db diff` tar ikke med `grant`/`revoke`, `security_invoker` på views eller
cron-jobber. Skriv dem inn for hånd i migrasjonen — se
[docs/DRIFT.md](docs/DRIFT.md#skjemaendringer).

## Edge-funksjoner

| Funksjon | Kjører | Gjør |
| --- | --- | --- |
| `fis-list-import` | 04:45 UTC | Importerer FIS-punktlista |
| `isonen-signups` | 05:00 UTC | Teller påmeldte i iSonen |
| `fis-cup-standings` | 05:15 UTC | Henter cupstillinger |
| `fis-athlete` | 05:30 UTC + appen | Henter FIS-profil, poeng og resultater |
| `entry-reminders` | :05 hver time | Sender påminnelse om påmeldingsfrist |

```bash
npm run fn:deploy              # alle
npm run fn:deploy -- fis-athlete
```

Disse tre Supabase-secretsene må være satt, ellers sender `entry-reminders`
ingenting: `RESEND_API_KEY`, `REMINDER_FROM`, `APP_URL`. Detaljer i
[docs/DRIFT.md](docs/DRIFT.md#hemmeligheter).

## Publisere frontend på Netlify

1. Koble GitHub-repoet til Netlify, eller kjør `npm run build` og dra `dist/`
   inn i Netlify Deploys.
2. Legg inn `VITE_SUPABASE_URL` og `VITE_SUPABASE_KEY` under
   Site settings → Environment variables.
3. I Supabase → Authentication → URL Configuration: sett Site URL til
   Netlify-adressen og legg den til under Redirect URLs, ellers går
   innloggingslenkene til localhost.

## Roller

- **Trener**: oppretter lag ved første innlogging, får invitasjonskode, velger
  renn under «Alle renn», ser lagets sesong og setter status per løper.
- **Løper i lag**: blir med via invitasjonskode, ser «Min sesong» med lagets
  renn, svarer Ønsker / Kan ikke og skriver notat. Kan i tillegg legge renn til
  i sin egen plan under «Alle renn».
- **Løper uten lag (solo)**: velger «bruk kalenderen på egen hånd» ved første
  innlogging, plukker selv renn under «Alle renn» og styrer status selv
  (Planlagt / Påmeldt / Kan ikke). Kan bli med i et lag senere ved å oppgi
  invitasjonskode under «Profil».
- **Forelder**: kobler seg til en løper med løperens koblingskode og ser
  løperens sesong.

Onboarding vises til profilen er markert som `onboarded`. En løper uten lag har
`team_id = null`; egne renn lagres i `athlete_races` med `team_id = null`, og
disse beholdes som de er hvis løperen senere blir med i et lag.

## Testbrukere

Fem brukere på `@test.rennkalender` med passordet `Testpassord1!`, merket
`profiles.is_test = true`. De legges inn av `supabase/seed.sql` (kjøres av
`db:reset`) og fjernes med `scripts/drop-test-users.sql`. Oversikt i
[docs/DRIFT.md](docs/DRIFT.md#testbrukere).
