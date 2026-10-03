-- Far East Cup 2026/27 - FIS sin kontinentalcup i Asia.
-- Hentet fra FIS-kalenderen (categorycode=FEC, seasoncode=2027) 4. oktober 2026.
-- Kan kjøres flere ganger: steder gjenkjennes på navn, renn på FIS sin event-id.

insert into public.venues (name, country, lat, lng) values
  ('Wanlong Ski Resorts', 'CHN', 40.963, 115.398),
  ('Yongpyong Resort',    'KOR', 37.644, 128.681),
  ('Alpensia Resort',     'KOR', 37.658, 128.672),
  ('Sugadaira',           'JPN', 36.533, 138.325)
on conflict (name) do nothing;

insert into public.races
  (fis_event_id, start_date, end_date, venue_id, place, host_nation, organiser_nation, category, events, gender, season)
select x.fis_event_id, x.start_date::date, x.end_date::date, v.id, x.place, x.nat, null, 'FEC', x.events, 'W M', '2027'
from (values
  (64468, '2026-12-08', '2026-12-11', 'Wanlong Ski Resorts', 'CHN', '4xGS 4xSL'),
  (63785, '2027-01-25', '2027-01-26', 'Yongpyong Resort',    'KOR', '4xGS'),
  (63786, '2027-01-28', '2027-02-04', 'Alpensia Resort',     'KOR', '8xSL'),
  (63787, '2027-01-31', '2027-02-01', 'Yongpyong Resort',    'KOR', '4xGS'),
  (63464, '2027-02-22', '2027-02-26', 'Sugadaira',           'JPN', '4xGS 4xSL')
) as x(fis_event_id, start_date, end_date, place, nat, events)
join public.venues v on v.name = x.place
on conflict (fis_event_id) do nothing;
