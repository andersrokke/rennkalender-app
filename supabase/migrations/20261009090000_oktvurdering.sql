-- Hvordan var økta, 1-10. Ønsket av en løper: da kan man finne igjen de
-- gode øktene og se hva de hadde felles - føre, vær, bakke, gren.
-- Anstrengelse (rpe) står som før; dette er noe annet: kvaliteten.
alter table public.training_sessions
  add column if not exists rating integer check (rating between 1 and 10);
