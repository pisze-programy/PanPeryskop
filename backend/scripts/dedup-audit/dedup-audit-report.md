# PanPeryskop — dedup audit (independent engine)

- generated: 2026-09-07T18:24:03.330Z · window: events from 2026-09-07
- engine: `backend/scripts/dedup-audit/engine.mjs` — **independent** (zero imports from app src), **100% coverage** (statements/branches/functions/lines), 52 tests.
- data: posts=6998 · cinema=5962 · non-cinema=1036 · geo(0,0)=45 · seed_candidates rejects=243 · seed_raw=0

## 1. Scope & coverage

| provider | non-cinema posts | in a suspicious group |
|---|---|---|
| kupbilecik | 448 | 140 |
| ebilet | 355 | 147 |
| mtp | 93 | 40 |
| meetup | 60 | 16 |
| going | 50 | 27 |
| luma | 16 | 2 |
| eventim | 14 | 6 |

**Total suspicious pairs:** 531 (same=18, ambiguous=494, different=19) · same-provider=262, cross-provider=269
**Involved posts:** 378 of 991 (38%)

## 2. Suspicious groups

#### G1 — 2026-09-07 · 2 members · winner `ebilet-210059-20260907` (ebilet)
- merged times (union): `[10:00, 10:30, 11:00, 11:30, 12:00, 12:30, 13:00, 13:30, 14:00, 14:30, 15:00, 15:30, 16:00, 16:30, 17:00, 17:30, 18:00, 18:30]` · winner shows: `[11:00, 11:30, 12:00, 12:30, 13:00, 13:30, 14:00, 14:30, 15:00, 15:30, 16:00, 16:30, 17:00, 17:30, 18:00]`
- pairs: 1 — same=0 ambiguous=1 different=0 · redundant posts (if all-same): ?

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `ebilet-23752-20260907` | ebilet | pending | BODY WORLDS – Vital - Poznań | MTP | 52.40640, 16.92520 | 10:00, 10:30, 11:00, 11:30, 12:00, 12:30, 13:00, 13:30, 14:00, 14:30, 15:00, 15:30, 16:00, 16:30, 17:00, 17:30, 18:00, 18:30 |
| `ebilet-210059-20260907` | ebilet | pending | Beksiński w Poznaniu | MTP | 52.40640, 16.92520 | 11:00, 11:30, 12:00, 12:30, 13:00, 13:30, 14:00, 14:30, 15:00, 15:30, 16:00, 16:30, 17:00, 17:30, 18:00 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| ambiguous | ebilet-23752-20260907 ↔ ebilet-210059-20260907 | cont=0.00 | vr=1 | geo=0km | gap=0m | ebilet/ebilet |

#### G2 — 2026-09-07 · 5 members · winner `kupbilecik-213696-20260907` (kupbilecik)
- merged times (union): `[19:00, 20:00, 20:30]` · winner shows: `[20:00]`
- pairs: 10 — same=0 ambiguous=10 different=0 · redundant posts (if all-same): ?

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `kupbilecik-213696-20260907` | kupbilecik | approved | Candlelight Chopin Concert Old Town Gdańsk | Sala pod Bazyliką Mariacką | 54.34992, 18.65305 | 20:00 |
| `kupbilecik-213227-20260907` | kupbilecik | approved | I like Chopin - kameralny koncert przy świecach | I like Chopin | 54.35510, 18.64909 | 19:00 |
| `kupbilecik-213858-20260907` | kupbilecik | approved | I like Queen - Piano Show | I like Chopin | 54.35510, 18.64909 | 20:30 |
| `ebilet-213429-20260907` | ebilet | pending | I like Queen - piano show przy świecach | Sala koncertowa I like CHOPIN | 54.35200, 18.64660 | 20:30 |
| `ebilet-211761-20260907` | ebilet | pending | I like CHOPIN | Sala koncertowa I like CHOPIN | 54.35200, 18.64660 | 19:00 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| ambiguous | kupbilecik-213696-20260907 ↔ kupbilecik-213227-20260907 | cont=0.00 | vr=0.308 | geo=0.631km | gap=60m | kupbilecik/kupbilecik |
| ambiguous | kupbilecik-213696-20260907 ↔ kupbilecik-213858-20260907 | cont=0.00 | vr=0.308 | geo=0.631km | gap=30m | kupbilecik/kupbilecik |
| ambiguous | kupbilecik-213696-20260907 ↔ ebilet-213429-20260907 | cont=0.00 | vr=0.436 | geo=0.478km | gap=30m | kupbilecik/ebilet |
| ambiguous | kupbilecik-213696-20260907 ↔ ebilet-211761-20260907 | cont=0.00 | vr=0.436 | geo=0.478km | gap=60m | kupbilecik/ebilet |
| ambiguous | kupbilecik-213227-20260907 ↔ kupbilecik-213858-20260907 | cont=0.00 | vr=1 | geo=0km | gap=90m | kupbilecik/kupbilecik |
| ambiguous | kupbilecik-213227-20260907 ↔ ebilet-213429-20260907 | cont=0.50 | vr=0.619 | geo=0.381km | gap=90m | kupbilecik/ebilet |
| ambiguous | kupbilecik-213227-20260907 ↔ ebilet-211761-20260907 | cont=0.00 | vr=0.619 | geo=0.381km | gap=0m | kupbilecik/ebilet |
| ambiguous | kupbilecik-213858-20260907 ↔ ebilet-213429-20260907 | cont=1.00 | vr=0.619 | geo=0.381km | gap=0m | kupbilecik/ebilet |
| ambiguous | kupbilecik-213858-20260907 ↔ ebilet-211761-20260907 | cont=0.00 | vr=0.619 | geo=0.381km | gap=90m | kupbilecik/ebilet |
| ambiguous | ebilet-213429-20260907 ↔ ebilet-211761-20260907 | cont=0.00 | vr=1 | geo=0km | gap=90m | ebilet/ebilet |

#### G3 — 2026-09-07 · 3 members · winner `ebilet-172054-20260907` (ebilet)
- merged times (union): `[18:00, 19:00, 20:00]` · winner shows: `[20:00]`
- pairs: 3 — same=0 ambiguous=3 different=0 · redundant posts (if all-same): ?

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `ebilet-172056-20260907` | ebilet | pending | Grand Piano Trio Chopin & Friends By Candle Glow | Klasztor O.O. Bernardynów | 50.06470, 19.94500 | 18:00 |
| `ebilet-172054-20260907` | ebilet | pending | Chopin & Friends Concert By Candle Glow | Klasztor O.O. Bernardynów | 50.06470, 19.94500 | 20:00 |
| `ebilet-181566-20260907` | ebilet | pending | Queen Classic Concert By Candle Glow | Klasztor O.O. Bernardynów | 50.06470, 19.94500 | 19:00 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| ambiguous | ebilet-172056-20260907 ↔ ebilet-172054-20260907 | cont=0.80 | vr=1 | geo=0km | gap=120m | ebilet/ebilet |
| ambiguous | ebilet-172056-20260907 ↔ ebilet-181566-20260907 | cont=0.40 | vr=1 | geo=0km | gap=60m | ebilet/ebilet |
| ambiguous | ebilet-172054-20260907 ↔ ebilet-181566-20260907 | cont=0.60 | vr=1 | geo=0km | gap=60m | ebilet/ebilet |

#### G4 — 2026-09-07 · 4 members · winner `kupbilecik-216527-20260907` (kupbilecik)
- merged times (union): `[16:00, 16:30, 17:00, 17:30, 18:00, 19:00, 20:00, 21:00]` · winner shows: `[20:00]`
- pairs: 6 — same=0 ambiguous=6 different=0 · redundant posts (if all-same): ?

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `ebilet-211889-20260907` | ebilet | approved | GENESIS – The Creation Light Show | Royal Chopin Hall | 50.05318, 19.93792 | 16:00, 16:30, 17:00, 17:30, 21:00 |
| `kupbilecik-216253-20260907` | kupbilecik | approved | Royal Chopin Hall - Queen Classic Candlelight | Royal Chopin Hall | 50.05318, 19.93792 | 19:00 |
| `kupbilecik-216527-20260907` | kupbilecik | approved | Chopin & Friends Concert Candlelight | Royal Chopin Hall | 50.05318, 19.93792 | 20:00 |
| `kupbilecik-217214-20260907` | kupbilecik | approved | Koncert Chopin & Friends przeniesie niejednego melomana w magiczny świat muzyki | Royal Chopin Hall | 50.05318, 19.93792 | 18:00 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| ambiguous | ebilet-211889-20260907 ↔ kupbilecik-216253-20260907 | cont=0.00 | vr=1 | geo=0km | gap=90m | ebilet/kupbilecik |
| ambiguous | ebilet-211889-20260907 ↔ kupbilecik-216527-20260907 | cont=0.00 | vr=1 | geo=0km | gap=60m | ebilet/kupbilecik |
| ambiguous | ebilet-211889-20260907 ↔ kupbilecik-217214-20260907 | cont=0.00 | vr=1 | geo=0km | gap=30m | ebilet/kupbilecik |
| ambiguous | kupbilecik-216253-20260907 ↔ kupbilecik-216527-20260907 | cont=0.33 | vr=1 | geo=0km | gap=60m | kupbilecik/kupbilecik |
| ambiguous | kupbilecik-216253-20260907 ↔ kupbilecik-217214-20260907 | cont=0.00 | vr=1 | geo=0km | gap=60m | kupbilecik/kupbilecik |
| ambiguous | kupbilecik-216527-20260907 ↔ kupbilecik-217214-20260907 | cont=0.33 | vr=1 | geo=0km | gap=120m | kupbilecik/kupbilecik |

#### G5 — 2026-09-07 · 2 members · winner `kupbilecik-217109-20260907` (kupbilecik)
- merged times (union): `[19:15, 20:30]` · winner shows: `[20:30]`
- pairs: 1 — same=0 ambiguous=1 different=0 · redundant posts (if all-same): ?

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `ebilet-146360-20260907` | ebilet | approved | Chopin & Friends Concert By Candle Glow | Kościół Rektorski Ojców Karmelitów pw. św. Katarzyny | 54.35294, 18.63086 | 19:15, 20:30 |
| `kupbilecik-217109-20260907` | kupbilecik | approved | Koncerty fortepianowe w Gdańsku | Kościół św. Katarzyny | 54.35443, 18.65239 | 20:30 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| ambiguous | ebilet-146360-20260907 ↔ kupbilecik-217109-20260907 | cont=0.00 | vr=0.571 | geo=1.405km | gap=0m | ebilet/kupbilecik |

#### G6 — 2026-09-07 · 2 members · winner `kupbilecik-210352-20260907` (kupbilecik)
- merged times (union): `[11:00]` · winner shows: `[11:00]`
- pairs: 1 — same=0 ambiguous=1 different=0 · redundant posts (if all-same): ?

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `ebilet-138964-20260907` | ebilet | approved | Muzeum Banksy | Muzeum Banksy | 50.05462, 19.94840 | 11:00 |
| `kupbilecik-210352-20260907` | kupbilecik | approved | Muzeum Banksy - bilet upoważniający do wejścia w ciągu całego dnia (od godz. 11:00) | Muzeum Banksy | 50.05511, 19.94810 | 11:00 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| ambiguous | ebilet-138964-20260907 ↔ kupbilecik-210352-20260907 | cont=0.00 | vr=1 | geo=0.058km | gap=0m | ebilet/kupbilecik |

#### G7 — 2026-09-07 · 4 members · winner `kupbilecik-217788-20260907` (kupbilecik)
- merged times (union): `[19:00, 21:00]` · winner shows: `[19:00]`
- pairs: 6 — same=0 ambiguous=6 different=0 · redundant posts (if all-same): ?

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `ebilet-25271-20260907` | ebilet | approved | Koncert Chopinowski | Sala Koncertowa „Fryderyk” | 52.24849, 21.00994 | 21:00 |
| `ebilet-68031-20260907` | ebilet | approved | Koncert Chopinowski w Chopin Point Warsaw | STARA GALERIA ZPAF | 52.24879, 21.01449 | 19:00 |
| `ebilet-131722-20260907` | ebilet | approved | Koncerty przy Świecach | Sala Koncertowa „Fryderyk” | 52.24849, 21.00994 | 21:00 |
| `kupbilecik-217788-20260907` | kupbilecik | approved | Nastrojowy wieczór z muzyką Chopina | Stara Galeria ZPAF | 52.24879, 21.01449 | 19:00 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| ambiguous | ebilet-25271-20260907 ↔ ebilet-68031-20260907 | cont=1.00 | vr=0.429 | geo=0.312km | gap=120m | ebilet/ebilet |
| ambiguous | ebilet-25271-20260907 ↔ ebilet-131722-20260907 | cont=0.00 | vr=1 | geo=0km | gap=0m | ebilet/ebilet |
| ambiguous | ebilet-25271-20260907 ↔ kupbilecik-217788-20260907 | cont=0.00 | vr=0.429 | geo=0.312km | gap=120m | ebilet/kupbilecik |
| ambiguous | ebilet-68031-20260907 ↔ ebilet-131722-20260907 | cont=0.00 | vr=0.429 | geo=0.312km | gap=120m | ebilet/ebilet |
| ambiguous | ebilet-68031-20260907 ↔ kupbilecik-217788-20260907 | cont=0.00 | vr=1 | geo=0km | gap=0m | ebilet/kupbilecik |
| ambiguous | ebilet-131722-20260907 ↔ kupbilecik-217788-20260907 | cont=0.00 | vr=0.429 | geo=0.312km | gap=120m | ebilet/kupbilecik |

#### G8 — 2026-09-07 · 2 members · winner `kupbilecik-205183-20260907` (kupbilecik)
- merged times (union): `[19:30]` · winner shows: `[19:30]`
- pairs: 1 — same=0 ambiguous=1 different=0 · redundant posts (if all-same): ?

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `kupbilecik-205183-20260907` | kupbilecik | approved | Średniowieczna forma. Współczesne brzmienie. | Opera i Filharmonia Podlaska - ul. Podleśna | 53.12301, 23.16625 | 19:30 |
| `kupbilecik-210293-20260907` | kupbilecik | approved | Średniowieczna forma. Współczesne brzmienie. | Opera i Filharmonia Podlaska Europejskie Centrum Sztuki - ul. Odeska | 53.13022, 23.15019 | 19:30 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| ambiguous | kupbilecik-205183-20260907 ↔ kupbilecik-210293-20260907 | cont=1.00 | vr=0.705 | geo=1.339km | gap=0m | kupbilecik/kupbilecik |

#### G9 — 2026-09-08 · 2 members · winner `kupbilecik-215427-20260908` (kupbilecik)
- merged times (union): `[19:00, 20:00]` · winner shows: `[20:00]`
- pairs: 1 — same=0 ambiguous=1 different=0 · redundant posts (if all-same): ?

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `kupbilecik-215427-20260908` | kupbilecik | approved | Będę grał w grę - improwizowane show komediowe | Klub Nietota | 51.10771, 17.03163 | 20:00 |
| `kupbilecik-216454-20260908` | kupbilecik | approved | SUMO - Stand-Up Mic Open | Klub Wędrówki | 51.10416, 17.02996 | 19:00 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| ambiguous | kupbilecik-215427-20260908 ↔ kupbilecik-216454-20260908 | cont=0.00 | vr=0.56 | geo=0.412km | gap=60m | kupbilecik/kupbilecik |

#### G10 — 2026-09-08 · 2 members · winner `ebilet-210059-20260908` (ebilet)
- merged times (union): `[10:00, 10:30, 11:00, 11:30, 12:00, 12:30, 13:00, 13:30, 14:00, 14:30, 15:00, 15:30, 16:00, 16:30, 17:00, 17:30, 18:00, 18:30]` · winner shows: `[11:00, 11:30, 12:00, 12:30, 13:00, 13:30, 14:00, 14:30, 15:00, 15:30, 16:00, 16:30, 17:00, 17:30, 18:00]`
- pairs: 1 — same=0 ambiguous=1 different=0 · redundant posts (if all-same): ?

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `ebilet-23752-20260908` | ebilet | pending | BODY WORLDS – Vital - Poznań | MTP | 52.40640, 16.92520 | 10:00, 10:30, 11:00, 11:30, 12:00, 12:30, 13:00, 13:30, 14:00, 14:30, 15:00, 15:30, 16:00, 16:30, 17:00, 17:30, 18:00, 18:30 |
| `ebilet-210059-20260908` | ebilet | pending | Beksiński w Poznaniu | MTP | 52.40640, 16.92520 | 11:00, 11:30, 12:00, 12:30, 13:00, 13:30, 14:00, 14:30, 15:00, 15:30, 16:00, 16:30, 17:00, 17:30, 18:00 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| ambiguous | ebilet-23752-20260908 ↔ ebilet-210059-20260908 | cont=0.00 | vr=1 | geo=0km | gap=0m | ebilet/ebilet |

#### G11 — 2026-09-08 · 6 members · winner `kupbilecik-213697-20260908` (kupbilecik)
- merged times (union): `[19:00, 20:00, 20:30]` · winner shows: `[20:00]`
- pairs: 15 — same=0 ambiguous=15 different=0 · redundant posts (if all-same): ?

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `kupbilecik-206389-20260908` | kupbilecik | approved | Muzyka Ludovica Einaudiego | Filharmonia Bałtycka - Sala Kameralna | 54.35234, 18.65980 | 19:00 |
| `kupbilecik-213697-20260908` | kupbilecik | approved | Candlelight Chopin Concert Old Town Gdańsk | Sala pod Bazyliką Mariacką | 54.34992, 18.65305 | 20:00 |
| `kupbilecik-213228-20260908` | kupbilecik | approved | I like Chopin - kameralny koncert przy świecach | I like Chopin | 54.35510, 18.64909 | 19:00 |
| `kupbilecik-213859-20260908` | kupbilecik | approved | I like Queen - Piano Show | I like Chopin | 54.35510, 18.64909 | 20:30 |
| `ebilet-211761-20260908` | ebilet | pending | I like CHOPIN | Sala koncertowa I like CHOPIN | 54.35200, 18.64660 | 19:00 |
| `ebilet-213429-20260908` | ebilet | pending | I like Queen - piano show przy świecach | Sala koncertowa I like CHOPIN | 54.35200, 18.64660 | 20:30 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| ambiguous | kupbilecik-206389-20260908 ↔ kupbilecik-213697-20260908 | cont=0.00 | vr=0.459 | geo=0.514km | gap=60m | kupbilecik/kupbilecik |
| ambiguous | kupbilecik-206389-20260908 ↔ kupbilecik-213228-20260908 | cont=0.00 | vr=0.25 | geo=0.759km | gap=0m | kupbilecik/kupbilecik |
| ambiguous | kupbilecik-206389-20260908 ↔ kupbilecik-213859-20260908 | cont=0.00 | vr=0.25 | geo=0.759km | gap=90m | kupbilecik/kupbilecik |
| ambiguous | kupbilecik-206389-20260908 ↔ ebilet-211761-20260908 | cont=0.00 | vr=0.344 | geo=0.856km | gap=0m | kupbilecik/ebilet |
| ambiguous | kupbilecik-206389-20260908 ↔ ebilet-213429-20260908 | cont=0.00 | vr=0.344 | geo=0.856km | gap=90m | kupbilecik/ebilet |
| ambiguous | kupbilecik-213697-20260908 ↔ kupbilecik-213228-20260908 | cont=0.00 | vr=0.308 | geo=0.631km | gap=60m | kupbilecik/kupbilecik |
| ambiguous | kupbilecik-213697-20260908 ↔ kupbilecik-213859-20260908 | cont=0.00 | vr=0.308 | geo=0.631km | gap=30m | kupbilecik/kupbilecik |
| ambiguous | kupbilecik-213697-20260908 ↔ ebilet-211761-20260908 | cont=0.00 | vr=0.436 | geo=0.478km | gap=60m | kupbilecik/ebilet |
| ambiguous | kupbilecik-213697-20260908 ↔ ebilet-213429-20260908 | cont=0.00 | vr=0.436 | geo=0.478km | gap=30m | kupbilecik/ebilet |
| ambiguous | kupbilecik-213228-20260908 ↔ kupbilecik-213859-20260908 | cont=0.00 | vr=1 | geo=0km | gap=90m | kupbilecik/kupbilecik |
| ambiguous | kupbilecik-213228-20260908 ↔ ebilet-211761-20260908 | cont=0.00 | vr=0.619 | geo=0.381km | gap=0m | kupbilecik/ebilet |
| ambiguous | kupbilecik-213228-20260908 ↔ ebilet-213429-20260908 | cont=0.50 | vr=0.619 | geo=0.381km | gap=90m | kupbilecik/ebilet |
| ambiguous | kupbilecik-213859-20260908 ↔ ebilet-211761-20260908 | cont=0.00 | vr=0.619 | geo=0.381km | gap=90m | kupbilecik/ebilet |
| ambiguous | kupbilecik-213859-20260908 ↔ ebilet-213429-20260908 | cont=1.00 | vr=0.619 | geo=0.381km | gap=0m | kupbilecik/ebilet |
| ambiguous | ebilet-211761-20260908 ↔ ebilet-213429-20260908 | cont=0.00 | vr=1 | geo=0km | gap=90m | ebilet/ebilet |

#### G12 — 2026-09-08 · 3 members · winner `ebilet-172054-20260908` (ebilet)
- merged times (union): `[18:00, 19:00, 20:00]` · winner shows: `[20:00]`
- pairs: 3 — same=0 ambiguous=3 different=0 · redundant posts (if all-same): ?

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `ebilet-172054-20260908` | ebilet | pending | Chopin & Friends Concert By Candle Glow | Klasztor O.O. Bernardynów | 50.06470, 19.94500 | 20:00 |
| `ebilet-181566-20260908` | ebilet | pending | Queen Classic Concert By Candle Glow | Klasztor O.O. Bernardynów | 50.06470, 19.94500 | 19:00 |
| `ebilet-172056-20260908` | ebilet | pending | Grand Piano Trio Chopin & Friends By Candle Glow | Klasztor O.O. Bernardynów | 50.06470, 19.94500 | 18:00 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| ambiguous | ebilet-172054-20260908 ↔ ebilet-181566-20260908 | cont=0.60 | vr=1 | geo=0km | gap=60m | ebilet/ebilet |
| ambiguous | ebilet-172054-20260908 ↔ ebilet-172056-20260908 | cont=0.80 | vr=1 | geo=0km | gap=120m | ebilet/ebilet |
| ambiguous | ebilet-181566-20260908 ↔ ebilet-172056-20260908 | cont=0.40 | vr=1 | geo=0km | gap=60m | ebilet/ebilet |

#### G13 — 2026-09-08 · 4 members · winner `kupbilecik-216528-20260908` (kupbilecik)
- merged times (union): `[16:00, 16:30, 17:00, 17:30, 18:00, 19:00, 20:00, 21:00]` · winner shows: `[20:00]`
- pairs: 6 — same=0 ambiguous=6 different=0 · redundant posts (if all-same): ?

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `ebilet-211889-20260908` | ebilet | approved | GENESIS – The Creation Light Show | Royal Chopin Hall | 50.05318, 19.93792 | 16:00, 16:30, 17:00, 17:30, 21:00 |
| `kupbilecik-217215-20260908` | kupbilecik | approved | Koncert Chopin & Friends przeniesie niejednego melomana w magiczny świat muzyki | Royal Chopin Hall | 50.05318, 19.93792 | 18:00 |
| `kupbilecik-216528-20260908` | kupbilecik | approved | Chopin & Friends Concert Candlelight | Royal Chopin Hall | 50.05318, 19.93792 | 20:00 |
| `kupbilecik-216682-20260908` | kupbilecik | approved | Royal Chopin Hall - Queen Classic Candlelight | Royal Chopin Hall | 50.05318, 19.93792 | 19:00 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| ambiguous | ebilet-211889-20260908 ↔ kupbilecik-217215-20260908 | cont=0.00 | vr=1 | geo=0km | gap=30m | ebilet/kupbilecik |
| ambiguous | ebilet-211889-20260908 ↔ kupbilecik-216528-20260908 | cont=0.00 | vr=1 | geo=0km | gap=60m | ebilet/kupbilecik |
| ambiguous | ebilet-211889-20260908 ↔ kupbilecik-216682-20260908 | cont=0.00 | vr=1 | geo=0km | gap=90m | ebilet/kupbilecik |
| ambiguous | kupbilecik-217215-20260908 ↔ kupbilecik-216528-20260908 | cont=0.33 | vr=1 | geo=0km | gap=120m | kupbilecik/kupbilecik |
| ambiguous | kupbilecik-217215-20260908 ↔ kupbilecik-216682-20260908 | cont=0.00 | vr=1 | geo=0km | gap=60m | kupbilecik/kupbilecik |
| ambiguous | kupbilecik-216528-20260908 ↔ kupbilecik-216682-20260908 | cont=0.33 | vr=1 | geo=0km | gap=60m | kupbilecik/kupbilecik |

#### G14 — 2026-09-08 · 2 members · winner `ebilet-205694-20260908` (ebilet)
- merged times (union): `[10:00, 11:00]` · winner shows: `[11:00]`
- pairs: 1 — same=0 ambiguous=1 different=0 · redundant posts (if all-same): ?

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `ebilet-205694-20260908` | ebilet | approved | Indywidualne zwiedzanie wystawy | Muzeum Sztuki Nowoczesnej | 52.23313, 21.00898 | 11:00 |
| `ebilet-126412-20260908` | ebilet | approved | Zwiedzanie Muzeum - Mt 5,14 | Muzeum Jana Pawła II i Prymasa Wyszyńskiego | 52.22585, 21.01627 | 10:00 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| ambiguous | ebilet-205694-20260908 ↔ ebilet-126412-20260908 | cont=1.00 | vr=0.382 | geo=0.95km | gap=60m | ebilet/ebilet |

#### G15 — 2026-09-08 · 2 members · winner `kupbilecik-217111-20260908` (kupbilecik)
- merged times (union): `[19:15, 20:30]` · winner shows: `[20:30]`
- pairs: 1 — same=0 ambiguous=1 different=0 · redundant posts (if all-same): ?

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `ebilet-146360-20260908` | ebilet | approved | Chopin & Friends Concert By Candle Glow | Kościół Rektorski Ojców Karmelitów pw. św. Katarzyny | 54.35294, 18.63086 | 19:15, 20:30 |
| `kupbilecik-217111-20260908` | kupbilecik | approved | Koncerty fortepianowe w Gdańsku | Kościół św. Katarzyny | 54.35443, 18.65239 | 20:30 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| ambiguous | ebilet-146360-20260908 ↔ kupbilecik-217111-20260908 | cont=0.00 | vr=0.571 | geo=1.405km | gap=0m | ebilet/kupbilecik |

#### G16 — 2026-09-08 · 2 members · winner `kupbilecik-210353-20260908` (kupbilecik)
- merged times (union): `[11:00]` · winner shows: `[11:00]`
- pairs: 1 — same=0 ambiguous=1 different=0 · redundant posts (if all-same): ?

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `ebilet-138964-20260908` | ebilet | approved | Muzeum Banksy | Muzeum Banksy | 50.05462, 19.94840 | 11:00 |
| `kupbilecik-210353-20260908` | kupbilecik | approved | Muzeum Banksy - bilet upoważniający do wejścia w ciągu całego dnia (od godz. 11:00) | Muzeum Banksy | 50.05511, 19.94810 | 11:00 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| ambiguous | ebilet-138964-20260908 ↔ kupbilecik-210353-20260908 | cont=0.00 | vr=1 | geo=0.058km | gap=0m | ebilet/kupbilecik |

#### G17 — 2026-09-08 · 4 members · winner `kupbilecik-217789-20260908` (kupbilecik)
- merged times (union): `[19:00, 21:00]` · winner shows: `[19:00]`
- pairs: 6 — same=0 ambiguous=6 different=0 · redundant posts (if all-same): ?

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `ebilet-25271-20260908` | ebilet | approved | Koncert Chopinowski | Sala Koncertowa „Fryderyk” | 52.24849, 21.00994 | 21:00 |
| `ebilet-131722-20260908` | ebilet | approved | Koncerty przy Świecach | Sala Koncertowa „Fryderyk” | 52.24849, 21.00994 | 21:00 |
| `ebilet-68031-20260908` | ebilet | approved | Koncert Chopinowski w Chopin Point Warsaw | STARA GALERIA ZPAF | 52.24879, 21.01449 | 19:00 |
| `kupbilecik-217789-20260908` | kupbilecik | approved | Nastrojowy wieczór z muzyką Chopina | Stara Galeria ZPAF | 52.24879, 21.01449 | 19:00 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| ambiguous | ebilet-25271-20260908 ↔ ebilet-131722-20260908 | cont=0.00 | vr=1 | geo=0km | gap=0m | ebilet/ebilet |
| ambiguous | ebilet-25271-20260908 ↔ ebilet-68031-20260908 | cont=1.00 | vr=0.429 | geo=0.312km | gap=120m | ebilet/ebilet |
| ambiguous | ebilet-25271-20260908 ↔ kupbilecik-217789-20260908 | cont=0.00 | vr=0.429 | geo=0.312km | gap=120m | ebilet/kupbilecik |
| ambiguous | ebilet-131722-20260908 ↔ ebilet-68031-20260908 | cont=0.00 | vr=0.429 | geo=0.312km | gap=120m | ebilet/ebilet |
| ambiguous | ebilet-131722-20260908 ↔ kupbilecik-217789-20260908 | cont=0.00 | vr=0.429 | geo=0.312km | gap=120m | ebilet/kupbilecik |
| ambiguous | ebilet-68031-20260908 ↔ kupbilecik-217789-20260908 | cont=0.00 | vr=1 | geo=0km | gap=0m | ebilet/kupbilecik |

#### G18 — 2026-09-09 · 2 members · winner `going-2414142` (going)
- merged times (union): `[19:00, 20:00]` · winner shows: `[19:00]`
- pairs: 1 — same=1 ambiguous=0 different=0 · redundant posts (if all-same): 1

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `ebilet-208452-20260909` | ebilet | approved | ALEX SPENCER | BARdzo bardzo | 52.22972, 21.01778 | 20:00 |
| `going-2414142` | going | approved | Alex Spencer \| Warszawa | BARdzo bardzo | 52.22910, 21.01777 | 19:00 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| same | ebilet-208452-20260909 ↔ going-2414142 | cont=1.00 | vr=1 | geo=0.069km | gap=60m | ebilet/going |

