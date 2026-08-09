// Spielt Mau-Mau mit drei Clients durch, so lange, bis jede Sonderkarte
// mindestens einmal vorgekommen ist: Sieben (zwei ziehen), Acht (aussetzen),
// Bube (Farbe wünschen), dazu Mau ansagen und vergessen, Talon-Nachmischen,
// Abgang mitten im Zug, Endstand, Neustart.
//
// Kein Testrahmen, keine Abhaengigkeit – das Skript wirft, wenn etwas nicht
// stimmt, und schreibt sonst mit, was passiert ist. Der Server muss dafuer
// laufen:
//
//   deno task dev            (in einer zweiten Sitzung)
//   deno task probe
// Gegen die Live-Fassung statt gegen den lokalen Server:
//   WS_URL=wss://inf-zeus.de/maumau/ws deno task probe
//
// Die Karten sind zufaellig, also kann die Probe keinen bestimmten Zug
// ansagen. Sie sucht sich mit derselben `regeln.js`, die auch der Server
// benutzt, einen gueltigen Zug – und prueft damit genau das, worauf es
// ankommt: was die gemeinsame Logik erlaubt, muss der Server annehmen, und was
// sie verbietet, muss er ablehnen. Der erste Teil laeuft ganz ohne Server.

import { FARBEN, gib, neuesDeck, passt, RAENGE, taugtAlsStart, wirkung } from "./regeln.js";

const PORT = Deno.env.get("PORT") ?? "8066";
const URL_WS = Deno.env.get("WS_URL") ?? `ws://127.0.0.1:${PORT}/ws`;

const muss = (bedingung, text) => { if (!bedingung) throw new Error(text); };
const karte = (k) => k.f + k.r;
const ALLE = { sieben: true, acht: true, bube: true };

// --- Erst die Regeln, ohne Server -------------------------------------------

const deck = neuesDeck();
muss(deck.length === 32, "Ein Skatblatt hat 32 Karten, hier: " + deck.length);
muss(new Set(deck.map(karte)).size === 32, "Im Deck liegt eine Karte doppelt");
console.log("ok  32 verschiedene Karten im Deck");

const lage = (o) => ({ oben: { r: "9", f: "♥" }, wunsch: null, strafe: 0, regeln: ALLE, ...o });

muss(passt({ r: "9", f: "♠" }, lage()), "Gleiche Zahl müsste passen");
muss(passt({ r: "K", f: "♥" }, lage()), "Gleiche Farbe müsste passen");
muss(!passt({ r: "K", f: "♠" }, lage()), "Weder Farbe noch Zahl – das darf nicht passen");
muss(passt({ r: "B", f: "♠" }, lage()), "Ein Bube müsste immer passen");
muss(!passt({ r: "B", f: "♠" }, lage({ regeln: { ...ALLE, bube: false } })),
  "Ohne Buben-Regel ist der Bube eine normale Karte und passt hier nicht");
muss(passt({ r: "K", f: "♦" }, lage({ wunsch: "♦" })), "Die gewünschte Farbe müsste passen");
muss(!passt({ r: "9", f: "♠" }, lage({ wunsch: "♦" })),
  "Ein Farbwunsch schlägt die Zahl der obersten Karte");
muss(passt({ r: "7", f: "♠" }, lage({ strafe: 2 })), "Auf eine Sieben müsste eine Sieben passen");
muss(!passt({ r: "9", f: "♠" }, lage({ strafe: 2 })),
  "Bei offener Strafe darf nur eine Sieben gelegt werden");
muss(passt({ r: "9", f: "♠" }, lage({ strafe: 2, regeln: { ...ALLE, sieben: false } })),
  "Ohne Sieben-Regel gibt es keine Strafe, die etwas blockiert");
console.log("ok  passt(): Zahl, Farbe, Bube, Farbwunsch, offene Strafe – auch abgeschaltet");

