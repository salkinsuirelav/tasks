// Übungsbibliothek: Vorschläge in der Übungsauswahl, nach Muskelgruppe.
// Format: 'Name | englische/andere Suchbegriffe (durch Komma getrennt)'
// Fehlt etwas? Einfach eine Zeile ergänzen – oder in der App über die Suche „neu anlegen“.

const RAW = {
  'Brust': [
    'Bankdrücken | bench press, flachbank, langhantel bankdrücken',
    'Kurzhantel-Bankdrücken | dumbbell bench press, db bench',
    'Schrägbankdrücken | incline bench press, schrägbank langhantel',
    'Kurzhantel-Schrägbankdrücken | incline dumbbell press, schrägbank kurzhantel',
    'Negativbankdrücken | decline bench press',
    'Bankdrücken an der Multipresse | smith machine bench press, smith',
    'Schrägbankdrücken an der Multipresse | smith machine incline press',
    'Brustpresse | chest press machine, maschine',
    'Schrägbank-Brustpresse | incline chest press machine',
    'Butterfly | pec deck, butterfly maschine, fly machine',
    'Kurzhantel-Fliegende | dumbbell fly, flys, fliegende',
    'Schrägbank-Fliegende | incline dumbbell fly',
    'Kabelzug-Crossover | cable crossover, cable fly, kabel fliegende',
    'Kabelzug-Fliegende von unten | low to high cable fly',
    'Liegestütze | push ups, pushups',
    'Dips | dips, barrenstütz',
    'Dips an der Maschine | assisted dips, dip machine',
    'Pullover | dumbbell pullover, überzüge',
  ],
  'Rücken': [
    'Kreuzheben | deadlift, conventional deadlift',
    'Sumo-Kreuzheben | sumo deadlift',
    'Klimmzüge | pull ups, pullups',
    'Klimmzüge im Untergriff | chin ups, chinups',
    'Klimmzüge mit Unterstützung | assisted pull ups, gravitron',
    'Latzug | lat pulldown, latziehen',
    'Latzug eng | close grip lat pulldown, v-griff',
    'Latzug im Untergriff | reverse grip lat pulldown',
    'Latzug einarmig | single arm lat pulldown',
    'Langhantelrudern | barbell row, bent over row',
    'Kurzhantelrudern einarmig | one arm dumbbell row, kh rudern',
    'Rudern am Kabel sitzend | seated cable row, kabelrudern',
    'Rudermaschine | seated row machine, rudern maschine',
    'T-Bar-Rudern | t bar row',
    'Brustgestütztes Rudern | chest supported row, incline dumbbell row',
    'Pendlay-Rudern | pendlay row',
    'Überzüge am Kabel | straight arm pulldown, lat pushdown, pullover kabel',
    'Hyperextensions | back extension, rückenstrecker',
    'Rückenstrecker an der Maschine | back extension machine, lower back',
    'Good Mornings | good morning',
    'Shrugs mit Kurzhanteln | dumbbell shrugs, schulterheben',
    'Shrugs mit Langhantel | barbell shrugs',
    'Rack Pulls | rack pull, teilkreuzheben',
  ],
  'Schultern': [
    'Schulterdrücken | overhead press, ohp, military press, langhantel',
    'Kurzhantel-Schulterdrücken | dumbbell shoulder press, seated',
    'Schulterpresse | shoulder press machine, maschine',
    'Arnold Press | arnold',
    'Seitheben | lateral raise, seitheben kurzhantel',
    'Seitheben am Kabel | cable lateral raise',
    'Seitheben an der Maschine | lateral raise machine',
    'Frontheben | front raise',
    'Reverse Butterfly | reverse pec deck, rear delt fly, reverse fly',
    'Vorgebeugtes Seitheben | bent over lateral raise, rear delt raise',
    'Face Pulls | facepull, face pull',
    'Aufrechtes Rudern | upright row',
    'Schulterdrücken an der Multipresse | smith machine shoulder press',
  ],
  'Bizeps': [
    'Bizepscurls | dumbbell curl, kurzhantel curls, biceps curl',
    'Langhantelcurls | barbell curl',
    'SZ-Curls | ez bar curl, sz stange',
    'Hammercurls | hammer curl',
    'Konzentrationscurls | concentration curl',
    'Scottcurls | preacher curl, larry scott',
    'Scottcurls an der Maschine | preacher curl machine, bizepsmaschine',
    'Kabelcurls | cable curl, bizeps kabel',
    'Schrägbankcurls | incline dumbbell curl',
    'Spider Curls | spider curl',
    'Reverse Curls | reverse curl, obergriff curls',
    'Bayesian Curls | bayesian cable curl',
  ],
  'Trizeps': [
    'Trizepsdrücken | triceps pushdown, kabel, seil, rope pushdown',
    'Trizepsdrücken mit Stange | bar pushdown, straight bar',
    'Trizepsdrücken einarmig | single arm pushdown',
    'French Press | skull crusher, sz french press, stirndrücken',
    'Überkopf-Trizepsdrücken am Kabel | overhead cable extension, overhead triceps',
    'Überkopf-Trizepsdrücken Kurzhantel | overhead dumbbell extension',
    'Enges Bankdrücken | close grip bench press',
    'Trizeps-Kickbacks | kickback',
    'Trizepsmaschine | triceps machine, dip machine',
    'Bankdips | bench dips',
  ],
  'Beine': [
    'Kniebeuge | squat, back squat, langhantel kniebeuge',
    'Frontkniebeuge | front squat',
    'Goblet Squat | goblet squat, kurzhantel kniebeuge',
    'Kniebeuge an der Multipresse | smith machine squat',
    'Hackenschmidt | hack squat',
    'Beinpresse | leg press',
    'Beinpresse einbeinig | single leg press',
    'Beinstrecker | leg extension, quadrizeps',
    'Beinbeuger sitzend | seated leg curl, leg curl sitzend, lackcurl',
    'Beinbeuger liegend | lying leg curl, leg curl liegend',
    'Beinbeuger stehend | standing leg curl',
    'Rumänisches Kreuzheben | romanian deadlift, rdl',
    'Kreuzheben mit gestreckten Beinen | stiff leg deadlift, sldl',
    'Ausfallschritte | lunges, walking lunges',
    'Bulgarian Split Squats | bulgarian split squat, bulgarische kniebeuge',
    'Step-ups | step up, aufsteigen',
    'Pendulum Squat | pendulum',
    'Belt Squat | belt squat',
    'Sissy Squat | sissy squat',
    'Nordic Curls | nordic hamstring curl',
  ],
  'Po & Hüfte': [
    'Hip Thrust | hip thrust, langhantel hip thrust',
    'Hip Thrust an der Maschine | hip thrust machine',
    'Glute Bridge | glute bridge, beckenheben',
    'Abduktoren | hip abduction, abduktion maschine, abductor',
    'Adduktoren | hip adduction, adduktion maschine, adductor',
    'Kickbacks am Kabel | cable glute kickback',
    'Glute-Kickback-Maschine | glute kickback machine',
    'Cable Pull Through | pull through',
  ],
  'Waden': [
    'Wadenheben stehend | standing calf raise, wadenheben',
    'Wadenheben sitzend | seated calf raise',
    'Wadenheben an der Beinpresse | calf press, leg press calf raise',
    'Wadenheben einbeinig | single leg calf raise',
  ],
  'Bauch & Core': [
    'Crunches | crunch',
    'Kabel-Crunches | cable crunch, kniender crunch',
    'Bauchmaschine | ab crunch machine',
    'Hängendes Beinheben | hanging leg raise',
    'Knieheben am Dip-Barren | captains chair, knee raise',
    'Beinheben liegend | lying leg raise',
    'Plank | plank, unterarmstütz',
    'Seitstütz | side plank',
    'Russian Twists | russian twist',
    'Ab Wheel | ab rollout, bauchroller',
    'Sit-ups | situps',
    'Woodchopper am Kabel | woodchop, holzhacker',
    'Pallof Press | pallof',
  ],
  'Unterarme': [
    'Unterarmcurls | wrist curl, handgelenkcurls',
    'Reverse Wrist Curls | reverse wrist curl',
    "Farmer's Walk | farmers walk, farmer carry",
    'Dead Hang | dead hang, hängen',
  ],
  'Cardio': [
    'Laufband | treadmill, laufen, cardio',
    'Crosstrainer | elliptical, cardio',
    'Fahrrad-Ergometer | bike, stationary bike, cardio',
    'Rudergerät | rowing machine, erg, cardio',
    'Stepper | stairmaster, treppen, cardio',
    'Seilspringen | jump rope, cardio',
  ],
  'Ganzkörper': [
    'Kettlebell Swings | kettlebell swing, kb swing',
    'Burpees | burpee',
    'Sled Push | schlitten, sled',
    'Thrusters | thruster',
    'Clean & Press | clean and press, umsetzen und drücken',
  ],
};