#### G19 — 2026-09-09 · 2 members · winner `kupbilecik-198948-20260909` (kupbilecik)
- merged times (union): `[19:00]` · winner shows: `[19:00]`
- pairs: 1 — same=0 ambiguous=1 different=0 · redundant posts (if all-same): ?

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `ebilet-155316-20260909` | ebilet | approved | Antimatter & Sleeping Pulse | 2Progi | 52.41494, 16.92647 | 19:00 |
| `kupbilecik-198948-20260909` | kupbilecik | approved | Antimatter & Sleeping Pulse | Klub 2Progi | 52.41809, 16.93100 | 19:00 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| ambiguous | ebilet-155316-20260909 ↔ kupbilecik-198948-20260909 | cont=1.00 | vr=0.706 | geo=0.466km | gap=0m | ebilet/kupbilecik |

#### G20 — 2026-09-09 · 2 members · winner `ebilet-210059-20260909` (ebilet)
- merged times (union): `[10:00, 10:30, 11:00, 11:30, 12:00, 12:30, 13:00, 13:30, 14:00, 14:30, 15:00, 15:30, 16:00, 16:30, 17:00, 17:30, 18:00, 18:30]` · winner shows: `[11:00, 11:30, 12:00, 12:30, 13:00, 13:30, 14:00, 14:30, 15:00, 15:30, 16:00, 16:30, 17:00, 17:30, 18:00]`
- pairs: 1 — same=0 ambiguous=1 different=0 · redundant posts (if all-same): ?

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `ebilet-23752-20260909` | ebilet | pending | BODY WORLDS – Vital - Poznań | MTP | 52.40640, 16.92520 | 10:00, 10:30, 11:00, 11:30, 12:00, 12:30, 13:00, 13:30, 14:00, 14:30, 15:00, 15:30, 16:00, 16:30, 17:00, 17:30, 18:00, 18:30 |
| `ebilet-210059-20260909` | ebilet | pending | Beksiński w Poznaniu | MTP | 52.40640, 16.92520 | 11:00, 11:30, 12:00, 12:30, 13:00, 13:30, 14:00, 14:30, 15:00, 15:30, 16:00, 16:30, 17:00, 17:30, 18:00 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| ambiguous | ebilet-23752-20260909 ↔ ebilet-210059-20260909 | cont=0.00 | vr=1 | geo=0km | gap=0m | ebilet/ebilet |

#### G21 — 2026-09-09 · 5 members · winner `kupbilecik-213698-20260909` (kupbilecik)
- merged times (union): `[19:00, 20:00, 20:30]` · winner shows: `[20:00]`
- pairs: 10 — same=0 ambiguous=10 different=0 · redundant posts (if all-same): ?

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `kupbilecik-213698-20260909` | kupbilecik | approved | Candlelight Chopin Concert Old Town Gdańsk | Sala pod Bazyliką Mariacką | 54.34992, 18.65305 | 20:00 |
| `kupbilecik-213229-20260909` | kupbilecik | approved | I like Chopin - kameralny koncert przy świecach | I like Chopin | 54.35510, 18.64909 | 19:00 |
| `kupbilecik-213860-20260909` | kupbilecik | approved | I like Queen - Piano Show | I like Chopin | 54.35510, 18.64909 | 20:30 |
| `ebilet-213429-20260909` | ebilet | pending | I like Queen - piano show przy świecach | Sala koncertowa I like CHOPIN | 54.35200, 18.64660 | 20:30 |
| `ebilet-211761-20260909` | ebilet | pending | I like CHOPIN | Sala koncertowa I like CHOPIN | 54.35200, 18.64660 | 19:00 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| ambiguous | kupbilecik-213698-20260909 ↔ kupbilecik-213229-20260909 | cont=0.00 | vr=0.308 | geo=0.631km | gap=60m | kupbilecik/kupbilecik |
| ambiguous | kupbilecik-213698-20260909 ↔ kupbilecik-213860-20260909 | cont=0.00 | vr=0.308 | geo=0.631km | gap=30m | kupbilecik/kupbilecik |
| ambiguous | kupbilecik-213698-20260909 ↔ ebilet-213429-20260909 | cont=0.00 | vr=0.436 | geo=0.478km | gap=30m | kupbilecik/ebilet |
| ambiguous | kupbilecik-213698-20260909 ↔ ebilet-211761-20260909 | cont=0.00 | vr=0.436 | geo=0.478km | gap=60m | kupbilecik/ebilet |
| ambiguous | kupbilecik-213229-20260909 ↔ kupbilecik-213860-20260909 | cont=0.00 | vr=1 | geo=0km | gap=90m | kupbilecik/kupbilecik |
| ambiguous | kupbilecik-213229-20260909 ↔ ebilet-213429-20260909 | cont=0.50 | vr=0.619 | geo=0.381km | gap=90m | kupbilecik/ebilet |
| ambiguous | kupbilecik-213229-20260909 ↔ ebilet-211761-20260909 | cont=0.00 | vr=0.619 | geo=0.381km | gap=0m | kupbilecik/ebilet |
| ambiguous | kupbilecik-213860-20260909 ↔ ebilet-213429-20260909 | cont=1.00 | vr=0.619 | geo=0.381km | gap=0m | kupbilecik/ebilet |
| ambiguous | kupbilecik-213860-20260909 ↔ ebilet-211761-20260909 | cont=0.00 | vr=0.619 | geo=0.381km | gap=90m | kupbilecik/ebilet |
| ambiguous | ebilet-213429-20260909 ↔ ebilet-211761-20260909 | cont=0.00 | vr=1 | geo=0km | gap=90m | ebilet/ebilet |

#### G22 — 2026-09-09 · 4 members · winner `kupbilecik-216530-20260909` (kupbilecik)
- merged times (union): `[16:00, 16:30, 17:00, 17:30, 18:00, 19:00, 20:00, 21:00]` · winner shows: `[20:00]`
- pairs: 6 — same=0 ambiguous=6 different=0 · redundant posts (if all-same): ?

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `ebilet-211889-20260909` | ebilet | approved | GENESIS – The Creation Light Show | Royal Chopin Hall | 50.05318, 19.93792 | 16:00, 16:30, 17:00, 17:30, 21:00 |
| `kupbilecik-216530-20260909` | kupbilecik | approved | Chopin & Friends Concert Candlelight | Royal Chopin Hall | 50.05318, 19.93792 | 20:00 |
| `kupbilecik-217216-20260909` | kupbilecik | approved | Koncert Chopin & Friends przeniesie niejednego melomana w magiczny świat muzyki | Royal Chopin Hall | 50.05318, 19.93792 | 18:00 |
| `kupbilecik-216683-20260909` | kupbilecik | approved | Royal Chopin Hall - Queen Classic Candlelight | Royal Chopin Hall | 50.05318, 19.93792 | 19:00 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| ambiguous | ebilet-211889-20260909 ↔ kupbilecik-216530-20260909 | cont=0.00 | vr=1 | geo=0km | gap=60m | ebilet/kupbilecik |
| ambiguous | ebilet-211889-20260909 ↔ kupbilecik-217216-20260909 | cont=0.00 | vr=1 | geo=0km | gap=30m | ebilet/kupbilecik |
| ambiguous | ebilet-211889-20260909 ↔ kupbilecik-216683-20260909 | cont=0.00 | vr=1 | geo=0km | gap=90m | ebilet/kupbilecik |
| ambiguous | kupbilecik-216530-20260909 ↔ kupbilecik-217216-20260909 | cont=0.33 | vr=1 | geo=0km | gap=120m | kupbilecik/kupbilecik |
| ambiguous | kupbilecik-216530-20260909 ↔ kupbilecik-216683-20260909 | cont=0.33 | vr=1 | geo=0km | gap=60m | kupbilecik/kupbilecik |
| ambiguous | kupbilecik-217216-20260909 ↔ kupbilecik-216683-20260909 | cont=0.00 | vr=1 | geo=0km | gap=60m | kupbilecik/kupbilecik |

#### G23 — 2026-09-09 · 11 members · winner `meetup-315972112` (meetup)
- merged times (union): `[10:30]` · winner shows: `[10:30]`
- pairs: 55 — same=0 ambiguous=55 different=0 · redundant posts (if all-same): ?

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `meetup-316098731` | meetup | approved | OWASP Top 3 for LLMs 📯 | BEC | 52.23368, 21.00206 | 10:30 |
| `meetup-315972108` | meetup | approved | Cybersecurity Congress 2026 \| 09.09.2026 in Warsaw 📯 | BEC | 52.23368, 21.00206 | 10:30 |
| `meetup-316098744` | meetup | approved | OWASP Top 3 for LLMs 🎉 | Warsaw Financial Center | 52.23342, 21.00162 | 10:30 |
| `meetup-316185604` | meetup | approved | Weaponized LLMs: Defending Against the Next Generation of AI-Driven Engineering | Warsaw Financial Center | 52.23342, 21.00162 | 10:30 |
| `meetup-315972112` | meetup | approved | Cybersecurity Congress 2026 \| 09.09.2026 in Warsaw ⚙️ | Warsaw Financial Center | 52.23342, 21.00162 | 10:30 |
| `meetup-316253127` | meetup | approved | From AI Assistance to Agentic SDLC 📣 | Warsaw Financial Center | 52.23342, 21.00162 | 10:30 |
| `meetup-316264857` | meetup | approved | Think like an attacker: Hardening LLMs via AI Red Teaming ✈️ | Warsaw Financial Center | 52.23342, 21.00162 | 10:30 |
| `meetup-316264856` | meetup | approved | Think like an attacker: Hardening LLMs via AI Red Teaming 📯 | BEC | 52.23368, 21.00206 | 10:30 |
| `meetup-316098514` | meetup | approved | Seven questions that reveal every AI security risk 🔎 | Warsaw Financial Center | 52.23342, 21.00162 | 10:30 |
| `meetup-316098508` | meetup | approved | Seven questions that reveal every AI security risk 📣 | BEC Financial Technologies | 52.23366, 21.00186 | 10:30 |
| `meetup-316253141` | meetup | approved | From AI Assistance to Agentic SDLC 🔔 | BEC Financial Technologies | 52.23366, 21.00186 | 10:30 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| ambiguous | meetup-316098731 ↔ meetup-315972108 | cont=0.00 | vr=1 | geo=0km | gap=0m | meetup/meetup |
| ambiguous | meetup-316098731 ↔ meetup-316098744 | cont=1.00 | vr=0.077 | geo=0.042km | gap=0m | meetup/meetup |
| ambiguous | meetup-316098731 ↔ meetup-316185604 | cont=0.25 | vr=0.077 | geo=0.042km | gap=0m | meetup/meetup |
| ambiguous | meetup-316098731 ↔ meetup-315972112 | cont=0.00 | vr=0.077 | geo=0.042km | gap=0m | meetup/meetup |
| ambiguous | meetup-316098731 ↔ meetup-316253127 | cont=0.00 | vr=0.077 | geo=0.042km | gap=0m | meetup/meetup |
| ambiguous | meetup-316098731 ↔ meetup-316264857 | cont=0.25 | vr=0.077 | geo=0.042km | gap=0m | meetup/meetup |
| ambiguous | meetup-316098731 ↔ meetup-316264856 | cont=0.25 | vr=1 | geo=0km | gap=0m | meetup/meetup |
| ambiguous | meetup-316098731 ↔ meetup-316098514 | cont=0.00 | vr=0.077 | geo=0.042km | gap=0m | meetup/meetup |
| ambiguous | meetup-316098731 ↔ meetup-316098508 | cont=0.00 | vr=0.207 | geo=0.014km | gap=0m | meetup/meetup |
| ambiguous | meetup-316098731 ↔ meetup-316253141 | cont=0.00 | vr=0.207 | geo=0.014km | gap=0m | meetup/meetup |
| ambiguous | meetup-315972108 ↔ meetup-316098744 | cont=0.00 | vr=0.077 | geo=0.042km | gap=0m | meetup/meetup |
| ambiguous | meetup-315972108 ↔ meetup-316185604 | cont=0.00 | vr=0.077 | geo=0.042km | gap=0m | meetup/meetup |
| ambiguous | meetup-315972108 ↔ meetup-315972112 | cont=1.00 | vr=0.077 | geo=0.042km | gap=0m | meetup/meetup |
| ambiguous | meetup-315972108 ↔ meetup-316253127 | cont=0.00 | vr=0.077 | geo=0.042km | gap=0m | meetup/meetup |
| ambiguous | meetup-315972108 ↔ meetup-316264857 | cont=0.00 | vr=0.077 | geo=0.042km | gap=0m | meetup/meetup |
| ambiguous | meetup-315972108 ↔ meetup-316264856 | cont=0.00 | vr=1 | geo=0km | gap=0m | meetup/meetup |
| ambiguous | meetup-315972108 ↔ meetup-316098514 | cont=0.00 | vr=0.077 | geo=0.042km | gap=0m | meetup/meetup |
| ambiguous | meetup-315972108 ↔ meetup-316098508 | cont=0.00 | vr=0.207 | geo=0.014km | gap=0m | meetup/meetup |
| ambiguous | meetup-315972108 ↔ meetup-316253141 | cont=0.00 | vr=0.207 | geo=0.014km | gap=0m | meetup/meetup |
| ambiguous | meetup-316098744 ↔ meetup-316185604 | cont=0.25 | vr=1 | geo=0km | gap=0m | meetup/meetup |
| ambiguous | meetup-316098744 ↔ meetup-315972112 | cont=0.00 | vr=1 | geo=0km | gap=0m | meetup/meetup |
| ambiguous | meetup-316098744 ↔ meetup-316253127 | cont=0.00 | vr=1 | geo=0km | gap=0m | meetup/meetup |
| ambiguous | meetup-316098744 ↔ meetup-316264857 | cont=0.25 | vr=1 | geo=0km | gap=0m | meetup/meetup |
| ambiguous | meetup-316098744 ↔ meetup-316264856 | cont=0.25 | vr=0.077 | geo=0.042km | gap=0m | meetup/meetup |
| ambiguous | meetup-316098744 ↔ meetup-316098514 | cont=0.00 | vr=1 | geo=0km | gap=0m | meetup/meetup |
| ambiguous | meetup-316098744 ↔ meetup-316098508 | cont=0.00 | vr=0.571 | geo=0.031km | gap=0m | meetup/meetup |
| ambiguous | meetup-316098744 ↔ meetup-316253141 | cont=0.00 | vr=0.571 | geo=0.031km | gap=0m | meetup/meetup |
| ambiguous | meetup-316185604 ↔ meetup-315972112 | cont=0.00 | vr=1 | geo=0km | gap=0m | meetup/meetup |
| ambiguous | meetup-316185604 ↔ meetup-316253127 | cont=0.00 | vr=1 | geo=0km | gap=0m | meetup/meetup |
| ambiguous | meetup-316185604 ↔ meetup-316264857 | cont=0.13 | vr=1 | geo=0km | gap=0m | meetup/meetup |
| ambiguous | meetup-316185604 ↔ meetup-316264856 | cont=0.13 | vr=0.077 | geo=0.042km | gap=0m | meetup/meetup |
| ambiguous | meetup-316185604 ↔ meetup-316098514 | cont=0.00 | vr=1 | geo=0km | gap=0m | meetup/meetup |
| ambiguous | meetup-316185604 ↔ meetup-316098508 | cont=0.00 | vr=0.571 | geo=0.031km | gap=0m | meetup/meetup |
| ambiguous | meetup-316185604 ↔ meetup-316253141 | cont=0.00 | vr=0.571 | geo=0.031km | gap=0m | meetup/meetup |
| ambiguous | meetup-315972112 ↔ meetup-316253127 | cont=0.00 | vr=1 | geo=0km | gap=0m | meetup/meetup |
| ambiguous | meetup-315972112 ↔ meetup-316264857 | cont=0.00 | vr=1 | geo=0km | gap=0m | meetup/meetup |
| ambiguous | meetup-315972112 ↔ meetup-316264856 | cont=0.00 | vr=0.077 | geo=0.042km | gap=0m | meetup/meetup |
| ambiguous | meetup-315972112 ↔ meetup-316098514 | cont=0.00 | vr=1 | geo=0km | gap=0m | meetup/meetup |
| ambiguous | meetup-315972112 ↔ meetup-316098508 | cont=0.00 | vr=0.571 | geo=0.031km | gap=0m | meetup/meetup |
| ambiguous | meetup-315972112 ↔ meetup-316253141 | cont=0.00 | vr=0.571 | geo=0.031km | gap=0m | meetup/meetup |
| ambiguous | meetup-316253127 ↔ meetup-316264857 | cont=0.00 | vr=1 | geo=0km | gap=0m | meetup/meetup |
| ambiguous | meetup-316253127 ↔ meetup-316264856 | cont=0.00 | vr=0.077 | geo=0.042km | gap=0m | meetup/meetup |
| ambiguous | meetup-316253127 ↔ meetup-316098514 | cont=0.00 | vr=1 | geo=0km | gap=0m | meetup/meetup |
| ambiguous | meetup-316253127 ↔ meetup-316098508 | cont=0.00 | vr=0.571 | geo=0.031km | gap=0m | meetup/meetup |
| ambiguous | meetup-316253127 ↔ meetup-316253141 | cont=1.00 | vr=0.571 | geo=0.031km | gap=0m | meetup/meetup |
| ambiguous | meetup-316264857 ↔ meetup-316264856 | cont=1.00 | vr=0.077 | geo=0.042km | gap=0m | meetup/meetup |
| ambiguous | meetup-316264857 ↔ meetup-316098514 | cont=0.00 | vr=1 | geo=0km | gap=0m | meetup/meetup |
| ambiguous | meetup-316264857 ↔ meetup-316098508 | cont=0.00 | vr=0.571 | geo=0.031km | gap=0m | meetup/meetup |
| ambiguous | meetup-316264857 ↔ meetup-316253141 | cont=0.00 | vr=0.571 | geo=0.031km | gap=0m | meetup/meetup |
| ambiguous | meetup-316264856 ↔ meetup-316098514 | cont=0.00 | vr=0.077 | geo=0.042km | gap=0m | meetup/meetup |
| ambiguous | meetup-316264856 ↔ meetup-316098508 | cont=0.00 | vr=0.207 | geo=0.014km | gap=0m | meetup/meetup |
| ambiguous | meetup-316264856 ↔ meetup-316253141 | cont=0.00 | vr=0.207 | geo=0.014km | gap=0m | meetup/meetup |
| ambiguous | meetup-316098514 ↔ meetup-316098508 | cont=1.00 | vr=0.571 | geo=0.031km | gap=0m | meetup/meetup |
| ambiguous | meetup-316098514 ↔ meetup-316253141 | cont=0.00 | vr=0.571 | geo=0.031km | gap=0m | meetup/meetup |
| ambiguous | meetup-316098508 ↔ meetup-316253141 | cont=0.00 | vr=1 | geo=0km | gap=0m | meetup/meetup |

#### G24 — 2026-09-09 · 2 members · winner `ebilet-205694-20260909` (ebilet)
- merged times (union): `[10:00, 11:00]` · winner shows: `[11:00]`
- pairs: 1 — same=0 ambiguous=1 different=0 · redundant posts (if all-same): ?

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `ebilet-126412-20260909` | ebilet | approved | Zwiedzanie Muzeum - Mt 5,14 | Muzeum Jana Pawła II i Prymasa Wyszyńskiego | 52.22585, 21.01627 | 10:00 |
| `ebilet-205694-20260909` | ebilet | approved | Indywidualne zwiedzanie wystawy | Muzeum Sztuki Nowoczesnej | 52.23313, 21.00898 | 11:00 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| ambiguous | ebilet-126412-20260909 ↔ ebilet-205694-20260909 | cont=1.00 | vr=0.382 | geo=0.95km | gap=60m | ebilet/ebilet |

#### G25 — 2026-09-09 · 2 members · winner `kupbilecik-214519-20260909` (kupbilecik)
- merged times (union): `[19:00, 19:01]` · winner shows: `[19:00]`
- pairs: 1 — same=0 ambiguous=1 different=0 · redundant posts (if all-same): ?

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `kupbilecik-214519-20260909` | kupbilecik | approved | Ja chcę gór, a on morza więc jesteśmy w Kutnie - NOWOŚĆ | Klub Komediowy | 52.21969, 21.01669 | 19:00 |
| `kupbilecik-214832-20260909` | kupbilecik | approved | Kiedyś dzieci Neostrady, teraz dorośli niewolnicy Stravy | Klub Komediowy | 52.21969, 21.01669 | 19:01 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| ambiguous | kupbilecik-214519-20260909 ↔ kupbilecik-214832-20260909 | cont=0.00 | vr=1 | geo=0km | gap=1m | kupbilecik/kupbilecik |

#### G26 — 2026-09-09 · 2 members · winner `kupbilecik-217113-20260909` (kupbilecik)
- merged times (union): `[19:15, 20:30]` · winner shows: `[20:30]`
- pairs: 1 — same=0 ambiguous=1 different=0 · redundant posts (if all-same): ?

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `ebilet-146360-20260909` | ebilet | approved | Chopin & Friends Concert By Candle Glow | Kościół Rektorski Ojców Karmelitów pw. św. Katarzyny | 54.35294, 18.63086 | 19:15, 20:30 |
| `kupbilecik-217113-20260909` | kupbilecik | approved | Koncerty fortepianowe w Gdańsku | Kościół św. Katarzyny | 54.35443, 18.65239 | 20:30 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| ambiguous | ebilet-146360-20260909 ↔ kupbilecik-217113-20260909 | cont=0.00 | vr=0.571 | geo=1.405km | gap=0m | ebilet/kupbilecik |

#### G27 — 2026-09-09 · 4 members · winner `meetup-315854981` (meetup)
- merged times (union): `[18:00, 19:00, 20:00]` · winner shows: `[18:00]`
- pairs: 6 — same=0 ambiguous=6 different=0 · redundant posts (if all-same): ?

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `meetup-315854981` | meetup | approved | Kotlin turns 15! 🎉 | VirtusLab Sp. z o.o. | 50.07117, 19.93962 | 18:00 |
| `ebilet-172054-20260909` | ebilet | pending | Chopin & Friends Concert By Candle Glow | Klasztor O.O. Bernardynów | 50.06470, 19.94500 | 20:00 |
| `ebilet-181566-20260909` | ebilet | pending | Queen Classic Concert By Candle Glow | Klasztor O.O. Bernardynów | 50.06470, 19.94500 | 19:00 |
| `ebilet-172056-20260909` | ebilet | pending | Grand Piano Trio Chopin & Friends By Candle Glow | Klasztor O.O. Bernardynów | 50.06470, 19.94500 | 18:00 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| ambiguous | meetup-315854981 ↔ ebilet-172054-20260909 | cont=0.00 | vr=0.381 | geo=0.815km | gap=120m | meetup/ebilet |
| ambiguous | meetup-315854981 ↔ ebilet-181566-20260909 | cont=0.00 | vr=0.381 | geo=0.815km | gap=60m | meetup/ebilet |
| ambiguous | meetup-315854981 ↔ ebilet-172056-20260909 | cont=0.00 | vr=0.381 | geo=0.815km | gap=0m | meetup/ebilet |
| ambiguous | ebilet-172054-20260909 ↔ ebilet-181566-20260909 | cont=0.60 | vr=1 | geo=0km | gap=60m | ebilet/ebilet |
| ambiguous | ebilet-172054-20260909 ↔ ebilet-172056-20260909 | cont=0.80 | vr=1 | geo=0km | gap=120m | ebilet/ebilet |
| ambiguous | ebilet-181566-20260909 ↔ ebilet-172056-20260909 | cont=0.40 | vr=1 | geo=0km | gap=60m | ebilet/ebilet |

#### G28 — 2026-09-09 · 2 members · winner `kupbilecik-210354-20260909` (kupbilecik)
- merged times (union): `[11:00]` · winner shows: `[11:00]`
- pairs: 1 — same=0 ambiguous=1 different=0 · redundant posts (if all-same): ?

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `ebilet-138964-20260909` | ebilet | approved | Muzeum Banksy | Muzeum Banksy | 50.05462, 19.94840 | 11:00 |
| `kupbilecik-210354-20260909` | kupbilecik | approved | Muzeum Banksy - bilet upoważniający do wejścia w ciągu całego dnia (od godz. 11:00) | Muzeum Banksy | 50.05511, 19.94810 | 11:00 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| ambiguous | ebilet-138964-20260909 ↔ kupbilecik-210354-20260909 | cont=0.00 | vr=1 | geo=0.058km | gap=0m | ebilet/kupbilecik |

#### G29 — 2026-09-09 · 4 members · winner `kupbilecik-217790-20260909` (kupbilecik)
- merged times (union): `[19:00, 21:00]` · winner shows: `[19:00]`
- pairs: 6 — same=0 ambiguous=6 different=0 · redundant posts (if all-same): ?

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `ebilet-25271-20260909` | ebilet | approved | Koncert Chopinowski | Sala Koncertowa „Fryderyk” | 52.24849, 21.00994 | 21:00 |
| `ebilet-131722-20260909` | ebilet | approved | Koncerty przy Świecach | Sala Koncertowa „Fryderyk” | 52.24849, 21.00994 | 21:00 |
| `ebilet-68031-20260909` | ebilet | approved | Koncert Chopinowski w Chopin Point Warsaw | STARA GALERIA ZPAF | 52.24879, 21.01449 | 19:00 |
| `kupbilecik-217790-20260909` | kupbilecik | approved | Nastrojowy wieczór z muzyką Chopina | Stara Galeria ZPAF | 52.24879, 21.01449 | 19:00 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| ambiguous | ebilet-25271-20260909 ↔ ebilet-131722-20260909 | cont=0.00 | vr=1 | geo=0km | gap=0m | ebilet/ebilet |
| ambiguous | ebilet-25271-20260909 ↔ ebilet-68031-20260909 | cont=1.00 | vr=0.429 | geo=0.312km | gap=120m | ebilet/ebilet |
| ambiguous | ebilet-25271-20260909 ↔ kupbilecik-217790-20260909 | cont=0.00 | vr=0.429 | geo=0.312km | gap=120m | ebilet/kupbilecik |
| ambiguous | ebilet-131722-20260909 ↔ ebilet-68031-20260909 | cont=0.00 | vr=0.429 | geo=0.312km | gap=120m | ebilet/ebilet |
| ambiguous | ebilet-131722-20260909 ↔ kupbilecik-217790-20260909 | cont=0.00 | vr=0.429 | geo=0.312km | gap=120m | ebilet/kupbilecik |
| ambiguous | ebilet-68031-20260909 ↔ kupbilecik-217790-20260909 | cont=0.00 | vr=1 | geo=0km | gap=0m | ebilet/kupbilecik |

#### G30 — 2026-09-10 · 2 members · winner `kupbilecik-216323-20260910` (kupbilecik)
- merged times (union): `[19:00, 19:01]` · winner shows: `[19:01]`
- pairs: 1 — same=0 ambiguous=1 different=0 · redundant posts (if all-same): ?

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `kupbilecik-214636-20260910` | kupbilecik | approved | Ugotowałem Faberge na twardo, czyli co robić z czasem, kiedy jesteś pierdyliarderem | Klub Komediowy | 52.21969, 21.01669 | 19:00 |
| `kupbilecik-216323-20260910` | kupbilecik | approved | "Sekrety polskich mężczyzn" - impro z Justyną Kwil | Klub Komediowy | 52.21969, 21.01669 | 19:01 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| ambiguous | kupbilecik-214636-20260910 ↔ kupbilecik-216323-20260910 | cont=0.00 | vr=1 | geo=0km | gap=1m | kupbilecik/kupbilecik |

#### G31 — 2026-09-10 · 2 members · winner `ebilet-210059-20260910` (ebilet)
- merged times (union): `[10:00, 10:30, 11:00, 11:30, 12:00, 12:30, 13:00, 13:30, 14:00, 14:30, 15:00, 15:30, 16:00, 16:30, 17:00, 17:30, 18:00, 18:30]` · winner shows: `[11:00, 11:30, 12:00, 12:30, 13:00, 13:30, 14:00, 14:30, 15:00, 15:30, 16:00, 16:30, 17:00, 17:30, 18:00]`
- pairs: 1 — same=0 ambiguous=1 different=0 · redundant posts (if all-same): ?

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `ebilet-210059-20260910` | ebilet | pending | Beksiński w Poznaniu | MTP | 52.40640, 16.92520 | 11:00, 11:30, 12:00, 12:30, 13:00, 13:30, 14:00, 14:30, 15:00, 15:30, 16:00, 16:30, 17:00, 17:30, 18:00 |
| `ebilet-23752-20260910` | ebilet | pending | BODY WORLDS – Vital - Poznań | MTP | 52.40640, 16.92520 | 10:00, 10:30, 11:00, 11:30, 12:00, 12:30, 13:00, 13:30, 14:00, 14:30, 15:00, 15:30, 16:00, 16:30, 17:00, 17:30, 18:00, 18:30 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| ambiguous | ebilet-210059-20260910 ↔ ebilet-23752-20260910 | cont=0.00 | vr=1 | geo=0km | gap=0m | ebilet/ebilet |

#### G32 — 2026-09-10 · 5 members · winner `kupbilecik-213699-20260910` (kupbilecik)
- merged times (union): `[19:00, 20:00, 20:30]` · winner shows: `[20:00]`
- pairs: 10 — same=0 ambiguous=10 different=0 · redundant posts (if all-same): ?

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `kupbilecik-213699-20260910` | kupbilecik | approved | Candlelight Chopin Concert Old Town Gdańsk | Sala pod Bazyliką Mariacką | 54.34992, 18.65305 | 20:00 |
| `kupbilecik-213230-20260910` | kupbilecik | approved | I like Chopin - kameralny koncert przy świecach | I like Chopin | 54.35510, 18.64909 | 19:00 |
| `kupbilecik-213861-20260910` | kupbilecik | approved | I like Queen - Piano Show | I like Chopin | 54.35510, 18.64909 | 20:30 |
| `ebilet-213429-20260910` | ebilet | pending | I like Queen - piano show przy świecach | Sala koncertowa I like CHOPIN | 54.35200, 18.64660 | 20:30 |
| `ebilet-211761-20260910` | ebilet | pending | I like CHOPIN | Sala koncertowa I like CHOPIN | 54.35200, 18.64660 | 19:00 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| ambiguous | kupbilecik-213699-20260910 ↔ kupbilecik-213230-20260910 | cont=0.00 | vr=0.308 | geo=0.631km | gap=60m | kupbilecik/kupbilecik |
| ambiguous | kupbilecik-213699-20260910 ↔ kupbilecik-213861-20260910 | cont=0.00 | vr=0.308 | geo=0.631km | gap=30m | kupbilecik/kupbilecik |
| ambiguous | kupbilecik-213699-20260910 ↔ ebilet-213429-20260910 | cont=0.00 | vr=0.436 | geo=0.478km | gap=30m | kupbilecik/ebilet |
| ambiguous | kupbilecik-213699-20260910 ↔ ebilet-211761-20260910 | cont=0.00 | vr=0.436 | geo=0.478km | gap=60m | kupbilecik/ebilet |
| ambiguous | kupbilecik-213230-20260910 ↔ kupbilecik-213861-20260910 | cont=0.00 | vr=1 | geo=0km | gap=90m | kupbilecik/kupbilecik |
| ambiguous | kupbilecik-213230-20260910 ↔ ebilet-213429-20260910 | cont=0.50 | vr=0.619 | geo=0.381km | gap=90m | kupbilecik/ebilet |
| ambiguous | kupbilecik-213230-20260910 ↔ ebilet-211761-20260910 | cont=0.00 | vr=0.619 | geo=0.381km | gap=0m | kupbilecik/ebilet |
| ambiguous | kupbilecik-213861-20260910 ↔ ebilet-213429-20260910 | cont=1.00 | vr=0.619 | geo=0.381km | gap=0m | kupbilecik/ebilet |
| ambiguous | kupbilecik-213861-20260910 ↔ ebilet-211761-20260910 | cont=0.00 | vr=0.619 | geo=0.381km | gap=90m | kupbilecik/ebilet |
| ambiguous | ebilet-213429-20260910 ↔ ebilet-211761-20260910 | cont=0.00 | vr=1 | geo=0km | gap=90m | ebilet/ebilet |