muss(wirkung({ r: "7", f: "♠" }, ALLE).strafePlus === 2, "Eine Sieben müsste zwei Strafkarten geben");
muss(wirkung({ r: "8", f: "♠" }, ALLE).ueberspringen === 1, "Eine Acht müsste einen überspringen");
muss(wirkung({ r: "B", f: "♠" }, ALLE).wuenscht === true, "Ein Bube müsste einen Wunsch auslösen");
muss(wirkung({ r: "9", f: "♠" }, ALLE).strafePlus === 0, "Eine Neun löst nichts aus");
for (const r of ["7", "8", "B"]) {
  const aus = { sieben: false, acht: false, bube: false };
  const w = wirkung({ r, f: "♠" }, aus);
  muss(!w.strafePlus && !w.ueberspringen && !w.wuenscht,
    `Die ${r} löst etwas aus, obwohl die Regel abgeschaltet ist`);
  muss(taugtAlsStart({ r, f: "♠" }, aus), `Die ${r} dürfte als Startkarte liegen, wenn sie nichts tut`);
  muss(!taugtAlsStart({ r, f: "♠" }, ALLE), `Die ${r} darf nicht als Startkarte liegen`);
}
for (const r of RAENGE.filter((x) => !["7", "8", "B"].includes(x))) {
  muss(taugtAlsStart({ r, f: "♠" }, ALLE), `Die ${r} müsste als Startkarte taugen`);
}
console.log("ok  wirkung() und taugtAlsStart() für jeden Rang, ein- und ausgeschaltet");

// Nachmischen: das Stueck, das online kaum vorkommt und trotzdem stimmen muss.
{
  const talon = [{ r: "9", f: "♥" }, { r: "K", f: "♠" }];
  const ablage = [{ r: "7", f: "♦" }];
  const a = gib(talon, ablage, 1);
  muss(a.gezogen.length === 1 && a.talon.length === 1, "Aus vollem Talon geben ging schief");
  muss(a.ablage.length === 1, "Beim normalen Geben ändert sich die Ablage");
  muss(talon.length === 2 && ablage.length === 1, "gib() hat die übergebenen Stapel angefasst");

  // Talon leer, Ablage mit fuenf Karten: vier davon werden neuer Talon, die
  // oberste bleibt liegen.
  const dick = [1, 2, 3, 4, 5].map((n) => ({ r: RAENGE[n], f: "♣" }));
  const b = gib([], dick, 2);
  muss(b.gezogen.length === 2, "Nach dem Nachmischen kamen nicht zwei Karten");
  muss(b.ablage.length === 1, "Nach dem Nachmischen liegt nicht genau eine Karte oben");
  muss(b.ablage[0].r === dick[4].r, "Die oberste Karte ist beim Nachmischen verschwunden");
  muss(b.talon.length === 2, "Talon nach dem Nachmischen: " + b.talon.length);
  const alleB = [...b.gezogen, ...b.talon, ...b.ablage].map(karte).sort();
  muss(JSON.stringify(alleB) === JSON.stringify(dick.map(karte).sort()),
    "Beim Nachmischen ist eine Karte verschwunden oder dazugekommen");

  // Beides leer bis auf die oberste Karte: dann gibt es eben nichts mehr.
  const c = gib([], [{ r: "9", f: "♥" }], 3);
  muss(c.gezogen.length === 0, "Aus dem Nichts kamen Karten");
  muss(c.ablage.length === 1, "Die letzte Ablagekarte ist verschwunden");
  console.log("ok  gib(): normal, mit Nachmischen, und wenn nichts mehr da ist");
}

// --- Jetzt der Server -------------------------------------------------------

function client(name) {
  const c = {
    name, ws: new WebSocket(URL_WS), you: null, room: null, runde: null,
    final: null, fehler: [],
  };
  c.ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.t === "joined") c.you = m.you;
    if (m.t === "room") c.room = m;
    if (m.t === "runde") { c.runde = m; c.final = null; }
    if (m.t === "final") c.final = m;
    if (m.t === "error") c.fehler.push(m.msg);
  };
  c.send = (m) => c.ws.send(JSON.stringify(m));
  c.offen = new Promise((res) => { c.ws.onopen = res; });
  return c;
}

