# three.js Demo 2

Eine Schnittzeichnung eines Hauses am Hang. Beim Scrollen öffnet sich das Objektiv in die Tiefe, eine Scan-Ebene verwandelt die Tusche in beleuchtetes Material, und die gezeichneten Sonnenwinkel werden zu echten Sonnenstrahlen. Dann gehen Sie durch den Schnitt hinein, Raum für Raum, und kommen wieder heraus zur Zeichnung.

[**Live ansehen**](https://seofessionals-3js.github.io/threejs-demo-2/) · [**Startprompt**](PROMPT.md) · [**Alle Demos**](https://seofessionals-3js.github.io/threejs-demos/)

## So funktioniert es

- **Die Zeichnung ist das Haus.** Das 3D-Modell ist bei A-A geschnitten und wird durch eine perspektivische Kamera mit 0,12°-Objektiv aus etwa 12 km Entfernung gesehen, deshalb wirkt es wie ein flacher Schnitt 1:100.
- **Die Tusche ist ein Shader.** `draw.js` rendert Normalen, Tiefe und eine Zeichnungs-ID in ein Float-Target, dann tuscht ein Vollbild-Pass alles: Poché, die Erdschraffur, Kanten aus Tiefensprüngen, Linienstärke nach Abstand hinter dem Schnitt.
- **Das Öffnen des Objektivs** ist ein Dolly-Zoom (`swingState()` in `main.js`). Das Objektiv weitet sich, während die Kamera näher kommt, sodass der Schnitt seine Größe behält und die Räume dahinter sich öffnen.
- **Der Scan** mischt Tusche und beleuchtetes Rendering pro Pixel nach der Weltkoordinate x. Sobald er das Glas passiert, gehen die gestrichelten Sonnenlinien in raymarchte Sonnenstrahlen im selben Winkel über (`real.js`).
- **Der Rundgang** ist ein einziger Catmull-Rom-Spline auf Augenhöhe. Die Kamera bleibt mit Shift-Objektiv waagerecht, wie bei einem Architekturfotografen, und hält nie an.

## Dateien

`index.html`, `main.js` (Kamera, Scrollen, HUD), `house.js` (das Haus aus Quadern, geschnitten bei z = 0), `draw.js` (die Tusche), `real.js` (Licht, Sonnenstrahlen), `look.js` (auf Canvas gemalte Materialien). Insgesamt etwa 140 KB.

`?noao` schaltet die Umgebungsverdeckung ab. `?dpr=1` begrenzt die Auflösung.

## Lokal starten

Die Seiten nutzen JavaScript-Module und brauchen deshalb einen lokalen Server. Ein Doppelklick auf `index.html` funktioniert nicht.

```bash
python -m http.server 8000
```

Dann http://localhost:8000/ öffnen. Am besten auf einem Laptop mit aktuellem Browser.

## Herkunft und Lizenz

Basiert auf „Section Sweep“ aus [flat-to-3d](https://github.com/Sam1983Aing/flat-to-3d) von Samnang Aing, veröffentlicht unter der MIT-Lizenz, und ins Deutsche übersetzt. Die Lizenz liegt unverändert in [LICENSE](LICENSE).

Alle Büros, Häuser, Adressen und Kontaktdaten in der Demo sind erfunden. three.js (MIT) wird von einem CDN geladen, die Schriften Chakra Petch und IBM Plex Mono von Google Fonts (SIL Open Font License).
