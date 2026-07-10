// MonkeyType-style word pools. The server is authoritative for race text, so it
// generates the passage and sends the same string to both players in a match.

const EN_WORDS = [
  "the", "be", "of", "and", "a", "to", "in", "he", "have", "it",
  "that", "for", "they", "with", "as", "not", "on", "she", "at", "by",
  "this", "we", "you", "do", "but", "from", "or", "which", "one", "would",
  "all", "will", "there", "say", "who", "make", "when", "can", "more", "if",
  "no", "man", "out", "other", "so", "what", "time", "up", "go", "about",
  "than", "into", "could", "state", "only", "new", "year", "some", "take", "come",
  "these", "know", "see", "use", "get", "like", "then", "first", "any", "work",
  "now", "may", "such", "give", "over", "think", "most", "even", "find", "day",
  "also", "after", "way", "many", "must", "look", "before", "great", "back", "through",
  "long", "where", "much", "should", "well", "people", "down", "own", "just", "because",
];

// Common Uzbek (latin) words — chosen without apostrophe letters (oʻ/gʻ) so
// they can be typed on any keyboard layout.
const UZ_WORDS = [
  "va", "bu", "men", "sen", "biz", "siz", "ular", "ham", "lekin", "yoki",
  "agar", "chunki", "uchun", "bilan", "kabi", "yana", "endi", "hozir", "keyin", "oldin",
  "bugun", "ertaga", "kecha", "kun", "tun", "yil", "oy", "hafta", "soat", "vaqt",
  "yaxshi", "yomon", "katta", "kichik", "yangi", "eski", "tez", "sekin", "issiq", "sovuq",
  "oq", "qora", "qizil", "sariq", "yashil", "suv", "non", "osh", "choy", "uy",
  "eshik", "deraza", "stol", "kitob", "daftar", "qalam", "maktab", "dars", "bola", "qiz",
  "odam", "inson", "ota", "ona", "aka", "uka", "opa", "singil", "oila", "mehmon",
  "ish", "pul", "bozor", "narx", "arzon", "qimmat", "shahar", "qishloq", "dengiz", "daryo",
  "osmon", "quyosh", "yulduz", "qor", "shamol", "havo", "daraxt", "gul", "barg", "meva",
  "olma", "uzum", "anor", "bahor", "yoz", "kuz", "qish", "hayvon", "qush", "baliq",
  "ot", "sigir", "qoy", "it", "mushuk", "kel", "ket", "bor", "yur", "tur",
  "yot", "yugur", "ayt", "eshit", "bil", "ol", "ber", "och", "yop", "boshla",
  "tugat", "savol", "javob", "gap", "til", "xona", "kalit", "doim", "hamma", "narsa",
  "joy", "birga", "muhim", "oson", "qiyin", "toza", "chiroyli",
];

export function generateText(count = 25, lang = "en") {
  const pool = lang === "uz" ? UZ_WORDS : EN_WORDS;
  const words = [];
  for (let i = 0; i < count; i++) {
    words.push(pool[Math.floor(Math.random() * pool.length)]);
  }
  return words.join(" ");
}