const warte = (ms) => new Promise((r) => setTimeout(r, ms));

async function bis(bedingung, was, ms = 4000) {
  const ende = Date.now() + ms;
  while (Date.now() < ende) {
    if (bedingung()) return;
    await warte(20);
  }
  throw new Error("Zeitüberschreitung: " + was);
}

const A = client("Anna"), B = client("Ben"), C = client("Cem");
const alleC = [A, B, C];
await Promise.all(alleC.map((c) => c.offen));

// Nicht oeffentlich: die Probe laeuft auch gegen live, und dort soll kein
// Geisterraum in der Liste stehen.
A.send({ t: "create", name: "Anna", isPublic: false });
await bis(() => A.room, "Raum angelegt");
console.log("Raum:", A.room.code);

for (const c of [B, C]) c.send({ t: "join", code: A.room.code, name: c.name });
await bis(() => A.room.players.length === 3, "drei Spieler");

A.send({ t: "start" });
await warte(150);
muss(A.room.phase === "lobby", "Start ging ohne Bereit durch");
console.log("ok  Start blockiert, solange nicht alle bereit sind");

for (const c of [B, C]) c.send({ t: "ready", value: true });
await bis(() => A.room.players.every((p) => p.ready || p.host), "alle bereit");

// --- Eine Partie spielen ----------------------------------------------------

/** Was im Lauf aller Partien mindestens einmal vorgekommen sein muss. */
const gesehen = {
  sieben: false, acht: false, bube: false,
  mauAngesagt: false, mauVergessen: false, gezogen: false,
};
// Nachmischen laesst sich online nicht erzwingen – ob der Talon in einer Partie
// leergeht, haengt am Blatt. Geprueft ist es oben an `gib()`; hier wird nur
// vermerkt, ob es auch einmal wirklich passiert ist.
let nachgemischt = false;

const amZug = () => alleC.find((c) => c.you === A.runde?.amZug);

/**
 * Hände + Talon + Ablage müssen immer 32 sein – sonst verschwindet eine Karte.
 * Wer fertig ist, hält null Karten und faellt aus der Liste; die Summe bleibt.
 */
function zaehleKarten(m) {
  const aufHaenden = m.spieler.reduce((n, s) => n + s.karten, 0);
  const summe = aufHaenden + m.talon + m.ablage;
  muss(summe === 32,
    `Es sind ${summe} Karten im Spiel statt 32 ` +
    `(Hände ${aufHaenden}, Talon ${m.talon}, Ablage ${m.ablage})`);
}

/** Der Server sagt für jede Handkarte, ob sie spielbar ist. Stimmt das? */
function pruefeSpielbar(c) {
  const m = c.runde;
  const soll = m.hand.map((k) =>
    passt(k, { oben: m.oben, wunsch: m.wunsch, strafe: m.strafe, regeln: m.regeln })
  );
  muss(JSON.stringify(soll) === JSON.stringify(m.spielbar),
    `${c.name}: Server sagt spielbar ${JSON.stringify(m.spielbar)}, regeln.js sagt ` +
    `${JSON.stringify(soll)} bei ${m.hand.map(karte).join(" ")} auf ${karte(m.oben)}` +
    `${m.wunsch ? " Wunsch " + m.wunsch : ""}${m.strafe ? " Strafe " + m.strafe : ""}`);
}