export const LIBRARY = Object.entries(RAW).flatMap(([group, rows]) => rows.map((row) => {
  const [name, alias = ''] = row.split('|').map((s) => s.trim());
  return { name, group, alias };
}));
export const GROUPS = Object.keys(RAW);

// Suche: ignoriert Groß/klein, Umlaute, Bindestriche; alle Wörter müssen vorkommen
export const norm = (s) => String(s).toLowerCase().replace(/ß/g, 'ss').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[-_'’.&]/g, ' ').replace(/\s+/g, ' ').trim();
export const matches = (q, ...texts) => {
  const hay = norm(texts.join(' ')), hayTight = hay.replace(/ /g, '');
  const short = { kh: 'kurzhantel', lh: 'langhantel', db: 'dumbbell', bb: 'barbell' };
  return norm(q).split(' ').every((w) => hay.includes(short[w] || w) || hayTight.includes(short[w] || w));
};

// Wie wird eine Übung erfasst?
//   weight = kg × Wdh (Standard) · reps = Körpergewicht: Wdh (+ optional Zusatz-kg)
//   time   = Sekunden (+ optional kg), z. B. Plank · cardio = Minuten + Stufe
const REPS = ['Liegestütze', 'Dips', 'Klimmzüge', 'Klimmzüge im Untergriff', 'Bankdips', 'Hyperextensions', 'Nordic Curls', 'Sissy Squat',
  'Glute Bridge', 'Crunches', 'Hängendes Beinheben', 'Knieheben am Dip-Barren', 'Beinheben liegend', 'Russian Twists', 'Ab Wheel', 'Sit-ups', 'Burpees'];
const TIME = ['Plank', 'Seitstütz', 'Dead Hang', "Farmer's Walk"];
export function kindOfName(name) {
  const n = norm(name);
  if (LIBRARY.some((l) => l.group === 'Cardio' && norm(l.name) === n)) return 'cardio';
  if (TIME.some((x) => norm(x) === n)) return 'time';
  if (REPS.some((x) => norm(x) === n)) return 'reps';
  return 'weight';
}
export const KIND_LABEL = { weight: 'Kraft (kg × Wdh)', reps: 'Körpergewicht (Wdh, optional +kg)', time: 'Auf Zeit (Sekunden)', cardio: 'Cardio (Minuten + Stufe)' };
