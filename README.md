# tennis-watch

Zeigt, wann die nächsten Matches ausgewählter ATP-/WTA-Spieler:innen sind und
(sofern bekannt) wo man sie in Deutschland sehen kann. Läuft als ein einziger
Docker-Container, aktualisiert sich einmal pro Nacht selbst (03:00 Europe/Berlin)
und braucht keinen Account/Login.

## Lokal starten

```
docker compose build
docker compose up -d
```

Danach ist die Seite unter `http://localhost:8080` erreichbar. Der Container
führt beim Start automatisch einen ersten Scrape+Build durch (siehe
`entrypoint.sh`); man muss nicht bis 03:00 warten, um Inhalte zu sehen.

Manuell neu scrapen, ohne den Container neu zu starten:

```
docker compose exec app node dist/scraper/index.js
docker compose exec app node dist/site/build.js
```

Logs ansehen: `docker compose logs -f`.

## Einen Spieler hinzufügen

Eintrag in [`src/config/players.json`](src/config/players.json) ergänzen:

```json
{
  "id": "kurzer-eindeutiger-slug",
  "name": "Vollständiger Name",
  "tour": "ATP oder WTA",
  "tennisExplorerSlug": "slug-aus-der-url-von-tennisexplorer.com/player/<slug>/",
  "wikipediaTitle": "Exakter Wikipedia-Artikeltitel (für das Foto)",
  "addedReason": "kurze Notiz, warum/wann hinzugefügt (nur zur Doku)"
}
```

Den `tennisExplorerSlug` findet man, indem man auf tennisexplorer.com nach dem
Spieler sucht — die URL der Profilseite ist `/player/<slug>/`. Danach einmal
neu bauen (`docker compose build && docker compose up -d`) oder beim nächsten
nächtlichen Lauf erscheint der Spieler automatisch.

## Sender-Zuordnung pflegen

[`src/config/broadcasters.json`](src/config/broadcasters.json) ordnet
Turniernamen (Teilstring-Match, z. B. `"Wimbledon"`) einem oder mehreren
Sendern zu. Das sind langfristige Übertragungsverträge (z. B. Sky/ATP bis 2033,
Amazon Prime/Wimbledon bis 2027) — keine Tagesdaten. Zusätzlich versucht
`broadcastScraper.ts` täglich best-effort, eine tagesaktuelle Bestätigung von
einer TV-Guide-Seite zu holen; falls das nichts findet (meistens der Fall,
diese Seiten sind unzuverlässig strukturiert), greift die Config-Zuordnung.

## Wenn das Scraping bricht (Playwright-Fallback)

Primärquelle für Spieltermine ist `tennisexplorer.com` per einfachem HTTP-GET +
HTML-Parsing (`src/scraper/tennisExplorerSource.ts`) — kein JS nötig, laut
`robots.txt` erlaubt. Sollte sich die Seitenstruktur ändern oder ein
Bot-Schutz dazukommen, gibt es bereits ein fertiges Playwright-basiertes
Äquivalent (`src/scraper/playwrightSource.ts`), das dieselbe Parsing-Logik
(`parseTennisExplorer.ts`) wiederverwendet. Umschalten reicht in
`src/scraper/index.ts`:

```ts
// vorher:
const scheduleSource = new TennisExplorerSource();
// nachher:
const scheduleSource = new PlaywrightSource();
```

## Bekannte Einschränkungen

- **Uhrzeiten**: tennisexplorer.com zeigt Zeiten offenbar in mitteleuropäischer
  Zeit für europäische Turniere; bei Turnieren außerhalb Europas (US, Australien,
  Asien) ist nicht abschließend verifiziert, ob die Zeit automatisch umgerechnet
  wird. Im Zweifel die Zeit auf der Quellseite gegenprüfen.
- **Sender-Angaben** sind nicht pro Einzelmatch bestätigt, sondern basieren auf
  bekannten Turnier-/Sender-Verträgen (siehe oben) plus Best-Effort-Scraping.
- **Fotos**: Wikipedia-Thumbnails (Wikimedia Commons), werden einmalig
  heruntergeladen und in `public/images/` gecacht (persistiert über ein Docker-
  Volume). Kein Foto gefunden → Platzhalter mit Initialen.

## Deploy (Hetzner, Subdomain `tennis.ramsterhad.de`)

Der Container lauscht intern auf Port 8080 (`docker-compose.yml` mappt ihn auf
Host-Port 8080). Sobald klar ist, welcher Reverse Proxy auf dem Server läuft,
reicht ein Vhost/Route, der `tennis.ramsterhad.de` auf `localhost:8080`
weiterleitet, z. B. mit Caddy:

```
tennis.ramsterhad.de {
    reverse_proxy localhost:8080
}
```

oder mit nginx:

```
server {
    server_name tennis.ramsterhad.de;
    location / {
        proxy_pass http://localhost:8080;
    }
}
```
