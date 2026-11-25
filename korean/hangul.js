// Hangul-Starterdeck: alle Buchstaben (Jamo) + die wichtigsten Regeln zum Lesen.
// Reihenfolge = Lernreihenfolge (einfache Vokale → Grundkonsonanten → behauchte → y-Vokale → ä/e → Doppelkonsonanten → Mischvokale → Regeln).
// say = was beim 🔊 gesprochen wird (einzelne Buchstaben spricht die Stimme schlecht, deshalb eine Silbe damit).
// Felder wie bei jeder Karte: ko, rom, de, type, expl, ex { ko, rom, de }

const V = (ko, rom, de, expl, ex, say) => ({ ko, rom, de, type: 'Vokal', expl, ex, say: say || ko });
const C = (ko, rom, de, expl, ex, say) => ({ ko, rom, de, type: 'Konsonant', expl, ex, say });
const R = (ko, rom, de, expl, ex) => ({ ko, rom, de, type: 'Regel', expl, ex, say: ko });
const e = (ko, rom, de) => ({ ko, rom, de });

export const HANGUL_DECK = [
  // --- 1. Einfache Vokale ---
  V('ㅏ', 'a', 'a wie in „Papa“', 'Senkrechter Strich, kleiner Ast nach rechts (nach außen) → offenes „a“. Steht immer rechts vom Konsonanten: 가 = ga.', e('아빠', 'appa', 'Papa'), '아'),
  V('ㅓ', 'eo', 'offenes o wie in „Sonne“', 'Ast nach links (nach innen). Klingt wie ein kurzes, offenes „o“ – Mund weiter auf als bei ㅗ. Häufigster Anfängerfehler: es wie „e-o“ zu sprechen.', e('어머니', 'eomeoni', 'Mutter'), '어'),
  V('ㅗ', 'o', 'o wie in „Boot“', 'Waagerechter Strich, Ast nach oben. Lippen rund und spitz. Steht unter dem Konsonanten: 고 = go.', e('오이', 'oi', 'Gurke'), '오'),
  V('ㅜ', 'u', 'u wie in „gut“', 'Ast nach unten. Lippen rund nach vorne. Merkhilfe: ㅗ zeigt nach oben (o wie „oben“), ㅜ nach unten (u wie „unten“).', e('우유', 'uyu', 'Milch'), '우'),
  V('ㅡ', 'eu', 'ü-artig, aber Lippen breit', 'Nur ein waagerechter Strich – wie ein breiter, lächelnder Mund. Lippen breit ziehen (nicht rund!) und „ü“ sagen. Gibt es im Deutschen nicht.', e('그', 'geu', 'das / jener'), '으'),
  V('ㅣ', 'i', 'i wie in „Kino“', 'Nur ein senkrechter Strich – wie ein stehender Mensch. Klingt wie ein klares „i“.', e('이', 'i', 'zwei · Zahn · dies'), '이'),

  // --- 2. Grundkonsonanten ---
  C('ㄱ', 'g / k', 'giyeok (기역)', 'Zwischen g und k: am Wortanfang eher wie ein weiches k, zwischen Vokalen wie g, am Silbenende wie k (ohne Luft). Form: zeigt die Zunge, die hinten den Gaumen berührt.', e('가방', 'gabang', 'Tasche'), '가'),
  C('ㄴ', 'n', 'nieun (니은)', 'Wie das deutsche n. Form: die Zungenspitze, die oben hinter den Zähnen anliegt.', e('나', 'na', 'ich (locker)'), '나'),
  C('ㄷ', 'd / t', 'digeut (디귿)', 'Zwischen d und t: am Anfang wie ein weiches t, zwischen Vokalen wie d. Form: wie ㄴ mit Deckel – auch hier liegt die Zunge vorne an.', e('다리', 'dari', 'Bein · Brücke'), '다'),
  C('ㄹ', 'r / l', 'rieul (리을)', 'Zwischen Vokalen ein kurz angetipptes r (Zunge tippt einmal oben an, nicht rollen). Am Silbenende ein l. Darum heißt die Stadt „Seoul“ (서울) mit l.', e('라면', 'ramyeon', 'Ramen-Nudeln'), '라'),
  C('ㅁ', 'm', 'mieum (미음)', 'Wie das deutsche m. Merkhilfe: das Quadrat ist ein geschlossener Mund → m.', e('물', 'mul', 'Wasser'), '마'),
  C('ㅂ', 'b / p', 'bieup (비읍)', 'Zwischen b und p: am Anfang wie ein weiches p, zwischen Vokalen wie b, am Ende wie p ohne Luft. Merkhilfe: sieht aus wie ein Becher → b.', e('밥', 'bap', 'Reis · Essen'), '바'),
  C('ㅅ', 's', 'siot (시옷)', 'Wie ein scharfes s. Vor ㅣ und den y-Vokalen klingt es wie „sch“: 시 = schi. Merkhilfe: sieht aus wie ein Zahn → zischendes s.', e('사람', 'saram', 'Mensch'), '사'),
  C('ㅇ', '– / ng', 'ieung (이응)', 'Zwei Rollen: am Silbenanfang stumm (Platzhalter, weil jede Silbe mit einem Konsonanten beginnen muss), am Silbenende „ng“ wie in „Ring“.', e('안녕', 'annyeong', 'Hallo / Tschüss (locker)'), '앙'),
  C('ㅈ', 'j', 'jieut (지읒)', 'Weiches „dsch“ wie in „Job“ oder „Dschungel“, zwischen Vokalen noch weicher.', e('지하철', 'jihacheol', 'U-Bahn'), '자'),
  C('ㅎ', 'h', 'hieut (히읗)', 'Wie das deutsche h. Zwischen Vokalen wird es oft fast verschluckt. Merkhilfe: ein Hut auf einem Kopf → h.', e('한국', 'hanguk', 'Korea'), '하'),

  // --- 3. Behauchte Konsonanten (ein Strich mehr = mehr Luft) ---
  C('ㅋ', 'k', 'kieuk (키읔)', 'Wie ㄱ mit Extra-Strich = kräftiges k mit Luftstoß, wie in „Kaffee“. Halt die Hand vor den Mund: du spürst die Luft.', e('커피', 'keopi', 'Kaffee'), '카'),
  C('ㅌ', 't', 'tieut (티읕)', 'Wie ㄷ mit Extra-Strich = kräftiges t mit Luftstoß, wie in „Tee“.', e('택시', 'taeksi', 'Taxi'), '타'),
  C('ㅍ', 'p', 'pieup (피읖)', 'Kräftiges p mit Luftstoß, wie in „Pizza“. Die behauchte Version von ㅂ.', e('피자', 'pija', 'Pizza'), '파'),
  C('ㅊ', 'ch', 'chieut (치읓)', 'Wie ㅈ mit Strich oben = kräftiges „tsch“ mit Luft, wie in „Tschüss“.', e('차', 'cha', 'Tee · Auto'), '차'),

  // --- 4. y-Vokale (zweiter Ast = y davor) ---
  V('ㅑ', 'ya', 'ja', 'ㅏ mit zwei Ästen. Zweiter Ast = ein „j“ davor: a → ja.', e('야구', 'yagu', 'Baseball'), '야'),
  V('ㅕ', 'yeo', 'jo (offen)', 'ㅓ mit zwei Ästen: offenes o → „jo“ wie in „Joch“.', e('여자', 'yeoja', 'Frau'), '여'),
  V('ㅛ', 'yo', 'jo (geschlossen)', 'ㅗ mit zwei Ästen: o → „jo“. Steckt in der höflichen Endung -요 fast jedes Satzes.', e('요리', 'yori', 'Kochen'), '요'),
  V('ㅠ', 'yu', 'ju', 'ㅜ mit zwei Ästen: u → „ju“.', e('유리', 'yuri', 'Glas'), '유'),

  // --- 5. ä / e ---
  V('ㅐ', 'ae', 'ä wie in „Bär“', 'ㅏ + ㅣ zusammengesetzt. Heute klingen ㅐ und ㅔ fast gleich (wie ein kurzes „e“) – auch Koreaner unterscheiden sie oft nur beim Schreiben.', e('개', 'gae', 'Hund'), '애'),
  V('ㅔ', 'e', 'e wie in „Bett“', 'ㅓ + ㅣ. Klingt praktisch wie ㅐ. Merkhilfe zum Schreiben: bei ㅔ zeigt der Ast nach innen.', e('네', 'ne', 'ja'), '에'),
  V('ㅒ', 'yae', 'jä', 'ㅐ mit zweitem Ast = „j“ davor. Selten.', e('얘기', 'yaegi', 'Gespräch · Geschichte'), '얘'),
  V('ㅖ', 'ye', 'je', 'ㅔ mit zweitem Ast = „je“. Nach Konsonanten oft nur „e“: 시계 klingt wie „schi-ge“.', e('시계', 'sigye', 'Uhr'), '예'),

  // --- 6. Doppelkonsonanten (angespannt, ohne Luft) ---
  C('ㄲ', 'kk', 'ssang-giyeok (쌍기역)', 'Doppeltes ㄱ = angespanntes k: Kehle kurz anspannen, KEINE Luft. Klingt härter als ㄱ, aber ohne Hauch wie bei ㅋ.', e('꼭', 'kkok', 'unbedingt'), '까'),
  C('ㄸ', 'tt', 'ssang-digeut (쌍디귿)', 'Angespanntes t ohne Luft – wie das t in „Stein“.', e('떡', 'tteok', 'Reiskuchen'), '따'),
  C('ㅃ', 'pp', 'ssang-bieup (쌍비읍)', 'Angespanntes p ohne Luft – wie das p in „Spiel“.', e('빵', 'ppang', 'Brot'), '빠'),
  C('ㅆ', 'ss', 'ssang-siot (쌍시옷)', 'Scharfes, angespanntes s. Wichtig im Alltag: 있어요 (isseoyo, „es gibt / ich habe“).', e('싸다', 'ssada', 'billig sein'), '싸'),
  C('ㅉ', 'jj', 'ssang-jieut (쌍지읒)', 'Angespanntes „dsch“/„tz“ ohne Luft.', e('짜다', 'jjada', 'salzig sein'), '짜'),

  // --- 7. Mischvokale (w-Laute) ---
  V('ㅘ', 'wa', 'wa', 'ㅗ + ㅏ schnell hintereinander: o-a → „wa“.', e('과자', 'gwaja', 'Snack · Kekse'), '와'),
  V('ㅙ', 'wae', 'wä', 'ㅗ + ㅐ: o-ä → „wä“.', e('왜', 'wae', 'warum'), '왜'),
  V('ㅚ', 'oe', 'we', 'ㅗ + ㅣ. Sieht nach „oi“ aus, klingt heute aber wie „we“. Fast gleich wie ㅙ und ㅞ.', e('회사', 'hoesa', 'Firma'), '외'),
  V('ㅝ', 'wo', 'wo', 'ㅜ + ㅓ: u-o → „wo“ (offenes o).', e('뭐', 'mwo', 'was'), '워'),
  V('ㅞ', 'we', 'we', 'ㅜ + ㅔ → „we“. Selten.', e('웨이터', 'weiteo', 'Kellner'), '웨'),
  V('ㅟ', 'wi', 'wi', 'ㅜ + ㅣ → „wi“.', e('귀', 'gwi', 'Ohr'), '위'),
  V('ㅢ', 'ui', 'ɯi (ü-i)', 'ㅡ + ㅣ. Am Wortanfang „ü-i“ mit breiten Lippen, nach Konsonanten meist nur „i“, als Besitz-Partikel 의 meist „e“.', e('의사', 'uisa', 'Arzt'), '의'),

  // --- 8. Regeln zum Lesen ---
  R('가', 'ga', 'Silbenblock: Konsonant + Vokal', 'Hangul schreibt man in Silbenblöcken. Senkrechte Vokale (ㅏ ㅓ ㅣ ㅐ …) stehen RECHTS vom Konsonanten: ㄱ + ㅏ = 가.', e('가다', 'gada', 'gehen')),
  R('고', 'go', 'Silbenblock: Vokal darunter', 'Waagerechte Vokale (ㅗ ㅜ ㅡ ㅛ ㅠ) stehen UNTER dem Konsonanten: ㄱ + ㅗ = 고.', e('고기', 'gogi', 'Fleisch')),
  R('아', 'a', 'stummes ㅇ am Anfang', 'Jede Silbe beginnt mit einem Konsonanten. Fängt sie mit einem Vokal an, steht ein stummes ㅇ davor: ㅇ + ㅏ = 아.', e('아이', 'ai', 'Kind')),
  R('한', 'han', 'Batchim (Schlusskonsonant)', 'Ein Konsonant ganz unten im Block heißt 받침 (batchim) und wird am Ende gesprochen: ㅎ + ㅏ + ㄴ = 한.', e('한국어', 'hangugeo', 'Koreanisch (Sprache)')),
  R('꽃', 'kkot', 'nur 7 Endlaute', 'Am Silbenende gibt es nur 7 Laute: k, n, t, l, m, p, ng. Viele Buchstaben klingen dort wie t – ㅅ, ㅈ, ㅊ, ㅌ, ㅎ: 꽃 (Blume) = „kkot“.', e('옷', 'ot', 'Kleidung')),
  R('음악', 'eumak', 'Verbinden (연음)', 'Folgt auf einen Schlusskonsonanten eine Silbe mit stummem ㅇ, rutscht er hinüber: 음악 klingt wie „eu-mak“. Darum klingt 맛있어요 wie „ma-si-sseo-yo“.', e('맛있어요', 'masisseoyo', 'Das ist lecker')),
];