#### G33 — 2026-09-10 · 3 members · winner `ebilet-172054-20260910` (ebilet)
- merged times (union): `[18:00, 19:00, 20:00]` · winner shows: `[20:00]`
- pairs: 3 — same=0 ambiguous=3 different=0 · redundant posts (if all-same): ?

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `ebilet-172056-20260910` | ebilet | pending | Grand Piano Trio Chopin & Friends By Candle Glow | Klasztor O.O. Bernardynów | 50.06470, 19.94500 | 18:00 |
| `ebilet-181566-20260910` | ebilet | pending | Queen Classic Concert By Candle Glow | Klasztor O.O. Bernardynów | 50.06470, 19.94500 | 19:00 |
| `ebilet-172054-20260910` | ebilet | pending | Chopin & Friends Concert By Candle Glow | Klasztor O.O. Bernardynów | 50.06470, 19.94500 | 20:00 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| ambiguous | ebilet-172056-20260910 ↔ ebilet-181566-20260910 | cont=0.40 | vr=1 | geo=0km | gap=60m | ebilet/ebilet |
| ambiguous | ebilet-172056-20260910 ↔ ebilet-172054-20260910 | cont=0.80 | vr=1 | geo=0km | gap=120m | ebilet/ebilet |
| ambiguous | ebilet-181566-20260910 ↔ ebilet-172054-20260910 | cont=0.60 | vr=1 | geo=0km | gap=60m | ebilet/ebilet |

#### G34 — 2026-09-10 · 4 members · winner `kupbilecik-216532-20260910` (kupbilecik)
- merged times (union): `[16:00, 16:30, 17:00, 17:30, 18:00, 19:00, 20:00, 21:00]` · winner shows: `[20:00]`
- pairs: 6 — same=0 ambiguous=6 different=0 · redundant posts (if all-same): ?

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `ebilet-211889-20260910` | ebilet | approved | GENESIS – The Creation Light Show | Royal Chopin Hall | 50.05318, 19.93792 | 16:00, 16:30, 17:00, 17:30, 21:00 |
| `kupbilecik-217217-20260910` | kupbilecik | approved | Koncert Chopin & Friends przeniesie niejednego melomana w magiczny świat muzyki | Royal Chopin Hall | 50.05318, 19.93792 | 18:00 |
| `kupbilecik-216532-20260910` | kupbilecik | approved | Chopin & Friends Concert Candlelight | Royal Chopin Hall | 50.05318, 19.93792 | 20:00 |
| `kupbilecik-216684-20260910` | kupbilecik | approved | Royal Chopin Hall - Queen Classic Candlelight | Royal Chopin Hall | 50.05318, 19.93792 | 19:00 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| ambiguous | ebilet-211889-20260910 ↔ kupbilecik-217217-20260910 | cont=0.00 | vr=1 | geo=0km | gap=30m | ebilet/kupbilecik |
| ambiguous | ebilet-211889-20260910 ↔ kupbilecik-216532-20260910 | cont=0.00 | vr=1 | geo=0km | gap=60m | ebilet/kupbilecik |
| ambiguous | ebilet-211889-20260910 ↔ kupbilecik-216684-20260910 | cont=0.00 | vr=1 | geo=0km | gap=90m | ebilet/kupbilecik |
| ambiguous | kupbilecik-217217-20260910 ↔ kupbilecik-216532-20260910 | cont=0.33 | vr=1 | geo=0km | gap=120m | kupbilecik/kupbilecik |
| ambiguous | kupbilecik-217217-20260910 ↔ kupbilecik-216684-20260910 | cont=0.00 | vr=1 | geo=0km | gap=60m | kupbilecik/kupbilecik |
| ambiguous | kupbilecik-216532-20260910 ↔ kupbilecik-216684-20260910 | cont=0.33 | vr=1 | geo=0km | gap=60m | kupbilecik/kupbilecik |

#### G35 — 2026-09-10 · 2 members · winner `meetup-315800674` (meetup)
- merged times (union): `[18:00, 19:00]` · winner shows: `[19:00]`
- pairs: 1 — same=0 ambiguous=1 different=0 · redundant posts (if all-same): ?

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `meetup-316181269` | meetup | approved | ProMEET#45 | Kawiarnia Klubu Żak | 54.38687, 18.59210 | 18:00 |
| `meetup-315800674` | meetup | approved | English Meetup at Klub Żak (non-alcohol) | Klub Żak | 54.38687, 18.59210 | 19:00 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| ambiguous | meetup-316181269 ↔ meetup-315800674 | cont=0.00 | vr=0.593 | geo=0km | gap=60m | meetup/meetup |

#### G36 — 2026-09-10 · 8 members · winner `going-2415718` (going)
- merged times (union): `[18:30, 19:00, 19:30]` · winner shows: `[19:00]`
- pairs: 28 — same=1 ambiguous=19 different=8 · redundant posts (if all-same): ?

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `ebilet-200700-20260910` | ebilet | approved | Zakochani w Młynarskim. Śpiewają Iza Połońska i goście | Teatr Muzyczny  Roma | 52.22741, 21.00781 | 19:00 |
| `going-2415718` | going | approved | Genialny pomysł | Teatr Capitol | 52.22970, 21.01220 | 19:00 |
| `going-2416311` | going | approved | Obiecuję, obiecuję ci… czyli bajka tylko dla dorosłych | Teatr Nowe Formy | 52.22970, 21.01220 | 18:30 |
| `going-2414127` | going | approved | Teściowe wiecznie żywe | Teatr Kamienica | 52.22970, 21.01220 | 19:30 |
| `kupbilecik-193563-20260910` | kupbilecik | approved | Reż. Olaf Lubaszenko | Teatr Kamienica - Scena ORLA | 52.24322, 20.99844 | 19:30 |
| `kupbilecik-198148-20260910` | kupbilecik | approved | Reżyseria: Wojciech Adamczyk | Teatr Capitol | 52.24107, 21.00316 | 19:00 |
| `kupbilecik-208357-20260910` | kupbilecik | approved | Śpiewają Iza Połońska i goście | Teatr Muzyczny ROMA | 52.22760, 21.00745 | 19:00 |
| `ebilet-36087-20260910` | ebilet | pending | LATA 20 LATA 30 | Teatr Sabat Małgorzaty Potockiej | 52.22970, 21.01220 | 19:30 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| ambiguous | ebilet-200700-20260910 ↔ going-2415718 | cont=0.00 | vr=0.5 | geo=0.393km | gap=0m | ebilet/going |
| ambiguous | ebilet-200700-20260910 ↔ going-2416311 | cont=0.00 | vr=0.571 | geo=0.393km | gap=30m | ebilet/going |
| ambiguous | ebilet-200700-20260910 ↔ going-2414127 | cont=0.00 | vr=0.529 | geo=0.393km | gap=30m | ebilet/going |
| different | ebilet-200700-20260910 ↔ kupbilecik-193563-20260910 | cont=0.00 | vr=0.533 | geo=—km | gap=30m | ebilet/kupbilecik |
| different | ebilet-200700-20260910 ↔ kupbilecik-198148-20260910 | cont=0.00 | vr=0.5 | geo=—km | gap=0m | ebilet/kupbilecik |
| same | ebilet-200700-20260910 ↔ kupbilecik-208357-20260910 | cont=1.00 | vr=1 | geo=0.032km | gap=0m | ebilet/kupbilecik |
| ambiguous | ebilet-200700-20260910 ↔ ebilet-36087-20260910 | cont=0.00 | vr=0.431 | geo=0.393km | gap=30m | ebilet/ebilet |
| ambiguous | going-2415718 ↔ going-2416311 | cont=0.00 | vr=0.483 | geo=0km | gap=30m | going/going |
| ambiguous | going-2415718 ↔ going-2414127 | cont=0.00 | vr=0.571 | geo=0km | gap=30m | going/going |
| different | going-2415718 ↔ kupbilecik-193563-20260910 | cont=0.00 | vr=0.513 | geo=—km | gap=30m | going/kupbilecik |
| ambiguous | going-2415718 ↔ kupbilecik-198148-20260910 | cont=0.00 | vr=1 | geo=1.407km | gap=0m | going/kupbilecik |
| ambiguous | going-2415718 ↔ kupbilecik-208357-20260910 | cont=0.00 | vr=0.5 | geo=0.399km | gap=0m | going/kupbilecik |
| ambiguous | going-2415718 ↔ ebilet-36087-20260910 | cont=0.00 | vr=0.444 | geo=0km | gap=30m | going/ebilet |
| ambiguous | going-2416311 ↔ going-2414127 | cont=0.00 | vr=0.452 | geo=0km | gap=60m | going/going |
| different | going-2416311 ↔ kupbilecik-193563-20260910 | cont=0.00 | vr=0.524 | geo=—km | gap=60m | going/kupbilecik |
| ambiguous | going-2416311 ↔ kupbilecik-198148-20260910 | cont=0.00 | vr=0.483 | geo=1.407km | gap=30m | going/kupbilecik |
| ambiguous | going-2416311 ↔ kupbilecik-208357-20260910 | cont=0.00 | vr=0.571 | geo=0.399km | gap=30m | going/kupbilecik |
| ambiguous | going-2416311 ↔ ebilet-36087-20260910 | cont=0.00 | vr=0.417 | geo=0km | gap=60m | going/ebilet |
| different | going-2414127 ↔ kupbilecik-193563-20260910 | cont=0.00 | vr=0.732 | geo=—km | gap=0m | going/kupbilecik |
| ambiguous | going-2414127 ↔ kupbilecik-198148-20260910 | cont=0.00 | vr=0.571 | geo=1.407km | gap=30m | going/kupbilecik |
| ambiguous | going-2414127 ↔ kupbilecik-208357-20260910 | cont=0.00 | vr=0.529 | geo=0.399km | gap=30m | going/kupbilecik |
| ambiguous | going-2414127 ↔ ebilet-36087-20260910 | cont=0.00 | vr=0.426 | geo=0km | gap=0m | going/ebilet |
| ambiguous | kupbilecik-193563-20260910 ↔ kupbilecik-198148-20260910 | cont=0.00 | vr=0.513 | geo=0.4km | gap=30m | kupbilecik/kupbilecik |
| different | kupbilecik-193563-20260910 ↔ kupbilecik-208357-20260910 | cont=0.00 | vr=0.533 | geo=—km | gap=30m | kupbilecik/kupbilecik |
| different | kupbilecik-193563-20260910 ↔ ebilet-36087-20260910 | cont=0.00 | vr=0.448 | geo=—km | gap=0m | kupbilecik/ebilet |
| different | kupbilecik-198148-20260910 ↔ kupbilecik-208357-20260910 | cont=0.00 | vr=0.5 | geo=—km | gap=0m | kupbilecik/kupbilecik |
| ambiguous | kupbilecik-198148-20260910 ↔ ebilet-36087-20260910 | cont=0.00 | vr=0.444 | geo=1.407km | gap=30m | kupbilecik/ebilet |
| ambiguous | kupbilecik-208357-20260910 ↔ ebilet-36087-20260910 | cont=0.00 | vr=0.431 | geo=0.399km | gap=30m | kupbilecik/ebilet |

#### G37 — 2026-09-10 · 2 members · winner `kupbilecik-204120-20260910` (kupbilecik)
- merged times (union): `[17:00, 20:00]` · winner shows: `[20:00]`
- pairs: 1 — same=1 ambiguous=0 different=0 · redundant posts (if all-same): 1

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `kupbilecik-206619-20260910` | kupbilecik | approved | hypeart.group zaprasza: Piotr Latała w programie 'Siwy dym' [stand-up] - II występ | Teatr Muzyczny | 51.78016, 19.47288 | 17:00 |
| `kupbilecik-204120-20260910` | kupbilecik | approved | hypeart.group zaprasza: Piotr Latała w programie 'Siwy dym' [stand-up] | Teatr Muzyczny | 51.78016, 19.47288 | 20:00 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| same | kupbilecik-206619-20260910 ↔ kupbilecik-204120-20260910 | cont=1.00 | vr=1 | geo=0km | gap=180m | kupbilecik/kupbilecik |

#### G38 — 2026-09-10 · 2 members · winner `ebilet-169920-20260910` (ebilet)
- merged times (union): `[09:00, 10:00]` · winner shows: `[09:00]`
- pairs: 1 — same=0 ambiguous=1 different=0 · redundant posts (if all-same): ?

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `ebilet-170024-20260910` | ebilet | approved | Ostróda/Stare Jabłonki SZLAK SZELĄGA | Przystań Ostróda | 53.69392, 19.96256 | 10:00 |
| `ebilet-169920-20260910` | ebilet | approved | JEZIORO DRWĘCKIE – REJS SPACEROWY | Przystań Ostróda | 53.69392, 19.96256 | 09:00 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| ambiguous | ebilet-170024-20260910 ↔ ebilet-169920-20260910 | cont=0.00 | vr=1 | geo=0km | gap=60m | ebilet/ebilet |

#### G39 — 2026-09-10 · 2 members · winner `ebilet-25271-20260910` (ebilet)
- merged times (union): `[21:00]` · winner shows: `[21:00]`
- pairs: 1 — same=0 ambiguous=1 different=0 · redundant posts (if all-same): ?

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `ebilet-25271-20260910` | ebilet | approved | Koncert Chopinowski | Sala Koncertowa „Fryderyk” | 52.24849, 21.00994 | 21:00 |
| `ebilet-131722-20260910` | ebilet | approved | Koncerty przy Świecach | Sala Koncertowa „Fryderyk” | 52.24849, 21.00994 | 21:00 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| ambiguous | ebilet-25271-20260910 ↔ ebilet-131722-20260910 | cont=0.00 | vr=1 | geo=0km | gap=0m | ebilet/ebilet |

#### G40 — 2026-09-10 · 2 members · winner `kupbilecik-217114-20260910` (kupbilecik)
- merged times (union): `[19:15, 20:30]` · winner shows: `[20:30]`
- pairs: 1 — same=0 ambiguous=1 different=0 · redundant posts (if all-same): ?

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `ebilet-146360-20260910` | ebilet | approved | Chopin & Friends Concert By Candle Glow | Kościół Rektorski Ojców Karmelitów pw. św. Katarzyny | 54.35294, 18.63086 | 19:15, 20:30 |
| `kupbilecik-217114-20260910` | kupbilecik | approved | Koncerty fortepianowe w Gdańsku | Kościół św. Katarzyny | 54.35443, 18.65239 | 20:30 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| ambiguous | ebilet-146360-20260910 ↔ kupbilecik-217114-20260910 | cont=0.00 | vr=0.571 | geo=1.405km | gap=0m | ebilet/kupbilecik |

#### G41 — 2026-09-10 · 2 members · winner `kupbilecik-210355-20260910` (kupbilecik)
- merged times (union): `[11:00]` · winner shows: `[11:00]`
- pairs: 1 — same=0 ambiguous=1 different=0 · redundant posts (if all-same): ?

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `ebilet-138964-20260910` | ebilet | approved | Muzeum Banksy | Muzeum Banksy | 50.05462, 19.94840 | 11:00 |
| `kupbilecik-210355-20260910` | kupbilecik | approved | Muzeum Banksy - bilet upoważniający do wejścia w ciągu całego dnia (od godz. 11:00) | Muzeum Banksy | 50.05511, 19.94810 | 11:00 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| ambiguous | ebilet-138964-20260910 ↔ kupbilecik-210355-20260910 | cont=0.00 | vr=1 | geo=0.058km | gap=0m | ebilet/kupbilecik |

#### G42 — 2026-09-10 · 2 members · winner `luma-evt-kL0nTmjPSNmZGo3` (luma)
- merged times (union): `[18:00]` · winner shows: `[18:00]`
- pairs: 1 — same=0 ambiguous=1 different=0 · redundant posts (if all-same): ?

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `luma-evt-kL0nTmjPSNmZGo3` | luma | approved | NextGen Founders Meetup Gdansk | Młyniska | 54.36299, 18.64799 | 18:00 |
| `meetup-315486327` | meetup | approved | NextGen Founders Meetup Gdańsk | Europejskie Centrum Solidarności | 54.35123, 18.64957 | 18:00 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| ambiguous | luma-evt-kL0nTmjPSNmZGo3 ↔ meetup-315486327 | cont=1.00 | vr=0.2 | geo=1.312km | gap=0m | luma/meetup |

#### G43 — 2026-09-10 · 2 members · winner `kupbilecik-215492-20260910` (kupbilecik)
- merged times (union): `[19:00, 19:45]` · winner shows: `[19:00]`
- pairs: 1 — same=0 ambiguous=1 different=0 · redundant posts (if all-same): ?

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `ebilet-213063-20260910` | ebilet | approved | The Laws playing SARCOFAGO European Tour 2026 | Klub Gwarek | 50.06574, 19.91573 | 19:45 |
| `kupbilecik-215492-20260910` | kupbilecik | approved | Wspomnienia z wakacji | Klub Buda | 50.06074, 19.93012 | 19:00 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| ambiguous | ebilet-213063-20260910 ↔ kupbilecik-215492-20260910 | cont=0.00 | vr=0.6 | geo=1.168km | gap=45m | ebilet/kupbilecik |

#### G44 — 2026-09-11 · 2 members · winner `kupbilecik-215519-20260911` (kupbilecik)
- merged times (union): `[20:00]` · winner shows: `[20:00]`
- pairs: 1 — same=0 ambiguous=1 different=0 · redundant posts (if all-same): ?

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `kupbilecik-213725-20260911` | kupbilecik | approved | Inauguracja nowej sceny Teatru Przypadków Feralnych | Teatr Przypadków Feralnych | 50.06236, 19.94247 | 20:00 |
| `kupbilecik-215519-20260911` | kupbilecik | approved | "Italian Passion - Burlesque Night" | Teatr Cabaret | 50.05101, 19.94170 | 20:00 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| ambiguous | kupbilecik-213725-20260911 ↔ kupbilecik-215519-20260911 | cont=0.00 | vr=0.41 | geo=1.263km | gap=0m | kupbilecik/kupbilecik |

#### G45 — 2026-09-11 · 6 members · winner `kupbilecik-194216-20260911` (kupbilecik)
- merged times (union): `[19:00, 19:30, 20:00]` · winner shows: `[19:00]`
- pairs: 15 — same=0 ambiguous=13 different=2 · redundant posts (if all-same): ?

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `ebilet-176641-20260911` | ebilet | approved | Wspaniałe horyzonty | Teatr 6 piętro. | 52.23196, 21.00672 | 19:30 |
| `kupbilecik-193564-20260911` | kupbilecik | approved | Reż. Olaf Lubaszenko | Teatr Kamienica - Scena ORLA | 52.24322, 20.99844 | 20:00 |
| `kupbilecik-194216-20260911` | kupbilecik | approved | "Kobieta, która ugotowała męża" to nowoczesna forma dramatu z elementami komedii. | Teatr Kamienica - Scena EMILIANA | 52.24322, 20.99844 | 19:00 |
| `kupbilecik-198149-20260911` | kupbilecik | approved | Reżyseria: Olaf Lubaszenko | Teatr Capitol - Scena mniejsza | 52.24107, 21.00316 | 19:30 |
| `kupbilecik-217187-20260911` | kupbilecik | approved | STAND-UP RESET | Piętro Niżej - Craft Beer Pub | 52.23632, 21.00635 | 19:00 |
| `ebilet-129869-20260911` | ebilet | pending | Rewia moja miłość - Historia Rewii | Teatr Sabat Małgorzaty Potockiej | 52.22970, 21.01220 | 19:30 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| ambiguous | ebilet-176641-20260911 ↔ kupbilecik-193564-20260911 | cont=0.00 | vr=0.45 | geo=1.374km | gap=30m | ebilet/kupbilecik |
| ambiguous | ebilet-176641-20260911 ↔ kupbilecik-194216-20260911 | cont=0.00 | vr=0.364 | geo=1.374km | gap=30m | ebilet/kupbilecik |
| ambiguous | ebilet-176641-20260911 ↔ kupbilecik-198149-20260911 | cont=0.00 | vr=0.476 | geo=1.042km | gap=0m | ebilet/kupbilecik |
| ambiguous | ebilet-176641-20260911 ↔ kupbilecik-217187-20260911 | cont=0.00 | vr=0.39 | geo=0.486km | gap=30m | ebilet/kupbilecik |
| ambiguous | ebilet-176641-20260911 ↔ ebilet-129869-20260911 | cont=0.00 | vr=0.435 | geo=0.45km | gap=0m | ebilet/ebilet |
| ambiguous | kupbilecik-193564-20260911 ↔ kupbilecik-194216-20260911 | cont=0.00 | vr=0.857 | geo=0km | gap=60m | kupbilecik/kupbilecik |
| ambiguous | kupbilecik-193564-20260911 ↔ kupbilecik-198149-20260911 | cont=0.67 | vr=0.593 | geo=0.4km | gap=30m | kupbilecik/kupbilecik |
| ambiguous | kupbilecik-193564-20260911 ↔ kupbilecik-217187-20260911 | cont=0.00 | vr=0.415 | geo=0.937km | gap=60m | kupbilecik/kupbilecik |
| different | kupbilecik-193564-20260911 ↔ ebilet-129869-20260911 | cont=0.00 | vr=0.448 | geo=—km | gap=30m | kupbilecik/ebilet |
| ambiguous | kupbilecik-194216-20260911 ↔ kupbilecik-198149-20260911 | cont=0.00 | vr=0.621 | geo=0.4km | gap=30m | kupbilecik/kupbilecik |
| ambiguous | kupbilecik-194216-20260911 ↔ kupbilecik-217187-20260911 | cont=0.00 | vr=0.386 | geo=0.937km | gap=0m | kupbilecik/kupbilecik |
| different | kupbilecik-194216-20260911 ↔ ebilet-129869-20260911 | cont=0.00 | vr=0.387 | geo=—km | gap=30m | kupbilecik/ebilet |
| ambiguous | kupbilecik-198149-20260911 ↔ kupbilecik-217187-20260911 | cont=0.00 | vr=0.364 | geo=0.571km | gap=30m | kupbilecik/kupbilecik |
| ambiguous | kupbilecik-198149-20260911 ↔ ebilet-129869-20260911 | cont=0.00 | vr=0.467 | geo=1.407km | gap=0m | kupbilecik/ebilet |
| ambiguous | kupbilecik-217187-20260911 ↔ ebilet-129869-20260911 | cont=0.00 | vr=0.339 | geo=0.837km | gap=30m | kupbilecik/ebilet |

#### G46 — 2026-09-11 · 2 members · winner `kupbilecik-198952-20260911` (kupbilecik)
- merged times (union): `[19:00]` · winner shows: `[19:00]`
- pairs: 1 — same=0 ambiguous=1 different=0 · redundant posts (if all-same): ?

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `ebilet-155316-20260911` | ebilet | approved | Antimatter & Sleeping Pulse | Voodoo Club | 52.22439, 20.95923 | 19:00 |
| `kupbilecik-198952-20260911` | kupbilecik | approved | Antimatter & Sleeping Pulse | VooDoo | 52.22403, 20.95886 | 19:00 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| ambiguous | ebilet-155316-20260911 ↔ kupbilecik-198952-20260911 | cont=1.00 | vr=0.706 | geo=0.047km | gap=0m | ebilet/kupbilecik |

#### G47 — 2026-09-11 · 2 members · winner `ebilet-210059-20260911` (ebilet)
- merged times (union): `[10:00, 10:30, 11:00, 11:30, 12:00, 12:30, 13:00, 13:30, 14:00, 14:30, 15:00, 15:30, 16:00, 16:30, 17:00, 17:30, 18:00, 18:30]` · winner shows: `[11:00, 11:30, 12:00, 12:30, 13:00, 13:30, 14:00, 14:30, 15:00, 15:30, 16:00, 16:30, 17:00, 17:30, 18:00]`
- pairs: 1 — same=0 ambiguous=1 different=0 · redundant posts (if all-same): ?

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `ebilet-210059-20260911` | ebilet | pending | Beksiński w Poznaniu | MTP | 52.40640, 16.92520 | 11:00, 11:30, 12:00, 12:30, 13:00, 13:30, 14:00, 14:30, 15:00, 15:30, 16:00, 16:30, 17:00, 17:30, 18:00 |
| `ebilet-23752-20260911` | ebilet | pending | BODY WORLDS – Vital - Poznań | MTP | 52.40640, 16.92520 | 10:00, 10:30, 11:00, 11:30, 12:00, 12:30, 13:00, 13:30, 14:00, 14:30, 15:00, 15:30, 16:00, 16:30, 17:00, 17:30, 18:00, 18:30 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| ambiguous | ebilet-210059-20260911 ↔ ebilet-23752-20260911 | cont=0.00 | vr=1 | geo=0km | gap=0m | ebilet/ebilet |

#### G48 — 2026-09-11 · 5 members · winner `kupbilecik-213700-20260911` (kupbilecik)
- merged times (union): `[19:00, 20:00, 20:30]` · winner shows: `[20:00]`
- pairs: 10 — same=0 ambiguous=10 different=0 · redundant posts (if all-same): ?

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `kupbilecik-213231-20260911` | kupbilecik | approved | I like Chopin - kameralny koncert przy świecach | I like Chopin | 54.35510, 18.64909 | 19:00 |
| `kupbilecik-213700-20260911` | kupbilecik | approved | Candlelight Chopin Concert Old Town Gdańsk | Sala pod Bazyliką Mariacką | 54.34992, 18.65305 | 20:00 |
| `kupbilecik-213862-20260911` | kupbilecik | approved | I like Queen - Piano Show | I like Chopin | 54.35510, 18.64909 | 20:30 |
| `ebilet-213429-20260911` | ebilet | pending | I like Queen - piano show przy świecach | Sala koncertowa I like CHOPIN | 54.35200, 18.64660 | 20:30 |
| `ebilet-211761-20260911` | ebilet | pending | I like CHOPIN | Sala koncertowa I like CHOPIN | 54.35200, 18.64660 | 19:00 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| ambiguous | kupbilecik-213231-20260911 ↔ kupbilecik-213700-20260911 | cont=0.00 | vr=0.308 | geo=0.631km | gap=60m | kupbilecik/kupbilecik |
| ambiguous | kupbilecik-213231-20260911 ↔ kupbilecik-213862-20260911 | cont=0.00 | vr=1 | geo=0km | gap=90m | kupbilecik/kupbilecik |
| ambiguous | kupbilecik-213231-20260911 ↔ ebilet-213429-20260911 | cont=0.50 | vr=0.619 | geo=0.381km | gap=90m | kupbilecik/ebilet |
| ambiguous | kupbilecik-213231-20260911 ↔ ebilet-211761-20260911 | cont=0.00 | vr=0.619 | geo=0.381km | gap=0m | kupbilecik/ebilet |
| ambiguous | kupbilecik-213700-20260911 ↔ kupbilecik-213862-20260911 | cont=0.00 | vr=0.308 | geo=0.631km | gap=30m | kupbilecik/kupbilecik |
| ambiguous | kupbilecik-213700-20260911 ↔ ebilet-213429-20260911 | cont=0.00 | vr=0.436 | geo=0.478km | gap=30m | kupbilecik/ebilet |
| ambiguous | kupbilecik-213700-20260911 ↔ ebilet-211761-20260911 | cont=0.00 | vr=0.436 | geo=0.478km | gap=60m | kupbilecik/ebilet |
| ambiguous | kupbilecik-213862-20260911 ↔ ebilet-213429-20260911 | cont=1.00 | vr=0.619 | geo=0.381km | gap=0m | kupbilecik/ebilet |
| ambiguous | kupbilecik-213862-20260911 ↔ ebilet-211761-20260911 | cont=0.00 | vr=0.619 | geo=0.381km | gap=90m | kupbilecik/ebilet |
| ambiguous | ebilet-213429-20260911 ↔ ebilet-211761-20260911 | cont=0.00 | vr=1 | geo=0km | gap=90m | ebilet/ebilet |

#### G49 — 2026-09-11 · 3 members · winner `ebilet-172054-20260911` (ebilet)
- merged times (union): `[18:00, 19:00, 20:00]` · winner shows: `[20:00]`
- pairs: 3 — same=0 ambiguous=3 different=0 · redundant posts (if all-same): ?

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `ebilet-181566-20260911` | ebilet | pending | Queen Classic Concert By Candle Glow | Klasztor O.O. Bernardynów | 50.06470, 19.94500 | 19:00 |
| `ebilet-172054-20260911` | ebilet | pending | Chopin & Friends Concert By Candle Glow | Klasztor O.O. Bernardynów | 50.06470, 19.94500 | 20:00 |
| `ebilet-172056-20260911` | ebilet | pending | Grand Piano Trio Chopin & Friends By Candle Glow | Klasztor O.O. Bernardynów | 50.06470, 19.94500 | 18:00 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| ambiguous | ebilet-181566-20260911 ↔ ebilet-172054-20260911 | cont=0.60 | vr=1 | geo=0km | gap=60m | ebilet/ebilet |
| ambiguous | ebilet-181566-20260911 ↔ ebilet-172056-20260911 | cont=0.40 | vr=1 | geo=0km | gap=60m | ebilet/ebilet |
| ambiguous | ebilet-172054-20260911 ↔ ebilet-172056-20260911 | cont=0.80 | vr=1 | geo=0km | gap=120m | ebilet/ebilet |

