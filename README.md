# Rennkalender 2026/27

Trener/løper-app for alpint rennplanlegging. React + Vite + Supabase, klar for Netlify.

## Kom i gang lokalt
```
npm install
npm run dev
```
`.env` inneholder Supabase-URL og publishable key (prosjekt «Rennkalender»).

## Publisere på Netlify
1. Push mappen til et Git-repo (GitHub) og koble repoet til et nytt Netlify-prosjekt,
   eller kjør `npm run build` og dra `dist/`-mappen inn i Netlify Deploys.
2. Legg inn miljøvariablene `VITE_SUPABASE_URL` og `VITE_SUPABASE_KEY` under Site settings → Environment variables.
3. I Supabase → Authentication → URL Configuration: sett Site URL til Netlify-adressen og legg den til under Redirect URLs, ellers går innloggingslenkene til localhost.

## Roller
- **Trener**: oppretter lag ved første innlogging, får invitasjonskode, velger renn under «Alle renn», ser lagets sesong og setter status per løper.
- **Løper i lag**: blir med via invitasjonskode, ser «Min sesong» med lagets renn, svarer Ønsker / Kan ikke og skriver notat. Kan i tillegg legge renn til i sin egen plan under «Alle renn».
- **Løper uten lag (solo)**: velger «bruk kalenderen på egen hånd» ved første innlogging, plukker selv renn under «Alle renn» og styrer status selv (Planlagt / Påmeldt / Kan ikke). Kan bli med i et lag senere ved å oppgi invitasjonskode under «Profil».

Onboarding vises til profilen er markert som `onboarded`. En løper uten lag har `team_id = null`;
egne renn lagres i `athlete_races` med `team_id = null`, og disse beholdes som de er hvis løperen
senere blir med i et lag.