async function spielePartie(nr) {
  A.send({ t: "start" });
  await bis(() => alleC.every((c) => c.runde && !c.final), "gegeben, Partie " + nr);

  muss(alleC.every((c) => c.runde.hand.length === 5), "Nicht jeder hat fünf Karten bekommen");
  muss(taugtAlsStart(A.runde.oben, A.runde.regeln),
    "Oben liegt eine Sonderkarte: " + karte(A.runde.oben));
  const alleHand = alleC.flatMap((c) => c.runde.hand.map(karte));
  muss(new Set([...alleHand, karte(A.runde.oben)]).size === 16,
    "Eine Karte wurde doppelt gegeben");
  for (const c of alleC) {
    muss(c.runde.spieler.every((s) => s.karten === 5), "Die Kartenzahlen stimmen nicht");
    muss(c.runde.spieler.every((s) => s.hand === undefined),
      `${c.name} sieht fremde Karten in der Spielerliste`);
  }
  zaehleKarten(A.runde);

  let talonVorher = A.runde.talon;

  for (let zug = 0; zug < 400 && !A.final; zug++) {
    const d = amZug();
    muss(d, "Niemand ist am Zug: " + A.runde.amZug);
    const m = d.runde;

    // Wer nicht dran ist, darf nichts – einmal je Partie geprüft.
    if (zug === 0) {
      const fremd = alleC.find((c) => c !== d);
      const obenVorher = karte(m.oben);
      fremd.send({ t: "legen", i: 0, mau: true });
      fremd.send({ t: "ziehen" });
      await warte(120);
      muss(karte(A.runde.oben) === obenVorher, "Wer nicht dran ist, konnte legen");
      muss(A.runde.amZug === d.you, "Wer nicht dran ist, konnte ziehen");
    }

    for (const c of alleC) pruefeSpielbar(c);
    zaehleKarten(m);

    if (m.wuenscht) {
      const farbe = FARBEN[Math.floor(Math.random() * 4)];
      d.send({ t: "wunsch", farbe });
      await bis(() => A.runde.wunsch === farbe, "Farbe gewünscht");
      muss(A.runde.amZug !== d.you, "Nach dem Wunsch ist derselbe noch dran");
      gesehen.bube = true;
      continue;
    }

    // Sonderkarten zuerst – so kommen sie in jeder Partie eher vor.
    const rang = (k) => ({ "7": 0, "8": 1, "B": 2 })[k.r] ?? 3;
    let i = -1;
    for (let j = 0; j < m.hand.length; j++) {
      if (!m.spielbar[j]) continue;
      if (i < 0 || rang(m.hand[j]) < rang(m.hand[i])) i = j;
    }

    if (i < 0) {
      // Nichts spielbar: ziehen. Bei offener Strafe kommen alle auf einmal.
      const vorher = m.hand.length, strafe = m.strafe;
      d.send({ t: "ziehen" });
      await bis(() => A.runde.amZug !== d.you || d.runde.hand.length !== vorher || A.final,
        `${d.name} zieht`);
      if (A.final) break;
      gesehen.gezogen = true;
      if (strafe > 0) {
        muss(d.runde.hand.length === vorher + strafe || d.runde.talon === 0,
          `${d.name} müsste ${strafe} ziehen, hat aber ${d.runde.hand.length - vorher} gezogen`);
        muss(A.runde.strafe === 0, "Die Strafe steht nach dem Ziehen noch offen");
      }
      if (A.runde.talon > talonVorher) nachgemischt = true;
      talonVorher = A.runde.talon;
      continue;
    }

    const k = m.hand[i];
    const w = wirkung(k, m.regeln);
    const strafeVorher = m.strafe;
    const letzte = m.hand.length === 2;      // danach bleibt genau eine übrig
    // Mau wird angesagt – bis auf einmal, damit auch das Vergessen drankommt.
    const sagtMau = !letzte || gesehen.mauVergessen;
    d.send({ t: "legen", i, mau: sagtMau });
    await bis(() => karte(A.runde?.oben ?? {}) === karte(k) || A.final, `${d.name} legt ${karte(k)}`);
    if (A.final) break;

    if (w.strafePlus) {
      gesehen.sieben = true;
      muss(A.runde.strafe === strafeVorher + 2,
        `Nach der Sieben steht die Strafe bei ${A.runde.strafe} statt ${strafeVorher + 2}`);
    }
    if (w.ueberspringen) {
      gesehen.acht = true;
      const reihe = A.runde.spieler.map((s) => s.id);
      const von = reihe.indexOf(d.you);
      // Nur pruefbar, solange der Leger selbst noch in der Reihe steht.
      if (von >= 0) {
        muss(A.runde.amZug === reihe[(von + 2) % reihe.length],
          "Die Acht hat niemanden übersprungen");
      }
    }
    if (w.wuenscht) muss(d.runde.wuenscht, "Nach dem Buben darf derselbe die Farbe wünschen");

    if (letzte) {
      if (sagtMau) {
        gesehen.mauAngesagt = true;
        muss(d.runde.hand.length === 1, "Nach dem angesagten Mau ist die Hand nicht bei eins");
        muss(A.runde.spieler.find((s) => s.id === d.you)?.mau, "Das Mau steht bei niemandem");
      } else {
        gesehen.mauVergessen = true;
        muss(d.runde.hand.length === 3,
          `Mau vergessen müsste zwei Strafkarten geben, die Hand ist bei ${d.runde.hand.length}`);
        console.log(`    ${d.name} hat Mau vergessen – zwei Karten`);
      }
    }
  }

  muss(A.final, "Die Partie ist nach 400 Zügen nicht fertig geworden");
  const f = A.final;
  muss(f.tabelle.length === 3, "Im Endstand fehlt jemand");
  muss(/Platz 1/.test(f.tabelle[0].wert), "Ganz oben steht nicht der Erste");
  console.log(`Partie ${nr}: ${f.untertitel} · ` +
    f.tabelle.map((z) => `${z.name} ${z.wert}`).join(" · "));

  A.send({ t: "again" });
  await bis(() => A.room.phase === "lobby", "zurück im Warteraum");
  muss(alleC.every((c) => c.room.players.every((p) => !p.ready)), "Bereit blieb stehen");
  for (const c of [B, C]) c.send({ t: "ready", value: true });
  await bis(() => A.room.players.every((p) => p.ready || p.host), "wieder alle bereit");
}

