# GetYourGuide — provider „Atrakcje" (PARKED)

Decyzja (2026-08-24): **wstrzymujemy** integrację GetYourGuide. Kod providera
zostaje w repo (disabled), żeby nie budować od nowa, gdy pojawi się działające
źródło danych.

## Cel

Dodać GetYourGuide jako provider atrakcji/wycieczek (tag **`atrakcje`**) z
pełnym reużyciem istniejącego pinu (img, cluster) → Story Preview: obraz
GetYourGuide, nazwa, showtimes, lokalizacja, URL z affiliation (partner_id).

## Co jest zrobione i w repo

- `backend/src/seed/providers/getyourguide.ts` — provider (fetch transport,
  Worker executor, scopes = CITIES, filtr `activity_type != 'transfer'`,
  showtimes z availability, link = affiliate URL z API, tag `atrakcje`).
- `backend/src/seed/core/tags.ts` — kanoniczny tag **`atrakcje`** → „Atrakcje".
- `backend/src/seed/core/types.ts` — `ProviderId.GETYOURGUIDE`.
- `backend/src/seed/core/constants.ts` — `GYG_BASE`/`GYG_WEB`/radius/limit/
  format obrazka.
- `backend/src/env.d.ts` — `GETYOURGUIDE_TOKEN` (wrangler secret).
- `backend/src/seed/providers/registry.ts` — wpis **`enabled: false`** (parked).
- `backend/.dev.vars` (gitignored) — pole `GETYOURGUIDE_TOKEN` **pozostawione puste**
  (integracja nieaktywna; żadnych tokenów/identyfikatorów w repo — sekrety tylko
  przez `wrangler secret put`).

Provider celował w Partner API v2 (spec OpenAPI z
`github.com/getyourguide/partner-api-spec`): `GET /v2/tours` z
`coordinates[]=lat&coordinates[]=lng&coordinates[]=radius`,
auth `X-ACCESS-TOKEN`, pola `title`, `pictures[]`, `coordinates`, `locations[]`,
`activity_type`, `url` (affiliate z `partner_id`).

## Ustalenia z walidacji (dlaczego parked)

Token affiliate **nie działa** z żadnym obecnym API:

| Źródło | Wynik |
|---|---|
| `api.getyourguide.com/v1/*` (affiliate API) — wszystkie metody auth | **404** (API wycofane) |
| `api.getyourguide.com/v2/tours` | 404 na tym hoście |
| `partner-api.getyourguide.com/v2/tours` | host nieosiągalny z naszego infra |
| `api.gygtest.net/v2` | 403 (token odrzucony) |
| Strona miasta `www.getyourguide.com/<miasto>-l<id>/` | **403** bot block (datacenter) |
| To samo przez Webshare residential proxy (VPS, curl) | **403** (GetYourGuide blokuje też TLS fingerprint/JS) |
| JSON site (`/s/search.json`, `/autocomplete`) | 403 |

Wnioski:
- Affiliate API v1 zostało wycofane przez GetYourGuide.
- Partner API v2 wymaga **prawdziwego tokenu partnera/suppliera** (kryteria:
  100k+ wizyt/mies. lub 50k pobrań — apka ich nie spełnia).
- Dane strony są bot-protected; zwykły HTTP (nawet przez residential proxy) nie
  przechodzi — wymagałby prawdziwej przeglądarki (Playwright) przez residential
  egress (VPS). To skraper: ciężki i kruchy.

## Jak wznowić (kiedy wrócić)

1. **Czysta ścieżka**: zdobyć prawdziwy token **Partner API** od GetYourGuide
   (konto supplier/partner z dostępem API). Wtedy:
   - base = `partner-api.getyourguide.com` (jeśli osiągalny z Workera/VPS),
   - token → `GETYOURGUIDE_TOKEN`,
   - `registry.ts`: `enabled: true` → deploy → testy lokalne.
   Kod providera już to obsługuje.
2. **Ścieżka skrapera**: Playwright na VPS przez Webshare residential
   (sprawdzić, czy przechodzi 403). Provider przechodzi na VPS executor.
   Wymaga zbadania struktury strony/embedded JSON.
3. **Uwaga na „prawdziwe starty"**: showtimes w spec Partner API to tylko
   dostępne DATY (`available_dates[{date,has_deal}]`), nie godziny startu.
   Starty (jeśli w ogóle dostępne) trzeba zweryfikować na żywym API — w kodzie
   providera jest parsowanie defensywne (`start_times` itp.).

## Powiązane

- `_internal/RELEASE.md` — proces wydawania do TestFlight.
- `backend/src/seed/providers/*` — wzorce providerów (going/kupbilecik/luma).
