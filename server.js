// MAU-MAU – Deno-Server. Der gemeinfreie Klassiker: Farbe oder Zahl bedienen,
// Sonderkarten als Schalter im Raum. Die Hand liegt nur hier; der Client
// bekommt seine eigene und von den anderen nur die Anzahl.

import { darfRaumOeffnen, raumVermerkt } from "./bremse.js";
import { cleanName, raumverwaltung, shuffle } from "./raum.js";
import { starte } from "./statisch.js";

const PORT = Number(Deno.env.get("PORT") ?? 8066);
const HOST = Deno.env.get("HOST") ?? "0.0.0.0";
const PUBLIC = new URL("./public/", import.meta.url);

const MAX_PLAYERS = 6;
const MIN_PLAYERS = 2;

const RAENGE = ["7", "8", "9", "10", "B", "D", "K", "A"];
const FARBEN = ["♠", "♥", "♦", "♣"];
const STARTHAND = 5;

const neuesDeck = () => shuffle(FARBEN.flatMap((f) => RAENGE.map((r) => ({ r, f }))));

const {
  rooms, browsing,
  createRoom, clearTimers, anwesende,
  send, raw, broadcast,
  roomList, pushState, pushRoomList,
  makePlayer, attach, dropPlayer,
} = raumverwaltung({
  maxPlayers: MAX_PLAYERS,
  minPlayers: MIN_PLAYERS,
  einstellungen: { sieben: true, acht: true, bube: true },
  raumfelder: () => ({
    talon: [], ablage: [], wunsch: null, strafe: 0, amZug: null,
    reihe: [], fertig: [], meldung: null, wuenscht: false,
  }),
  spielerfelder: () => ({ hand: [], mau: false }),

  beimBeitritt: (room) => { if (room.phase === "playing") pushRunde(room); },
  nachVerlassen: (room, player) => {
    if (room.phase === "playing" && room.amZug === player.id) weiterWennWeg(room);
  },
  beimPlatzfrei: (room, id) => {
    if (room.phase !== "playing") return;
    const i = room.reihe.indexOf(id);
    if (i >= 0) room.reihe.splice(i, 1);
    if (room.amZug === id) weiterWennWeg(room);
    if (room.reihe.length < 2) finishGame(room);
    else pushRunde(room);
  },
  zurueckZurLobby: (room) => backToLobby(room),
});

// ---------------------------------------------------------------------------
// Ablauf
// ---------------------------------------------------------------------------

function startGame(room) {
  clearTimers(room);
  room.phase = "playing";
  room.rundeNr = 1;
  room.fertig = [];
  room.wunsch = null;
  room.strafe = 0;
  room.wuenscht = false;
  room.meldung = null;
  room.talon = neuesDeck();
  room.reihe = shuffle(anwesende(room).map((p) => p.id));
  for (const p of room.players.values()) {
    p.hand = [];
    p.mau = false;
    p.punkte = 0;
    p.ready = false;
  }
  for (const id of room.reihe) {
    const p = room.players.get(id);
    for (let i = 0; i < STARTHAND; i++) p.hand.push(room.talon.pop());
    sortiere(p);
  }
  // Die erste offene Karte darf keine Sonderkarte sein – sonst müsste schon
  // vor dem ersten Zug jemand ziehen oder aussetzen.
  let erste = room.talon.pop();
  while (["7", "8", "B"].includes(erste.r)) {
    room.talon.unshift(erste);
    erste = room.talon.pop();
  }
  room.ablage = [erste];
  room.amZug = room.reihe[0];
  pushState(room);
  pushRunde(room);
  pushRoomList();
}

const sortiere = (p) =>
  p.hand.sort((a, b) => a.f.localeCompare(b.f) || RAENGE.indexOf(a.r) - RAENGE.indexOf(b.r));

const oben = (room) => room.ablage[room.ablage.length - 1];

function ziehe(room, p, n) {
  for (let i = 0; i < n; i++) {
    if (!room.talon.length) {
      // Ablage bis auf die oberste Karte zurück in den Talon.
      const top = room.ablage.pop();
      room.talon = shuffle(room.ablage);
      room.ablage = [top];
      if (!room.talon.length) return;
    }
    p.hand.push(room.talon.pop());
  }
  p.mau = false;
  sortiere(p);
}

