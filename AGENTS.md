# Video Theatre — Θέατρο Αθήναιον

Πριν από οποιαδήποτε αλλαγή, διάβασε τα κεντρικά docs στο repo `polmitso/videotheatre-work`, φάκελος `docs/`:
- `01-SYSTEM.md` — ταυτότητα, χάρτης repos/domains, πώς γίνεται deploy, κανόνες ασφαλείας
- `02-DATA.md` — collections του PocketBase και κανόνες (ορατότητα, κατάσταση, εισιτήρια, ημερομηνίες)
- `03-DECISIONS.md` — αποφάσεις που δεν ξανασυζητιούνται
- `04-STATUS.md` — τι λειτουργεί και τι ακολουθεί

## Αυτό το repo
- Δημόσιο site (Astro SSR), μόνο ανάγνωση από PocketBase. Όλη η πρόσβαση στο `src/lib/pocketbase.js`.
- Δείχνει παραγωγές με run στο venue `athinaion-theatre` (ή `ATHINAION_VENUE_ID`).
- Σελίδα λεπτομερειών: `src/components/ShowDetail.astro` (κοινή για EL/EN).
- Έλεγχος: `/health.json` πρέπει να δείχνει `"ok": true`.
- Προαιρετικές μεταβλητές: `POCKETBASE_INTERNAL_URL`, `ATHINAION_VENUE_ID`, `ATHINAION_VENUE_SLUG`.

## Κανόνες εργασίας
- Branch → `npm run build` → έλεγχος diff → merge στο `main` ως ένα πακέτο.
- Το Coolify δεν κάνει αυτόματο deploy: μετά το merge, Deploy στο Coolify και έλεγχος live.
- Κανένα μυστικό σε κώδικα ή docs. Μην αγγίζεις άλλα repos/εφαρμογές χωρίς λόγο.
- Μην κρύβεις σφάλματα του PocketBase επιστρέφοντας σιωπηλά κενά δεδομένα.
- Μετά από κάθε ολοκληρωμένη δουλειά, ενημέρωσε το `docs/04-STATUS.md` στο videotheatre-work.
