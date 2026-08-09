// MAU-MAU – Client. Was spielbar ist, entscheidet der Server und schickt es
// als Maske mit; hier wird nichts nachgerechnet.
import { $, el, S, schicke, starteSchale, zeige } from "./schale.js";

const HILFE = [
  "<b>Fünf Karten</b> bekommt jeder. Wer zuerst keine mehr hat, gewinnt.",
  "<b>Bedienen:</b> Farbe oder Zahl der obersten Karte. Passt nichts, ziehst du eine.",
  "<b>Sieben:</b> der Nächste zieht zwei – außer er legt selbst eine Sieben drauf, dann zieht der Übernächste vier.",
  "<b>Acht:</b> der Nächste setzt aus.",
  "<b>Bube:</b> darf immer gelegt werden und wünscht sich eine Farbe.",
  "<b>Mau!</b> Wenn du auf eine Karte kommst, musst du es ansagen – der Knopf leuchtet. Vergessen kostet zwei Karten.",
  "<b>Welche Sonderregeln gelten</b>, stellt der Host vor dem Start ein.",
];

let mauGedrueckt = false;

const rot = (k) => k.f === "♥" || k.f === "♦";

function zeichneSpiel(m) {
  zeige("game");
  $("tbLinks").innerHTML = `Talon <strong>${m.talon}</strong>`;
  $("tbTag").textContent = m.strafe ? `${m.strafe} ziehen!` : m.wunsch ? "Wunsch " + m.wunsch : "Mau-Mau";

  const b = $("buehne");
  b.innerHTML = "";

  const tisch = el("div", "tisch");
  for (const p of m.spieler) {
    const d = el("div", "mp" + (p.id === m.amZug ? " zug" : "") + (p.weg ? " off" : ""));
    d.append(el("span", "mp-nm", p.name));
    d.append(el("span", "mp-kt", `${p.karten} 🂠${p.mau ? " · Mau!" : ""}`));
    tisch.append(d);
  }
  b.append(tisch);

  const mitte = el("div", "mmitte");
  const k = m.oben;
  mitte.append(el("div", "karte gross" + (rot(k) ? " rot" : ""), `${k.r}${k.f}`));
  if (m.wunsch) mitte.append(el("div", "wunschzeichen", m.wunsch));
  b.append(mitte);
  if (m.meldung) b.append(el("p", "meldung", m.meldung));

  const binDran = m.amZug === S.me;

  // Farbwunsch nach einem Buben
  if (m.wuenscht) {
    const w = el("div", "farbwahl");
    for (const f of ["♠", "♥", "♦", "♣"]) {
      const btn = el("button", "karte gross" + (f === "♥" || f === "♦" ? " rot" : ""), f);
      btn.onclick = () => schicke({ t: "wunsch", farbe: f });
      w.append(btn);
    }
    b.append(el("p", "auf-kopf", "Welche Farbe wünschst du dir?"));
    b.append(w);
  }

  const hb = el("div", "handbereich");
  m.hand.forEach((k, i) => {
    const c = el("button", "karte hand" + (rot(k) ? " rot" : "") + (m.spielbar[i] ? "" : " matt"),
      `${k.r}${k.f}`);
    c.disabled = !binDran || !m.spielbar[i] || m.wuenscht;
    c.onclick = () => {
      schicke({ t: "legen", i, mau: mauGedrueckt });
      mauGedrueckt = false;
    };
    hb.append(c);
  });
  b.append(hb);

  const akt = $("aktionen");
  akt.innerHTML = "";
  if (binDran && !m.wuenscht) {
    const z = el("button", "btn big", m.strafe ? `${m.strafe} ziehen` : "Karte ziehen");
    z.onclick = () => schicke({ t: "ziehen" });
    akt.append(z);
    if (m.hand.length === 2) {
      const mau = el("button", "btn big mau" + (mauGedrueckt ? " on" : ""), "Mau!");
      mau.onclick = () => { mauGedrueckt = !mauGedrueckt; zeichneSpiel(m); };
      akt.append(mau);
    }
  }
  $("rundenHint").textContent = binDran
    ? (m.wuenscht ? "Farbe wählen." : "Du bist dran.")
    : `${m.spieler.find((p) => p.id === m.amZug)?.name ?? "Jemand"} ist dran.`;
}

$("helpList").innerHTML = HILFE.map((h) => `<li>${h}</li>`).join("");

const extra = $("hostExtra");
extra.innerHTML = ["sieben", "acht", "bube"].map((r) => `
  <div class="setting"><span class="setting-label">${
  { sieben: "Sieben zieht zwei", acht: "Acht setzt aus", bube: "Bube wünscht" }[r]
}</span>
    <div class="segmented">
      <button class="seg" data-r="${r}" data-v="1">an</button>
      <button class="seg" data-r="${r}" data-v="0">aus</button>
    </div></div>`).join("");
for (const b of extra.querySelectorAll("[data-r]")) {
  b.onclick = () => schicke({ t: "settings", [b.dataset.r]: b.dataset.v === "1" });
}

starteSchale({
  key: "maumau",
  zeichneSpiel,
  zeichneRaum: (r) => {
    for (const b of extra.querySelectorAll("[data-r]")) {
      b.classList.toggle("sel", (b.dataset.v === "1") === !!r.settings[b.dataset.r]);
    }
  },
});
