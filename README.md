# Singularity Arcade — Quantum Vault

Eigenständiges Node.js-Projekt für das Singularity Arcade Game.

## Voraussetzungen

- Node.js 20.6 oder neuer
- PowerShell nur für den optionalen Smoke-Test
- Keine zusätzlichen npm-Abhängigkeiten

## Start

```powershell
npm run check
npm start
```

Danach im Browser `http://127.0.0.1:3000` öffnen. Die Startseite bietet Registrierung und Login; nach erfolgreicher Anmeldung öffnet sich das Spiel unter `/game.html`.

## Konfiguration und Speicherung

Der Server verwendet `HOST`, `PORT`, `NODE_ENV` und optional `VAULT_ENCRYPTION_KEY` aus seiner Prozessumgebung. `.env.example` dokumentiert diese Variablen, wird aber nicht automatisch geladen. In PowerShell können sie vor dem Start gesetzt werden:

```powershell
$env:HOST = '127.0.0.1'
$env:PORT = '3000'
npm start
```

Beim ersten lokalen Vault-Zugriff wird `server/data/.vault-key` mit eingeschränkten Dateirechten erzeugt, falls `VAULT_ENCRYPTION_KEY` nicht gesetzt ist. Für produktive Umgebungen muss `VAULT_ENCRYPTION_KEY` als sicher verwaltetes Secret mit genau 64 Hex-Zeichen gesetzt werden. Niemals Schlüssel, `.env`-Dateien oder Inhalte aus `server/data` committen.

Accounts werden in `server/data/users.json` gespeichert. Spielstände liegen accountgebunden in `server/data/vaults.enc`, verschlüsselt mit AES-256-GCM. Beide Dateien und der Schlüssel sind von Git ausgeschlossen. Der Host muss persistenten Dateispeicher bereitstellen; GitHub Pages kann den Node.js-Backend-Prozess nicht ausführen.

Die Vault-Identität stammt ausschließlich aus der serverseitigen HttpOnly-Session. Eine nicht authentifizierte Anfrage auf `/api/vault` erhält HTTP 401. Passwörter werden mit `scrypt` gehasht und weder zurückgegeben noch im Browser gespeichert. Sessions liegen im Speicher und werden nach einem Backend-Neustart ungültig; bei mehreren Backend-Instanzen ist ein gemeinsamer Session-Store erforderlich.

## Smoke-Test

In einem PowerShell-Fenster `npm start` ausführen. In einem zweiten Fenster aus dem Repository-Ordner starten:

```powershell
.\smoke-test.ps1
```

Der Test prüft Health, unauthentifizierten Vault-Zugriff, Registrierung, Lesen und Schreiben des Vaults, Account-Isolation, Login, Session-Erkennung und Logout. Er legt einen temporären Test-Account und lokale Daten unter `server/data` an.

## Grenzen

Die Spiellogik läuft clientseitig, daher kann ein Spieler den eigenen Spielstand manipulieren. Punkte und Belohnungen müssten serverseitig berechnet werden, falls die Rangliste später fälschungssicher sein soll. Öffentlich angezeigt werden nur Handle und Vibe Score.
