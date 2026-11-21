# three.js Demo 2

Eine Schnittzeichnung eines zweigeschossigen Hauses, in Tusche auf Transparentpapier gezeichnet. Beim Scrollen öffnet sich das Objektiv in die Tiefe, eine Scan-Ebene verwandelt die Tusche in beleuchtetes Material, und die gezeichneten Sonnenwinkel werden zu echten Sonnenstrahlen. Dann gehen Sie durch den Schnitt hinein, Raum für Raum, hinaus in den Garten, und kommen wieder heraus zur Zeichnung.

[**Live ansehen**](https://seofessionals-3js.github.io/threejs-demo-2/) · [**Startprompt**](PROMPT.md) · [**Alle Demos**](https://seofessionals-3js.github.io/threejs-demos/)

## Das Haus

Haus Linie: 12 × 12 m, zwei Geschosse unter einem flachen Dach. Unten Küche mit Kochinsel, ein Esstisch für sechs und der Wohnraum, der an der Südseite 6 m hoch ist. Eine gerade Treppe an der Rückwand führt auf die Galerie mit Bücherwand und Schreibtisch am Luftraum, dahinter liegt das Schlafzimmer. Die Südseite ist über beide Geschosse verglast, ein Feld davon steht als Schiebetür zur Terrasse offen.

## So funktioniert es

- **Die Zeichnung ist das Haus.** Das 3D-Modell ist bei A-A geschnitten und wird durch eine perspektivische Kamera mit 0,12°-Objektiv aus etwa 11 km Entfernung gesehen, deshalb wirkt es wie ein flacher Schnitt 1:100.
- **Die Tusche ist ein Shader.** `draw.js` rendert Normalen, Tiefe und eine Zeichnungs-ID in ein 8-Bit-Target mit 24-Bit-Tiefentextur (kein Float-Target, das Handys oft nicht rendern können), dann tuscht ein Vollbild-Pass alles: Poché, die Erdschraffur, Kanten aus Tiefensprüngen, Linienstärke nach Abstand hinter dem Schnitt.
- **Das Öffnen des Objektivs** ist ein Dolly-Zoom (`swingState()` in `main.js`). Das Objektiv weitet sich, während die Kamera näher kommt, sodass der Schnitt seine Größe behält und die Räume dahinter sich öffnen.
- **Der Scan** mischt Tusche und beleuchtetes Rendering pro Pixel nach der Weltkoordinate x. Sobald er das Glas passiert, gehen die gestrichelten Sonnenlinien in raymarchte Sonnenstrahlen im selben Winkel über (`real.js`).
- **Das beleuchtete Haus steht im Tageslicht.** Hinter der Scan-Ebene zeigt das Blatt ein Haus im Licht einer tiefen, warmen Wintersonne unter blassem Himmel. Die Schnittflächen bleiben auch dort massiver Tusche-Poché, wie bei einer gerenderten Schnittperspektive mit schwarzem Poché. Innenräume bekommen ihren Verlauf aus Himmelslicht, Raumleuchten und (am Rechner) Umgebungsverdeckung.
- **Weniger Aufwand auf dem Handy.** Auf der niedrigen Stufe gibt es keine Umgebungsverdeckung, eine 1536er Shadow-Map, weniger Leuchten, halbaufgelöste Sonnenstrahlen mit 10 Schritten, und der Rundgang überspringt die Tusche-Pässe ganz. Eine Auflösungsregelung (`quality.js`) hält die Bildrate; im Ruhezustand wird nichts gerendert.
- **Der Rundgang** ist ein einziger Catmull-Rom-Spline auf Augenhöhe. Die Kamera bleibt mit Shift-Objektiv waagerecht, wie bei einem Architekturfotografen, und hält nie an.
- **Nichts durchdringt sich.** Die Kamera geht nur durch echte Öffnungen, auch in den Garten, und hält auf dem ganzen Weg mindestens 40 cm Abstand zu allem, was gerade zu sehen ist. `window.__clear()` misst das in der Konsole nach.

## Farben

| | Farbe | Verwendung |
|---|---|---|
| Papier | `#e9e7e0` (hell `#f4f3ee`, tief `#dddad1`) | Transparentpapier, Tafeln, Himmel am Horizont |
| Tusche | `#1b1c1e` | Linien, Poché, Schrift |
| Sonnenorange | `#e07a12` (hell `#f39a36`, Schrift `#a85400`) | Scan-Ebene, Sonnenwinkel, Sonnenstrahlen |

Gebaut (Tageslicht): Sichtbeton `#bdbab2`, weißer Putz `#f1efe9`, Eiche `#c8a26e`, Nussbaum `#7a5a3c`, Leinen `#d9d3c5`, schwarzer Stahl `#2a2b2d`, genau ein gebranntes Orange als Textil `#c8642a` (die Sitzbank), Laub `#7f906b`, Rasen `#8ea070`, Himmel von `#cfdde6` (Zenit) zu `#f1efe9` (Horizont).

## Dateien

`index.html`, `main.js` (Kamera, Scrollen, HUD), `house.js` (das Haus aus Quadern, geschnitten bei z = 0), `draw.js` (die Tusche), `real.js` (Licht, Sonnenstrahlen), `look.js` (auf Canvas gemalte Materialien). 

`?noao` schaltet die Umgebungsverdeckung ab. `?dpr=1` begrenzt die Auflösung.

## Lokal starten

Die Seiten nutzen JavaScript-Module und brauchen deshalb einen lokalen Server. Ein Doppelklick auf `index.html` funktioniert nicht.

```bash
python -m http.server 8000
```

Dann http://localhost:8000/ öffnen. Am besten auf einem Laptop mit aktuellem Browser.

## Herkunft und Lizenz

Basiert auf „Section Sweep“ aus [flat-to-3d](https://github.com/Sam1983Aing/flat-to-3d) von Samnang Aing, veröffentlicht unter der MIT-Lizenz, und ins Deutsche übersetzt. Das Haus ist neu entworfen, Aufbau, Animationen und Effekte folgen der Vorlage. Die Lizenz liegt unverändert in [LICENSE](LICENSE).

Alle Büros, Häuser, Adressen und Kontaktdaten in der Demo sind erfunden. three.js (MIT) wird von einem CDN geladen, die Schriften Chakra Petch und IBM Plex Mono von Google Fonts (SIL Open Font License).