#### G50 — 2026-09-11 · 4 members · winner `kupbilecik-216533-20260911` (kupbilecik)
- merged times (union): `[16:00, 16:30, 17:00, 17:30, 18:00, 19:00, 20:00, 21:00]` · winner shows: `[20:00]`
- pairs: 6 — same=0 ambiguous=6 different=0 · redundant posts (if all-same): ?

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `ebilet-211889-20260911` | ebilet | approved | GENESIS – The Creation Light Show | Royal Chopin Hall | 50.05318, 19.93792 | 16:00, 16:30, 17:00, 17:30, 21:00 |
| `kupbilecik-216533-20260911` | kupbilecik | approved | Chopin & Friends Concert Candlelight | Royal Chopin Hall | 50.05318, 19.93792 | 20:00 |
| `kupbilecik-216686-20260911` | kupbilecik | approved | Royal Chopin Hall - Queen Classic Candlelight | Royal Chopin Hall | 50.05318, 19.93792 | 19:00 |
| `kupbilecik-217218-20260911` | kupbilecik | approved | Koncert Chopin & Friends przeniesie niejednego melomana w magiczny świat muzyki | Royal Chopin Hall | 50.05318, 19.93792 | 18:00 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| ambiguous | ebilet-211889-20260911 ↔ kupbilecik-216533-20260911 | cont=0.00 | vr=1 | geo=0km | gap=60m | ebilet/kupbilecik |
| ambiguous | ebilet-211889-20260911 ↔ kupbilecik-216686-20260911 | cont=0.00 | vr=1 | geo=0km | gap=90m | ebilet/kupbilecik |
| ambiguous | ebilet-211889-20260911 ↔ kupbilecik-217218-20260911 | cont=0.00 | vr=1 | geo=0km | gap=30m | ebilet/kupbilecik |
| ambiguous | kupbilecik-216533-20260911 ↔ kupbilecik-216686-20260911 | cont=0.33 | vr=1 | geo=0km | gap=60m | kupbilecik/kupbilecik |
| ambiguous | kupbilecik-216533-20260911 ↔ kupbilecik-217218-20260911 | cont=0.33 | vr=1 | geo=0km | gap=120m | kupbilecik/kupbilecik |
| ambiguous | kupbilecik-216686-20260911 ↔ kupbilecik-217218-20260911 | cont=0.00 | vr=1 | geo=0km | gap=60m | kupbilecik/kupbilecik |

#### G51 — 2026-09-11 · 2 members · winner `kupbilecik-195070-20260911` (kupbilecik)
- merged times (union): `[16:30]` · winner shows: `[16:30]`
- pairs: 1 — same=0 ambiguous=1 different=0 · redundant posts (if all-same): ?

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `ebilet-50763-20260911` | ebilet | approved | Cztery Pory Roku - Antonio Vivaldi | SALA ORATORIUM MARIANUM UNIWERSYTETU WROCŁAWSKIEGO | 51.11300, 17.03539 | 16:30 |
| `kupbilecik-195070-20260911` | kupbilecik | approved | Cztery Pory Roku - Antonio Vivaldi | Oratorium Marianum | 51.11395, 17.03385 | 16:30 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| ambiguous | ebilet-50763-20260911 ↔ kupbilecik-195070-20260911 | cont=1.00 | vr=0.529 | geo=0.15km | gap=0m | ebilet/kupbilecik |

#### G52 — 2026-09-11 · 3 members · winner `kupbilecik-195607-20260911` (kupbilecik)
- merged times (union): `[20:00]` · winner shows: `[20:00]`
- pairs: 3 — same=0 ambiguous=3 different=0 · redundant posts (if all-same): ?

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `ebilet-5751-20260911` | ebilet | approved | Freddie Mercury Rock -Operowo | SALA ORATORIUM MARIANUM UNIWERSYTETU WROCŁAWSKIEGO | 51.11300, 17.03539 | 20:00 |
| `kupbilecik-195607-20260911` | kupbilecik | approved | Freddie Mercury rock-operowo | Oratorium Marianum | 51.11395, 17.03385 | 20:00 |
| `ebilet-211351-20260911` | ebilet | pending | "PAROSTATKIEM W PIĘKNY REJS...", czyli Urodziny Krzysztofa | Sala Gotycka w Starym Klasztorze | 51.10790, 17.03850 | 20:00 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| ambiguous | ebilet-5751-20260911 ↔ kupbilecik-195607-20260911 | cont=1.00 | vr=0.529 | geo=0.15km | gap=0m | ebilet/kupbilecik |
| ambiguous | ebilet-5751-20260911 ↔ ebilet-211351-20260911 | cont=0.00 | vr=0.415 | geo=0.608km | gap=0m | ebilet/ebilet |
| ambiguous | kupbilecik-195607-20260911 ↔ ebilet-211351-20260911 | cont=0.00 | vr=0.32 | geo=0.747km | gap=0m | kupbilecik/ebilet |

#### G53 — 2026-09-11 · 2 members · winner `kupbilecik-211622-20260911` (kupbilecik)
- merged times (union): `[19:00]` · winner shows: `[19:00]`
- pairs: 1 — same=0 ambiguous=1 different=0 · redundant posts (if all-same): ?

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `ebilet-5910-20260911` | ebilet | approved | Pozytywni | Garnizon Sztuki | 52.22844, 21.02636 | 19:00 |
| `kupbilecik-211622-20260911` | kupbilecik | approved | Garnizon Sztuki - teatr pozytywnych emocji. | Garnizon Sztuki | 52.22805, 21.02656 | 19:00 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| ambiguous | ebilet-5910-20260911 ↔ kupbilecik-211622-20260911 | cont=0.00 | vr=1 | geo=0.045km | gap=0m | ebilet/kupbilecik |

#### G54 — 2026-09-11 · 2 members · winner `ebilet-205694-20260911` (ebilet)
- merged times (union): `[10:00, 11:00]` · winner shows: `[11:00]`
- pairs: 1 — same=0 ambiguous=1 different=0 · redundant posts (if all-same): ?

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `ebilet-126412-20260911` | ebilet | approved | Zwiedzanie Muzeum - Mt 5,14 | Muzeum Jana Pawła II i Prymasa Wyszyńskiego | 52.22585, 21.01627 | 10:00 |
| `ebilet-205694-20260911` | ebilet | approved | Indywidualne zwiedzanie wystawy | Muzeum Sztuki Nowoczesnej | 52.23313, 21.00898 | 11:00 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| ambiguous | ebilet-126412-20260911 ↔ ebilet-205694-20260911 | cont=1.00 | vr=0.382 | geo=0.95km | gap=60m | ebilet/ebilet |

#### G55 — 2026-09-11 · 2 members · winner `ebilet-132942-20260911` (ebilet)
- merged times (union): `[19:00, 19:30]` · winner shows: `[19:30]`
- pairs: 1 — same=0 ambiguous=1 different=0 · redundant posts (if all-same): ?

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `ebilet-5770-20260911` | ebilet | approved | Złodziej | TEATR KOMEDIA. | 52.26915, 20.97862 | 19:00 |
| `ebilet-132942-20260911` | ebilet | approved | Klancyk Noir | Teatr Komedia | 52.26915, 20.97862 | 19:30 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| ambiguous | ebilet-5770-20260911 ↔ ebilet-132942-20260911 | cont=0.00 | vr=1 | geo=0km | gap=30m | ebilet/ebilet |

#### G56 — 2026-09-11 · 2 members · winner `kupbilecik-215194-20260911` (kupbilecik)
- merged times (union): `[20:00]` · winner shows: `[20:00]`
- pairs: 1 — same=0 ambiguous=1 different=0 · redundant posts (if all-same): ?

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `ebilet-97669-20260911` | ebilet | approved | Dziwna Wiosna | Baza | 53.78558, 20.47776 | 20:00 |
| `kupbilecik-215194-20260911` | kupbilecik | approved | koncert \| 11.09.2026 \| Baza Olsztyn | Baza | 53.78558, 20.47776 | 20:00 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| ambiguous | ebilet-97669-20260911 ↔ kupbilecik-215194-20260911 | cont=0.00 | vr=1 | geo=0km | gap=0m | ebilet/kupbilecik |

#### G57 — 2026-09-11 · 4 members · winner `kupbilecik-218543-20260911` (kupbilecik)
- merged times (union): `[19:00, 21:00]` · winner shows: `[21:00]`
- pairs: 6 — same=0 ambiguous=6 different=0 · redundant posts (if all-same): ?

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `ebilet-25271-20260911` | ebilet | approved | Koncert Chopinowski | Sala Koncertowa „Fryderyk” | 52.24849, 21.00994 | 21:00 |
| `ebilet-68031-20260911` | ebilet | approved | Koncert Chopinowski w Chopin Point Warsaw | STARA GALERIA ZPAF | 52.24879, 21.01449 | 19:00 |
| `ebilet-131722-20260911` | ebilet | approved | Koncerty przy Świecach | Sala Koncertowa „Fryderyk” | 52.24849, 21.00994 | 21:00 |
| `kupbilecik-218543-20260911` | kupbilecik | approved | Koncert Przy Świecach w Sali Koncertowej Fryderyk | Sala Koncertowa Fryderyk | 52.24832, 21.00996 | 21:00 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| ambiguous | ebilet-25271-20260911 ↔ ebilet-68031-20260911 | cont=1.00 | vr=0.429 | geo=0.312km | gap=120m | ebilet/ebilet |
| ambiguous | ebilet-25271-20260911 ↔ ebilet-131722-20260911 | cont=0.00 | vr=1 | geo=0km | gap=0m | ebilet/ebilet |
| ambiguous | ebilet-25271-20260911 ↔ kupbilecik-218543-20260911 | cont=0.50 | vr=1 | geo=0.019km | gap=0m | ebilet/kupbilecik |
| ambiguous | ebilet-68031-20260911 ↔ ebilet-131722-20260911 | cont=0.00 | vr=0.429 | geo=0.312km | gap=120m | ebilet/ebilet |
| ambiguous | ebilet-68031-20260911 ↔ kupbilecik-218543-20260911 | cont=0.20 | vr=0.429 | geo=0.313km | gap=120m | ebilet/kupbilecik |
| ambiguous | ebilet-131722-20260911 ↔ kupbilecik-218543-20260911 | cont=0.67 | vr=1 | geo=0.019km | gap=0m | ebilet/kupbilecik |

#### G58 — 2026-09-11 · 2 members · winner `kupbilecik-217115-20260911` (kupbilecik)
- merged times (union): `[20:30]` · winner shows: `[20:30]`
- pairs: 1 — same=0 ambiguous=1 different=0 · redundant posts (if all-same): ?

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `ebilet-146360-20260911` | ebilet | approved | Chopin & Friends Concert By Candle Glow | Kościół Rektorski Ojców Karmelitów pw. św. Katarzyny | 54.35294, 18.63086 | 20:30 |
| `kupbilecik-217115-20260911` | kupbilecik | approved | Koncerty fortepianowe w Gdańsku | Kościół św. Katarzyny | 54.35443, 18.65239 | 20:30 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| ambiguous | ebilet-146360-20260911 ↔ kupbilecik-217115-20260911 | cont=0.00 | vr=0.571 | geo=1.405km | gap=0m | ebilet/kupbilecik |

#### G59 — 2026-09-11 · 3 members · winner `kupbilecik-215395-20260911` (kupbilecik)
- merged times (union): `[17:00, 19:30, 20:15]` · winner shows: `[17:00, 20:15]`
- pairs: 3 — same=0 ambiguous=3 different=0 · redundant posts (if all-same): ?

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `kupbilecik-203762-20260911` | kupbilecik | approved | Prawda - komedia w reżyserii Wojciecha Malajkata | Kino Teatr Apollo | 52.40495, 16.92479 | 17:00, 19:30 |
| `kupbilecik-215395-20260911` | kupbilecik | approved | Kultowa komedia z Cezarym Żakiem i Arturem Barcisiem w rolach głównych | Teatr Wielki | 52.41021, 16.91762 | 17:00, 20:15 |
| `ebilet-6210-20260911` | ebilet | pending | Słoneczni Chłopcy | Teatr Wielki w Poznaniu | 52.40640, 16.92520 | 17:00, 20:15 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| ambiguous | kupbilecik-203762-20260911 ↔ kupbilecik-215395-20260911 | cont=0.20 | vr=0.483 | geo=0.761km | gap=0m | kupbilecik/kupbilecik |
| ambiguous | kupbilecik-203762-20260911 ↔ ebilet-6210-20260911 | cont=0.00 | vr=0.4 | geo=0.164km | gap=0m | kupbilecik/ebilet |
| ambiguous | kupbilecik-215395-20260911 ↔ ebilet-6210-20260911 | cont=0.00 | vr=0.686 | geo=0.666km | gap=0m | kupbilecik/ebilet |

#### G60 — 2026-09-11 · 2 members · winner `kupbilecik-196719-20260911` (kupbilecik)
- merged times (union): `[19:00]` · winner shows: `[19:00]`
- pairs: 1 — same=1 ambiguous=0 different=0 · redundant posts (if all-same): 1

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `ebilet-77638-20260911` | ebilet | approved | Mariusz Kałamaga - Mamo! Papier się kończy! | Namysłowski Ośrodek Kultury | 51.07642, 17.72064 | 19:00 |
| `kupbilecik-196719-20260911` | kupbilecik | approved | Mamo! Papier się kończy! | Namysłowski Ośrodek Kultury | 51.07642, 17.72064 | 19:00 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| same | ebilet-77638-20260911 ↔ kupbilecik-196719-20260911 | cont=1.00 | vr=1 | geo=0km | gap=0m | ebilet/kupbilecik |

#### G61 — 2026-09-11 · 2 members · winner `kupbilecik-214529-20260911` (kupbilecik)
- merged times (union): `[19:00, 19:01]` · winner shows: `[19:01]`
- pairs: 1 — same=0 ambiguous=1 different=0 · redundant posts (if all-same): ?

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `kupbilecik-214523-20260911` | kupbilecik | approved | O nic mi nie chodzi, czyli toksyczna para na co dzień | Klub Komediowy | 52.21969, 21.01669 | 19:00 |
| `kupbilecik-214529-20260911` | kupbilecik | approved | Mój kraj taki piękny - spektakl do narzekania \| NOWOŚĆ | Klub Komediowy | 52.21969, 21.01669 | 19:01 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| ambiguous | kupbilecik-214523-20260911 ↔ kupbilecik-214529-20260911 | cont=0.00 | vr=1 | geo=0km | gap=1m | kupbilecik/kupbilecik |

#### G62 — 2026-09-11 · 2 members · winner `kupbilecik-210356-20260911` (kupbilecik)
- merged times (union): `[11:00]` · winner shows: `[11:00]`
- pairs: 1 — same=0 ambiguous=1 different=0 · redundant posts (if all-same): ?

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `ebilet-138964-20260911` | ebilet | approved | Muzeum Banksy | Muzeum Banksy | 50.05462, 19.94840 | 11:00 |
| `kupbilecik-210356-20260911` | kupbilecik | approved | Muzeum Banksy - bilet upoważniający do wejścia w ciągu całego dnia (od godz. 11:00) | Muzeum Banksy | 50.05511, 19.94810 | 11:00 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| ambiguous | ebilet-138964-20260911 ↔ kupbilecik-210356-20260911 | cont=0.00 | vr=1 | geo=0.058km | gap=0m | ebilet/kupbilecik |

#### G63 — 2026-09-11 · 2 members · winner `kupbilecik-209990-20260911` (kupbilecik)
- merged times (union): `[18:00, 21:00]` · winner shows: `[18:00]`
- pairs: 1 — same=1 ambiguous=0 different=0 · redundant posts (if all-same): 1

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `kupbilecik-209991-20260911` | kupbilecik | approved | Rewia Burleski od Madame de Minou 11.09.2026 Kraków godz. 21.00 | Teatr Variété | 50.05685, 19.96363 | 21:00 |
| `kupbilecik-209990-20260911` | kupbilecik | approved | Rewia Burleski od Madame de Minou 11.09.2026 KRAKÓW godz. 18.00 | Teatr Variété | 50.05685, 19.96363 | 18:00 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| same | kupbilecik-209991-20260911 ↔ kupbilecik-209990-20260911 | cont=1.00 | vr=1 | geo=0km | gap=180m | kupbilecik/kupbilecik |

#### G64 — 2026-09-11 · 2 members · winner `kupbilecik-195540-20260911` (kupbilecik)
- merged times (union): `[18:00]` · winner shows: `[18:00]`
- pairs: 1 — same=0 ambiguous=1 different=0 · redundant posts (if all-same): ?

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `ebilet-17883-20260911` | ebilet | approved | Muzyczny życiorys Franka Sinatry. | SALA ORATORIUM MARIANUM UNIWERSYTETU WROCŁAWSKIEGO | 51.11300, 17.03539 | 18:00 |
| `kupbilecik-195540-20260911` | kupbilecik | approved | Wyjątkowy koncert w stylu włoskim | Oratorium Marianum | 51.11395, 17.03385 | 18:00 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| ambiguous | ebilet-17883-20260911 ↔ kupbilecik-195540-20260911 | cont=0.00 | vr=0.529 | geo=0.15km | gap=0m | ebilet/kupbilecik |

#### G65 — 2026-09-11 · 2 members · winner `kupbilecik-215400-20260911` (kupbilecik)
- merged times (union): `[17:30, 20:00]` · winner shows: `[17:30, 20:00]`
- pairs: 1 — same=0 ambiguous=1 different=0 · redundant posts (if all-same): ?

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `ebilet-48182-20260911` | ebilet | approved | Nerwica Natręctw | Kino Kijów Centrum | 50.05828, 19.92490 | 17:30, 20:00 |
| `kupbilecik-215400-20260911` | kupbilecik | approved | Zwariowana komedia w gwiazdorskiej obsadzie | Kino Kijów Centrum | 50.05845, 19.92515 | 17:30, 20:00 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| ambiguous | ebilet-48182-20260911 ↔ kupbilecik-215400-20260911 | cont=0.00 | vr=1 | geo=0.025km | gap=0m | ebilet/kupbilecik |

#### G66 — 2026-09-12 · 2 members · winner `luma-evt-UOJaC8hWfIeloJC` (luma)
- merged times (union): `[17:30]` · winner shows: `[17:30]`
- pairs: 1 — same=0 ambiguous=1 different=0 · redundant posts (if all-same): ?

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `luma-evt-UOJaC8hWfIeloJC` | luma | approved | ✨ Wyjątkowy wywiad na żywo: Easy Polish 🇵🇱💬 | Marcina Kasprzaka 18/20 | 52.22920, 20.97330 | 17:30 |
| `meetup-316400749` | meetup | approved | ✨ Wyjątkowy wywiad na żywo: Easy Polish 🇵🇱💬 | a&o | 52.22942, 20.97294 | 17:30 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| ambiguous | luma-evt-UOJaC8hWfIeloJC ↔ meetup-316400749 | cont=1.00 | vr=0.154 | geo=0.035km | gap=0m | luma/meetup |

#### G67 — 2026-09-12 · 2 members · winner `going-2414939` (going)
- merged times (union): `[19:00]` · winner shows: `[19:00]`
- pairs: 1 — same=0 ambiguous=1 different=0 · redundant posts (if all-same): ?

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `going-2414939` | going | approved | Amy Gadiaga | Klub Jassmine | 52.22970, 21.01220 | 19:00 |
| `kupbilecik-215537-20260912` | kupbilecik | approved | Kochanie, musimy porozmawiać... - spektakl improwizowany | Klub Komediowy | 52.21969, 21.01669 | 19:00 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| ambiguous | going-2414939 ↔ kupbilecik-215537-20260912 | cont=0.00 | vr=0.519 | geo=1.154km | gap=0m | going/kupbilecik |

#### G68 — 2026-09-12 · 2 members · winner `going-2413504` (going)
- merged times (union): `[19:00, 20:00]` · winner shows: `[19:00]`
- pairs: 1 — same=1 ambiguous=0 different=0 · redundant posts (if all-same): 1

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `ebilet-205773-20260912` | ebilet | approved | BAYONNE | BARdzo bardzo | 52.22972, 21.01778 | 20:00 |
| `going-2413504` | going | approved | BAYONNE \| Warszawa | BARdzo bardzo | 52.22910, 21.01777 | 19:00 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| same | ebilet-205773-20260912 ↔ going-2413504 | cont=1.00 | vr=1 | geo=0.069km | gap=60m | ebilet/going |

#### G69 — 2026-09-12 · 2 members · winner `going-2415479` (going)
- merged times (union): `[18:00, 19:00]` · winner shows: `[18:00]`
- pairs: 1 — same=0 ambiguous=1 different=0 · redundant posts (if all-same): ?

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `ebilet-83022-20260912` | ebilet | approved | Brasswood Soundtracks | Opera Leśna | 54.44517, 18.54621 | 19:00 |
| `going-2415479` | going | approved | Brasswood Soundtracks 2026 \| Dzień pierwszy | Opera Leśna / The Forest Opera | 54.44517, 18.54621 | 18:00 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| ambiguous | ebilet-83022-20260912 ↔ going-2415479 | cont=1.00 | vr=0.564 | geo=0km | gap=60m | ebilet/going |

#### G70 — 2026-09-12 · 4 members · winner `ebilet-172054-20260912` (ebilet)
- merged times (union): `[18:00, 19:00, 20:00, 20:20]` · winner shows: `[20:00]`
- pairs: 6 — same=0 ambiguous=6 different=0 · redundant posts (if all-same): ?

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `ebilet-206658-20260912` | ebilet | approved | Cztery Pory Roku w Krużgankach Karmelitów | Klasztor Karmelitów w Krakowie "Na Piasku" | 50.06523, 19.93163 | 20:20 |
| `ebilet-172056-20260912` | ebilet | pending | Grand Piano Trio Chopin & Friends By Candle Glow | Klasztor O.O. Bernardynów | 50.06470, 19.94500 | 18:00 |
| `ebilet-181566-20260912` | ebilet | pending | Queen Classic Concert By Candle Glow | Klasztor O.O. Bernardynów | 50.06470, 19.94500 | 19:00 |
| `ebilet-172054-20260912` | ebilet | pending | Chopin & Friends Concert By Candle Glow | Klasztor O.O. Bernardynów | 50.06470, 19.94500 | 20:00 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| ambiguous | ebilet-206658-20260912 ↔ ebilet-172056-20260912 | cont=0.00 | vr=0.5 | geo=0.956km | gap=140m | ebilet/ebilet |
| ambiguous | ebilet-206658-20260912 ↔ ebilet-181566-20260912 | cont=0.00 | vr=0.5 | geo=0.956km | gap=80m | ebilet/ebilet |
| ambiguous | ebilet-206658-20260912 ↔ ebilet-172054-20260912 | cont=0.00 | vr=0.5 | geo=0.956km | gap=20m | ebilet/ebilet |
| ambiguous | ebilet-172056-20260912 ↔ ebilet-181566-20260912 | cont=0.40 | vr=1 | geo=0km | gap=60m | ebilet/ebilet |
| ambiguous | ebilet-172056-20260912 ↔ ebilet-172054-20260912 | cont=0.80 | vr=1 | geo=0km | gap=120m | ebilet/ebilet |
| ambiguous | ebilet-181566-20260912 ↔ ebilet-172054-20260912 | cont=0.60 | vr=1 | geo=0km | gap=60m | ebilet/ebilet |

#### G71 — 2026-09-12 · 2 members · winner `kupbilecik-209357-20260912` (kupbilecik)
- merged times (union): `[16:00, 19:00]` · winner shows: `[19:00]`
- pairs: 1 — same=0 ambiguous=1 different=0 · redundant posts (if all-same): ?

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `kupbilecik-204840-20260912` | kupbilecik | approved | Gorący spektakl w gwiazdorskiej obsadzie | Kino Teatr Apollo | 52.40495, 16.92479 | 16:00, 19:00 |
| `kupbilecik-209357-20260912` | kupbilecik | approved | czyli pic na wodę | Teatr Wielki | 52.41021, 16.91762 | 19:00 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| ambiguous | kupbilecik-204840-20260912 ↔ kupbilecik-209357-20260912 | cont=0.00 | vr=0.483 | geo=0.761km | gap=0m | kupbilecik/kupbilecik |

#### G72 — 2026-09-12 · 2 members · winner `going-2417308` (going)
- merged times (union): `[21:00, 21:15]` · winner shows: `[21:00]`
- pairs: 1 — same=0 ambiguous=1 different=0 · redundant posts (if all-same): ?

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `kupbilecik-214678-20260912` | kupbilecik | approved | One night stand | Klub Komediowy | 52.21969, 21.01669 | 21:15 |
| `going-2417308` | going | approved | DISCO LEOPARD ??? | Klub SPATiF | 52.22681, 21.02310 | 21:00 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| ambiguous | kupbilecik-214678-20260912 ↔ going-2417308 | cont=0.00 | vr=0.48 | geo=0.905km | gap=15m | kupbilecik/going |

#### G73 — 2026-09-12 · 4 members · winner `kupbilecik-215520-20260912` (kupbilecik)
- merged times (union): `[11:00, 12:00]` · winner shows: `[11:00]`
- pairs: 6 — same=0 ambiguous=6 different=0 · redundant posts (if all-same): ?

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `ebilet-205694-20260912` | ebilet | approved | Indywidualne zwiedzanie wystawy | Muzeum Sztuki Nowoczesnej | 52.23313, 21.00898 | 11:00 |
| `ebilet-87721-20260912` | ebilet | approved | Zwiedzanie Pałacu Kultury i Nauki | Pałac Kultury i Nauki | 52.23191, 21.00931 | 11:00 |
| `ebilet-126412-20260912` | ebilet | approved | Zwiedzanie Muzeum - Mt 5,14 | Muzeum Jana Pawła II i Prymasa Wyszyńskiego | 52.22585, 21.01627 | 12:00 |
| `kupbilecik-215520-20260912` | kupbilecik | approved | GITARY, UKULELE, BANJO! Dla Maluszków 0-3! INAUGURACJA NA 10 INSTRUMENTÓW! | Pałac Staszica - Sala Lustrzana | 52.23768, 21.01772 | 11:00 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| ambiguous | ebilet-205694-20260912 ↔ ebilet-87721-20260912 | cont=0.50 | vr=0.261 | geo=0.138km | gap=0m | ebilet/ebilet |
| ambiguous | ebilet-205694-20260912 ↔ ebilet-126412-20260912 | cont=1.00 | vr=0.382 | geo=0.95km | gap=60m | ebilet/ebilet |
| ambiguous | ebilet-205694-20260912 ↔ kupbilecik-215520-20260912 | cont=0.00 | vr=0.259 | geo=0.781km | gap=0m | ebilet/kupbilecik |
| ambiguous | ebilet-87721-20260912 ↔ ebilet-126412-20260912 | cont=1.00 | vr=0.344 | geo=0.824km | gap=60m | ebilet/ebilet |
| ambiguous | ebilet-87721-20260912 ↔ kupbilecik-215520-20260912 | cont=0.00 | vr=0.44 | geo=0.86km | gap=0m | ebilet/kupbilecik |
| ambiguous | ebilet-126412-20260912 ↔ kupbilecik-215520-20260912 | cont=0.00 | vr=0.361 | geo=1.319km | gap=60m | ebilet/kupbilecik |

#### G74 — 2026-09-12 · 2 members · winner `ebilet-176778-20260912` (ebilet)
- merged times (union): `[19:00, 19:30]` · winner shows: `[19:30]`
- pairs: 1 — same=0 ambiguous=1 different=0 · redundant posts (if all-same): ?

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `ebilet-142210-20260912` | ebilet | approved | Zemsta | TEATR KOMEDIA. | 52.26915, 20.97862 | 19:00 |
| `ebilet-176778-20260912` | ebilet | approved | Kobieta Pracująca. Powraca – Mała Scena | Teatr Komedia | 52.26915, 20.97862 | 19:30 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| ambiguous | ebilet-142210-20260912 ↔ ebilet-176778-20260912 | cont=0.00 | vr=1 | geo=0km | gap=30m | ebilet/ebilet |

