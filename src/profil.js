// Kolonnene klienten får lese fra profiles. Foreldrekoden (link_code) er ikke
// med: den hentes av løperen selv gjennom min_foreldrekode(). En ny kolonne i
// tabellen må gis lesetilgang i en migrasjon og føres opp her.
export const PROFIL_FELT = 'id, full_name, role, team_id, fis_code, birth_year, gender, created_at, onboarded, home_city, plan_settings, lang, theme, is_test, is_admin, entry_alerts'
