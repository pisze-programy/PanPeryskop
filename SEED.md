# SEED — jak dodawać przyszłe wydarzenia (automatyczny wsad)

> **Uwaga dla agenta:** ten plik to stary, RĘCZNY przepływ. Obecny, automatyczny
> przepływ jest w **`admin/seed/SEED-PLAYBOOK.md`** (lokalny, gitignored) —
> **czytaj GO najpierw**.

## Jeśli dostałeś polecenie „zrób wsad na [dzień]" (np. jutro)
1. **Najpierw przeczytaj `admin/seed/SEED-PLAYBOOK.md`** — opisuje automatyczne
   pobieranie wydarzeń z goingapp (Algolia) + kupbilecik, zapis kandydatów do
   `admin/seed/events.json`, krótkie opisy i bramkę zatwierdzenia.
2. **NIE pytaj admina o dane wydarzenia** — dane są pobierane ze źródeł.
   Pytaj tylko, gdy pojawi się realny bloker (wg playbooka).
3. Główne kroki (skrót, szczegóły w playbooku):
   ```bash
   node admin/src/seed-import.mjs <YYYY-MM-DD>   # fetch → kandydaci → events.json + plakaty
   # przegląd: napisz krótkie opisy w events.json (Co: HH:MM, miejsce — bez kodu pocztowego/miasta)
   # podsumowanie → czekaj na „go" od admina
   node admin/src/seed-ingest.mjs admin/seed/events.json   # po „go" → posty (pending)
   # admin approve przez: node admin/src/cli.js approve <post_id>
   ```

## Legacy (nieużywane)
Historycznie admin podawał: tytuł, datę/godzinę, miejsce, opis, link i lokalny
plakat do `admin/seed/media/`, a agent pisał wpis w `events.json`. Zastąpione
automatycznym importem (`admin/src/seed-import.mjs`) — patrz playbook.

Jeśli `admin/seed/SEED-PLAYBOOK.md` nie istnieje (świeży clone), poproś admina o
jego przywrócenie — zawiera szczegóły źródeł i endpointów.