function naechster(room, von, ueberspringen = 0) {
  if (!room.reihe.length) return null;
  let i = room.reihe.indexOf(von);
  if (i < 0) i = 0;
  return room.reihe[(i + 1 + ueberspringen) % room.reihe.length];
}

function weiterWennWeg(room) {
  const p = room.players.get(room.amZug);
  if (p?.connected) return;
  room.amZug = naechster(room, room.amZug);
  pushRunde(room);
}

/** Passt die Karte auf die Ablage? Ein gewünschter Farbwunsch schlägt alles. */
function passt(room, k) {
  const top = oben(room);
  if (room.settings.bube && k.r === "B") return true;
  if (room.wunsch) return k.f === room.wunsch;
  if (room.strafe > 0 && room.settings.sieben) return k.r === "7";
  return k.f === top.f || k.r === top.r;
}

function pushRunde(room) {
  if (room.phase !== "playing") return;
  const spieler = room.reihe.map((id) => {
    const p = room.players.get(id);
    return {
      id, name: p?.name ?? "?", karten: p?.hand.length ?? 0,
      mau: !!p?.mau, weg: !p?.connected,
    };
  });
  for (const p of room.players.values()) {
    send(p, {
      t: "runde",
      amZug: room.amZug,
      oben: oben(room),
      wunsch: room.wunsch,
      strafe: room.strafe,
      talon: room.talon.length,
      spieler,
      fertig: room.fertig.map((id) => room.players.get(id)?.name ?? "?"),
      hand: p.hand,
      spielbar: p.hand.map((k) => passt(room, k)),
      wuenscht: room.wuenscht && room.amZug === p.id,
      meldung: room.meldung,
      regeln: room.settings,
    });
  }
}

function finishGame(room) {
  clearTimers(room);
  room.phase = "final";
  const tabelle = [
    ...room.fertig.map((id, i) => ({
      name: room.players.get(id)?.name ?? "?", wert: `Platz ${i + 1}`, punkte: 1000 - i,
    })),
    ...room.reihe.map((id) => {
      const p = room.players.get(id);
      const rest = p?.hand.length ?? 0;
      return { name: p?.name ?? "?", wert: `${rest} Karten übrig`, punkte: -rest };
    }).sort((a, b) => b.punkte - a.punkte),
  ];
  for (const p of room.players.values()) p.ready = false;
  broadcast(room, {
    t: "final",
    tabelle,
    untertitel: room.fertig.length
      ? `${room.players.get(room.fertig[0])?.name} war zuerst fertig.`
      : "Abgebrochen",
  });
  pushState(room);
  pushRoomList();
}

function backToLobby(room) {
  clearTimers(room);
  room.phase = "lobby";
  room.rundeNr = 0;
  room.reihe = [];
  room.fertig = [];
  room.talon = [];
  room.ablage = [];
  room.wunsch = null;
  room.strafe = 0;
  room.wuenscht = false;
  room.meldung = null;
  for (const p of room.players.values()) {
    p.ready = false;
    p.hand = [];
    p.mau = false;
    p.punkte = 0;
  }
  pushState(room);
}

// ---------------------------------------------------------------------------
// Nachrichten
// ---------------------------------------------------------------------------

