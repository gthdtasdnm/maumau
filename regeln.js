// Die Mau-Mau-Regeln – als eigene Datei, damit `probe.js` genau die Funktionen
// prüfen kann, mit denen auch der Server rechnet. Sonst prüft die Probe eine
// Nachbildung, und die kann mit dem Server auseinanderlaufen, ohne dass es
// jemandem auffällt. Dasselbe Muster wie `zug.js` beim Wortleger.
//
// Hier steht nur, was aus Karten Regeln macht. Wer wann dran ist, wer wie viele
// Karten hält und wer gewonnen hat, bleibt im `server.js`.

export const RAENGE = ["7", "8", "9", "10", "B", "D", "K", "A"];
export const FARBEN = ["♠", "♥", "♦", "♣"];

export function mische(list) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

export const neuesDeck = () => mische(FARBEN.flatMap((f) => RAENGE.map((r) => ({ r, f }))));

/** Erst nach Farbe, dann nach Rang – damit die Hand nicht bei jedem Zug hüpft. */
export const sortiere = (hand) =>
  hand.sort((a, b) => a.f.localeCompare(b.f) || RAENGE.indexOf(a.r) - RAENGE.indexOf(b.r));

/**
 * Darf diese Karte auf die Ablage?
 *
 * @param {{r:string, f:string}} k        die Karte
 * @param {object} lage
 * @param {{r:string, f:string}} lage.oben   oberste Karte der Ablage
 * @param {string|null} lage.wunsch          gewünschte Farbe nach einem Buben
 * @param {number} lage.strafe               offene Strafkarten aus Siebenen
 * @param {object} lage.regeln               welche Sonderkarten gelten
 */
export function passt(k, { oben, wunsch, strafe, regeln }) {
  // Ein Bube geht immer – deshalb ist er der Farbwunsch und nicht die Strafe.
  if (regeln.bube && k.r === "B") return true;
  // Ein Farbwunsch schlägt alles andere, auch die Zahl der obersten Karte.
  if (wunsch) return k.f === wunsch;
  // Auf eine offene Sieben kommt nur eine Sieben – oder man zieht.
  if (strafe > 0 && regeln.sieben) return k.r === "7";
  return k.f === oben.f || k.r === oben.r;
}

/**
 * Was löst diese Karte aus? Ausgeschaltete Sonderkarten lösen nichts aus.
 *
 * @returns {{strafePlus:number, ueberspringen:number, wuenscht:boolean}}
 */
export function wirkung(k, regeln) {
  return {
    strafePlus: k.r === "7" && regeln.sieben ? 2 : 0,
    ueberspringen: k.r === "8" && regeln.acht ? 1 : 0,
    wuenscht: k.r === "B" && !!regeln.bube,
  };
}

/**
 * `n` Karten geben.
 *
 * Ist der Talon leer, kommt die Ablage bis auf die oberste Karte zurück und
 * wird gemischt. Sind danach beide leer – alles liegt auf den Händen –, gibt es
 * eben nichts mehr; das ist kein Fehler, sondern das Ende des Vorrats.
 *
 * Gibt neue Stapel zurück und fasst die übergebenen nicht an.
 *
 * @returns {{talon:object[], ablage:object[], gezogen:object[]}}
 */
export function gib(talonAlt, ablageAlt, n) {
  let talon = [...talonAlt], ablage = [...ablageAlt];
  const gezogen = [];
  for (let i = 0; i < n; i++) {
    if (!talon.length) {
      if (ablage.length < 2) break;
      const top = ablage.pop();
      talon = mische(ablage);
      ablage = [top];
    }
    gezogen.push(talon.pop());
  }
  return { talon, ablage, gezogen };
}

/**
 * Taugt die Karte als erste offene Karte?
 *
 * Nein, wenn sie etwas auslöst: sonst müsste vor dem ersten Zug schon jemand
 * ziehen, aussetzen oder eine Farbe wünschen. Ist eine Sonderkarte
 * abgeschaltet, ist sie eine ganz normale Karte und darf oben liegen.
 */
export function taugtAlsStart(k, regeln) {
  const w = wirkung(k, regeln);
  return !w.strafePlus && !w.ueberspringen && !w.wuenscht;
}
