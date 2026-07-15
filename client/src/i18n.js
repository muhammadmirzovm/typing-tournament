import { useSyncExternalStore } from "react";

// Tiny i18n: module-level language + subscriber list. Components call useLang()
// to re-render on switch and t() to translate.

const DICT = {
  en: {
    connected: "connected",
    offline: "offline",
    // Home
    yourName: "Your name",
    namePh: "e.g. Jimmy",
    createRoom: "Create room",
    orJoin: "or join with a key",
    join: "Join",
    enterName: "Enter your name first.",
    enterKey: "Enter a join key.",
    createFail: "Could not create room.",
    joinFail: "Could not join room.",
    // Lobby
    joinKey: "Join key",
    copyInvite: "Copy invite link",
    copied: "copied!",
    players: "Players",
    host: "host",
    you: "you",
    start: "Start tournament",
    needPlayers: "Need at least 2 players",
    waitingHost: "Waiting for the host to start…",
    leave: "Leave",
    textLength: "Text length",
    words: "words",
    wordLang: "Word language",
    langEn: "English",
    langUz: "Uzbek",
    chatPh: "Message…",
    send: "Send",
    // Race
    youWonMatch: "✅ You won this match!",
    youLostMatch: "You lost this match",
    cont: "Continue →",
    finalGame: "FINAL — game {0} · score {1}:{2}",
    rejoined: "Rejoined the race — keep typing!",
    fixErrors: "There's a mistake behind — press Backspace and fix the red spot to finish",
    // Standings
    liveNow: "🔴 Live now",
    watch: "👁 Watch",
    stillCompeting: "Still competing",
    finalStandings: "🏆 Final standings",
    placesSoFar: "Places so far",
    noPlaces: "No places decided yet…",
    waitingNext: "⏳ Waiting for your next match — watch the live races below",
    champion: "🏆 You are the champion!",
    finishedAs: "You finished {0}",
    lockedPlace: "Your place: {0} — you can watch the rest",
    racingNow: "You're racing now…",
    newTournament: "New tournament (same players)",
    forPlaces: "for places {0}–{1}",
    forPlace: "for {0}",
    avg: "avg",
    best: "best",
    roundOf: "Round {0} of {1}",
    roundBadge: "Round {0}",
    historyTitle: "Match history",
    roundLabel: "Round {0}",
    byeNote: "bye — no opponent this round",
    woNote: "won by walkover (opponent left)",
    finalGameShort: "Final · game {0}",
    // Spectate
    watching: "👁 Watching",
    stopWatching: "Stop watching",
    backToStandings: "Back to standings",
    won: "won",
    // Errors / version
    outOfSync: "Something went out of sync",
    reloadHint: "A new version may have been deployed. Reload to continue.",
    reload: "Reload",
    newVersion: "A new version is available — please reload.",
    onlineTitle: "users online now",
    joinAs: "How do you want to join?",
    asPlayer: "🎮 Player",
    asSpectator: "👁 Spectator",
    spectators: "Spectators",
    spectatorMode: "👁 You are watching as a spectator",
    accShort: "acc",
    leader: "⚡ leading",
    capsWarn: "⚠️ Caps Lock is ON — your letters will be UPPERCASE",
    bronzeMatch: "3rd-place match",
    eliminatedMsg: "❌ You're out of the bracket — watch the rest live",
    noPodium: "Tournament over — no podium this time",
  },
  uz: {
    connected: "ulandi",
    offline: "aloqa yoʻq",
    // Home
    yourName: "Ismingiz",
    namePh: "masalan: Jasur",
    createRoom: "Xona yaratish",
    orJoin: "yoki kalit bilan qoʻshiling",
    join: "Kirish",
    enterName: "Avval ismingizni kiriting.",
    enterKey: "Kalitni kiriting.",
    createFail: "Xona yaratib boʻlmadi.",
    joinFail: "Xonaga kirib boʻlmadi.",
    // Lobby
    joinKey: "Kalit",
    copyInvite: "Havolani nusxalash",
    copied: "nusxalandi!",
    players: "Oʻyinchilar",
    host: "host",
    you: "siz",
    start: "Turnirni boshlash",
    needPlayers: "Kamida 2 oʻyinchi kerak",
    waitingHost: "Host boshlashini kuting…",
    leave: "Chiqish",
    textLength: "Matn uzunligi",
    words: "soʻz",
    wordLang: "Soʻzlar tili",
    langEn: "Inglizcha",
    langUz: "Oʻzbekcha",
    chatPh: "Xabar…",
    send: "Yuborish",
    // Race
    youWonMatch: "✅ Siz bu oʻyinda yutdingiz!",
    youLostMatch: "Bu oʻyinda yutqazdingiz",
    cont: "Davom etish →",
    finalGame: "FINAL — {0}-oʻyin · hisob {1}:{2}",
    rejoined: "Poygaga qaytdingiz — yozishda davom eting!",
    fixErrors: "Orqada xato bor — Backspace bosib qizil joyni tuzating, shundagina tugaydi",
    // Standings
    liveNow: "🔴 Jonli oʻyinlar",
    watch: "👁 Koʻrish",
    stillCompeting: "Hali oʻynayapti",
    finalStandings: "🏆 Yakuniy natijalar",
    placesSoFar: "Hozirgi oʻrinlar",
    noPlaces: "Oʻrinlar hali aniqlanmagan…",
    waitingNext: "⏳ Keyingi oʻyiningizni kuting — pastdagi jonli oʻyinlarni tomosha qiling",
    champion: "🏆 Siz chempionsiz!",
    finishedAs: "Siz {0}ni egalladingiz",
    lockedPlace: "Oʻrningiz: {0} — qolganini tomosha qilishingiz mumkin",
    racingNow: "Siz hozir oʻynayapsiz…",
    newTournament: "Yangi turnir (oʻsha oʻyinchilar)",
    forPlaces: "{0}–{1}-oʻrinlar uchun",
    forPlace: "{0} uchun",
    avg: "oʻrtacha",
    best: "eng zoʻr",
    roundOf: "Tur: {0} / {1}",
    roundBadge: "{0}-tur",
    historyTitle: "Oʻyinlar tarixi",
    roundLabel: "{0}-tur",
    byeNote: "bye — bu turda raqibsiz oʻtdi",
    woNote: "walkover bilan yutdi (raqib chiqib ketdi)",
    finalGameShort: "Final · {0}-oʻyin",
    // Spectate
    watching: "👁 Tomosha:",
    stopWatching: "Tomoshani toʻxtatish",
    backToStandings: "Natijalarga qaytish",
    won: "yutdi",
    // Errors / version
    outOfSync: "Nimadir mos kelmadi",
    reloadHint: "Yangi versiya chiqqan boʻlishi mumkin. Sahifani yangilang.",
    reload: "Yangilash",
    newVersion: "Yangi versiya chiqdi — sahifani yangilang.",
    onlineTitle: "hozir onlayn foydalanuvchilar",
    joinAs: "Qanday kirmoqchisiz?",
    asPlayer: "🎮 Oʻyinchi",
    asSpectator: "👁 Tomoshabin",
    spectators: "Tomoshabinlar",
    spectatorMode: "👁 Siz tomoshabin sifatida kuzatyapsiz",
    accShort: "aniqlik",
    leader: "⚡ oldinda",
    capsWarn: "⚠️ Caps Lock yoniq — harflaringiz KATTA chiqadi",
    bronzeMatch: "3-oʻrin uchun oʻyin",
    eliminatedMsg: "❌ Siz yutqazdingiz — qolganini jonli tomosha qiling",
    noPodium: "Turnir tugadi — bu safar sovrinsiz",
  },
};

let lang = localStorage.getItem("tt-lang") || "uz";
const listeners = new Set();

export function t(key, ...args) {
  let s = DICT[lang][key] ?? DICT.en[key] ?? key;
  args.forEach((a, i) => {
    s = s.replace(`{${i}}`, a);
  });
  return s;
}

export function ordinal(n) {
  if (lang === "uz") return `${n}-oʻrin`;
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export function setLang(next) {
  lang = next === "en" ? "en" : "uz";
  localStorage.setItem("tt-lang", lang);
  listeners.forEach((fn) => fn());
}

export function useLang() {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => lang
  );
}