#### G75 — 2026-09-12 · 13 members · winner `going-2415724` (going)
- merged times (union): `[15:00, 15:30, 16:00, 18:00, 18:30, 19:00, 19:30, 20:00]` · winner shows: `[19:30]`
- pairs: 78 — same=2 ambiguous=72 different=4 · redundant posts (if all-same): ?

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `ebilet-176641-20260912` | ebilet | approved | Wspaniałe horyzonty | Teatr 6 piętro. | 52.23196, 21.00672 | 15:00, 18:00 |
| `ebilet-49906-20260912` | ebilet | approved | Wodecki - Welcome To Polyphonics & Paweł Głowiński | Teatr Muzyczny  Roma | 52.22741, 21.00781 | 18:00 |
| `going-2416313` | going | approved | Obiecuję, obiecuję ci… czyli bajka tylko dla dorosłych | Teatr Nowe Formy | 52.22970, 21.01220 | 18:30 |
| `going-2415727` | going | approved | Łóżko pełne cudzoziemców | Teatr Capitol | 52.22970, 21.01220 | 19:00 |
| `going-2415724` | going | approved | Komedia odlotowa, czyli lumbago | Teatr Capitol | 52.22970, 21.01220 | 19:30 |
| `going-2415737` | going | approved | Seks, siano i sekrety | Teatr Capitol | 52.22970, 21.01220 | 20:00 |
| `going-2415993` | going | approved | Opiekunka na zabój | Teatr Kamienica | 52.22970, 21.01220 | 16:00 |
| `going-2415793` | going | approved | Prawda | Scena Mała Warszawa | 52.22970, 21.01220 | 15:30 |
| `going-2415786` | going | approved | Prawda | Scena Mała Warszawa | 52.22970, 21.01220 | 18:30 |
| `kupbilecik-198150-20260912` | kupbilecik | approved | Reż. Jerzy Bończak. Dancing | Teatr Capitol | 52.24107, 21.00316 | 19:00 |
| `kupbilecik-198151-20260912` | kupbilecik | approved | Reżyseria: Olaf Lubaszenko | Teatr Capitol - Scena mniejsza | 52.24107, 21.00316 | 19:30 |
| `kupbilecik-205997-20260912` | kupbilecik | approved | Polyphonics & Paweł Głowiński | Teatr Muzyczny ROMA | 52.22760, 21.00745 | 18:00 |
| `ebilet-141247-20260912` | ebilet | pending | Łóżko pełne cudzoziemców | Teatr Capitol Duża Scena | 52.22970, 21.01220 | 19:00 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| ambiguous | ebilet-176641-20260912 ↔ ebilet-49906-20260912 | cont=0.00 | vr=0.545 | geo=0.511km | gap=0m | ebilet/ebilet |
| ambiguous | ebilet-176641-20260912 ↔ going-2416313 | cont=0.00 | vr=0.533 | geo=0.45km | gap=30m | ebilet/going |
| ambiguous | ebilet-176641-20260912 ↔ going-2415727 | cont=0.00 | vr=0.741 | geo=0.45km | gap=60m | ebilet/going |
| ambiguous | ebilet-176641-20260912 ↔ going-2415724 | cont=0.00 | vr=0.741 | geo=0.45km | gap=90m | ebilet/going |
| ambiguous | ebilet-176641-20260912 ↔ going-2415737 | cont=0.00 | vr=0.741 | geo=0.45km | gap=120m | ebilet/going |
| ambiguous | ebilet-176641-20260912 ↔ going-2415993 | cont=0.00 | vr=0.552 | geo=0.45km | gap=60m | ebilet/going |
| ambiguous | ebilet-176641-20260912 ↔ going-2415793 | cont=0.00 | vr=0.303 | geo=0.45km | gap=30m | ebilet/going |
| ambiguous | ebilet-176641-20260912 ↔ going-2415786 | cont=0.00 | vr=0.303 | geo=0.45km | gap=30m | ebilet/going |
| ambiguous | ebilet-176641-20260912 ↔ kupbilecik-198150-20260912 | cont=0.00 | vr=0.741 | geo=1.042km | gap=60m | ebilet/kupbilecik |
| ambiguous | ebilet-176641-20260912 ↔ kupbilecik-198151-20260912 | cont=0.00 | vr=0.476 | geo=1.042km | gap=90m | ebilet/kupbilecik |
| ambiguous | ebilet-176641-20260912 ↔ kupbilecik-205997-20260912 | cont=0.00 | vr=0.545 | geo=0.488km | gap=0m | ebilet/kupbilecik |
| ambiguous | ebilet-176641-20260912 ↔ ebilet-141247-20260912 | cont=0.00 | vr=0.526 | geo=0.45km | gap=60m | ebilet/ebilet |
| ambiguous | ebilet-49906-20260912 ↔ going-2416313 | cont=0.00 | vr=0.571 | geo=0.393km | gap=30m | ebilet/going |
| ambiguous | ebilet-49906-20260912 ↔ going-2415727 | cont=0.00 | vr=0.5 | geo=0.393km | gap=60m | ebilet/going |
| ambiguous | ebilet-49906-20260912 ↔ going-2415724 | cont=0.00 | vr=0.5 | geo=0.393km | gap=90m | ebilet/going |
| ambiguous | ebilet-49906-20260912 ↔ going-2415737 | cont=0.00 | vr=0.5 | geo=0.393km | gap=120m | ebilet/going |
| ambiguous | ebilet-49906-20260912 ↔ going-2415993 | cont=0.00 | vr=0.529 | geo=0.393km | gap=120m | ebilet/going |
| ambiguous | ebilet-49906-20260912 ↔ going-2415793 | cont=0.00 | vr=0.368 | geo=0.393km | gap=150m | ebilet/going |
| ambiguous | ebilet-49906-20260912 ↔ going-2415786 | cont=0.00 | vr=0.368 | geo=0.393km | gap=30m | ebilet/going |
| different | ebilet-49906-20260912 ↔ kupbilecik-198150-20260912 | cont=0.00 | vr=0.5 | geo=—km | gap=60m | ebilet/kupbilecik |
| different | ebilet-49906-20260912 ↔ kupbilecik-198151-20260912 | cont=0.00 | vr=0.468 | geo=—km | gap=90m | ebilet/kupbilecik |
| same | ebilet-49906-20260912 ↔ kupbilecik-205997-20260912 | cont=1.00 | vr=1 | geo=0.032km | gap=0m | ebilet/kupbilecik |
| ambiguous | ebilet-49906-20260912 ↔ ebilet-141247-20260912 | cont=0.00 | vr=0.512 | geo=0.393km | gap=60m | ebilet/ebilet |
| ambiguous | going-2416313 ↔ going-2415727 | cont=0.00 | vr=0.483 | geo=0km | gap=30m | going/going |
| ambiguous | going-2416313 ↔ going-2415724 | cont=0.25 | vr=0.483 | geo=0km | gap=60m | going/going |
| ambiguous | going-2416313 ↔ going-2415737 | cont=0.00 | vr=0.483 | geo=0km | gap=90m | going/going |
| ambiguous | going-2416313 ↔ going-2415993 | cont=0.00 | vr=0.452 | geo=0km | gap=150m | going/going |
| ambiguous | going-2416313 ↔ going-2415793 | cont=0.00 | vr=0.286 | geo=0km | gap=180m | going/going |
| ambiguous | going-2416313 ↔ going-2415786 | cont=0.00 | vr=0.286 | geo=0km | gap=0m | going/going |
| ambiguous | going-2416313 ↔ kupbilecik-198150-20260912 | cont=0.00 | vr=0.483 | geo=1.407km | gap=30m | going/kupbilecik |
| ambiguous | going-2416313 ↔ kupbilecik-198151-20260912 | cont=0.00 | vr=0.455 | geo=1.407km | gap=60m | going/kupbilecik |
| ambiguous | going-2416313 ↔ kupbilecik-205997-20260912 | cont=0.00 | vr=0.571 | geo=0.399km | gap=30m | going/kupbilecik |
| ambiguous | going-2416313 ↔ ebilet-141247-20260912 | cont=0.00 | vr=0.4 | geo=0km | gap=30m | going/ebilet |
| ambiguous | going-2415727 ↔ going-2415724 | cont=0.00 | vr=1 | geo=0km | gap=30m | going/going |
| ambiguous | going-2415727 ↔ going-2415737 | cont=0.00 | vr=1 | geo=0km | gap=60m | going/going |
| ambiguous | going-2415727 ↔ going-2415993 | cont=0.00 | vr=0.571 | geo=0km | gap=180m | going/going |
| ambiguous | going-2415727 ↔ going-2415793 | cont=0.00 | vr=0.313 | geo=0km | gap=210m | going/going |
| ambiguous | going-2415727 ↔ going-2415786 | cont=0.00 | vr=0.313 | geo=0km | gap=30m | going/going |
| ambiguous | going-2415727 ↔ kupbilecik-198150-20260912 | cont=0.00 | vr=1 | geo=1.407km | gap=0m | going/kupbilecik |
| ambiguous | going-2415727 ↔ kupbilecik-198151-20260912 | cont=0.00 | vr=0.634 | geo=1.407km | gap=30m | going/kupbilecik |
| ambiguous | going-2415727 ↔ kupbilecik-205997-20260912 | cont=0.00 | vr=0.5 | geo=0.399km | gap=60m | going/kupbilecik |
| ambiguous | going-2415727 ↔ ebilet-141247-20260912 | cont=1.00 | vr=0.703 | geo=0km | gap=0m | going/ebilet |
| ambiguous | going-2415724 ↔ going-2415737 | cont=0.00 | vr=1 | geo=0km | gap=30m | going/going |
| ambiguous | going-2415724 ↔ going-2415993 | cont=0.00 | vr=0.571 | geo=0km | gap=210m | going/going |
| ambiguous | going-2415724 ↔ going-2415793 | cont=0.00 | vr=0.313 | geo=0km | gap=240m | going/going |
| ambiguous | going-2415724 ↔ going-2415786 | cont=0.00 | vr=0.313 | geo=0km | gap=60m | going/going |
| ambiguous | going-2415724 ↔ kupbilecik-198150-20260912 | cont=0.00 | vr=1 | geo=1.407km | gap=30m | going/kupbilecik |
| ambiguous | going-2415724 ↔ kupbilecik-198151-20260912 | cont=0.00 | vr=0.634 | geo=1.407km | gap=0m | going/kupbilecik |
| ambiguous | going-2415724 ↔ kupbilecik-205997-20260912 | cont=0.00 | vr=0.5 | geo=0.399km | gap=90m | going/kupbilecik |
| ambiguous | going-2415724 ↔ ebilet-141247-20260912 | cont=0.00 | vr=0.703 | geo=0km | gap=30m | going/ebilet |
| ambiguous | going-2415737 ↔ going-2415993 | cont=0.00 | vr=0.571 | geo=0km | gap=240m | going/going |
| ambiguous | going-2415737 ↔ going-2415793 | cont=0.00 | vr=0.313 | geo=0km | gap=270m | going/going |
| ambiguous | going-2415737 ↔ going-2415786 | cont=0.00 | vr=0.313 | geo=0km | gap=90m | going/going |
| ambiguous | going-2415737 ↔ kupbilecik-198150-20260912 | cont=0.00 | vr=1 | geo=1.407km | gap=60m | going/kupbilecik |
| ambiguous | going-2415737 ↔ kupbilecik-198151-20260912 | cont=0.00 | vr=0.634 | geo=1.407km | gap=30m | going/kupbilecik |
| ambiguous | going-2415737 ↔ kupbilecik-205997-20260912 | cont=0.00 | vr=0.5 | geo=0.399km | gap=120m | going/kupbilecik |
| ambiguous | going-2415737 ↔ ebilet-141247-20260912 | cont=0.00 | vr=0.703 | geo=0km | gap=60m | going/ebilet |
| ambiguous | going-2415993 ↔ going-2415793 | cont=0.00 | vr=0.294 | geo=0km | gap=30m | going/going |
| ambiguous | going-2415993 ↔ going-2415786 | cont=0.00 | vr=0.294 | geo=0km | gap=150m | going/going |
| ambiguous | going-2415993 ↔ kupbilecik-198150-20260912 | cont=0.00 | vr=0.571 | geo=1.407km | gap=180m | going/kupbilecik |
| ambiguous | going-2415993 ↔ kupbilecik-198151-20260912 | cont=0.00 | vr=0.558 | geo=1.407km | gap=210m | going/kupbilecik |
| ambiguous | going-2415993 ↔ kupbilecik-205997-20260912 | cont=0.00 | vr=0.529 | geo=0.399km | gap=120m | going/kupbilecik |
| ambiguous | going-2415993 ↔ ebilet-141247-20260912 | cont=0.00 | vr=0.564 | geo=0km | gap=180m | going/ebilet |
| same | going-2415793 ↔ going-2415786 | cont=1.00 | vr=1 | geo=0km | gap=180m | going/going |
| ambiguous | going-2415793 ↔ kupbilecik-198150-20260912 | cont=0.00 | vr=0.313 | geo=1.407km | gap=210m | going/kupbilecik |
| ambiguous | going-2415793 ↔ kupbilecik-198151-20260912 | cont=0.00 | vr=0.426 | geo=1.407km | gap=240m | going/kupbilecik |
| ambiguous | going-2415793 ↔ kupbilecik-205997-20260912 | cont=0.00 | vr=0.368 | geo=0.399km | gap=150m | going/kupbilecik |
| ambiguous | going-2415793 ↔ ebilet-141247-20260912 | cont=0.00 | vr=0.419 | geo=0km | gap=210m | going/ebilet |
| ambiguous | going-2415786 ↔ kupbilecik-198150-20260912 | cont=0.00 | vr=0.313 | geo=1.407km | gap=30m | going/kupbilecik |
| ambiguous | going-2415786 ↔ kupbilecik-198151-20260912 | cont=0.00 | vr=0.426 | geo=1.407km | gap=60m | going/kupbilecik |
| ambiguous | going-2415786 ↔ kupbilecik-205997-20260912 | cont=0.00 | vr=0.368 | geo=0.399km | gap=30m | going/kupbilecik |
| ambiguous | going-2415786 ↔ ebilet-141247-20260912 | cont=0.00 | vr=0.419 | geo=0km | gap=30m | going/ebilet |
| ambiguous | kupbilecik-198150-20260912 ↔ kupbilecik-198151-20260912 | cont=0.00 | vr=0.634 | geo=0km | gap=30m | kupbilecik/kupbilecik |
| different | kupbilecik-198150-20260912 ↔ kupbilecik-205997-20260912 | cont=0.00 | vr=0.5 | geo=—km | gap=60m | kupbilecik/kupbilecik |
| ambiguous | kupbilecik-198150-20260912 ↔ ebilet-141247-20260912 | cont=0.00 | vr=0.703 | geo=1.407km | gap=0m | kupbilecik/ebilet |
| different | kupbilecik-198151-20260912 ↔ kupbilecik-205997-20260912 | cont=0.00 | vr=0.468 | geo=—km | gap=90m | kupbilecik/kupbilecik |
| ambiguous | kupbilecik-198151-20260912 ↔ ebilet-141247-20260912 | cont=0.00 | vr=0.731 | geo=1.407km | gap=30m | kupbilecik/ebilet |
| ambiguous | kupbilecik-205997-20260912 ↔ ebilet-141247-20260912 | cont=0.00 | vr=0.512 | geo=0.399km | gap=60m | kupbilecik/ebilet |

#### G76 — 2026-09-12 · 5 members · winner `kupbilecik-218507-20260912` (kupbilecik)
- merged times (union): `[19:00, 21:00]` · winner shows: `[19:00]`
- pairs: 10 — same=1 ambiguous=9 different=0 · redundant posts (if all-same): ?

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `ebilet-25271-20260912` | ebilet | approved | Koncert Chopinowski | Sala Koncertowa „Fryderyk” | 52.24849, 21.00994 | 21:00 |
| `ebilet-131722-20260912` | ebilet | approved | Koncerty przy Świecach | Sala Koncertowa „Fryderyk” | 52.24849, 21.00994 | 21:00 |
| `ebilet-68031-20260912` | ebilet | approved | Koncert Chopinowski w Chopin Point Warsaw | STARA GALERIA ZPAF | 52.24879, 21.01449 | 19:00 |
| `kupbilecik-218544-20260912` | kupbilecik | approved | Koncert Przy Świecach w Sali Koncertowej Fryderyk | Sala Koncertowa Fryderyk | 52.24832, 21.00996 | 21:00 |
| `kupbilecik-218507-20260912` | kupbilecik | approved | Koncert Chopinowski w Sali Koncertowej Fryderyk | Sala Koncertowa Fryderyk | 52.24832, 21.00996 | 19:00 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| ambiguous | ebilet-25271-20260912 ↔ ebilet-131722-20260912 | cont=0.00 | vr=1 | geo=0km | gap=0m | ebilet/ebilet |
| ambiguous | ebilet-25271-20260912 ↔ ebilet-68031-20260912 | cont=1.00 | vr=0.429 | geo=0.312km | gap=120m | ebilet/ebilet |
| ambiguous | ebilet-25271-20260912 ↔ kupbilecik-218544-20260912 | cont=0.50 | vr=1 | geo=0.019km | gap=0m | ebilet/kupbilecik |
| same | ebilet-25271-20260912 ↔ kupbilecik-218507-20260912 | cont=1.00 | vr=1 | geo=0.019km | gap=120m | ebilet/kupbilecik |
| ambiguous | ebilet-131722-20260912 ↔ ebilet-68031-20260912 | cont=0.00 | vr=0.429 | geo=0.312km | gap=120m | ebilet/ebilet |
| ambiguous | ebilet-131722-20260912 ↔ kupbilecik-218544-20260912 | cont=0.67 | vr=1 | geo=0.019km | gap=0m | ebilet/kupbilecik |
| ambiguous | ebilet-131722-20260912 ↔ kupbilecik-218507-20260912 | cont=0.00 | vr=1 | geo=0.019km | gap=120m | ebilet/kupbilecik |
| ambiguous | ebilet-68031-20260912 ↔ kupbilecik-218544-20260912 | cont=0.20 | vr=0.429 | geo=0.313km | gap=120m | ebilet/kupbilecik |
| ambiguous | ebilet-68031-20260912 ↔ kupbilecik-218507-20260912 | cont=0.50 | vr=0.429 | geo=0.313km | gap=0m | ebilet/kupbilecik |
| ambiguous | kupbilecik-218544-20260912 ↔ kupbilecik-218507-20260912 | cont=0.75 | vr=1 | geo=0km | gap=120m | kupbilecik/kupbilecik |

#### G77 — 2026-09-12 · 2 members · winner `kupbilecik-217116-20260912` (kupbilecik)
- merged times (union): `[19:15, 20:30]` · winner shows: `[20:30]`
- pairs: 1 — same=0 ambiguous=1 different=0 · redundant posts (if all-same): ?

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `ebilet-146360-20260912` | ebilet | approved | Chopin & Friends Concert By Candle Glow | Kościół Rektorski Ojców Karmelitów pw. św. Katarzyny | 54.35294, 18.63086 | 19:15, 20:30 |
| `kupbilecik-217116-20260912` | kupbilecik | approved | Koncerty fortepianowe w Gdańsku | Kościół św. Katarzyny | 54.35443, 18.65239 | 20:30 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| ambiguous | ebilet-146360-20260912 ↔ kupbilecik-217116-20260912 | cont=0.00 | vr=0.571 | geo=1.405km | gap=0m | ebilet/kupbilecik |

#### G78 — 2026-09-12 · 3 members · winner `going-2417191` (going)
- merged times (union): `[19:00]` · winner shows: `[19:00]`
- pairs: 3 — same=0 ambiguous=3 different=0 · redundant posts (if all-same): ?

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `going-2414986` | going | approved | Teściowe wiecznie żywe | Teatr Muzyczny w Łodzi | 51.77993, 19.47304 | 19:00 |
| `going-2417191` | going | approved | Kryminał improwizowany | Teatr Komedii Impro | 51.77670, 19.45470 | 19:00 |
| `kupbilecik-200916-20260912` | kupbilecik | approved | Warszawski Teatr Kamienica | Teatr Muzyczny | 51.78016, 19.47288 | 19:00 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| ambiguous | going-2414986 ↔ going-2417191 | cont=0.00 | vr=0.439 | geo=1.312km | gap=0m | going/going |
| ambiguous | going-2414986 ↔ kupbilecik-200916-20260912 | cont=0.00 | vr=0.778 | geo=0.028km | gap=0m | going/kupbilecik |
| ambiguous | going-2417191 ↔ kupbilecik-200916-20260912 | cont=0.00 | vr=0.424 | geo=1.308km | gap=0m | going/kupbilecik |

#### G79 — 2026-09-12 · 2 members · winner `kupbilecik-209199-20260912` (kupbilecik)
- merged times (union): `[19:00]` · winner shows: `[19:00]`
- pairs: 1 — same=0 ambiguous=1 different=0 · redundant posts (if all-same): ?

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `ebilet-87069-20260912` | ebilet | approved | Wymyśliłem Ciebie - Koncert Pamięci Andrzeja Zauchy | Centrum Spotkania Kultur | 51.24700, 22.54904 | 19:00 |
| `kupbilecik-209199-20260912` | kupbilecik | approved | Muzyczny hołd dla Andrzeja Zauchy rusza w Polskę! | Centrum Spotkania Kultur | 51.24766, 22.54944 | 19:00 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| ambiguous | ebilet-87069-20260912 ↔ kupbilecik-209199-20260912 | cont=0.33 | vr=1 | geo=0.079km | gap=0m | ebilet/kupbilecik |

#### G80 — 2026-09-12 · 2 members · winner `kupbilecik-197168-20260912` (kupbilecik)
- merged times (union): `[16:00]` · winner shows: `[16:00]`
- pairs: 1 — same=1 ambiguous=0 different=0 · redundant posts (if all-same): 1

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `ebilet-150394-20260912` | ebilet | approved | SKOLIM Król Latino | Myślenicki Ośrodek Kultury i Sportu | 49.82948, 19.94272 | 16:00 |
| `kupbilecik-197168-20260912` | kupbilecik | approved | SKOLIM - Król Latino | Myślenicki Ośrodek Kultury i Sportu | 49.82973, 19.94267 | 16:00 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| same | ebilet-150394-20260912 ↔ kupbilecik-197168-20260912 | cont=1.00 | vr=1 | geo=0.029km | gap=0m | ebilet/kupbilecik |

#### G81 — 2026-09-12 · 2 members · winner `kupbilecik-188445-20260912` (kupbilecik)
- merged times (union): `[14:00]` · winner shows: `[14:00]`
- pairs: 1 — same=0 ambiguous=1 different=0 · redundant posts (if all-same): ?

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `ebilet-195578-20260912` | ebilet | approved | Śpiewające Brzdące: Lisek i Przyjaciele | Aula Artis | 52.41556, 16.93190 | 14:00 |
| `kupbilecik-188445-20260912` | kupbilecik | approved | Śpiewające Brzdące: Lisek i Przyjaciele | Collegium Da Vinci - Aula Artis | 52.41581, 16.93153 | 14:00 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| ambiguous | ebilet-195578-20260912 ↔ kupbilecik-188445-20260912 | cont=1.00 | vr=0.513 | geo=0.038km | gap=0m | ebilet/kupbilecik |

#### G82 — 2026-09-12 · 3 members · winner `going-2414698` (going)
- merged times (union): `[18:45, 19:00, 20:00]` · winner shows: `[18:45]`
- pairs: 3 — same=0 ambiguous=2 different=1 · redundant posts (if all-same): ?

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `going-2414698` | going | approved | Z poważaniem, Leonard Cohen | Teatr Przypadków Feralnych | 50.06470, 19.94500 | 18:45 |
| `kupbilecik-209394-20260912` | kupbilecik | approved | Inauguracja nowej sceny TPF | Teatr Przypadków Feralnych | 50.06236, 19.94247 | 19:00 |
| `kupbilecik-215521-20260912` | kupbilecik | approved | Burlesque - zmysłowy spektakl wokalno-taneczny | Teatr Cabaret | 50.05101, 19.94170 | 20:00 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| ambiguous | going-2414698 ↔ kupbilecik-209394-20260912 | cont=0.00 | vr=1 | geo=0.317km | gap=15m | going/kupbilecik |
| different | going-2414698 ↔ kupbilecik-215521-20260912 | cont=0.00 | vr=0.41 | geo=—km | gap=75m | going/kupbilecik |
| ambiguous | kupbilecik-209394-20260912 ↔ kupbilecik-215521-20260912 | cont=0.00 | vr=0.41 | geo=1.263km | gap=60m | kupbilecik/kupbilecik |

#### G83 — 2026-09-13 · 2 members · winner `kupbilecik-212703-20260913` (kupbilecik)
- merged times (union): `[17:00]` · winner shows: `[17:00]`
- pairs: 1 — same=0 ambiguous=1 different=0 · redundant posts (if all-same): ?

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `kupbilecik-212703-20260913` | kupbilecik | approved | ¡Viva España! - hiszpańska noc przy świecach | Centrum Kultury Agora | 51.13480, 17.02160 | 17:00 |
| `eventim-45318195539` | eventim | approved | Koncert przy świecach – ¡Viva España! – hiszpańska noc przy świecach | Centrum Kultury AGORA – Sala Widowiskowa | 51.13489, 17.02164 | 17:00 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| ambiguous | kupbilecik-212703-20260913 ↔ eventim-45318195539 | cont=1.00 | vr=0.712 | geo=0.011km | gap=0m | kupbilecik/eventim |

#### G84 — 2026-09-13 · 3 members · winner `kupbilecik-204559-20260913` (kupbilecik)
- merged times (union): `[16:00, 19:00]` · winner shows: `[19:00]`
- pairs: 3 — same=1 ambiguous=2 different=0 · redundant posts (if all-same): ?

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `ebilet-163532-20260913` | ebilet | approved | Gala Piosenki Wakacyjnej 2026 – Duo Performance | Nowohuckie Centrum Kultury w Krakowie | 50.07025, 20.03470 | 16:00, 19:00 |
| `kupbilecik-204555-20260913` | kupbilecik | approved | gospodarze wieczoru: Monika Biederman-Pers oraz Piotr Karzełek | Nowohuckie Centrum Kultury | 50.07036, 20.03503 | 16:00 |
| `kupbilecik-204559-20260913` | kupbilecik | approved | artyści i gospodarze wieczoru: Monika Biederman-Pers oraz Piotr Karzełek | Nowohuckie Centrum Kultury | 50.07036, 20.03503 | 19:00 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| ambiguous | ebilet-163532-20260913 ↔ kupbilecik-204555-20260913 | cont=0.00 | vr=0.825 | geo=0.027km | gap=0m | ebilet/kupbilecik |
| ambiguous | ebilet-163532-20260913 ↔ kupbilecik-204559-20260913 | cont=0.00 | vr=0.825 | geo=0.027km | gap=0m | ebilet/kupbilecik |
| same | kupbilecik-204555-20260913 ↔ kupbilecik-204559-20260913 | cont=1.00 | vr=1 | geo=0km | gap=180m | kupbilecik/kupbilecik |

#### G85 — 2026-09-13 · 2 members · winner `ebilet-207347-20260913` (ebilet)
- merged times (union): `[13:00, 14:00]` · winner shows: `[13:00]`
- pairs: 1 — same=0 ambiguous=1 different=0 · redundant posts (if all-same): ?

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `ebilet-170023-20260913` | ebilet | approved | Ostróda/Miłomłyn SZLAKIEM KANAŁU ELBLĄSKIEGO | Przystań Ostróda | 53.69392, 19.96256 | 14:00 |
| `ebilet-207347-20260913` | ebilet | approved | BAŚNIOWY REJS Z LOKALNĄ LEGENDĄ DLA DZIECI | Przystań Ostróda | 53.69392, 19.96256 | 13:00 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| ambiguous | ebilet-170023-20260913 ↔ ebilet-207347-20260913 | cont=0.00 | vr=1 | geo=0km | gap=60m | ebilet/ebilet |

#### G86 — 2026-09-13 · 2 members · winner `kupbilecik-213727-20260913` (kupbilecik)
- merged times (union): `[17:30, 20:00]` · winner shows: `[17:30, 20:00]`
- pairs: 1 — same=0 ambiguous=1 different=0 · redundant posts (if all-same): ?

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `ebilet-212185-20260913` | ebilet | approved | Muzyka i akrobacje przy świecach: Terra | Sala Koncertowa Radia Wrocław | 51.07134, 17.00671 | 17:30 |
| `kupbilecik-213727-20260913` | kupbilecik | approved | Candle Live Music: Koncerty przy świecach | Sala Koncertowa Radia Wrocław | 51.07174, 17.00695 | 17:30, 20:00 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| ambiguous | ebilet-212185-20260913 ↔ kupbilecik-213727-20260913 | cont=0.40 | vr=1 | geo=0.048km | gap=0m | ebilet/kupbilecik |

#### G87 — 2026-09-13 · 5 members · winner `kupbilecik-213702-20260913` (kupbilecik)
- merged times (union): `[19:00, 20:00, 20:30]` · winner shows: `[20:00]`
- pairs: 10 — same=0 ambiguous=10 different=0 · redundant posts (if all-same): ?

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `kupbilecik-213864-20260913` | kupbilecik | approved | I like Queen - Piano Show | I like Chopin | 54.35510, 18.64909 | 20:30 |
| `kupbilecik-213702-20260913` | kupbilecik | approved | Candlelight Chopin Concert Old Town Gdańsk | Sala pod Bazyliką Mariacką | 54.34992, 18.65305 | 20:00 |
| `kupbilecik-213233-20260913` | kupbilecik | approved | I like Chopin - kameralny koncert przy świecach | I like Chopin | 54.35510, 18.64909 | 19:00 |
| `ebilet-211761-20260913` | ebilet | pending | I like CHOPIN | Sala koncertowa I like CHOPIN | 54.35200, 18.64660 | 19:00 |
| `ebilet-213429-20260913` | ebilet | pending | I like Queen - piano show przy świecach | Sala koncertowa I like CHOPIN | 54.35200, 18.64660 | 20:30 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| ambiguous | kupbilecik-213864-20260913 ↔ kupbilecik-213702-20260913 | cont=0.00 | vr=0.308 | geo=0.631km | gap=30m | kupbilecik/kupbilecik |
| ambiguous | kupbilecik-213864-20260913 ↔ kupbilecik-213233-20260913 | cont=0.00 | vr=1 | geo=0km | gap=90m | kupbilecik/kupbilecik |
| ambiguous | kupbilecik-213864-20260913 ↔ ebilet-211761-20260913 | cont=0.00 | vr=0.619 | geo=0.381km | gap=90m | kupbilecik/ebilet |
| ambiguous | kupbilecik-213864-20260913 ↔ ebilet-213429-20260913 | cont=1.00 | vr=0.619 | geo=0.381km | gap=0m | kupbilecik/ebilet |
| ambiguous | kupbilecik-213702-20260913 ↔ kupbilecik-213233-20260913 | cont=0.00 | vr=0.308 | geo=0.631km | gap=60m | kupbilecik/kupbilecik |
| ambiguous | kupbilecik-213702-20260913 ↔ ebilet-211761-20260913 | cont=0.00 | vr=0.436 | geo=0.478km | gap=60m | kupbilecik/ebilet |
| ambiguous | kupbilecik-213702-20260913 ↔ ebilet-213429-20260913 | cont=0.00 | vr=0.436 | geo=0.478km | gap=30m | kupbilecik/ebilet |
| ambiguous | kupbilecik-213233-20260913 ↔ ebilet-211761-20260913 | cont=0.00 | vr=0.619 | geo=0.381km | gap=0m | kupbilecik/ebilet |
| ambiguous | kupbilecik-213233-20260913 ↔ ebilet-213429-20260913 | cont=0.50 | vr=0.619 | geo=0.381km | gap=90m | kupbilecik/ebilet |
| ambiguous | ebilet-211761-20260913 ↔ ebilet-213429-20260913 | cont=0.00 | vr=1 | geo=0km | gap=90m | ebilet/ebilet |

#### G88 — 2026-09-13 · 2 members · winner `kupbilecik-216881-20260913` (kupbilecik)
- merged times (union): `[19:00]` · winner shows: `[19:00]`
- pairs: 1 — same=0 ambiguous=1 different=0 · redundant posts (if all-same): ?

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `kupbilecik-216881-20260913` | kupbilecik | approved | Chopin & Friends - koncerty fortepianowe przy świecach | Sala koncertowa w podziemiach Bazyliki św. Józefa | 52.41366, 16.92998 | 19:00 |
| `eventim-44973512628` | eventim | approved | KONCERTY FORTEPIANOWE PRZY ŚWIECACH | Bazylika św. Józefa | 52.41357, 16.93039 | 19:00 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| ambiguous | kupbilecik-216881-20260913 ↔ eventim-44973512628 | cont=1.00 | vr=0.515 | geo=0.029km | gap=0m | kupbilecik/eventim |

#### G89 — 2026-09-13 · 3 members · winner `ebilet-172054-20260913` (ebilet)
- merged times (union): `[18:00, 19:00, 20:00]` · winner shows: `[20:00]`
- pairs: 3 — same=0 ambiguous=3 different=0 · redundant posts (if all-same): ?

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `ebilet-172056-20260913` | ebilet | pending | Grand Piano Trio Chopin & Friends By Candle Glow | Klasztor O.O. Bernardynów | 50.06470, 19.94500 | 18:00 |
| `ebilet-181566-20260913` | ebilet | pending | Queen Classic Concert By Candle Glow | Klasztor O.O. Bernardynów | 50.06470, 19.94500 | 19:00 |
| `ebilet-172054-20260913` | ebilet | pending | Chopin & Friends Concert By Candle Glow | Klasztor O.O. Bernardynów | 50.06470, 19.94500 | 20:00 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| ambiguous | ebilet-172056-20260913 ↔ ebilet-181566-20260913 | cont=0.40 | vr=1 | geo=0km | gap=60m | ebilet/ebilet |
| ambiguous | ebilet-172056-20260913 ↔ ebilet-172054-20260913 | cont=0.80 | vr=1 | geo=0km | gap=120m | ebilet/ebilet |
| ambiguous | ebilet-181566-20260913 ↔ ebilet-172054-20260913 | cont=0.60 | vr=1 | geo=0km | gap=60m | ebilet/ebilet |

