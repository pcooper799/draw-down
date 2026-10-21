Draw Down — Code Issuer (seller tool)
=====================================

Use this on YOUR computer to generate paid activation codes.
Do NOT give this folder to customers.

Codes are Ed25519-signed (DD2…). The customer app only contains the
public key, so unpacking the app cannot create new codes.

How to open on Windows
----------------------
1. Unzip this folder anywhere (Desktop is fine).
2. Confirm these files are present:
     - index.html
     - keys.js                 ← private key (keep secret)
     - vendor/ed25519.iife.js
     - Open-Code-Issuer.bat
3. Double-click  Open-Code-Issuer.bat
4. Click Generate, then Copy, and send the code to your customer.

Optional: run Create-Desktop-Shortcut.bat for a Desktop icon.

What the customer gets
----------------------
Each code unlocks Draw Down for 48 hours after they activate it
on their PC. Codes must be activated within 30 days of issue.

Security
--------
- Keep this whole folder private.
- Never put keys.js inside the customer Windows installer.
- If keys.js is missing, run in the project:  npm run license:keys
  then rebuild/repackage this issuer folder.
