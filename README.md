# Mau-Mau 🎴

Der gemeinfreie Klassiker: Farbe oder Zahl bedienen, wer zuerst keine Karten
mehr hat, gewinnt. Die Sonderkarten sind Schalter, die der Host vor dem Start
umlegt – jede Runde spielt Mau-Mau ein bisschen anders, und hier kann man sich
vorher einigen.

Läuft auf **Deno**, ohne eine einzige externe Abhängigkeit. Kein Build-Schritt,
kein `node_modules`, ein Prozess.

---

## Starten

```bash
deno task dev          # http://localhost:8066/
PORT=9000 deno task dev
deno task check        # Typprüfung
deno task probe        # spielt ganze Partien durch (Server muss laufen)
```

Zum Ausprobieren allein: die Seite in **mehreren Browserfenstern** öffnen.

## An den Tisch kommen

Name eintippen, **Raum eröffnen** oder über die Liste bzw. den vierstelligen
**Code** beitreten. **Zwei bis sechs** Leute, je fünf Karten.

## Die Regeln

Bedient wird nach **Farbe oder Zahl** der obersten Karte. Passt nichts, zieht
man eine und ist durch.

| Karte | Wirkung | abschaltbar |
|---|---|---|
| **Sieben** | Der Nächste zieht zwei – oder legt selbst eine Sieben, dann zieht der Übernächste vier | ja |
| **Acht** | Der Nächste setzt aus | ja |
| **Bube** | Darf immer gelegt werden und wünscht sich eine Farbe | ja |

Ist eine Sonderregel abgeschaltet, ist die Karte eine ganz normale – dann darf
sie auch als erste offene Karte liegen.

**Mau!** Wer auf eine Karte kommt, muss es ansagen; der Knopf leuchtet.
Vergessen kostet zwei Karten.

## Was nur der Server weiß

Die Hände liegen ausschließlich im Server. Der Client bekommt seine eigene und
von den anderen nur die **Anzahl**. Dazu kommt für jede eigene Karte ein Haken,
ob sie gerade spielbar ist – gerechnet wird das im Server, nicht im Browser.

## regeln.js

Was aus Karten Regeln macht, liegt in einer **eigenen Datei**: `passt()`,
`wirkung()`, `taugtAlsStart()` und `gib()`. Der Grund ist die Probe. Die Karten
sind zufällig, also kann sie keinen bestimmten Zug ansagen; sie sucht sich mit
derselben `regeln.js` einen gültigen – und prüft damit genau das, worauf es
ankommt: **was die gemeinsame Logik erlaubt, muss der Server annehmen, und was
sie verbietet, muss er ablehnen.** In jedem Zug wird die Spielbar-Liste des
Servers gegen `regeln.js` gehalten.

`gib()` ist der Sonderfall: das Nachmischen. Ist der Talon leer, kommt die
Ablage bis auf die oberste Karte zurück und wird gemischt. Das kommt in einer
einzelnen Partie oft gar nicht vor – deshalb ist es als reine Funktion
herausgelöst und wird **ohne Server** geprüft, samt dem Fall, dass beide Stapel
leer sind.

Die Runden-Nachricht enthält außerdem die Zahl der Karten auf der Ablage. Sie
steht in keinem Bildschirm; sie ist da, damit sich nachrechnen lässt, dass
keine Karte verschwindet: **Hände + Talon + Ablage sind immer 32.** Ohne diese
Zahl fällt eine verschwundene Karte niemandem auf.

## Wenn jemand geht

- Wer die Verbindung verliert, behält seinen Platz eine Minute lang.
- Verlässt jemand den Raum, während er am Zug ist, rückt der Zug weiter.
- Fallen die Mitspieler unter zwei, endet die Partie.

## Dateien

| Datei | Was |
|---|---|
| `server.js` | Geben, Zugreihenfolge, Ablage, Mau, Endstand |
| `regeln.js` | Blatt, `passt`, `wirkung`, `taugtAlsStart`, `gib` |
| `probe.js` | rechnet ohne Server, dann Partien mit drei Clients |
| `bremse.js`, `raum.js`, `statisch.js` | gemeinsam, **wortgleich in allen Spielen** |
| `public/index.html` | alle vier Bildschirme plus die Hilfe |
| `public/schale.js` | gemeinsame Client-Schale (Verbindung, Lobby) |
| `public/style.css` | Lobby-Basis, gemeinsamer Rahmen, darunter das Eigene |
| `public/app.js` | Hand, Ablage, Farbwunsch, Mau-Knopf |

## Betrieb

Port **8066**, gebunden auf `127.0.0.1`, davor Apache als Reverse Proxy unter
`/maumau/`. Dienst: `maumau.service` (systemd, läuft als `www-data`).

```bash
systemctl status maumau
journalctl -u maumau -f
```

Der Zustand liegt vollständig im RAM. Ein Neustart wirft alle laufenden Partien
weg – das ist gewollt, es gibt nichts zu sichern.