function handle(ws, msg) {
  const room = ws._room;
  const player = ws._player;

  if (msg.t === "ping") return raw(ws, { t: "pong", c: msg.c, s: Date.now() });

  if (msg.t === "browse") {
    if (!ws._room) {
      browsing.add(ws);
      raw(ws, { t: "rooms", rooms: roomList() });
    }
    return;
  }

  if (msg.t === "create") {
    if (room) return;
    if (!darfRaumOeffnen(ws._ip)) {
      return raw(ws, { t: "error", msg: "Zu viele Räume in kurzer Zeit. Warte kurz." });
    }
    raumVermerkt(ws._ip);
    const r = createRoom(msg.isPublic);
    const p = makePlayer(msg.name, true);
    r.hostId = p.id;
    r.players.set(p.id, p);
    attach(ws, r, p);
    pushState(r);
    pushRoomList();
    return;
  }

  if (msg.t === "join") {
    if (room) return;
    const r = rooms.get(String(msg.code ?? "").toUpperCase().trim());
    if (!r) return raw(ws, { t: "error", msg: "Diesen Raum gibt es nicht" });
    if (msg.token) {
      const back = [...r.players.values()].find((p) => p.token === msg.token);
      if (back) {
        if (back.ws && back.ws !== ws && back.ws.readyState === WebSocket.OPEN) {
          try { back.ws.close(4001, "woanders geöffnet"); } catch { /* egal */ }
        }
        attach(ws, r, back);
        pushState(r);
        return;
      }
    }
    if (r.players.size >= MAX_PLAYERS) {
      return raw(ws, { t: "error", msg: `Der Raum ist voll (${MAX_PLAYERS} Spieler)` });
    }
    if (r.phase !== "lobby") return raw(ws, { t: "error", msg: "Die Runde läuft schon" });
    const p = makePlayer(msg.name, false);
    r.players.set(p.id, p);
    attach(ws, r, p);
    pushState(r);
    return;
  }

  if (!room || !player) return;
  room.lastActivity = Date.now();

  switch (msg.t) {
    case "name":
      player.name = cleanName(msg.name);
      pushState(room);
      pushRunde(room);
      break;

    case "ready":
      player.ready = !!msg.value;
      pushState(room);
      break;

    case "settings":
      if (player.id !== room.hostId || room.phase !== "lobby") break;
      for (const k of ["sieben", "acht", "bube"]) {
        if (typeof msg[k] === "boolean") room.settings[k] = msg[k];
      }
      if (typeof msg.isPublic === "boolean") room.isPublic = msg.isPublic;
      pushState(room);
      pushRoomList();
      break;

    case "start": {
      if (player.id !== room.hostId || room.phase !== "lobby") break;
      const da = anwesende(room);
      if (da.length < MIN_PLAYERS) break;
      if (!da.every((p) => p.ready || p.id === room.hostId)) break;
      startGame(room);
      break;
    }

    case "legen": {
      if (room.phase !== "playing" || room.amZug !== player.id || room.wuenscht) break;
      const i = Number(msg.i);
      const k = player.hand[i];
      if (!k || !passt(room, k)) break;

      player.hand.splice(i, 1);
      room.ablage.push(k);
      room.wunsch = null;
      room.meldung = null;

      // Mau vergessen: wer auf eine Karte kommt und nicht ansagt, zieht zwei.
      if (player.hand.length === 1) {
        if (msg.mau) {
          player.mau = true;
          room.meldung = `${player.name} sagt Mau!`;
        } else {
          ziehe(room, player, 2);
          room.meldung = `${player.name} hat Mau vergessen – zwei Karten.`;
        }
      }

      if (!player.hand.length) {
        room.fertig.push(player.id);
        const j = room.reihe.indexOf(player.id);
        if (j >= 0) room.reihe.splice(j, 1);
        room.meldung = `${player.name} ist fertig!`;
        if (room.reihe.length < 2) return finishGame(room);
      }

      // Sonderkarten
      let ueberspringen = 0;
      if (k.r === "7" && room.settings.sieben) room.strafe += 2;
      if (k.r === "8" && room.settings.acht) ueberspringen = 1;
      if (k.r === "B" && room.settings.bube) {
        room.wuenscht = true;   // derselbe Spieler sagt jetzt die Farbe an
        pushRunde(room);
        break;
      }
      room.amZug = naechster(room, player.id, ueberspringen);
      pushRunde(room);
      break;
    }

    case "wunsch": {
      if (room.amZug !== player.id || !room.wuenscht) break;
      if (!FARBEN.includes(msg.farbe)) break;
      room.wunsch = msg.farbe;
      room.wuenscht = false;
      room.meldung = `${player.name} wünscht sich ${msg.farbe}`;
      room.amZug = naechster(room, player.id);
      pushRunde(room);
      break;
    }

    case "ziehen": {
      if (room.phase !== "playing" || room.amZug !== player.id || room.wuenscht) break;
      if (room.strafe > 0) {
        ziehe(room, player, room.strafe);
        room.meldung = `${player.name} zieht ${room.strafe}.`;
        room.strafe = 0;
      } else {
        ziehe(room, player, 1);
        room.meldung = null;
      }
      room.amZug = naechster(room, player.id);
      pushRunde(room);
      break;
    }

    case "ende":
      if (player.id !== room.hostId || room.phase !== "playing") break;
      finishGame(room);
      break;

    case "again":
      if (player.id !== room.hostId || room.phase !== "final") break;
      backToLobby(room);
      break;

    case "leave":
      dropPlayer(ws, { immediate: true });
      break;
  }
}

starte({ port: PORT, host: HOST, publicDir: PUBLIC, titel: "MAU-MAU", handle, dropPlayer });
