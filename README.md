# Singularity Arcade — Quantum Vault

Eigenständiges zweites Projekt für das Singularity Arcade Game.

## Was enthalten ist

- Account-Registrierung und Login
- serverseitige Session mit HttpOnly-Cookie
- Passwort-Hashing mit Node.js `scrypt`
- pro Account getrennte Vault-Daten
- Vault wird serverseitig mit AES-256-GCM verschlüsselt gespeichert
- kein `localStorage` als Spielstandquelle
- Gerätewechsel: auf anderem Gerät einloggen und denselben Vault laden
- Autosave alle 10 Sekunden
- Speichern beim Wechsel auf Hintergrund / beim Verlassen über `sendBeacon`
- manueller Speichern-Button
- Logout
- öffentliche Rangliste mit ausschließlich Handle + Vibe Score
- keine Express-/Session-Middleware; nur Node.js Standardbibliothek
- GitHub-freundliche Struktur; geheime/benutzerspezifische Dateien stehen in `.gitignore`

## Wichtig für GitHub

GitHub kann dieses Projekt als Repository speichern. GitHub Pages kann jedoch keinen Node.js-Backend-Prozess mit privaten Account-Daten ausführen.

Für den echten Betrieb muss der **gesamte Ordner** auf einem Node-fähigen Server/Host laufen. Der GitHub-Repository kann dabei weiterhin die Quelle des Projekts sein.

Die `server/data`-Dateien dürfen nicht ins Repository. Sie werden deshalb ignoriert. Für einen echten Geräte-übergreifenden Vault muss der verwendete Host einen **persistenten Speicher** bereitstellen.

## Start unter PowerShell

```powershell
cd 'C:\Pfad\zu\Singularity Arcade'
Copy-Item .env.example .env
npm run check
npm start
```

Danach im Browser:

```text
http://127.0.0.1:3000
```

Beim ersten Start wird automatisch `server/data/.vault-key` erzeugt, wenn `VAULT_ENCRYPTION_KEY` nicht gesetzt ist. Diese Datei ist geheim und wird nicht von Git erfasst.

Für einen produktiven Server sollte ein dauerhafter 32-Byte-Schlüssel als `VAULT_ENCRYPTION_KEY` gesetzt werden, z. B. als 64 Hex-Zeichen. Der Schlüssel darf niemals in GitHub eingecheckt werden.

## Smoke-Test

1. `npm start` in einem PowerShell-Fenster starten.
2. In einem zweiten PowerShell-Fenster aus dem Projektordner:

```powershell
.\scripts\smoke-test.ps1
```

Der Test registriert einen temporären Account, liest den Vault, verändert Daten, speichert sie und prüft die Session.

## Sicherheitsmodell

Der Browser sendet beim Speichern **keine frei wählbare `userId`**. Der Server nimmt die Identität ausschließlich aus der gültigen HttpOnly-Session. Dadurch kann ein Account nicht einfach die ID eines anderen Accounts einsetzen, um dessen Vault anzufordern.

Der Vault selbst liegt verschlüsselt auf dem Server. Passwörter werden nur als `scrypt`-Hash gespeichert.

## Grenzen

Dieses Projekt ist für einen kleinen bis mittleren Standalone-Game-Server ausgelegt. Die Session-Daten liegen bewusst nur im Speicher; nach einem Backend-Neustart müssen sich Spieler erneut einloggen. Für mehrere parallel laufende Backend-Instanzen wäre später ein gemeinsamer Session-Store erforderlich.

Die Rangliste ist absichtlich öffentlich und enthält nur Handle + Vibe Score. Private Vault-Daten werden nicht über die Rangliste ausgegeben.

Die aktuelle Spiellogik ist clientseitig. Ein Spieler kann seinen eigenen Spielstand technisch manipulieren. Wenn später ein fälschungssicherer Wettbewerb/Leaderboard benötigt wird, müssen Punkte und Belohnungen serverseitig berechnet werden.
