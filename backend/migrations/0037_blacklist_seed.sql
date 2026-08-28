-- Initial event-blacklist rules (goingapp spam families, 2026-07..09 audit):
--   R1  — Koncert Chopinowski… Fryderyk by Agencja Presto (daily "kopia" spam)
--   R2a-e — the "przy świecach" candlelight genre, per organizer (user decision:
--           the whole genre is rejected regardless of goingapp carrying it)
--   R3  — PIJ, JEDZ, MALUJ workshop tour (one organizer reusing a single slug)
INSERT OR IGNORE INTO event_blacklist (id, pattern, venue, partner_id, partner_name, note, active, created_at, created_by) VALUES
  ('bl-r1', 'Koncert Chopinowski W Najpiękniejszej Sali Koncertowej Fryderyk', NULL, '2107', 'Agencja Presto', 'dzienny spam — 13 kopii jednego wydarzenia (31.08.2026)', 1, 1788040800000, 'seed'),
  ('bl-r2a', 'przy świecach', NULL, '2107', 'Agencja Presto', 'spam dzienny na Sali Koncertowej Fryderyk', 1, 1788040800000, 'seed'),
  ('bl-r2b', 'przy świecach', NULL, '4725', 'FUNDACJA NA RZECZ POMOCY PESTKA', 'gatunek przy świecach — Poznań/Wrocław/Katowice/Łódź', 1, 1788040800000, 'seed'),
  ('bl-r2c', 'przy świecach', NULL, '4702', 'DREAMLIVE CONCERTS', 'gatunek przy świecach — Kraków/Katowice', 1, 1788040800000, 'seed'),
  ('bl-r2d', 'przy świecach', NULL, '4464', '2S2S SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ', 'gatunek przy świecach — Rzeszów/Olsztyn', 1, 1788040800000, 'seed'),
  ('bl-r2e', 'przy świecach', NULL, '4532', 'Agencja kreatywna Barbara Knapczyk', 'gatunek przy świecach — Wrocław', 1, 1788040800000, 'seed'),
  ('bl-r3', 'pij jedz maluj', NULL, '4535', 'B3 MAREK KOTIUSZKO SPÓŁKA KOMANDYTOWO-AKCYJNA', 'warsztaty multi-city — jeden slug dla wszystkich miast', 1, 1788040800000, 'seed');
