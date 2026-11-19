# Startprompt · three.js Demo 2

Der Prompt, mit dem ich anfangen würde, um diese Demo nachzubauen. Er liefert nicht genau diese Seite, sondern eine erste Version der Idee. Danach beginnt die eigentliche Arbeit.

Ersetzen Sie die Teile in `[eckigen Klammern]` durch Ihr eigenes Thema.

```text
Ich möchte eine scrollgesteuerte Landingpage bauen für [ein Architekturbüro, Ihr Thema].

Die Idee: Die Seite öffnet mit einer flachen Schnittzeichnung eines [Hauses am Hang], geschnitten
bei A-A. Schwarzes Poché, wo der Schnitt Wände und Decken trifft, schraffiertes Erdreich,
Achsblasen, Höhenkoten, Maße und Raumnamen. Drei gestrichelte Linien in Bernstein zeigen die
Sonnenwinkel am [21. Dezember, 21. März und 21. Juni]. Nichts wirkt dreidimensional.

Der Scrollablauf, der Reihe nach:
1. Der Loader ist ein kleiner Übersichtsplan, über den sich die Schnittlinie A-A zeichnet.
   Dann zeichnet sich der Schnitt selbst: erst Erdreich und Poché, dann die Linien hinter dem
   Schnitt von vorn nach hinten, dann die Beschriftungen.
2. Das Objektiv öffnet sich. Die Kamera kommt näher, während sich das Sichtfeld weitet, sodass
   der Schnitt auf dem Bildschirm seine Größe behält und sich die Räume dahinter zu einer
   Schnittperspektive öffnen. Dann dreht sich die Ansicht über Eck.
3. Der Scan. Eine senkrechte Scan-Ebene fährt durch das Haus von [dem Garten bis zum Hang].
   Auf der einen Seite ist das Haus noch Tusche, auf der anderen beleuchtetes Material. Wenn
   die Ebene das Glas passiert, verblassen die gestrichelten Sonnenlinien, und echte
   Sonnenstrahlen fallen im [Dezember]-Winkel herein.
4. Der Rundgang. Auf Augenhöhe durch den Schnitt hinein, durch [den Wohnraum, das
   Arbeitszimmer, die Galerie, das Kaminzimmer, das Schlafzimmer, den unteren Garten], an
   jedem Raum langsamer werdend und mit einer Beschriftung.
5. Zurück durch den Schnitt. Der Scan läuft zurück, das Objektiv schließt sich, und das flache
   Blatt kehrt zurück mit [Projekt starten].

Worauf es mir ankommt:
- Die Zeichnung ist kein Bild. Sie ist das bei A-A geschnittene 3D-Modell, gesehen durch eine
  perspektivische Kamera mit 0,12-Grad-Objektiv aus etwa 12 km Entfernung, deshalb wirkt sie
  flach. Ein Vollbild-Shader tuscht sie aus einem Normalen- und Tiefen-Pass und mischt je nach
  Position des Scans das beleuchtete Rendering hinein.
- Die Kamera schneidet nie. Das Öffnen des Objektivs ist ein einziger durchgehender Dolly-Zoom.
- Der Look: ein CAD-Bildschirm. Papier #f2efe7, Tusche #1d1c19, ein Bernstein-Akzent #e85d04,
  Chakra Petch für Überschriften, IBM Plex Mono für Beschriftungen. Passermarken in den Ecken,
  eine Brennweitenanzeige in mm, ein Schriftfeld und ein kleiner Live-Schnitt, der zeigt, wo
  die Kamera ist.
- three.js 0.160 von einem CDN, einfache Dateien, kein Build-Schritt. Keine Bilddateien, jede
  Textur wird im Code gezeichnet.

Bevor du Code schreibst, schlage das Haus mit Maßen vor, die ich mir vorstellen kann, und den
Kameraweg Station für Station, und warte auf meine Antwort. Dann baue in Etappen. Nur die
erste Etappe: der Loader, das Zeichnen des Schnitts und das Öffnen des Objektivs. Nimm es auf
und zeig es mir, bevor du weitermachst.
```

Der letzte Absatz ist genauso wichtig wie die Idee. Ohne ihn bekommen Sie eine fertige Seite, die Sie nicht selbst ausgewählt haben.