#### G90 — 2026-09-13 · 4 members · winner `kupbilecik-216538-20260913` (kupbilecik)
- merged times (union): `[16:00, 16:30, 17:00, 17:30, 18:00, 19:00, 20:00, 21:00]` · winner shows: `[20:00]`
- pairs: 6 — same=0 ambiguous=6 different=0 · redundant posts (if all-same): ?

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `ebilet-211889-20260913` | ebilet | approved | GENESIS – The Creation Light Show | Royal Chopin Hall | 50.05318, 19.93792 | 16:00, 16:30, 17:00, 17:30, 21:00 |
| `kupbilecik-217221-20260913` | kupbilecik | approved | Koncert Chopin & Friends przeniesie niejednego melomana w magiczny świat muzyki | Royal Chopin Hall | 50.05318, 19.93792 | 18:00 |
| `kupbilecik-216538-20260913` | kupbilecik | approved | Chopin & Friends Concert Candlelight | Royal Chopin Hall | 50.05318, 19.93792 | 20:00 |
| `kupbilecik-216688-20260913` | kupbilecik | approved | Royal Chopin Hall - Queen Classic Candlelight | Royal Chopin Hall | 50.05318, 19.93792 | 19:00 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| ambiguous | ebilet-211889-20260913 ↔ kupbilecik-217221-20260913 | cont=0.00 | vr=1 | geo=0km | gap=30m | ebilet/kupbilecik |
| ambiguous | ebilet-211889-20260913 ↔ kupbilecik-216538-20260913 | cont=0.00 | vr=1 | geo=0km | gap=60m | ebilet/kupbilecik |
| ambiguous | ebilet-211889-20260913 ↔ kupbilecik-216688-20260913 | cont=0.00 | vr=1 | geo=0km | gap=90m | ebilet/kupbilecik |
| ambiguous | kupbilecik-217221-20260913 ↔ kupbilecik-216538-20260913 | cont=0.33 | vr=1 | geo=0km | gap=120m | kupbilecik/kupbilecik |
| ambiguous | kupbilecik-217221-20260913 ↔ kupbilecik-216688-20260913 | cont=0.00 | vr=1 | geo=0km | gap=60m | kupbilecik/kupbilecik |
| ambiguous | kupbilecik-216538-20260913 ↔ kupbilecik-216688-20260913 | cont=0.33 | vr=1 | geo=0km | gap=60m | kupbilecik/kupbilecik |

#### G91 — 2026-09-13 · 2 members · winner `kupbilecik-195082-20260913` (kupbilecik)
- merged times (union): `[16:00]` · winner shows: `[16:00]`
- pairs: 1 — same=0 ambiguous=1 different=0 · redundant posts (if all-same): ?

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `kupbilecik-195082-20260913` | kupbilecik | approved | Cztery Pory Roku - Antonio Vivaldi | IBB Andersia Hotel | 52.40122, 16.92614 | 16:00 |
| `ebilet-50763-20260913` | ebilet | pending | Cztery Pory Roku - Antonio Vivaldi | Andersia Hotel&Spa Poznań | 52.40640, 16.92520 | 16:00 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| ambiguous | kupbilecik-195082-20260913 ↔ ebilet-50763-20260913 | cont=1.00 | vr=0.651 | geo=0.58km | gap=0m | kupbilecik/ebilet |

#### G92 — 2026-09-13 · 2 members · winner `kupbilecik-202311-20260913` (kupbilecik)
- merged times (union): `[20:30]` · winner shows: `[20:30]`
- pairs: 1 — same=0 ambiguous=1 different=0 · redundant posts (if all-same): ?

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `kupbilecik-202311-20260913` | kupbilecik | approved | DiscoOpera przy świecach | IBB Andersia Hotel | 52.40122, 16.92614 | 20:30 |
| `ebilet-204876-20260913` | ebilet | pending | DiscoOpera przy świecach | Andersia Hotel&Spa Poznań | 52.40640, 16.92520 | 20:30 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| ambiguous | kupbilecik-202311-20260913 ↔ ebilet-204876-20260913 | cont=1.00 | vr=0.651 | geo=0.58km | gap=0m | kupbilecik/ebilet |

#### G93 — 2026-09-13 · 2 members · winner `eventim-44973512618` (eventim)
- merged times (union): `[11:00]` · winner shows: `[11:00]`
- pairs: 1 — same=0 ambiguous=1 different=0 · redundant posts (if all-same): ?

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `eventim-44973512618` | eventim | approved | Doktor Dolittle i jego zwierzęta | Teatr Capitol | 52.24149, 21.00347 | 11:00 |
| `ebilet-15461-20260913` | ebilet | pending | Doktor Dolittle i jego zwierzęta | Teatr Capitol Scena Mniejsza | 52.22970, 21.01220 | 11:00 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| ambiguous | eventim-44973512618 ↔ ebilet-15461-20260913 | cont=1.00 | vr=0.634 | geo=1.439km | gap=0m | eventim/ebilet |

#### G94 — 2026-09-13 · 3 members · winner `going-2416467` (going)
- merged times (union): `[19:00]` · winner shows: `[19:00]`
- pairs: 3 — same=0 ambiguous=3 different=0 · redundant posts (if all-same): ?

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `ebilet-212200-20260913` | ebilet | approved | JAZZTIVAL MOXO vol. III | MOXO Restaurant&Club Fabryka Norblina | 52.23228, 20.99083 | 19:00 |
| `going-2416467` | going | approved | Doogie White & Polish Chapter \| 30-lecie Stranger in Us All \| Warszawa | VooDoo Club | 52.22970, 21.01220 | 19:00 |
| `kupbilecik-217530-20260913` | kupbilecik | approved | GRZECH PIOTROWSKi band & RUTH WILHELMINE Meyer | Moxo Restaurant | 52.23204, 20.99170 | 19:00 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| ambiguous | ebilet-212200-20260913 ↔ going-2416467 | cont=0.00 | vr=0.292 | geo=1.483km | gap=0m | ebilet/going |
| ambiguous | ebilet-212200-20260913 ↔ kupbilecik-217530-20260913 | cont=0.00 | vr=0.577 | geo=0.065km | gap=0m | ebilet/kupbilecik |
| ambiguous | going-2416467 ↔ kupbilecik-217530-20260913 | cont=0.00 | vr=0.308 | geo=1.42km | gap=0m | going/kupbilecik |

#### G95 — 2026-09-13 · 3 members · winner `kupbilecik-212625-20260913` (kupbilecik)
- merged times (union): `[17:30, 20:00]` · winner shows: `[17:30, 20:00]`
- pairs: 3 — same=0 ambiguous=3 different=0 · redundant posts (if all-same): ?

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `ebilet-58711-20260913` | ebilet | approved | Legendy Rocka - Koncert przy świecach | Pałac Młodzieży | 50.25489, 19.01121 | 20:00 |
| `kupbilecik-212625-20260913` | kupbilecik | approved | Dreamlive Concerts: Koncerty przy świecach | Pałac Młodzieży - sala teatralna | 50.25482, 19.01116 | 17:30, 20:00 |
| `eventim-45301495327` | eventim | pending | Muzyka Filmowa: Koncert przy świecach by Dreamlive Concerts | Pałac Młodzieży w Katowicach | 50.26490, 19.02380 | 17:30 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| ambiguous | ebilet-58711-20260913 ↔ kupbilecik-212625-20260913 | cont=0.40 | vr=0.667 | geo=0.009km | gap=0m | ebilet/kupbilecik |
| ambiguous | ebilet-58711-20260913 ↔ eventim-45301495327 | cont=0.60 | vr=0.698 | geo=1.428km | gap=150m | ebilet/eventim |
| ambiguous | kupbilecik-212625-20260913 ↔ eventim-45301495327 | cont=0.80 | vr=0.69 | geo=1.437km | gap=0m | kupbilecik/eventim |

#### G96 — 2026-09-13 · 2 members · winner `kupbilecik-195611-20260913` (kupbilecik)
- merged times (union): `[19:00]` · winner shows: `[19:00]`
- pairs: 1 — same=0 ambiguous=1 different=0 · redundant posts (if all-same): ?

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `kupbilecik-195611-20260913` | kupbilecik | approved | Freddie Mercury rock-operowo | IBB Andersia Hotel | 52.40122, 16.92614 | 19:00 |
| `ebilet-5751-20260913` | ebilet | pending | Freddie Mercury Rock -Operowo | Andersia Hotel&Spa Poznań | 52.40640, 16.92520 | 19:00 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| ambiguous | kupbilecik-195611-20260913 ↔ ebilet-5751-20260913 | cont=1.00 | vr=0.651 | geo=0.58km | gap=0m | kupbilecik/ebilet |

#### G97 — 2026-09-13 · 2 members · winner `kupbilecik-211624-20260913` (kupbilecik)
- merged times (union): `[18:00]` · winner shows: `[18:00]`
- pairs: 1 — same=0 ambiguous=1 different=0 · redundant posts (if all-same): ?

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `ebilet-199540-20260913` | ebilet | approved | PRZYJACIELE/Le Mensonge | Garnizon Sztuki | 52.22844, 21.02636 | 18:00 |
| `kupbilecik-211624-20260913` | kupbilecik | approved | Garnizon Sztuki - teatr pozytywnych emocji. | Garnizon Sztuki | 52.22805, 21.02656 | 18:00 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| ambiguous | ebilet-199540-20260913 ↔ kupbilecik-211624-20260913 | cont=0.00 | vr=1 | geo=0.045km | gap=0m | ebilet/kupbilecik |

#### G98 — 2026-09-13 · 5 members · winner `kupbilecik-215571-20260913` (kupbilecik)
- merged times (union): `[11:00, 12:00, 13:00]` · winner shows: `[11:00]`
- pairs: 10 — same=1 ambiguous=9 different=0 · redundant posts (if all-same): ?

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `ebilet-205694-20260913` | ebilet | approved | Indywidualne zwiedzanie wystawy | Muzeum Sztuki Nowoczesnej | 52.23313, 21.00898 | 11:00 |
| `ebilet-87721-20260913` | ebilet | approved | Zwiedzanie Pałacu Kultury i Nauki | Pałac Kultury i Nauki | 52.23191, 21.00931 | 11:00 |
| `ebilet-126412-20260913` | ebilet | approved | Zwiedzanie Muzeum - Mt 5,14 | Muzeum Jana Pawła II i Prymasa Wyszyńskiego | 52.22585, 21.01627 | 12:00 |
| `kupbilecik-215571-20260913` | kupbilecik | approved | GITARY, UKULELE, BANJO! Dla Dzieci 2-7! INAUGURACJA NA 10 INSTRUMENTÓW! | Pałac Staszica - Sala Lustrzana | 52.23768, 21.01772 | 11:00 |
| `kupbilecik-215576-20260913` | kupbilecik | approved | GITARY, UKULELE, BANJO! Dla Dzieci 5-12! INAUGURACJA NA 10 INSTRUMENTÓW! | Pałac Staszica - Sala Lustrzana | 52.23768, 21.01772 | 13:00 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| ambiguous | ebilet-205694-20260913 ↔ ebilet-87721-20260913 | cont=0.50 | vr=0.261 | geo=0.138km | gap=0m | ebilet/ebilet |
| ambiguous | ebilet-205694-20260913 ↔ ebilet-126412-20260913 | cont=1.00 | vr=0.382 | geo=0.95km | gap=60m | ebilet/ebilet |
| ambiguous | ebilet-205694-20260913 ↔ kupbilecik-215571-20260913 | cont=0.00 | vr=0.259 | geo=0.781km | gap=0m | ebilet/kupbilecik |
| ambiguous | ebilet-205694-20260913 ↔ kupbilecik-215576-20260913 | cont=0.00 | vr=0.259 | geo=0.781km | gap=120m | ebilet/kupbilecik |
| ambiguous | ebilet-87721-20260913 ↔ ebilet-126412-20260913 | cont=1.00 | vr=0.344 | geo=0.824km | gap=60m | ebilet/ebilet |
| ambiguous | ebilet-87721-20260913 ↔ kupbilecik-215571-20260913 | cont=0.00 | vr=0.44 | geo=0.86km | gap=0m | ebilet/kupbilecik |
| ambiguous | ebilet-87721-20260913 ↔ kupbilecik-215576-20260913 | cont=0.00 | vr=0.44 | geo=0.86km | gap=120m | ebilet/kupbilecik |
| ambiguous | ebilet-126412-20260913 ↔ kupbilecik-215571-20260913 | cont=0.00 | vr=0.361 | geo=1.319km | gap=60m | ebilet/kupbilecik |
| ambiguous | ebilet-126412-20260913 ↔ kupbilecik-215576-20260913 | cont=0.00 | vr=0.361 | geo=1.319km | gap=60m | ebilet/kupbilecik |
| same | kupbilecik-215571-20260913 ↔ kupbilecik-215576-20260913 | cont=1.00 | vr=1 | geo=0km | gap=120m | kupbilecik/kupbilecik |

#### G99 — 2026-09-13 · 7 members · winner `going-2413868` (going)
- merged times (union): `[15:30, 16:30, 17:00, 18:00]` · winner shows: `[15:30]`
- pairs: 21 — same=1 ambiguous=18 different=2 · redundant posts (if all-same): ?

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `ebilet-182276-20260913` | ebilet | approved | Nieśmiała dżokejka | Teatr Studio | 52.23264, 21.00674 | 17:00 |
| `ebilet-185305-20260913` | ebilet | approved | Jej Wysokość Operetka | Teatr Muzyczny  Roma | 52.22741, 21.00781 | 18:00 |
| `going-2415728` | going | approved | Łóżko pełne cudzoziemców | Teatr Capitol | 52.22970, 21.01220 | 17:00 |
| `going-2416314` | going | approved | Obiecuję, obiecuję ci… czyli bajka tylko dla dorosłych | Teatr Nowe Formy | 52.22970, 21.01220 | 16:30 |
| `going-2413868` | going | approved | Gra o dom | Teatr Kamienica | 52.22970, 21.01220 | 15:30 |
| `kupbilecik-198152-20260913` | kupbilecik | approved | Reż. Jerzy Bończak | Teatr Capitol | 52.24107, 21.00316 | 17:00 |
| `kupbilecik-208358-20260913` | kupbilecik | approved | Jej Wysokość Operetka | Teatr Muzyczny ROMA | 52.22760, 21.00745 | 18:00 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| ambiguous | ebilet-182276-20260913 ↔ ebilet-185305-20260913 | cont=0.00 | vr=0.516 | geo=0.586km | gap=60m | ebilet/ebilet |
| ambiguous | ebilet-182276-20260913 ↔ going-2415728 | cont=0.00 | vr=0.64 | geo=0.495km | gap=0m | ebilet/going |
| ambiguous | ebilet-182276-20260913 ↔ going-2416314 | cont=0.00 | vr=0.5 | geo=0.495km | gap=30m | ebilet/going |
| ambiguous | ebilet-182276-20260913 ↔ going-2413868 | cont=0.00 | vr=0.519 | geo=0.495km | gap=90m | ebilet/going |
| ambiguous | ebilet-182276-20260913 ↔ kupbilecik-198152-20260913 | cont=0.00 | vr=0.64 | geo=0.969km | gap=0m | ebilet/kupbilecik |
| ambiguous | ebilet-182276-20260913 ↔ kupbilecik-208358-20260913 | cont=0.00 | vr=0.516 | geo=0.563km | gap=60m | ebilet/kupbilecik |
| ambiguous | ebilet-185305-20260913 ↔ going-2415728 | cont=0.00 | vr=0.5 | geo=0.393km | gap=60m | ebilet/going |
| ambiguous | ebilet-185305-20260913 ↔ going-2416314 | cont=0.00 | vr=0.571 | geo=0.393km | gap=90m | ebilet/going |
| ambiguous | ebilet-185305-20260913 ↔ going-2413868 | cont=0.00 | vr=0.529 | geo=0.393km | gap=150m | ebilet/going |
| different | ebilet-185305-20260913 ↔ kupbilecik-198152-20260913 | cont=0.00 | vr=0.5 | geo=—km | gap=60m | ebilet/kupbilecik |
| same | ebilet-185305-20260913 ↔ kupbilecik-208358-20260913 | cont=1.00 | vr=1 | geo=0.032km | gap=0m | ebilet/kupbilecik |
| ambiguous | going-2415728 ↔ going-2416314 | cont=0.00 | vr=0.483 | geo=0km | gap=30m | going/going |
| ambiguous | going-2415728 ↔ going-2413868 | cont=0.00 | vr=0.571 | geo=0km | gap=90m | going/going |
| ambiguous | going-2415728 ↔ kupbilecik-198152-20260913 | cont=0.00 | vr=1 | geo=1.407km | gap=0m | going/kupbilecik |
| ambiguous | going-2415728 ↔ kupbilecik-208358-20260913 | cont=0.00 | vr=0.5 | geo=0.399km | gap=60m | going/kupbilecik |
| ambiguous | going-2416314 ↔ going-2413868 | cont=0.00 | vr=0.452 | geo=0km | gap=60m | going/going |
| ambiguous | going-2416314 ↔ kupbilecik-198152-20260913 | cont=0.00 | vr=0.483 | geo=1.407km | gap=30m | going/kupbilecik |
| ambiguous | going-2416314 ↔ kupbilecik-208358-20260913 | cont=0.00 | vr=0.571 | geo=0.399km | gap=90m | going/kupbilecik |
| ambiguous | going-2413868 ↔ kupbilecik-198152-20260913 | cont=0.00 | vr=0.571 | geo=1.407km | gap=90m | going/kupbilecik |
| ambiguous | going-2413868 ↔ kupbilecik-208358-20260913 | cont=0.00 | vr=0.529 | geo=0.399km | gap=150m | going/kupbilecik |
| different | kupbilecik-198152-20260913 ↔ kupbilecik-208358-20260913 | cont=0.00 | vr=0.5 | geo=—km | gap=60m | kupbilecik/kupbilecik |

#### G100 — 2026-09-13 · 2 members · winner `kupbilecik-199552-20260913` (kupbilecik)
- merged times (union): `[20:00]` · winner shows: `[20:00]`
- pairs: 1 — same=1 ambiguous=0 different=0 · redundant posts (if all-same): 1

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `ebilet-5856-20260913` | ebilet | approved | Happysad Inaczej 2026 - 25 lat zespołu | Amfiteatr Wolskiego Centrum Kultury | 52.23099, 20.94923 | 20:00 |
| `kupbilecik-199552-20260913` | kupbilecik | approved | Happysad Inaczej 2026 - 25 lat zespołu | Amfiteatr Wolskiego Centrum Kultury | 52.23287, 20.94848 | 20:00 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| same | ebilet-5856-20260913 ↔ kupbilecik-199552-20260913 | cont=1.00 | vr=1 | geo=0.216km | gap=0m | ebilet/kupbilecik |

#### G101 — 2026-09-13 · 3 members · winner `going-2417195` (going)
- merged times (union): `[15:00, 18:00]` · winner shows: `[18:00]`
- pairs: 3 — same=0 ambiguous=3 different=0 · redundant posts (if all-same): ?

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `going-2417193` | going | approved | Wymyślanka - bajka improwizowana | Teatr Komedii Impro | 51.77670, 19.45470 | 15:00 |
| `going-2417195` | going | approved | IMPRO Swing!, czyli para na parze | Teatr Komedii Impro | 51.77670, 19.45470 | 18:00 |
| `kupbilecik-203692-20260913` | kupbilecik | approved | Gorący spektakl w gwiazdorskiej obsadzie | Teatr Muzyczny | 51.78016, 19.47288 | 15:00, 18:00 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| ambiguous | going-2417193 ↔ going-2417195 | cont=0.00 | vr=1 | geo=0km | gap=180m | going/going |
| ambiguous | going-2417193 ↔ kupbilecik-203692-20260913 | cont=0.00 | vr=0.424 | geo=1.308km | gap=0m | going/kupbilecik |
| ambiguous | going-2417195 ↔ kupbilecik-203692-20260913 | cont=0.00 | vr=0.424 | geo=1.308km | gap=0m | going/kupbilecik |

#### G102 — 2026-09-13 · 6 members · winner `going-2413641` (going)
- merged times (union): `[16:00, 17:00, 18:00, 18:30, 19:00]` · winner shows: `[19:00]`
- pairs: 15 — same=0 ambiguous=14 different=1 · redundant posts (if all-same): ?

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `going-2413641` | going | approved | JAZZ PO POLSKU: Martyna Sabak Sekstet | Klub Jassmine | 52.22970, 21.01220 | 19:00 |
| `going-2416954` | going | approved | WŚCIEKŁY PIES \| spektakl i spotkanie | Klub SPATiF | 52.22681, 21.02310 | 18:30 |
| `kupbilecik-217602-20260913` | kupbilecik | approved | Open mic | Klub OCZKI | 52.22429, 21.00111 | 19:00 |
| `kupbilecik-214685-20260913` | kupbilecik | approved | Ten koleś to redflag - czyli chłopak, przed którym ostrzegała cię psiapsi | Klub Komediowy | 52.21969, 21.01669 | 16:00 |
| `kupbilecik-214688-20260913` | kupbilecik | approved | Jak osiągnąć sukces, orgazm i oświecenie duchowe w weekend | Klub Komediowy | 52.21969, 21.01669 | 17:00 |
| `kupbilecik-215533-20260913` | kupbilecik | approved | "Mamy Open'era w domu" - musical Improwizowany | Klub Komediowy | 52.21969, 21.01669 | 18:00 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| ambiguous | going-2413641 ↔ going-2416954 | cont=0.00 | vr=0.583 | geo=0.809km | gap=30m | going/going |
| ambiguous | going-2413641 ↔ kupbilecik-217602-20260913 | cont=0.00 | vr=0.522 | geo=0.965km | gap=0m | going/kupbilecik |
| ambiguous | going-2413641 ↔ kupbilecik-214685-20260913 | cont=0.00 | vr=0.519 | geo=1.154km | gap=180m | going/kupbilecik |
| ambiguous | going-2413641 ↔ kupbilecik-214688-20260913 | cont=0.00 | vr=0.519 | geo=1.154km | gap=120m | going/kupbilecik |
| ambiguous | going-2413641 ↔ kupbilecik-215533-20260913 | cont=0.00 | vr=0.519 | geo=1.154km | gap=60m | going/kupbilecik |
| different | going-2416954 ↔ kupbilecik-217602-20260913 | cont=0.00 | vr=0.571 | geo=—km | gap=30m | going/kupbilecik |
| ambiguous | going-2416954 ↔ kupbilecik-214685-20260913 | cont=0.00 | vr=0.48 | geo=0.905km | gap=150m | going/kupbilecik |
| ambiguous | going-2416954 ↔ kupbilecik-214688-20260913 | cont=0.00 | vr=0.48 | geo=0.905km | gap=90m | going/kupbilecik |
| ambiguous | going-2416954 ↔ kupbilecik-215533-20260913 | cont=0.00 | vr=0.48 | geo=0.905km | gap=30m | going/kupbilecik |
| ambiguous | kupbilecik-217602-20260913 ↔ kupbilecik-214685-20260913 | cont=0.00 | vr=0.583 | geo=1.178km | gap=180m | kupbilecik/kupbilecik |
| ambiguous | kupbilecik-217602-20260913 ↔ kupbilecik-214688-20260913 | cont=0.00 | vr=0.583 | geo=1.178km | gap=120m | kupbilecik/kupbilecik |
| ambiguous | kupbilecik-217602-20260913 ↔ kupbilecik-215533-20260913 | cont=0.50 | vr=0.583 | geo=1.178km | gap=60m | kupbilecik/kupbilecik |
| ambiguous | kupbilecik-214685-20260913 ↔ kupbilecik-214688-20260913 | cont=0.00 | vr=1 | geo=0km | gap=60m | kupbilecik/kupbilecik |
| ambiguous | kupbilecik-214685-20260913 ↔ kupbilecik-215533-20260913 | cont=0.00 | vr=1 | geo=0km | gap=120m | kupbilecik/kupbilecik |
| ambiguous | kupbilecik-214688-20260913 ↔ kupbilecik-215533-20260913 | cont=0.00 | vr=1 | geo=0km | gap=60m | kupbilecik/kupbilecik |

#### G103 — 2026-09-13 · 2 members · winner `kupbilecik-215296-20260913` (kupbilecik)
- merged times (union): `[17:30]` · winner shows: `[17:30]`
- pairs: 1 — same=0 ambiguous=1 different=0 · redundant posts (if all-same): ?

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `ebilet-208868-20260913` | ebilet | approved | Jubileusz 58-lecia – Old Metropolitan Band | Piwnica pod Złotą Pipą | 50.06403, 19.94046 | 17:30 |
| `kupbilecik-215296-20260913` | kupbilecik | approved | Jubileusz 58-lecia | Restauracja Piwnica pod Złotą Pipą | 50.06401, 19.94048 | 17:30 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| ambiguous | ebilet-208868-20260913 ↔ kupbilecik-215296-20260913 | cont=1.00 | vr=0.786 | geo=0.002km | gap=0m | ebilet/kupbilecik |

#### G104 — 2026-09-13 · 2 members · winner `ebilet-176778-20260913` (ebilet)
- merged times (union): `[16:00, 17:00]` · winner shows: `[17:00]`
- pairs: 1 — same=0 ambiguous=1 different=0 · redundant posts (if all-same): ?

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `ebilet-142210-20260913` | ebilet | approved | Zemsta | TEATR KOMEDIA. | 52.26915, 20.97862 | 16:00 |
| `ebilet-176778-20260913` | ebilet | approved | Kobieta Pracująca. Powraca – Mała Scena | Teatr Komedia | 52.26915, 20.97862 | 17:00 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| ambiguous | ebilet-142210-20260913 ↔ ebilet-176778-20260913 | cont=0.00 | vr=1 | geo=0km | gap=60m | ebilet/ebilet |

#### G105 — 2026-09-13 · 6 members · winner `kupbilecik-218508-20260913` (kupbilecik)
- merged times (union): `[19:00, 21:00]` · winner shows: `[19:00]`
- pairs: 15 — same=1 ambiguous=14 different=0 · redundant posts (if all-same): ?

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `ebilet-25271-20260913` | ebilet | approved | Koncert Chopinowski | Sala Koncertowa „Fryderyk” | 52.24849, 21.00994 | 21:00 |
| `ebilet-131722-20260913` | ebilet | approved | Koncerty przy Świecach | Sala Koncertowa „Fryderyk” | 52.24849, 21.00994 | 21:00 |
| `ebilet-68031-20260913` | ebilet | approved | Koncert Chopinowski w Chopin Point Warsaw | STARA GALERIA ZPAF | 52.24879, 21.01449 | 19:00 |
| `kupbilecik-217793-20260913` | kupbilecik | approved | Nastrojowy wieczór z muzyką Chopina | Stara Galeria ZPAF | 52.24879, 21.01449 | 19:00 |
| `kupbilecik-218508-20260913` | kupbilecik | approved | Koncert Chopinowski w Sali Koncertowej Fryderyk | Sala Koncertowa Fryderyk | 52.24832, 21.00996 | 19:00 |
| `kupbilecik-218545-20260913` | kupbilecik | approved | Koncert Przy Świecach w Sali Koncertowej Fryderyk | Sala Koncertowa Fryderyk | 52.24832, 21.00996 | 21:00 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| ambiguous | ebilet-25271-20260913 ↔ ebilet-131722-20260913 | cont=0.00 | vr=1 | geo=0km | gap=0m | ebilet/ebilet |
| ambiguous | ebilet-25271-20260913 ↔ ebilet-68031-20260913 | cont=1.00 | vr=0.429 | geo=0.312km | gap=120m | ebilet/ebilet |
| ambiguous | ebilet-25271-20260913 ↔ kupbilecik-217793-20260913 | cont=0.00 | vr=0.429 | geo=0.312km | gap=120m | ebilet/kupbilecik |
| same | ebilet-25271-20260913 ↔ kupbilecik-218508-20260913 | cont=1.00 | vr=1 | geo=0.019km | gap=120m | ebilet/kupbilecik |
| ambiguous | ebilet-25271-20260913 ↔ kupbilecik-218545-20260913 | cont=0.50 | vr=1 | geo=0.019km | gap=0m | ebilet/kupbilecik |
| ambiguous | ebilet-131722-20260913 ↔ ebilet-68031-20260913 | cont=0.00 | vr=0.429 | geo=0.312km | gap=120m | ebilet/ebilet |
| ambiguous | ebilet-131722-20260913 ↔ kupbilecik-217793-20260913 | cont=0.00 | vr=0.429 | geo=0.312km | gap=120m | ebilet/kupbilecik |
| ambiguous | ebilet-131722-20260913 ↔ kupbilecik-218508-20260913 | cont=0.00 | vr=1 | geo=0.019km | gap=120m | ebilet/kupbilecik |
| ambiguous | ebilet-131722-20260913 ↔ kupbilecik-218545-20260913 | cont=0.67 | vr=1 | geo=0.019km | gap=0m | ebilet/kupbilecik |
| ambiguous | ebilet-68031-20260913 ↔ kupbilecik-217793-20260913 | cont=0.00 | vr=1 | geo=0km | gap=0m | ebilet/kupbilecik |
| ambiguous | ebilet-68031-20260913 ↔ kupbilecik-218508-20260913 | cont=0.50 | vr=0.429 | geo=0.313km | gap=0m | ebilet/kupbilecik |
| ambiguous | ebilet-68031-20260913 ↔ kupbilecik-218545-20260913 | cont=0.20 | vr=0.429 | geo=0.313km | gap=120m | ebilet/kupbilecik |
| ambiguous | kupbilecik-217793-20260913 ↔ kupbilecik-218508-20260913 | cont=0.00 | vr=0.429 | geo=0.313km | gap=0m | kupbilecik/kupbilecik |
| ambiguous | kupbilecik-217793-20260913 ↔ kupbilecik-218545-20260913 | cont=0.00 | vr=0.429 | geo=0.313km | gap=120m | kupbilecik/kupbilecik |
| ambiguous | kupbilecik-218508-20260913 ↔ kupbilecik-218545-20260913 | cont=0.75 | vr=1 | geo=0km | gap=120m | kupbilecik/kupbilecik |

