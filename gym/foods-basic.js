// Grundnahrungsmittel: immer da, auch offline und wenn Open Food Facts nicht antwortet.
// Richtwerte pro 100 g (Getränke pro 100 ml), gerundet nach gängigen Nährwerttabellen.
// Format: 'Name | Suchbegriffe | kcal Eiweiß KH Fett | Portion | Einheit'
// Fehlt etwas? Einfach eine Zeile ergänzen.

const RAW = [
  // Brot, Getreide, Beilagen
  'Toastbrot (Weizen) | toast, weißbrot, sandwich | 265 8 48 4 | 25',
  'Vollkorntoast | toast vollkorn | 250 9 42 4.5 | 25',
  'Vollkornbrot | brot, schwarzbrot, roggen | 205 7 38 1.5 | 50',
  'Brötchen | semmel, weck, schrippe | 270 9 54 1.5 | 55',
  'Baguette | weißbrot, ciabatta | 260 9 52 1.5 | 60',
  'Haferflocken | oats, porridge, hafer | 370 13.5 59 7 | 50',
  'Müsli (ungesüßt) | muesli, granola | 365 10 62 6 | 50',
  'Cornflakes | cerealien | 375 7 84 1 | 30',
  'Reis, gekocht | rice, reis | 130 2.7 28 0.3 | 200',
  'Reis, roh | rice, reis trocken | 350 7 78 0.6 | 80',
  'Nudeln, gekocht | pasta, spaghetti, nudeln | 150 5.5 30 0.9 | 200',
  'Nudeln, roh | pasta trocken, spaghetti | 355 12.5 71 1.5 | 100',
  'Kartoffeln, gekocht | potato, kartoffel | 72 2 15.5 0.1 | 200',
  'Süßkartoffel, gekocht | sweet potato | 86 1.6 20 0.1 | 200',
  'Pommes frites | fries, pommes | 290 3.4 36 15 | 150',
  'Wrap (Tortilla) | tortilla, wrap | 300 8 50 7 | 60',
  // Fleisch, Fisch, Eier
  'Hähnchenbrust, roh | chicken, huhn, hähnchen | 110 23 0 1.5 | 150',
  'Hähnchenbrust, gebraten | chicken, huhn, hähnchen | 165 31 0 3.6 | 150',
  'Putenbrust | pute, truthahn, turkey | 105 24 0 1 | 150',
  'Rinderhackfleisch | hack, hackfleisch, ground beef | 250 17 0 20 | 125',
  'Rindersteak, gebraten | steak, rind, beef | 185 29 0 7.5 | 200',
  'Schweinefleisch, mager | schwein, pork, schnitzel | 125 21 0 4 | 150',
  'Lachs | salmon, fisch | 200 20 0 13 | 125',
  'Thunfisch (Dose, in Wasser) | tuna, thunfisch | 110 25 0 1 | 130',
  'Ei | eier, egg, hühnerei, spiegelei, rührei | 155 13 1 11 | 60',
  'Eiklar | eiweiß, egg white | 50 11 0.7 0.2 | 33',
  'Bacon | speck | 400 13 1 38 | 20',
  'Schinken (gekocht) | kochschinken, ham | 110 19 1 3.5 | 30',
  // Milchprodukte
  'Magerquark | quark, protein | 67 12 4 0.3 | 250',
  'Skyr | skyr natur | 63 11 4 0.2 | 150',
  'Griechischer Joghurt (10 %) | greek yogurt, joghurt | 130 6 4 10 | 150',
  'Naturjoghurt (3,5 %) | joghurt, yogurt | 65 3.5 4.5 3.5 | 150',
  'Milch (3,5 %) | milk, vollmilch | 64 3.3 4.8 3.5 | 250 | ml',
  'Milch (1,5 %) | milk, fettarm | 47 3.4 4.9 1.5 | 250 | ml',
  'Hüttenkäse | cottage cheese, körniger frischkäse | 100 12 3 4.5 | 200',
  'Gouda | käse, cheese | 360 25 0 28 | 30',
  'Mozzarella | käse, cheese | 255 18 1 19.5 | 125',
  'Feta | käse, schafskäse | 265 17 0.5 21 | 50',
  'Butter | butter | 740 0.7 0.6 83 | 10',
  // Fette, Aufstriche
  'Olivenöl | öl, oil | 885 0 0 100 | 10',
  'Erdnussbutter | peanut butter | 600 25 13 50 | 15',
  'Nuss-Nougat-Creme | nutella, schokocreme | 540 6 57 31 | 15',
  'Honig | honey | 305 0.4 76 0 | 20',
  'Marmelade | konfitüre, jam | 250 0.4 60 0.1 | 20',
  // Obst, Gemüse, Hülsenfrüchte, Nüsse
  'Banane | banana | 95 1.1 21 0.3 | 120',
  'Apfel | apple | 54 0.3 11.5 0.4 | 150',
  'Orange | apfelsine, orange | 47 1 9 0.2 | 150',
  'Beeren (gemischt) | blaubeeren, himbeeren, erdbeeren, berries | 45 1 8 0.4 | 100',
  'Weintrauben | trauben, grapes | 70 0.7 16 0.3 | 100',
  'Avocado | avocado | 160 2 4 15 | 80',
  'Tomate | tomato | 18 0.9 3 0.2 | 100',
  'Gurke | cucumber | 15 0.6 2 0.2 | 100',
  'Brokkoli | broccoli | 34 2.8 4 0.4 | 150',
  'Blattsalat | salat, lettuce | 15 1.3 1.5 0.2 | 50',
  'Paprika | pepper | 30 1 5 0.3 | 100',
  'Karotte | möhre, carrot | 36 0.9 7 0.2 | 100',
  'Zwiebel | onion | 40 1.2 8 0.1 | 50',
  'Mais (Dose) | corn | 85 2.9 16 1.2 | 100',
  'Kidneybohnen (Dose) | bohnen, beans | 100 7 14 0.5 | 100',
  'Linsen, gekocht | lentils | 115 9 17 0.4 | 150',
  'Kichererbsen, gekocht | chickpeas | 140 7.5 20 2.6 | 150',
  'Tofu | tofu, dubu | 120 13 1.5 7 | 100',
  'Mandeln | nüsse, almonds | 600 21 6 52 | 30',
  'Walnüsse | nüsse, walnuts | 670 15 7 65 | 30',
  // Sport
  'Whey-Proteinpulver | protein, eiweißpulver, shake | 380 75 8 6 | 30',
  'Proteinriegel | protein bar, riegel | 350 30 35 10 | 50',
  // Fast Food, Snacks, Süßes
  'Pizza Margherita | pizza | 240 10 30 9 | 350',
  'Döner Kebab | döner, kebab | 215 12 21 9 | 350',
  'Cheeseburger | burger | 265 14 28 11 | 120',
  'Vollmilchschokolade | schokolade, chocolate | 535 7 56 31 | 25',
  'Chips | crisps, kartoffelchips | 535 6 52 34 | 30',
  'Gummibärchen | haribo, fruchtgummi | 345 7 77 0.1 | 25',
  // Getränke
  'Cola | coke, softdrink | 42 0 10.6 0 | 330 | ml',
  'Cola Zero | coke zero, light | 0.3 0 0 0 | 330 | ml',
  'Orangensaft | saft, juice | 45 0.7 10 0.2 | 250 | ml',
  'Bier | beer, maekju, 맥주 | 43 0.5 3.1 0 | 500 | ml',
  'Kaffee, schwarz | coffee, americano | 2 0.2 0 0 | 200 | ml',
  'Cappuccino | kaffee, coffee | 40 2.2 3.3 2 | 200 | ml',
  'Latte macchiato | latte, kaffee | 45 2.5 3.5 2.3 | 300 | ml',
  // Koreanisch
  'Kimchi | 김치, kimchi | 25 1.6 3.5 0.5 | 50',
  'Kimbap | 김밥, gimbap, kimbap | 180 5 30 4 | 250',
  'Samgak-Kimbap (Dreieck) | 삼각김밥, onigiri | 170 4.5 34 2 | 110',
  'Bibimbap | 비빔밥 | 120 5 18 3.5 | 500',
  'Bulgogi | 불고기, rind | 210 18 9 11 | 200',
  'Samgyeopsal (gegrillt) | 삼겹살, schweinebauch, pork belly | 450 14 0 44 | 200',
  'Tteokbokki | 떡볶이, reiskuchen | 150 3 32 1.5 | 300',
  'Japchae | 잡채, glasnudeln | 160 3 25 5 | 200',
  'Mandu (gedämpft) | 만두, dumplings, teigtaschen | 200 9 25 7 | 150',
  'Kimchi-Jjigae | 김치찌개, eintopf | 50 4 3 2.5 | 400',
  'Ramyeon (Packung, trocken) | 라면, ramen, instant nudeln | 440 9 65 16 | 120',
  'Bananenmilch | 바나나우유, banana milk | 87 2.9 13 2.7 | 240 | ml',
];

const slug = (s) => s.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

export const BASIC = RAW.map((row) => {
  const [name, alias, vals, serving, unit] = row.split('|').map((s) => s.trim());
  const [kcal, p, c, f] = vals.split(/\s+/).map(Number);
  return { id: 'b-' + slug(name), name, alias, kcal, p, c, f, serving: Number(serving) || null, unit: unit || 'g', src: 'basis' };
});