const fehlt = () => Object.entries(gesehen).filter(([, v]) => !v).map(([k]) => k);

let partie = 0;
while (partie < 8 && fehlt().length) {
  partie++;
  await spielePartie(partie);
}
muss(!fehlt().length, `Nach ${partie} Partien kam nie vor: ${fehlt().join(", ")}`);
console.log(`ok  in ${partie} Partien kam alles vor: Sieben, Acht, Bube, Mau, ` +
  "Mau vergessen, Ziehen");
console.log(nachgemischt
  ? "ok  der Talon ging einmal leer und wurde aus der Ablage nachgemischt"
  : "    (der Talon ging in keiner Partie leer – nachgemischt wurde oben ohne Server geprüft)");
console.log("ok  Hände + Talon + Ablage waren in jedem Zug 32 Karten");
console.log("ok  der Server hielt sich in jedem Zug an regeln.js");

// --- Abgang mitten im Zug ---------------------------------------------------

A.send({ t: "start" });
await bis(() => alleC.every((c) => c.runde && !c.final), "letzte Partie läuft");
const geht = amZug();
const bleibt = alleC.filter((c) => c !== geht);
geht.send({ t: "leave" });
await bis(() => bleibt[0].runde.spieler.length === 2 || bleibt[0].final, "einer ist raus");
muss(!bleibt[0].final, "Bei zwei Übriggebliebenen ist noch nicht Schluss");
muss(bleibt[0].runde.amZug !== geht.you, `Der Zug hängt an ${geht.name} – weg, aber noch dran`);
console.log(`ok  ${geht.name} geht mitten im eigenen Zug – die Runde läuft weiter`);

bleibt[1].send({ t: "leave" });
await bis(() => bleibt[0].final, "unter zwei Leuten ist Schluss");
console.log("ok  unter zwei Leuten endet die Partie von allein");

if (alleC.some((c) => c.fehler.length)) {
  throw new Error("Fehlermeldungen: " + JSON.stringify(alleC.map((c) => c.fehler)));
}
console.log("\nALLES GRÜN");
Deno.exit(0);