#### G106 — 2026-09-13 · 3 members · winner `kupbilecik-217118-20260913` (kupbilecik)
- merged times (union): `[19:15, 20:30]` · winner shows: `[20:30]`
- pairs: 3 — same=0 ambiguous=3 different=0 · redundant posts (if all-same): ?

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `ebilet-146360-20260913` | ebilet | approved | Chopin & Friends Concert By Candle Glow | Kościół Rektorski Ojców Karmelitów pw. św. Katarzyny | 54.35294, 18.63086 | 19:15, 20:30 |
| `kupbilecik-217118-20260913` | kupbilecik | approved | Koncerty fortepianowe w Gdańsku | Kościół św. Katarzyny | 54.35443, 18.65239 | 20:30 |
| `eventim-45622451938` | eventim | approved | CHOPIN & FRIENDS CONCERT BY CANDLE GLOW | Kościół św. Katarzyny | 54.35451, 18.65128 | 19:15, 20:30 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| ambiguous | ebilet-146360-20260913 ↔ kupbilecik-217118-20260913 | cont=0.00 | vr=0.571 | geo=1.405km | gap=0m | ebilet/kupbilecik |
| ambiguous | ebilet-146360-20260913 ↔ eventim-45622451938 | cont=1.00 | vr=0.571 | geo=1.335km | gap=0m | ebilet/eventim |
| ambiguous | kupbilecik-217118-20260913 ↔ eventim-45622451938 | cont=0.00 | vr=1 | geo=0.072km | gap=0m | kupbilecik/eventim |

#### G107 — 2026-09-13 · 3 members · winner `kupbilecik-210358-20260913` (kupbilecik)
- merged times (union): `[11:00]` · winner shows: `[11:00]`
- pairs: 3 — same=0 ambiguous=3 different=0 · redundant posts (if all-same): ?

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `ebilet-138964-20260913` | ebilet | approved | Muzeum Banksy | Muzeum Banksy | 50.05462, 19.94840 | 11:00 |
| `kupbilecik-210358-20260913` | kupbilecik | approved | Muzeum Banksy - bilet upoważniający do wejścia w ciągu całego dnia (od godz. 11:00) | Muzeum Banksy | 50.05511, 19.94810 | 11:00 |
| `eventim-42932505853` | eventim | approved | MUZEUM BANKSY KRAKÓW | Muzeum Banksy Kraków | 50.05462, 19.94840 | 11:00 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| ambiguous | ebilet-138964-20260913 ↔ kupbilecik-210358-20260913 | cont=0.00 | vr=1 | geo=0.058km | gap=0m | ebilet/kupbilecik |
| ambiguous | ebilet-138964-20260913 ↔ eventim-42932505853 | cont=0.00 | vr=0.788 | geo=0km | gap=0m | ebilet/eventim |
| ambiguous | kupbilecik-210358-20260913 ↔ eventim-42932505853 | cont=0.00 | vr=0.788 | geo=0.058km | gap=0m | kupbilecik/eventim |

#### G108 — 2026-09-13 · 2 members · winner `kupbilecik-209201-20260913` (kupbilecik)
- merged times (union): `[19:00]` · winner shows: `[19:00]`
- pairs: 1 — same=0 ambiguous=1 different=0 · redundant posts (if all-same): ?

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `ebilet-87069-20260913` | ebilet | approved | Wymyśliłem Ciebie - Koncert Pamięci Andrzeja Zauchy | Filharmonia Bałtycka | 54.35248, 18.65970 | 19:00 |
| `kupbilecik-209201-20260913` | kupbilecik | approved | Muzyczny hołd dla Andrzeja Zauchy rusza w Polskę! | Polska Filharmonia Bałtycka | 54.35234, 18.65980 | 19:00 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| ambiguous | ebilet-87069-20260913 ↔ kupbilecik-209201-20260913 | cont=0.33 | vr=0.851 | geo=0.016km | gap=0m | ebilet/kupbilecik |

#### G109 — 2026-09-13 · 3 members · winner `going-2415995` (going)
- merged times (union): `[18:45, 19:00, 20:00]` · winner shows: `[18:45]`
- pairs: 3 — same=0 ambiguous=2 different=1 · redundant posts (if all-same): ?

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `going-2415995` | going | approved | NICK CAVE. Ballady kochanków i morderców | Teatr Przypadków Feralnych | 50.06470, 19.94500 | 18:45 |
| `kupbilecik-213728-20260913` | kupbilecik | approved | Inauguracja nowej sceny Teatru Przypadków Feralnych | Teatr Przypadków Feralnych | 50.06236, 19.94247 | 19:00 |
| `kupbilecik-215523-20260913` | kupbilecik | approved | I love Cabaret | Teatr Cabaret | 50.05101, 19.94170 | 20:00 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| ambiguous | going-2415995 ↔ kupbilecik-213728-20260913 | cont=0.00 | vr=1 | geo=0.317km | gap=15m | going/kupbilecik |
| different | going-2415995 ↔ kupbilecik-215523-20260913 | cont=0.00 | vr=0.41 | geo=—km | gap=75m | going/kupbilecik |
| ambiguous | kupbilecik-213728-20260913 ↔ kupbilecik-215523-20260913 | cont=0.00 | vr=0.41 | geo=1.263km | gap=60m | kupbilecik/kupbilecik |

#### G110 — 2026-09-13 · 2 members · winner `kupbilecik-211669-20260913` (kupbilecik)
- merged times (union): `[16:00, 19:00]` · winner shows: `[19:00]`
- pairs: 1 — same=1 ambiguous=0 different=0 · redundant posts (if all-same): 1

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `kupbilecik-211664-20260913` | kupbilecik | approved | Opiekunka na zabój / Teatr Kamienica / Warszawa Winobraniowe Spotkania Teatralne 2026 | Lubuski Teatr | 51.94026, 15.50705 | 16:00 |
| `kupbilecik-211669-20260913` | kupbilecik | approved | Opiekunka na zabój / Teatr Kamienica / Warszawa Winobraniowe Spotkania Teatralne | Lubuski Teatr | 51.94026, 15.50705 | 19:00 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| same | kupbilecik-211664-20260913 ↔ kupbilecik-211669-20260913 | cont=1.00 | vr=1 | geo=0km | gap=180m | kupbilecik/kupbilecik |

#### G111 — 2026-09-13 · 2 members · winner `kupbilecik-188446-20260913` (kupbilecik)
- merged times (union): `[14:00]` · winner shows: `[14:00]`
- pairs: 1 — same=1 ambiguous=0 different=0 · redundant posts (if all-same): 1

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `ebilet-195578-20260913` | ebilet | approved | Śpiewające Brzdące: Lisek i Przyjaciele | Scena Teatralna NOT | 54.35535, 18.65068 | 14:00 |
| `kupbilecik-188446-20260913` | kupbilecik | approved | Śpiewające Brzdące: Lisek i Przyjaciele | Scena Teatralna NOT | 54.35530, 18.65069 | 14:00 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| same | ebilet-195578-20260913 ↔ kupbilecik-188446-20260913 | cont=1.00 | vr=1 | geo=0.006km | gap=0m | ebilet/kupbilecik |

#### G112 — 2026-09-13 · 2 members · winner `kupbilecik-216919-20260913` (kupbilecik)
- merged times (union): `[18:00, 20:00]` · winner shows: `[18:00]`
- pairs: 1 — same=1 ambiguous=0 different=0 · redundant posts (if all-same): 1

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `kupbilecik-216919-20260913` | kupbilecik | approved | Stand-up Ciechanów \| Ewa Błachnio testuje | Klubokawiarnia W18 | 52.88031, 20.61767 | 18:00 |
| `kupbilecik-218262-20260913` | kupbilecik | approved | Stand-up Ciechanów II termin \| Ewa Błachnio testuje | Klubokawiarnia W18 | 52.88031, 20.61767 | 20:00 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| same | kupbilecik-216919-20260913 ↔ kupbilecik-218262-20260913 | cont=1.00 | vr=1 | geo=0km | gap=120m | kupbilecik/kupbilecik |

#### G113 — 2026-09-13 · 2 members · winner `kupbilecik-206273-20260913` (kupbilecik)
- merged times (union): `[19:00]` · winner shows: `[19:00]`
- pairs: 1 — same=0 ambiguous=1 different=0 · redundant posts (if all-same): ?

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `kupbilecik-206273-20260913` | kupbilecik | approved | The best of Amy by Natalia Podwin | Stary Klasztor | 51.11050, 17.03982 | 19:00 |
| `ebilet-207588-20260913` | ebilet | pending | AMY WINEHOUSE BIRTHDAY - The best of Amy by Natalia Podwin | Sala Gotycka w Starym Klasztorze | 51.10790, 17.03850 | 19:00 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| ambiguous | kupbilecik-206273-20260913 ↔ ebilet-207588-20260913 | cont=1.00 | vr=0.609 | geo=0.303km | gap=0m | kupbilecik/ebilet |

#### G114 — 2026-09-13 · 2 members · winner `kupbilecik-195545-20260913` (kupbilecik)
- merged times (union): `[17:30]` · winner shows: `[17:30]`
- pairs: 1 — same=0 ambiguous=1 different=0 · redundant posts (if all-same): ?

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `kupbilecik-195545-20260913` | kupbilecik | approved | Wyjątkowy koncert w stylu włoskim | IBB Andersia Hotel | 52.40122, 16.92614 | 17:30 |
| `ebilet-17883-20260913` | ebilet | pending | Muzyczny życiorys Franka Sinatry. | Andersia Hotel&Spa Poznań | 52.40640, 16.92520 | 17:30 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| ambiguous | kupbilecik-195545-20260913 ↔ ebilet-17883-20260913 | cont=0.00 | vr=0.651 | geo=0.58km | gap=0m | kupbilecik/ebilet |

#### G115 — 2026-09-20 · 2 members · winner `mtp-retromotorshow.pl-20260920` (mtp)
- merged times (union): `[10:00]` · winner shows: `[10:00]`
- pairs: 1 — same=0 ambiguous=1 different=0 · redundant posts (if all-same): ?

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `mtp-retromotorshow.pl-20260920` | mtp | approved | Retro Motor Show 2026 | Międzynarodowe Targi Poznańskie | 52.40349, 16.91105 | 10:00 |
| `mtp-swiatowy_dzien_serca-20260920` | mtp | approved | Światowy Dzień Serca | Międzynarodowe Targi Poznańskie | 52.40349, 16.91105 | 10:00 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| ambiguous | mtp-retromotorshow.pl-20260920 ↔ mtp-swiatowy_dzien_serca-20260920 | cont=0.00 | vr=1 | geo=0km | gap=0m | mtp/mtp |

#### G116 — 2026-09-23 · 2 members · winner `mtp-polagra.pl-20260923` (mtp)
- merged times (union): `[10:00]` · winner shows: `[10:00]`
- pairs: 1 — same=0 ambiguous=1 different=0 · redundant posts (if all-same): ?

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `mtp-taropak.pl-20260923` | mtp | approved | TAROPAK 2026 | Międzynarodowe Targi Poznańskie | 52.40349, 16.91105 | 10:00 |
| `mtp-polagra.pl-20260923` | mtp | approved | POLAGRA 2026 | Międzynarodowe Targi Poznańskie | 52.40349, 16.91105 | 10:00 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| ambiguous | mtp-taropak.pl-20260923 ↔ mtp-polagra.pl-20260923 | cont=0.00 | vr=1 | geo=0km | gap=0m | mtp/mtp |

#### G117 — 2026-09-24 · 2 members · winner `mtp-polagra.pl-20260924` (mtp)
- merged times (union): `[10:00]` · winner shows: `[10:00]`
- pairs: 1 — same=0 ambiguous=1 different=0 · redundant posts (if all-same): ?

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `mtp-taropak.pl-20260924` | mtp | approved | TAROPAK 2026 | Międzynarodowe Targi Poznańskie | 52.40349, 16.91105 | 10:00 |
| `mtp-polagra.pl-20260924` | mtp | approved | POLAGRA 2026 | Międzynarodowe Targi Poznańskie | 52.40349, 16.91105 | 10:00 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| ambiguous | mtp-taropak.pl-20260924 ↔ mtp-polagra.pl-20260924 | cont=0.00 | vr=1 | geo=0km | gap=0m | mtp/mtp |

#### G118 — 2026-09-25 · 3 members · winner `mtp-polagra.pl-20260925` (mtp)
- merged times (union): `[10:00]` · winner shows: `[10:00]`
- pairs: 3 — same=0 ambiguous=3 different=0 · redundant posts (if all-same): ?

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `mtp-taropak.pl-20260925` | mtp | approved | TAROPAK 2026 | Międzynarodowe Targi Poznańskie | 52.40349, 16.91105 | 10:00 |
| `mtp-polagra.pl-20260925` | mtp | approved | POLAGRA 2026 | Międzynarodowe Targi Poznańskie | 52.40349, 16.91105 | 10:00 |
| `mtp-smaki-regionow.pl-20260925` | mtp | approved | Smaki Regionów 2026 | Międzynarodowe Targi Poznańskie | 52.40349, 16.91105 | 10:00 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| ambiguous | mtp-taropak.pl-20260925 ↔ mtp-polagra.pl-20260925 | cont=0.00 | vr=1 | geo=0km | gap=0m | mtp/mtp |
| ambiguous | mtp-taropak.pl-20260925 ↔ mtp-smaki-regionow.pl-20260925 | cont=0.00 | vr=1 | geo=0km | gap=0m | mtp/mtp |
| ambiguous | mtp-polagra.pl-20260925 ↔ mtp-smaki-regionow.pl-20260925 | cont=0.00 | vr=1 | geo=0km | gap=0m | mtp/mtp |

#### G119 — 2026-10-06 · 3 members · winner `mtp-targigardenia.pl-20261006` (mtp)
- merged times (union): `[10:00]` · winner shows: `[10:00]`
- pairs: 3 — same=0 ambiguous=3 different=0 · redundant posts (if all-same): ?

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `mtp-x1v5b-20261006` | mtp | approved | Invest Cuffs Poznań 2026 | Międzynarodowe Targi Poznańskie | 52.40349, 16.91105 | 10:00 |
| `mtp-poleco.pl-20261006` | mtp | approved | Poleco 2026 | Międzynarodowe Targi Poznańskie | 52.40349, 16.91105 | 10:00 |
| `mtp-targigardenia.pl-20261006` | mtp | approved | Gardenia 2026 | Międzynarodowe Targi Poznańskie | 52.40349, 16.91105 | 10:00 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| ambiguous | mtp-x1v5b-20261006 ↔ mtp-poleco.pl-20261006 | cont=0.00 | vr=1 | geo=0km | gap=0m | mtp/mtp |
| ambiguous | mtp-x1v5b-20261006 ↔ mtp-targigardenia.pl-20261006 | cont=0.00 | vr=1 | geo=0km | gap=0m | mtp/mtp |
| ambiguous | mtp-poleco.pl-20261006 ↔ mtp-targigardenia.pl-20261006 | cont=0.00 | vr=1 | geo=0km | gap=0m | mtp/mtp |

#### G120 — 2026-10-07 · 2 members · winner `mtp-targigardenia.pl-20261007` (mtp)
- merged times (union): `[10:00]` · winner shows: `[10:00]`
- pairs: 1 — same=0 ambiguous=1 different=0 · redundant posts (if all-same): ?

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `mtp-poleco.pl-20261007` | mtp | approved | Poleco 2026 | Międzynarodowe Targi Poznańskie | 52.40349, 16.91105 | 10:00 |
| `mtp-targigardenia.pl-20261007` | mtp | approved | Gardenia 2026 | Międzynarodowe Targi Poznańskie | 52.40349, 16.91105 | 10:00 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| ambiguous | mtp-poleco.pl-20261007 ↔ mtp-targigardenia.pl-20261007 | cont=0.00 | vr=1 | geo=0km | gap=0m | mtp/mtp |

#### G121 — 2026-10-08 · 2 members · winner `mtp-targigardenia.pl-20261008` (mtp)
- merged times (union): `[10:00]` · winner shows: `[10:00]`
- pairs: 1 — same=0 ambiguous=1 different=0 · redundant posts (if all-same): ?

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `mtp-poleco.pl-20261008` | mtp | approved | Poleco 2026 | Międzynarodowe Targi Poznańskie | 52.40349, 16.91105 | 10:00 |
| `mtp-targigardenia.pl-20261008` | mtp | approved | Gardenia 2026 | Międzynarodowe Targi Poznańskie | 52.40349, 16.91105 | 10:00 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| ambiguous | mtp-poleco.pl-20261008 ↔ mtp-targigardenia.pl-20261008 | cont=0.00 | vr=1 | geo=0km | gap=0m | mtp/mtp |

#### G122 — 2026-10-16 · 2 members · winner `mtp-caravanssalon.pl-20261016` (mtp)
- merged times (union): `[10:00]` · winner shows: `[10:00]`
- pairs: 1 — same=0 ambiguous=1 different=0 · redundant posts (if all-same): ?

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `mtp-caravanssalon.pl-20261016` | mtp | approved | Caravans Salon Poland 2026 | Międzynarodowe Targi Poznańskie | 52.40349, 16.91105 | 10:00 |
| `mtp-tour-salon.pl-20261016` | mtp | approved | TOUR SALON 2026 | Międzynarodowe Targi Poznańskie | 52.40349, 16.91105 | 10:00 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| ambiguous | mtp-caravanssalon.pl-20261016 ↔ mtp-tour-salon.pl-20261016 | cont=0.50 | vr=1 | geo=0km | gap=0m | mtp/mtp |

#### G123 — 2026-10-17 · 2 members · winner `mtp-caravanssalon.pl-20261017` (mtp)
- merged times (union): `[10:00]` · winner shows: `[10:00]`
- pairs: 1 — same=0 ambiguous=1 different=0 · redundant posts (if all-same): ?

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `mtp-caravanssalon.pl-20261017` | mtp | approved | Caravans Salon Poland 2026 | Międzynarodowe Targi Poznańskie | 52.40349, 16.91105 | 10:00 |
| `mtp-tour-salon.pl-20261017` | mtp | approved | TOUR SALON 2026 | Międzynarodowe Targi Poznańskie | 52.40349, 16.91105 | 10:00 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| ambiguous | mtp-caravanssalon.pl-20261017 ↔ mtp-tour-salon.pl-20261017 | cont=0.50 | vr=1 | geo=0km | gap=0m | mtp/mtp |

#### G124 — 2026-10-18 · 2 members · winner `mtp-caravanssalon.pl-20261018` (mtp)
- merged times (union): `[10:00]` · winner shows: `[10:00]`
- pairs: 1 — same=0 ambiguous=1 different=0 · redundant posts (if all-same): ?

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `mtp-caravanssalon.pl-20261018` | mtp | approved | Caravans Salon Poland 2026 | Międzynarodowe Targi Poznańskie | 52.40349, 16.91105 | 10:00 |
| `mtp-tour-salon.pl-20261018` | mtp | approved | TOUR SALON 2026 | Międzynarodowe Targi Poznańskie | 52.40349, 16.91105 | 10:00 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| ambiguous | mtp-caravanssalon.pl-20261018 ↔ mtp-tour-salon.pl-20261018 | cont=0.50 | vr=1 | geo=0km | gap=0m | mtp/mtp |

#### G125 — 2026-11-14 · 2 members · winner `mtp-hobbycon.pl-20261114` (mtp)
- merged times (union): `[10:00]` · winner shows: `[10:00]`
- pairs: 1 — same=0 ambiguous=1 different=0 · redundant posts (if all-same): ?

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `mtp-jarmark.poznan.pl-20261114` | mtp | approved | Poznański Jarmark Świąteczny 2026 | Międzynarodowe Targi Poznańskie | 52.40349, 16.91105 | 10:00 |
| `mtp-hobbycon.pl-20261114` | mtp | approved | HobbyCon 2026 | Międzynarodowe Targi Poznańskie | 52.40349, 16.91105 | 10:00 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| ambiguous | mtp-jarmark.poznan.pl-20261114 ↔ mtp-hobbycon.pl-20261114 | cont=0.00 | vr=1 | geo=0km | gap=0m | mtp/mtp |

#### G126 — 2026-11-15 · 2 members · winner `mtp-hobbycon.pl-20261115` (mtp)
- merged times (union): `[10:00]` · winner shows: `[10:00]`
- pairs: 1 — same=0 ambiguous=1 different=0 · redundant posts (if all-same): ?

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `mtp-jarmark.poznan.pl-20261115` | mtp | approved | Poznański Jarmark Świąteczny 2026 | Międzynarodowe Targi Poznańskie | 52.40349, 16.91105 | 10:00 |
| `mtp-hobbycon.pl-20261115` | mtp | approved | HobbyCon 2026 | Międzynarodowe Targi Poznańskie | 52.40349, 16.91105 | 10:00 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| ambiguous | mtp-jarmark.poznan.pl-20261115 ↔ mtp-hobbycon.pl-20261115 | cont=0.00 | vr=1 | geo=0km | gap=0m | mtp/mtp |

#### G127 — 2026-11-18 · 2 members · winner `mtp-forumdostepnosci.pl-20261118` (mtp)
- merged times (union): `[10:00]` · winner shows: `[10:00]`
- pairs: 1 — same=0 ambiguous=1 different=0 · redundant posts (if all-same): ?

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `mtp-jarmark.poznan.pl-20261118` | mtp | approved | Poznański Jarmark Świąteczny 2026 | Międzynarodowe Targi Poznańskie | 52.40349, 16.91105 | 10:00 |
| `mtp-forumdostepnosci.pl-20261118` | mtp | approved | Forum Dostępności | Międzynarodowe Targi Poznańskie | 52.40349, 16.91105 | 10:00 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| ambiguous | mtp-jarmark.poznan.pl-20261118 ↔ mtp-forumdostepnosci.pl-20261118 | cont=0.00 | vr=1 | geo=0km | gap=0m | mtp/mtp |

#### G128 — 2026-11-19 · 2 members · winner `mtp-forumdostepnosci.pl-20261119` (mtp)
- merged times (union): `[10:00]` · winner shows: `[10:00]`
- pairs: 1 — same=0 ambiguous=1 different=0 · redundant posts (if all-same): ?

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `mtp-jarmark.poznan.pl-20261119` | mtp | approved | Poznański Jarmark Świąteczny 2026 | Międzynarodowe Targi Poznańskie | 52.40349, 16.91105 | 10:00 |
| `mtp-forumdostepnosci.pl-20261119` | mtp | approved | Forum Dostępności | Międzynarodowe Targi Poznańskie | 52.40349, 16.91105 | 10:00 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| ambiguous | mtp-jarmark.poznan.pl-20261119 ↔ mtp-forumdostepnosci.pl-20261119 | cont=0.00 | vr=1 | geo=0km | gap=0m | mtp/mtp |

#### G129 — 2026-11-30 · 2 members · winner `mtp-polishlocalcontent.pl-20261130` (mtp)
- merged times (union): `[10:00]` · winner shows: `[10:00]`
- pairs: 1 — same=0 ambiguous=1 different=0 · redundant posts (if all-same): ?

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `mtp-jarmark.poznan.pl-20261130` | mtp | approved | Poznański Jarmark Świąteczny 2026 | Międzynarodowe Targi Poznańskie | 52.40349, 16.91105 | 10:00 |
| `mtp-polishlocalcontent.pl-20261130` | mtp | approved | Polish Local Content 2026 | Międzynarodowe Targi Poznańskie | 52.40349, 16.91105 | 10:00 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| ambiguous | mtp-jarmark.poznan.pl-20261130 ↔ mtp-polishlocalcontent.pl-20261130 | cont=0.00 | vr=1 | geo=0km | gap=0m | mtp/mtp |

#### G130 — 2026-12-01 · 2 members · winner `mtp-polishlocalcontent.pl-20261201` (mtp)
- merged times (union): `[10:00]` · winner shows: `[10:00]`
- pairs: 1 — same=0 ambiguous=1 different=0 · redundant posts (if all-same): ?

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `mtp-jarmark.poznan.pl-20261201` | mtp | approved | Poznański Jarmark Świąteczny 2026 | Międzynarodowe Targi Poznańskie | 52.40349, 16.91105 | 10:00 |
| `mtp-polishlocalcontent.pl-20261201` | mtp | approved | Polish Local Content 2026 | Międzynarodowe Targi Poznańskie | 52.40349, 16.91105 | 10:00 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| ambiguous | mtp-jarmark.poznan.pl-20261201 ↔ mtp-polishlocalcontent.pl-20261201 | cont=0.00 | vr=1 | geo=0km | gap=0m | mtp/mtp |

#### G131 — 2026-12-04 · 2 members · winner `mtp-festiwalprezentow.pl-20261204` (mtp)
- merged times (union): `[10:00]` · winner shows: `[10:00]`
- pairs: 1 — same=0 ambiguous=1 different=0 · redundant posts (if all-same): ?

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `mtp-jarmark.poznan.pl-20261204` | mtp | approved | Poznański Jarmark Świąteczny 2026 | Międzynarodowe Targi Poznańskie | 52.40349, 16.91105 | 10:00 |
| `mtp-festiwalprezentow.pl-20261204` | mtp | approved | Festiwal Prezentów 2026 | Międzynarodowe Targi Poznańskie | 52.40349, 16.91105 | 10:00 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| ambiguous | mtp-jarmark.poznan.pl-20261204 ↔ mtp-festiwalprezentow.pl-20261204 | cont=0.00 | vr=1 | geo=0km | gap=0m | mtp/mtp |

#### G132 — 2026-12-05 · 2 members · winner `mtp-festiwalprezentow.pl-20261205` (mtp)
- merged times (union): `[10:00]` · winner shows: `[10:00]`
- pairs: 1 — same=0 ambiguous=1 different=0 · redundant posts (if all-same): ?

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `mtp-jarmark.poznan.pl-20261205` | mtp | approved | Poznański Jarmark Świąteczny 2026 | Międzynarodowe Targi Poznańskie | 52.40349, 16.91105 | 10:00 |
| `mtp-festiwalprezentow.pl-20261205` | mtp | approved | Festiwal Prezentów 2026 | Międzynarodowe Targi Poznańskie | 52.40349, 16.91105 | 10:00 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| ambiguous | mtp-jarmark.poznan.pl-20261205 ↔ mtp-festiwalprezentow.pl-20261205 | cont=0.00 | vr=1 | geo=0km | gap=0m | mtp/mtp |

#### G133 — 2026-12-06 · 2 members · winner `mtp-festiwalprezentow.pl-20261206` (mtp)
- merged times (union): `[10:00]` · winner shows: `[10:00]`
- pairs: 1 — same=0 ambiguous=1 different=0 · redundant posts (if all-same): ?

| external_id | provider | status | title | venue | coords | times |
|---|---|---|---|---|---|---|
| `mtp-jarmark.poznan.pl-20261206` | mtp | approved | Poznański Jarmark Świąteczny 2026 | Międzynarodowe Targi Poznańskie | 52.40349, 16.91105 | 10:00 |
| `mtp-festiwalprezentow.pl-20261206` | mtp | approved | Festiwal Prezentów 2026 | Międzynarodowe Targi Poznańskie | 52.40349, 16.91105 | 10:00 |
| kind | pair | titleCont | venueRatio | geo | timeGap | providers |
|---|---|---|---|---|---|---|
| ambiguous | mtp-jarmark.poznan.pl-20261206 ↔ mtp-festiwalprezentow.pl-20261206 | cont=0.00 | vr=1 | geo=0km | gap=0m | mtp/mtp |

## 3. Damage — what a correct merge would change

- groups where every pair classifies **same** (high-confidence duplicates): **10** — each collapses to 1 post (redundant posts removed).
- groups whose winner is **missing showtimes** the loser carries (merge would ADD times): **71**

