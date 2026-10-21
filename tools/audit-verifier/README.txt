Draw Down — Audit Verifier (organizer tool)
===========================================

Separate offline tool from the customer Draw Down app.
Checks both the JSON and CSV audit exports from an event.

No private keys. Safe to keep on organizer PCs and to publish
on GitHub Releases (unlike the Code Issuer).

How to open on Windows
----------------------
1. Unzip this folder anywhere.
2. Double-click Open-Audit-Verifier.bat (or index.html).
3. Optional: Create-Desktop-Shortcut.bat for a Desktop icon.
4. Load the Audit JSON and Audit CSV from the event.
5. Click Verify both files.

What it checks
--------------
- SHA-256 hash chain (tamper-evident)
- Seed commitment / reveal (when seed was revealed)
- Deterministic replay of selections
- Ticket transition rules
- CSV rows and hashes agree with the JSON (detects hand-edits)

JSON is authoritative for cryptography. CSV is a convenience view
that must match the JSON entries. Older CSVs without metadata headers
still have every data row cross-checked.

CLI (from the Draw Down project repo)
-------------------------------------
  npm run audit:verify -- --json path\to\audit.json --csv path\to\audit.csv
