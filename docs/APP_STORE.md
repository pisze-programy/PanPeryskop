# App Store Connect — metadata do zgłoszenia

Wszystko po polsku (rynek PL). Wypełnij w App Store Connect → „Pan Peryskop" → version 1.0.

## Podstawowe

| Pole | Wartość |
|---|---|
| **Nazwa** (display) | Pan Peryskop |
| **Subtitle** | Zobacz, co się dzieje w Twoim mieście |
| **Bundle ID** | `pl.piszeprogramy.panperyskop` |
| **Wersja** | 1.0 (build 1 → aktualizuj przy każdym TestFlight) |
| **Kategoria** | Lifestyle |
| **Zawartość dla dzieci** | Nie |
| **Język** | polski |

## Opis (Description)

```
Pan Peryskop to interaktywna mapa wydarzeń i treści w Twoim mieście. Zobacz, co
dzieje się wokół Ciebie — koncerty, kino, festiwale, meetupy i live publikowane
przez innych użytkowników.

• Mapa wydarzeń — kino, koncerty i spotkania z najpopularniejszych źródeł,
  z datami, miejscami i linkami do biletów.
• Treści od ludzi — publikuj zdjęcia i filmy z miejsca zdarzenia i obserwuj,
  co dzieje się na żywo w Twojej okolicy.
• Treści widoczne przez 24 godziny — zawsze świeże, zawsze aktualne.
• Powiadomienia o nowych treściach w pobliżu.

Zaloguj się przez Apple i sprawdź, co dzieje się w Twoim mieście.
```

## Keywords (comma-separated, ≤100 znaków)

```
pan peryskop,wydarzenia,kino,koncert,miasto,mapa,imprezy,kultura,live,poznan
```

## Wiek (Age rating)

**12+** — treści publikowane przez użytkowników mogą zawierać okazjonalnie
niewybredny język / nieodpowiednie treści (UGC; moderacja ręczna).

## Odnośniki

| Pole | URL |
|---|---|
| Support URL | `https://panperyskop.app/support` |
| Marketing URL | `https://panperyskop.app` |
| Privacy Policy URL | `https://panperyskop.app/privacy` |
| EULA | standardowa Apple (zalecane) lub `https://panperyskop.app/terms` |
| Copyright | © 2026 Pan Peryskop |

## App Review Notes

```
Aplikacja wymaga logowania przez Sign in with Apple — recenzent loguje się
własnym Apple ID (bez podawania haseł). Konto tworzy się automatycznie.

Lokalizacja: aplikacja prosi o dostęp do lokalizacji tylko podczas korzystania
(When In Use) — do pokazania pozycji na mapie i przypisywania publikowanych
treści do miejsc. Lokalizacja nie jest śledzona w tle.

Treści użytkowników: aplikacja umożliwia publikowanie zdjęć i filmów.
Użytkownicy mogą zgłaszać treści (przycisk „···" → „Raportuj"). Zgłoszenia są
weryfikowane ręcznie przez administratora — moderacja nie jest automatyczna.
Administrator może ukryć treść lub zablokować urządzenie naruszające zasady.

Usuwanie konta jest dostępne w aplikacji (Profil → Ustawienia → Usuń konto)
i usuwa trwale konto oraz wszystkie powiązane dane.
```

## Export Compliance

**Exempt** — wyłącznie HTTPS (TLS), brak własnych algorytmów kryptograficznych.

## App Privacy (kwestionariusz „nutrition label")

| Dane | Zbierane | Cel |
|---|---|---|
| Zdjęcia / Wideo | ✅ | treści publikowane przez użytkownika |
| Dźwięk | ✅ | filmy z dźwiękiem |
| Lokalizacja (precyzyjna) | ✅ | przypisywanie treści do miejsc |
| Nazwa | ✅ | via Sign in with Apple (nick) |
| User ID | ✅ | identyfikacja konta |
| Device ID | ✅ | identyfikacja urządzenia, banowanie |
| Dane diagnostyczne | ✅ | logi błędów wysyłki (best-effort) |
| Tracking | ❌ | brak — bez reklam i bez trzecich SDK |

Odpowiedzi w krokach Apple:
- **User Content** → Photos or Videos: Yes; Audio: Yes.
- **Location** → Precise Location: Yes (used in app).
- **Contact Info** → Name: Yes (other).
- **Identifiers** → User ID: Yes; Device ID: Yes.
- **Diagnostics** → Crash Data / Other Diagnostic Data: Yes.
- **Tracking** → This app does not track users.
- **Data Linked to You** → yes (kontom).
- **Data Used to Track** → nie.

## TestFlight

1. Xcode → build → archiwizuj (Archive) → Upload to App Store Connect (profiles: Distribution z SIWA).
2. Wersja 1.0 (build 1) → TestFlight → grupa „Testerzy" → dodaj swój Apple ID.
3. Po instalacji przetestuj: logowanie SIWA, mapę, publikację, raportowanie, usuwanie konta.

## Po akceptacji

- Podmień w `site/index.html` przycisk App Store: `https://apps.apple.com/app/id0000000000`
  → prawdziwe ID (np. `https://apps.apple.com/pl/app/pan-peryskop/id<ID>`).
- Screenshoty 6.7" / 6.5" / 5.5" — dodaj przed wysłaniem (na razie pomijane).