| # | day | members | winner | winner times | merged times | verdict |
|---|---|---|---|---|---|---|
| G1 | 2026-09-07 | 2 | ebilet | `[11:00, 11:30, 12:00, 12:30, 13:00, 13:30, 14:00, 14:30, 15:00, 15:30, 16:00, 16:30, 17:00, 17:30, 18:00]` | `[10:00, 10:30, 11:00, 11:30, 12:00, 12:30, 13:00, 13:30, 14:00, 14:30, 15:00, 15:30, 16:00, 16:30, 17:00, 17:30, 18:00, 18:30]` | REVIEW |
| G2 | 2026-09-07 | 5 | kupbilecik | `[20:00]` | `[19:00, 20:00, 20:30]` | REVIEW |
| G3 | 2026-09-07 | 3 | ebilet | `[20:00]` | `[18:00, 19:00, 20:00]` | REVIEW |
| G4 | 2026-09-07 | 4 | kupbilecik | `[20:00]` | `[16:00, 16:30, 17:00, 17:30, 18:00, 19:00, 20:00, 21:00]` | REVIEW |
| G5 | 2026-09-07 | 2 | kupbilecik | `[20:30]` | `[19:15, 20:30]` | REVIEW |
| G6 | 2026-09-07 | 2 | kupbilecik | `[11:00]` | `[11:00]` | REVIEW |
| G7 | 2026-09-07 | 4 | kupbilecik | `[19:00]` | `[19:00, 21:00]` | REVIEW |
| G8 | 2026-09-07 | 2 | kupbilecik | `[19:30]` | `[19:30]` | REVIEW |
| G9 | 2026-09-08 | 2 | kupbilecik | `[20:00]` | `[19:00, 20:00]` | REVIEW |
| G10 | 2026-09-08 | 2 | ebilet | `[11:00, 11:30, 12:00, 12:30, 13:00, 13:30, 14:00, 14:30, 15:00, 15:30, 16:00, 16:30, 17:00, 17:30, 18:00]` | `[10:00, 10:30, 11:00, 11:30, 12:00, 12:30, 13:00, 13:30, 14:00, 14:30, 15:00, 15:30, 16:00, 16:30, 17:00, 17:30, 18:00, 18:30]` | REVIEW |
| G11 | 2026-09-08 | 6 | kupbilecik | `[20:00]` | `[19:00, 20:00, 20:30]` | REVIEW |
| G12 | 2026-09-08 | 3 | ebilet | `[20:00]` | `[18:00, 19:00, 20:00]` | REVIEW |
| G13 | 2026-09-08 | 4 | kupbilecik | `[20:00]` | `[16:00, 16:30, 17:00, 17:30, 18:00, 19:00, 20:00, 21:00]` | REVIEW |
| G14 | 2026-09-08 | 2 | ebilet | `[11:00]` | `[10:00, 11:00]` | REVIEW |
| G15 | 2026-09-08 | 2 | kupbilecik | `[20:30]` | `[19:15, 20:30]` | REVIEW |
| G16 | 2026-09-08 | 2 | kupbilecik | `[11:00]` | `[11:00]` | REVIEW |
| G17 | 2026-09-08 | 4 | kupbilecik | `[19:00]` | `[19:00, 21:00]` | REVIEW |
| G18 | 2026-09-09 | 2 | going | `[19:00]` | `[19:00, 20:00]` | MERGE (dup) |
| G19 | 2026-09-09 | 2 | kupbilecik | `[19:00]` | `[19:00]` | REVIEW |
| G20 | 2026-09-09 | 2 | ebilet | `[11:00, 11:30, 12:00, 12:30, 13:00, 13:30, 14:00, 14:30, 15:00, 15:30, 16:00, 16:30, 17:00, 17:30, 18:00]` | `[10:00, 10:30, 11:00, 11:30, 12:00, 12:30, 13:00, 13:30, 14:00, 14:30, 15:00, 15:30, 16:00, 16:30, 17:00, 17:30, 18:00, 18:30]` | REVIEW |
| G21 | 2026-09-09 | 5 | kupbilecik | `[20:00]` | `[19:00, 20:00, 20:30]` | REVIEW |
| G22 | 2026-09-09 | 4 | kupbilecik | `[20:00]` | `[16:00, 16:30, 17:00, 17:30, 18:00, 19:00, 20:00, 21:00]` | REVIEW |
| G23 | 2026-09-09 | 11 | meetup | `[10:30]` | `[10:30]` | REVIEW |
| G24 | 2026-09-09 | 2 | ebilet | `[11:00]` | `[10:00, 11:00]` | REVIEW |
| G25 | 2026-09-09 | 2 | kupbilecik | `[19:00]` | `[19:00, 19:01]` | REVIEW |
| G26 | 2026-09-09 | 2 | kupbilecik | `[20:30]` | `[19:15, 20:30]` | REVIEW |
| G27 | 2026-09-09 | 4 | meetup | `[18:00]` | `[18:00, 19:00, 20:00]` | REVIEW |
| G28 | 2026-09-09 | 2 | kupbilecik | `[11:00]` | `[11:00]` | REVIEW |
| G29 | 2026-09-09 | 4 | kupbilecik | `[19:00]` | `[19:00, 21:00]` | REVIEW |
| G30 | 2026-09-10 | 2 | kupbilecik | `[19:01]` | `[19:00, 19:01]` | REVIEW |
| G31 | 2026-09-10 | 2 | ebilet | `[11:00, 11:30, 12:00, 12:30, 13:00, 13:30, 14:00, 14:30, 15:00, 15:30, 16:00, 16:30, 17:00, 17:30, 18:00]` | `[10:00, 10:30, 11:00, 11:30, 12:00, 12:30, 13:00, 13:30, 14:00, 14:30, 15:00, 15:30, 16:00, 16:30, 17:00, 17:30, 18:00, 18:30]` | REVIEW |
| G32 | 2026-09-10 | 5 | kupbilecik | `[20:00]` | `[19:00, 20:00, 20:30]` | REVIEW |
| G33 | 2026-09-10 | 3 | ebilet | `[20:00]` | `[18:00, 19:00, 20:00]` | REVIEW |
| G34 | 2026-09-10 | 4 | kupbilecik | `[20:00]` | `[16:00, 16:30, 17:00, 17:30, 18:00, 19:00, 20:00, 21:00]` | REVIEW |
| G35 | 2026-09-10 | 2 | meetup | `[19:00]` | `[18:00, 19:00]` | REVIEW |
| G36 | 2026-09-10 | 8 | going | `[19:00]` | `[18:30, 19:00, 19:30]` | REVIEW |
| G37 | 2026-09-10 | 2 | kupbilecik | `[20:00]` | `[17:00, 20:00]` | MERGE (dup) |
| G38 | 2026-09-10 | 2 | ebilet | `[09:00]` | `[09:00, 10:00]` | REVIEW |
| G39 | 2026-09-10 | 2 | ebilet | `[21:00]` | `[21:00]` | REVIEW |
| G40 | 2026-09-10 | 2 | kupbilecik | `[20:30]` | `[19:15, 20:30]` | REVIEW |
| G41 | 2026-09-10 | 2 | kupbilecik | `[11:00]` | `[11:00]` | REVIEW |
| G42 | 2026-09-10 | 2 | luma | `[18:00]` | `[18:00]` | REVIEW |
| G43 | 2026-09-10 | 2 | kupbilecik | `[19:00]` | `[19:00, 19:45]` | REVIEW |
| G44 | 2026-09-11 | 2 | kupbilecik | `[20:00]` | `[20:00]` | REVIEW |
| G45 | 2026-09-11 | 6 | kupbilecik | `[19:00]` | `[19:00, 19:30, 20:00]` | REVIEW |
| G46 | 2026-09-11 | 2 | kupbilecik | `[19:00]` | `[19:00]` | REVIEW |
| G47 | 2026-09-11 | 2 | ebilet | `[11:00, 11:30, 12:00, 12:30, 13:00, 13:30, 14:00, 14:30, 15:00, 15:30, 16:00, 16:30, 17:00, 17:30, 18:00]` | `[10:00, 10:30, 11:00, 11:30, 12:00, 12:30, 13:00, 13:30, 14:00, 14:30, 15:00, 15:30, 16:00, 16:30, 17:00, 17:30, 18:00, 18:30]` | REVIEW |
| G48 | 2026-09-11 | 5 | kupbilecik | `[20:00]` | `[19:00, 20:00, 20:30]` | REVIEW |
| G49 | 2026-09-11 | 3 | ebilet | `[20:00]` | `[18:00, 19:00, 20:00]` | REVIEW |
| G50 | 2026-09-11 | 4 | kupbilecik | `[20:00]` | `[16:00, 16:30, 17:00, 17:30, 18:00, 19:00, 20:00, 21:00]` | REVIEW |
| G51 | 2026-09-11 | 2 | kupbilecik | `[16:30]` | `[16:30]` | REVIEW |
| G52 | 2026-09-11 | 3 | kupbilecik | `[20:00]` | `[20:00]` | REVIEW |
| G53 | 2026-09-11 | 2 | kupbilecik | `[19:00]` | `[19:00]` | REVIEW |
| G54 | 2026-09-11 | 2 | ebilet | `[11:00]` | `[10:00, 11:00]` | REVIEW |
| G55 | 2026-09-11 | 2 | ebilet | `[19:30]` | `[19:00, 19:30]` | REVIEW |
| G56 | 2026-09-11 | 2 | kupbilecik | `[20:00]` | `[20:00]` | REVIEW |
| G57 | 2026-09-11 | 4 | kupbilecik | `[21:00]` | `[19:00, 21:00]` | REVIEW |
| G58 | 2026-09-11 | 2 | kupbilecik | `[20:30]` | `[20:30]` | REVIEW |
| G59 | 2026-09-11 | 3 | kupbilecik | `[17:00, 20:15]` | `[17:00, 19:30, 20:15]` | REVIEW |
| G60 | 2026-09-11 | 2 | kupbilecik | `[19:00]` | `[19:00]` | MERGE (dup) |
| G61 | 2026-09-11 | 2 | kupbilecik | `[19:01]` | `[19:00, 19:01]` | REVIEW |
| G62 | 2026-09-11 | 2 | kupbilecik | `[11:00]` | `[11:00]` | REVIEW |
| G63 | 2026-09-11 | 2 | kupbilecik | `[18:00]` | `[18:00, 21:00]` | MERGE (dup) |
| G64 | 2026-09-11 | 2 | kupbilecik | `[18:00]` | `[18:00]` | REVIEW |
| G65 | 2026-09-11 | 2 | kupbilecik | `[17:30, 20:00]` | `[17:30, 20:00]` | REVIEW |
| G66 | 2026-09-12 | 2 | luma | `[17:30]` | `[17:30]` | REVIEW |
| G67 | 2026-09-12 | 2 | going | `[19:00]` | `[19:00]` | REVIEW |
| G68 | 2026-09-12 | 2 | going | `[19:00]` | `[19:00, 20:00]` | MERGE (dup) |
| G69 | 2026-09-12 | 2 | going | `[18:00]` | `[18:00, 19:00]` | REVIEW |
| G70 | 2026-09-12 | 4 | ebilet | `[20:00]` | `[18:00, 19:00, 20:00, 20:20]` | REVIEW |
| G71 | 2026-09-12 | 2 | kupbilecik | `[19:00]` | `[16:00, 19:00]` | REVIEW |
| G72 | 2026-09-12 | 2 | going | `[21:00]` | `[21:00, 21:15]` | REVIEW |
| G73 | 2026-09-12 | 4 | kupbilecik | `[11:00]` | `[11:00, 12:00]` | REVIEW |
| G74 | 2026-09-12 | 2 | ebilet | `[19:30]` | `[19:00, 19:30]` | REVIEW |
| G75 | 2026-09-12 | 13 | going | `[19:30]` | `[15:00, 15:30, 16:00, 18:00, 18:30, 19:00, 19:30, 20:00]` | REVIEW |
| G76 | 2026-09-12 | 5 | kupbilecik | `[19:00]` | `[19:00, 21:00]` | REVIEW |
| G77 | 2026-09-12 | 2 | kupbilecik | `[20:30]` | `[19:15, 20:30]` | REVIEW |
| G78 | 2026-09-12 | 3 | going | `[19:00]` | `[19:00]` | REVIEW |
| G79 | 2026-09-12 | 2 | kupbilecik | `[19:00]` | `[19:00]` | REVIEW |
| G80 | 2026-09-12 | 2 | kupbilecik | `[16:00]` | `[16:00]` | MERGE (dup) |
| G81 | 2026-09-12 | 2 | kupbilecik | `[14:00]` | `[14:00]` | REVIEW |
| G82 | 2026-09-12 | 3 | going | `[18:45]` | `[18:45, 19:00, 20:00]` | REVIEW |
| G83 | 2026-09-13 | 2 | kupbilecik | `[17:00]` | `[17:00]` | REVIEW |
| G84 | 2026-09-13 | 3 | kupbilecik | `[19:00]` | `[16:00, 19:00]` | REVIEW |
| G85 | 2026-09-13 | 2 | ebilet | `[13:00]` | `[13:00, 14:00]` | REVIEW |
| G86 | 2026-09-13 | 2 | kupbilecik | `[17:30, 20:00]` | `[17:30, 20:00]` | REVIEW |
| G87 | 2026-09-13 | 5 | kupbilecik | `[20:00]` | `[19:00, 20:00, 20:30]` | REVIEW |
| G88 | 2026-09-13 | 2 | kupbilecik | `[19:00]` | `[19:00]` | REVIEW |
| G89 | 2026-09-13 | 3 | ebilet | `[20:00]` | `[18:00, 19:00, 20:00]` | REVIEW |
| G90 | 2026-09-13 | 4 | kupbilecik | `[20:00]` | `[16:00, 16:30, 17:00, 17:30, 18:00, 19:00, 20:00, 21:00]` | REVIEW |
| G91 | 2026-09-13 | 2 | kupbilecik | `[16:00]` | `[16:00]` | REVIEW |
| G92 | 2026-09-13 | 2 | kupbilecik | `[20:30]` | `[20:30]` | REVIEW |
| G93 | 2026-09-13 | 2 | eventim | `[11:00]` | `[11:00]` | REVIEW |
| G94 | 2026-09-13 | 3 | going | `[19:00]` | `[19:00]` | REVIEW |
| G95 | 2026-09-13 | 3 | kupbilecik | `[17:30, 20:00]` | `[17:30, 20:00]` | REVIEW |
| G96 | 2026-09-13 | 2 | kupbilecik | `[19:00]` | `[19:00]` | REVIEW |
| G97 | 2026-09-13 | 2 | kupbilecik | `[18:00]` | `[18:00]` | REVIEW |
| G98 | 2026-09-13 | 5 | kupbilecik | `[11:00]` | `[11:00, 12:00, 13:00]` | REVIEW |
| G99 | 2026-09-13 | 7 | going | `[15:30]` | `[15:30, 16:30, 17:00, 18:00]` | REVIEW |
| G100 | 2026-09-13 | 2 | kupbilecik | `[20:00]` | `[20:00]` | MERGE (dup) |
| G101 | 2026-09-13 | 3 | going | `[18:00]` | `[15:00, 18:00]` | REVIEW |
| G102 | 2026-09-13 | 6 | going | `[19:00]` | `[16:00, 17:00, 18:00, 18:30, 19:00]` | REVIEW |
| G103 | 2026-09-13 | 2 | kupbilecik | `[17:30]` | `[17:30]` | REVIEW |
| G104 | 2026-09-13 | 2 | ebilet | `[17:00]` | `[16:00, 17:00]` | REVIEW |
| G105 | 2026-09-13 | 6 | kupbilecik | `[19:00]` | `[19:00, 21:00]` | REVIEW |
| G106 | 2026-09-13 | 3 | kupbilecik | `[20:30]` | `[19:15, 20:30]` | REVIEW |
| G107 | 2026-09-13 | 3 | kupbilecik | `[11:00]` | `[11:00]` | REVIEW |
| G108 | 2026-09-13 | 2 | kupbilecik | `[19:00]` | `[19:00]` | REVIEW |
| G109 | 2026-09-13 | 3 | going | `[18:45]` | `[18:45, 19:00, 20:00]` | REVIEW |
| G110 | 2026-09-13 | 2 | kupbilecik | `[19:00]` | `[16:00, 19:00]` | MERGE (dup) |
| G111 | 2026-09-13 | 2 | kupbilecik | `[14:00]` | `[14:00]` | MERGE (dup) |
| G112 | 2026-09-13 | 2 | kupbilecik | `[18:00]` | `[18:00, 20:00]` | MERGE (dup) |
| G113 | 2026-09-13 | 2 | kupbilecik | `[19:00]` | `[19:00]` | REVIEW |
| G114 | 2026-09-13 | 2 | kupbilecik | `[17:30]` | `[17:30]` | REVIEW |
| G115 | 2026-09-20 | 2 | mtp | `[10:00]` | `[10:00]` | REVIEW |
| G116 | 2026-09-23 | 2 | mtp | `[10:00]` | `[10:00]` | REVIEW |
| G117 | 2026-09-24 | 2 | mtp | `[10:00]` | `[10:00]` | REVIEW |
| G118 | 2026-09-25 | 3 | mtp | `[10:00]` | `[10:00]` | REVIEW |
| G119 | 2026-10-06 | 3 | mtp | `[10:00]` | `[10:00]` | REVIEW |
| G120 | 2026-10-07 | 2 | mtp | `[10:00]` | `[10:00]` | REVIEW |
| G121 | 2026-10-08 | 2 | mtp | `[10:00]` | `[10:00]` | REVIEW |
| G122 | 2026-10-16 | 2 | mtp | `[10:00]` | `[10:00]` | REVIEW |
| G123 | 2026-10-17 | 2 | mtp | `[10:00]` | `[10:00]` | REVIEW |
| G124 | 2026-10-18 | 2 | mtp | `[10:00]` | `[10:00]` | REVIEW |
| G125 | 2026-11-14 | 2 | mtp | `[10:00]` | `[10:00]` | REVIEW |
| G126 | 2026-11-15 | 2 | mtp | `[10:00]` | `[10:00]` | REVIEW |
| G127 | 2026-11-18 | 2 | mtp | `[10:00]` | `[10:00]` | REVIEW |
| G128 | 2026-11-19 | 2 | mtp | `[10:00]` | `[10:00]` | REVIEW |
| G129 | 2026-11-30 | 2 | mtp | `[10:00]` | `[10:00]` | REVIEW |
| G130 | 2026-12-01 | 2 | mtp | `[10:00]` | `[10:00]` | REVIEW |
| G131 | 2026-12-04 | 2 | mtp | `[10:00]` | `[10:00]` | REVIEW |
| G132 | 2026-12-05 | 2 | mtp | `[10:00]` | `[10:00]` | REVIEW |
| G133 | 2026-12-06 | 2 | mtp | `[10:00]` | `[10:00]` | REVIEW |

## 4. Rejects (seed_candidates: duplicate / error)

- duplicate=35 unique events · error=186 unique events · seed_raw rejects=0

#### R1 — 2026-09-13 · 3 rejects grouped
| external_id | provider | title | status | reason |
|---|---|---|---|---|
| `ebilet-25271-20260913` | ebilet | Koncert Chopinowski | duplicate | dedupe: covered by another provider |
| `kupbilecik-218508-20260913` | kupbilecik | Koncert Chopinowski w Sali Koncertowej Fryderyk | error | GET https://assets.kupbilecik.pl/img/baza/8000/7463.webp?1788505599 -> 429 |
| `eventim-44973512619` | eventim | Koncert Chopinowski w Sali Koncertowej Fryderyk | duplicate | dedupe: covered by another provider |

#### R2 — 2026-09-11 · 2 rejects grouped
| external_id | provider | title | status | reason |
|---|---|---|---|---|
| `ebilet-25271-20260911` | ebilet | Koncert Chopinowski | duplicate | dedupe: covered by another provider |
| `kupbilecik-218506-20260911` | kupbilecik | Koncert Chopinowski w Sali Koncertowej Fryderyk | error | GET https://assets.kupbilecik.pl/img/baza/8000/7463.webp?1788505599 -> 429 |

#### R3 — 2026-09-13 · 2 rejects grouped
| external_id | provider | title | status | reason |
|---|---|---|---|---|
| `ebilet-195578-20260913` | ebilet | Śpiewające Brzdące: Lisek i Przyjaciele | duplicate | dedupe: covered by another provider |
| `eventim-44973512629` | eventim | Śpiewające Brzdące: Lisek i Przyjaciele | duplicate | dedupe: covered by another provider |

#### R4 — 2026-09-13 · 2 rejects grouped
| external_id | provider | title | status | reason |
|---|---|---|---|---|
| `kupbilecik-204703-20260913` | kupbilecik | Normalne to to nie jest | error | D1_ERROR: UNIQUE constraint failed: posts.external_id: SQLITE_CONSTRAINT (extended: SQLITE_CONSTRAINT_UNIQUE) |
| `ebilet-149215-20260913` | ebilet | Kabaret Moralnego Niepokoju - Normalne to to nie jest | duplicate | dedupe: covered by another provider |

#### R5 — 2026-09-13 · 2 rejects grouped
| external_id | provider | title | status | reason |
|---|---|---|---|---|
| `kupbilecik-208358-20260913` | kupbilecik | Jej Wysokość Operetka | error | D1_ERROR: UNIQUE constraint failed: posts.external_id: SQLITE_CONSTRAINT (extended: SQLITE_CONSTRAINT_UNIQUE) |
| `ebilet-185305-20260913` | ebilet | Jej Wysokość Operetka | duplicate | dedupe: covered by another provider |

#### R6 — 2026-09-13 · 2 rejects grouped
| external_id | provider | title | status | reason |
|---|---|---|---|---|
| `kupbilecik-211664-20260913` | kupbilecik | Opiekunka na zabój / Teatr Kamienica / Warszawa Winobraniowe Spotkania Teatralne 2026 | error | GET https://assets.kupbilecik.pl/img/imprezy/212000/211664.webp?1788627613 -> 429 |
| `kupbilecik-211669-20260913` | kupbilecik | Opiekunka na zabój / Teatr Kamienica / Warszawa Winobraniowe Spotkania Teatralne | error | GET https://assets.kupbilecik.pl/img/imprezy/212000/211669.webp?1788627608 -> 429 |

#### R7 — 2026-09-13 · 2 rejects grouped
| external_id | provider | title | status | reason |
|---|---|---|---|---|
| `kupbilecik-213233-20260913` | kupbilecik | I like Chopin - kameralny koncert przy świecach | error | GET https://assets.kupbilecik.pl/img/baza/25000/24241.webp?1788755529 -> 429 |
| `eventim-45077924394` | eventim | I like Chopin - kameralny koncert przy świecach | duplicate | dedupe: covered by another provider |

#### R8 — 2026-09-12 · 2 rejects grouped
| external_id | provider | title | status | reason |
|---|---|---|---|---|
| `kupbilecik-214024-20260912` | kupbilecik | AVE MARINA VOL. 5 — VIP ON WAVE | error | GET https://assets.kupbilecik.pl/img/baza/25000/24605.webp?1788754695 -> 429 |
| `kupbilecik-217431-20260912` | kupbilecik | AVE MARINA VOL. 5 -- VIP ON WAVE | duplicate | dedupe: covered by another provider |

#### R9 — 2026-09-13 · 2 rejects grouped
| external_id | provider | title | status | reason |
|---|---|---|---|---|
| `kupbilecik-215571-20260913` | kupbilecik | GITARY, UKULELE, BANJO! Dla Dzieci 2-7! INAUGURACJA NA 10 INSTRUMENTÓW! | error | GET https://assets.kupbilecik.pl/img/imprezy/216000/215571.webp?1788622028 -> 429 |
| `kupbilecik-215576-20260913` | kupbilecik | GITARY, UKULELE, BANJO! Dla Dzieci 5-12! INAUGURACJA NA 10 INSTRUMENTÓW! | error | GET https://assets.kupbilecik.pl/img/imprezy/216000/215576.webp?1788622015 -> 429 |

#### R10 — 2026-09-13 · 2 rejects grouped
| external_id | provider | title | status | reason |
|---|---|---|---|---|
| `kupbilecik-218545-20260913` | kupbilecik | Koncert Przy Świecach w Sali Koncertowej Fryderyk | error | GET https://assets.kupbilecik.pl/img/baza/15000/14552.webp?1788485922 -> 429 |
| `eventim-45110867241` | eventim | KONCERT PRZY ŚWIECACH | duplicate | dedupe: covered by another provider |

#### R11 — 2026-09-13 · 3 rejects grouped
| external_id | provider | title | status | reason |
|---|---|---|---|---|
| `eventim-42713157180` | eventim | Chopin Concert By Candle Glow | duplicate | dedupe: covered by another provider |
| `eventim-42713157925` | eventim | Royal Chopin Hall - Queen Classic Concert By Candle Glow | duplicate | dedupe: covered by another provider |
| `ebilet-172054-20260913` | ebilet | Chopin & Friends Concert By Candle Glow | duplicate | dedupe: covered by another provider |

## 5. Missing geo (0,0)

**45 future event posts pinned at (0,0):**

| external_id | provider | status | title | venue | times |
|---|---|---|---|---|---|
| `ebilet-169932-20260910` | ebilet | pending | Buczyniec/Elbląg STATKIEM PO TRAWIE | Pochylnia Buczyniec | 13:50 |
| `ebilet-169925-20260910` | ebilet | pending | Stare Jabłonki/Ostróda  SZLAK SZELĄGA | Przystań Stare Jabłonki (plaża Hotelu Anders) | 12:30 |
| `ebilet-169924-20260910` | ebilet | pending | Buczyniec/Jelenie SZLAKIEM CZTERECH POCHYLNI | Pochylnia Buczyniec | 10:30, 14:20 |
| `ebilet-142799-20260910` | ebilet | pending | Wystawa stała - zwiedzanie samodzielne | Muzeum Józefa Piłsudskiego w Sulejówku - budynek główny | 10:00 |
| `ebilet-169922-20260910` | ebilet | pending | Jelenie/Buczyniec SZLAKIEM CZTERECH POCHYLNI | Przystań przy pochylni Jelenie | 12:45 |
| `ebilet-169922-20260908` | ebilet | pending | Jelenie/Buczyniec SZLAKIEM CZTERECH POCHYLNI | Przystań przy pochylni Jelenie | 12:30, 12:45 |
| `ebilet-169924-20260908` | ebilet | pending | Buczyniec/Jelenie SZLAKIEM CZTERECH POCHYLNI | Pochylnia Buczyniec | 14:20 |
| `ebilet-169925-20260908` | ebilet | pending | Stare Jabłonki/Ostróda  SZLAK SZELĄGA | Przystań Stare Jabłonki (plaża Hotelu Anders) | 12:30 |
| `ebilet-169921-20260908` | ebilet | pending | Buczyniec/Oleśnica/Buczyniec SZLAKIEM TRZECH POCHYLNI | Pochylnia Buczyniec | 15:15 |
| `ebilet-169924-20260907` | ebilet | pending | Buczyniec/Jelenie SZLAKIEM CZTERECH POCHYLNI | Pochylnia Buczyniec | 10:30, 14:20 |
| `ebilet-169922-20260907` | ebilet | pending | Jelenie/Buczyniec SZLAKIEM CZTERECH POCHYLNI | Przystań przy pochylni Jelenie | 12:45 |
| `ebilet-169921-20260907` | ebilet | pending | Buczyniec/Oleśnica/Buczyniec SZLAKIEM TRZECH POCHYLNI | Pochylnia Buczyniec | 15:15 |
| `ebilet-169932-20260907` | ebilet | pending | Buczyniec/Elbląg STATKIEM PO TRAWIE | Pochylnia Buczyniec | 09:15 |
| `ebilet-169932-20260909` | ebilet | pending | Buczyniec/Elbląg STATKIEM PO TRAWIE | Pochylnia Buczyniec | 09:15, 13:50 |
| `ebilet-169921-20260909` | ebilet | pending | Buczyniec/Oleśnica/Buczyniec SZLAKIEM TRZECH POCHYLNI | Pochylnia Buczyniec | 11:00 |
| `ebilet-169921-20260911` | ebilet | pending | Buczyniec/Oleśnica/Buczyniec SZLAKIEM TRZECH POCHYLNI | Pochylnia Buczyniec | 15:15 |
| `ebilet-169925-20260909` | ebilet | pending | Stare Jabłonki/Ostróda  SZLAK SZELĄGA | Przystań Stare Jabłonki (plaża Hotelu Anders) | 12:30 |
| `ebilet-169932-20260911` | ebilet | pending | Buczyniec/Elbląg STATKIEM PO TRAWIE | Pochylnia Buczyniec | 09:15, 14:40 |
| `ebilet-169924-20260909` | ebilet | pending | Buczyniec/Jelenie SZLAKIEM CZTERECH POCHYLNI | Pochylnia Buczyniec | 14:20 |
| `ebilet-169924-20260911` | ebilet | pending | Buczyniec/Jelenie SZLAKIEM CZTERECH POCHYLNI | Pochylnia Buczyniec | 10:30, 14:20 |
| `ebilet-142799-20260911` | ebilet | pending | Wystawa stała - zwiedzanie samodzielne | Muzeum Józefa Piłsudskiego w Sulejówku - budynek główny | 10:00 |
| `ebilet-169925-20260911` | ebilet | pending | Stare Jabłonki/Ostróda  SZLAK SZELĄGA | Przystań Stare Jabłonki (plaża Hotelu Anders) | 12:30 |
| `ebilet-50763-20260912` | ebilet | pending | Cztery Pory Roku - Antonio Vivaldi | Park w Świerklańcu / Pałac Kawalera | 16:00 |
| `ebilet-169925-20260912` | ebilet | pending | Stare Jabłonki/Ostróda  SZLAK SZELĄGA | Przystań Stare Jabłonki (plaża Hotelu Anders) | 12:30 |
| `ebilet-142799-20260912` | ebilet | pending | Wystawa stała - zwiedzanie samodzielne | Muzeum Józefa Piłsudskiego w Sulejówku - budynek główny | 10:00 |
| `ebilet-169924-20260912` | ebilet | pending | Buczyniec/Jelenie SZLAKIEM CZTERECH POCHYLNI | Pochylnia Buczyniec | 14:20 |
| `ebilet-213590-20260912` | ebilet | pending | XXXI FESTYN ARCHEOLOGICZNY - ARCHEOMEDICUS. Od magii do medycyny. | Muzeum Archeologiczne w Biskupinie | 10:00 |
| `ebilet-177001-20260912` | ebilet | pending | Hubert. na Skoczni | Skocznia Narciarska im. Adama Małysza | 20:00 |
| `ebilet-17883-20260912` | ebilet | pending | Muzyczny życiorys Franka Sinatry. | Park w Świerklańcu / Pałac Kawalera | 17:30 |
| `ebilet-166516-20260912` | ebilet | pending | Strefa 57 Opening | Strefa 57 | 15:00 |
| `ebilet-5751-20260912` | ebilet | pending | Freddie Mercury Rock -Operowo | Park w Świerklańcu / Pałac Kawalera | 19:00 |
| `ebilet-142799-20260913` | ebilet | pending | Wystawa stała - zwiedzanie samodzielne | Muzeum Józefa Piłsudskiego w Sulejówku - budynek główny | 10:00 |
| `ebilet-169921-20260913` | ebilet | pending | Buczyniec/Oleśnica/Buczyniec SZLAKIEM TRZECH POCHYLNI | Pochylnia Buczyniec | 15:15 |
| `ebilet-169922-20260913` | ebilet | pending | Jelenie/Buczyniec SZLAKIEM CZTERECH POCHYLNI | Przystań przy pochylni Jelenie | 12:45 |
| `ebilet-142800-20260913` | ebilet | pending | Śladami Józefa Piłsudskiego z przewodnikiem | Muzeum Józefa Piłsudskiego w Sulejówku - budynek główny | 13:20 |
| `ebilet-213590-20260913` | ebilet | pending | XXXI FESTYN ARCHEOLOGICZNY - ARCHEOMEDICUS. Od magii do medycyny. | Muzeum Archeologiczne w Biskupinie | 10:00 |
| `ebilet-13655-20260913` | ebilet | pending | Kabaret hrAbi & Wojtek Kamiński - Być facetem | Miejski Dom Kultury w Radomsku | 19:00 |
| `ebilet-169932-20260913` | ebilet | pending | Buczyniec/Elbląg STATKIEM PO TRAWIE | Pochylnia Buczyniec | 09:15, 13:50 |
| `ebilet-169924-20260913` | ebilet | pending | Buczyniec/Jelenie SZLAKIEM CZTERECH POCHYLNI | Pochylnia Buczyniec | 10:30, 14:20 |
| `ebilet-125481-20260913` | ebilet | pending | Halina Mlynkowa & ZPiT "Śląsk | Amfiteatr pod Grojcem | 18:00 |
| `ebilet-144776-20260913` | ebilet | pending | Koncert przy świecach: Hans Zimmer i inni - Muzyka Filmowa | Centrum Sztuki Galeria EL | 19:30 |
| `ebilet-77638-20260913` | ebilet | pending | Mariusz Kałamaga - Mamo! Papier się kończy! | Rypiński Dom Kultury | 19:00 |
| `ebilet-169936-20260913` | ebilet | pending | K2 - Jedziemy na luzie | Powiatowe Centrum Animacji Społecznej Tomaszów Mazowiecki | 17:00 |
| `ebilet-149215-20260913` | ebilet | pending | Kabaret Moralnego Niepokoju - Normalne to to nie jest | 3mk Arena Ostrów | 16:00 |
| `ebilet-203540-20260913` | ebilet | pending | Maryla Rodowicz – Niech żyje bal | Amfiteatr NCPP | 17:00 |
