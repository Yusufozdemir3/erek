// Store-screenshot demo data in Erek's export format (Profile > My data > Import).
// Usage: node scripts/gen-demo-data.js <out.json> [tr|en|de]
// "Today" = DEMO_TODAY (default 2026-10-11) and must match the phone/emulator date.
const fs = require('fs');
const lang = process.argv[3] || 'tr';
const I = { tr: 0, en: 1, de: 2 }[lang];
const x = (...a) => a[I]; // pick the text for the chosen language

const TODAY = new Date((process.env.DEMO_TODAY || '2026-10-11') + 'T12:00:00Z');
const ymd = (d) => d.toISOString().slice(0, 10);
const ago = (n) => { const d = new Date(TODAY); d.setUTCDate(d.getUTCDate() - n); return d; };
const ts = (n) => ago(n).toISOString();
let seed = 7;
const day = (k) => ymd(ago(-k)); // k days from today
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

const habits = [], logs = [];
// A real person's history, not a highlight reel: short streaks, half-done days, a holiday
// week and a few sick days with nothing logged, and a slightly weaker start months ago.
// [key,title,icon,color,kind,target,unit,schedule,rate,streak(scheduled days incl. today if done)]
const H = [
  ['su', x('Su iç', 'Drink water', 'Wasser trinken'), 'water', '#0ea5e9', 'numeric', 8, x('bardak', 'glasses', 'Gläser'), null, 0.55, 2],
  ['kos', x('Koşu', 'Run', 'Laufen'), 'run', '#f97316', 'binary', null, null, { freq: 'weekly', weekdays: [1, 3, 6] }, 0.62, 1],
  ['kitap', x('Kitap oku', 'Read a book', 'Buch lesen'), 'book', '#8b5cf6', 'timer', 1200, null, null, 0.5, 0],
  ['medi', x('Meditasyon', 'Meditation', 'Meditation'), 'meditate', '#14b8a6', 'binary', null, null, null, 0.52, 4],
  ['vit', x('Vitamin al', 'Take vitamins', 'Vitamine nehmen'), 'medication', '#10b981', 'binary', null, null, null, 0.84, 11],
  ['gunluk', x('Günlük yaz', 'Write a journal', 'Tagebuch schreiben'), 'journal', '#ec4899', 'binary', null, null, null, 0.34, 0],
  ['uyku', x('Erken yat', 'Early bedtime', 'Früh schlafen'), 'sleep', '#4f46e5', 'binary', null, null, null, 0.42, 1],
];
// Snapshot is taken at 09:41 on a Sunday: only the morning routine is done.
const todayDone = { su: false, kos: false, kitap: false, medi: true, vit: true, gunluk: false, uyku: false };
// Weekends are looser for the evening/discipline habits.
const weekendDip = { gunluk: 0.6, uyku: 0.5, kitap: 1.2, medi: 0.7, su: 0.8 };
const holiday = (n) => n >= 24 && n <= 30; // a week away: only the vitamins survive
const sick = (n) => n >= 52 && n <= 55; // flu: nothing logged at all
const lazyDays = new Set(); // whole off-days scattered around
for (let n = 8; n <= 200; n++) if (rnd() < 0.07) lazyDays.add(n);

H.forEach(([k, title, icon, color, kind, target, unit, sched, rate, streak]) => {
  const id = 'habit-' + k + '-0001';
  habits.push({
    id, goal_id: k === 'kitap' ? 'goal-kitap-0001' : k === 'kos' ? 'goal-yari-0001' : null,
    title, icon, color, kind, target_amount: target, unit,
    schedule: sched ? JSON.stringify(sched) : null,
    updated_at: ts(0),
    goal_contribution: k === 'kitap' || k === 'kos' ? 'per_completion' : null, goal_factor: 1,
  });
  const scheduled = (d) => !sched || sched.weekdays.includes(d.getUTCDay());
  // Streak counts scheduled days, so walk back until enough of them are covered.
  let need = todayDone[k] ? streak - 1 : streak, lastStreakDay = 0;
  for (let n = 1; need > 0; n++) if (scheduled(ago(n))) { need--; lastStreakDay = n; }
  let brokeStreak = false;
  for (let n = 0; n <= 200; n++) {
    const d = ago(n);
    if (!scheduled(d)) continue;
    const weekend = d.getUTCDay() === 0 || d.getUTCDay() === 6;
    let done;
    if (n === 0) done = todayDone[k];
    else if (n <= lastStreakDay) done = true;
    else if (!brokeStreak) { done = false; brokeStreak = true; }
    else if (sick(n)) done = false;
    else if (holiday(n)) done = k === 'vit' || (k === 'kitap' && rnd() < 0.6);
    else if (lazyDays.has(n) && k !== 'vit') done = false;
    else done = rnd() < rate * (weekend ? (weekendDip[k] || 0.9) : 1) * (n > 90 ? 0.85 : 1);
    let amount = 0;
    if (done) {
      if (kind === 'numeric') amount = rnd() < 0.75 ? 8 : 9;
      if (kind === 'timer') amount = 1200 + Math.floor(rnd() * 12) * 60;
    } else if (n > 0) {
      // Missed days are often half done rather than empty.
      if (kind === 'numeric' && !sick(n) && rnd() < 0.7) amount = 3 + Math.floor(rnd() * 5);
      if (kind === 'timer' && !sick(n) && rnd() < 0.35) amount = (4 + Math.floor(rnd() * 12)) * 60;
      if (!amount) continue;
    } else continue;
    logs.push({ id: `log-${k}-${ymd(d).replace(/-/g, '')}`, habit_id: id, log_date: ymd(d), completed: done ? 1 : 0, amount, updated_at: ts(n) });
  }
});
logs.push({ id: 'log-su-' + day(0).replace(/-/g, ''), habit_id: 'habit-su-0001', log_date: day(0), completed: 0, amount: 2, updated_at: ts(0) });

const cur = x('₺', '$', '€');
const goals = [
  { id: 'goal-kitap-0001', title: x('Bu yıl 12 kitap oku', 'Read 12 books this year', 'Dieses Jahr 12 Bücher lesen'), goal_type: 'numeric', target_value: 12, current_value: 8, unit: x('kitap', 'books', 'Bücher'), deadline: '2026-12-31', start_date: '2026-01-01', value_baseline: 0, updated_at: ts(6) },
  { id: 'goal-yari-0001', title: x('150 km koş', 'Run 150 km', '150 km laufen'), goal_type: 'numeric', target_value: 150, current_value: 82.5, unit: 'km', deadline: '2026-12-20', start_date: '2026-08-01', value_baseline: 0, updated_at: ts(1) },
  { id: 'goal-tatil-0001', title: x('Tatil için birikim', 'Save for a holiday', 'Für den Urlaub sparen'), goal_type: 'numeric', target_value: 20000, current_value: 7250, unit: cur, deadline: '2027-06-01', start_date: '2026-03-01', value_baseline: 0, updated_at: ts(9) },
  { id: 'goal-ing-0001', title: x('İngilizce B2 seviyesine ulaş', 'Reach B2 English', 'Englisch auf B2-Niveau bringen'), goal_type: 'milestone', target_value: null, current_value: 0, unit: null, deadline: '2027-06-01', start_date: '2026-06-01', value_baseline: 0, updated_at: ts(20) },
  { id: 'goal-kilo-0001', title: x('5 kilo ver', 'Lose 5 kg', '5 Kilo abnehmen'), goal_type: 'numeric', target_value: 5, current_value: 2, unit: 'kg', deadline: '2026-12-31', start_date: '2026-08-01', value_baseline: 0, updated_at: ts(4) },
  { id: 'goal-kurs-0001', title: x('Online yazılım kursunu bitir', 'Finish the online coding course', 'Online-Programmierkurs abschließen'), goal_type: 'milestone', target_value: null, current_value: 0, unit: null, deadline: '2027-01-31', start_date: '2026-08-15', value_baseline: 0, updated_at: ts(12) },
  { id: 'goal-gitar-0001', title: x('Gitarda 3 şarkı öğren', 'Learn 3 songs on guitar', '3 Lieder auf der Gitarre lernen'), goal_type: 'milestone', target_value: null, current_value: 0, unit: null, deadline: '2027-03-01', start_date: '2026-10-05', value_baseline: 0, updated_at: ts(6) },
];
const entries = [];
// Irregular, human-looking entries that add up exactly to `total` (in `step` units).
const spread = (gid, total, count, span, prefix, step = 1) => {
  const w = Array.from({ length: count }, () => 0.4 + rnd() * 1.4);
  const sw = w.reduce((p, c) => p + c, 0);
  let left = total;
  for (let i = 0; i < count; i++) {
    let a = i === count - 1 ? left : Math.max(step, Math.round((total * w[i] / sw) / step) * step);
    a = Math.round(a * 100) / 100;
    left = Math.round((left - a) * 100) / 100;
    entries.push({ id: `${prefix}-${i}-0000`, goal_id: gid, amount: a, updated_at: ts(Math.round(span * (1 - i / count) + rnd() * 3)) });
  }
};
// Books: a fast start, a slow summer.
[270, 252, 230, 205, 160, 118, 61, 6].forEach((n, i) => entries.push({ id: `ent-kitap-${i}-0000`, goal_id: 'goal-kitap-0001', amount: 1, updated_at: ts(n) }));
spread('goal-yari-0001', 82.5, 21, 70, 'ent-yari', 0.5);
spread('goal-kilo-0001', 2, 4, 70, 'ent-kilo', 0.5);
spread('goal-tatil-0001', 7250, 7, 220, 'ent-tatil', 250);

const msKurs = [
  [x('Temel konuları tamamla', 'Finish the basics', 'Grundlagen abschließen'), 1],
  [x('İlk mini projeyi bitir', 'Finish the first mini project', 'Erstes Mini-Projekt beenden'), 1],
  [x('Veritabanı modülü', 'Database module', 'Datenbank-Modul'), 0],
  [x('API modülü', 'API module', 'API-Modul'), 0],
  [x('Bitirme projesi', 'Final project', 'Abschlussprojekt'), 0],
  [x('Sertifika sınavı', 'Certificate exam', 'Zertifikatsprüfung'), 0],
];
const ms = [
  [x('Temel dilbilgisini tamamla', 'Finish the basic grammar', 'Grundgrammatik abschließen'), 1],
  [x('500 yeni kelime öğren', 'Learn 500 new words', '500 neue Vokabeln lernen'), 0],
  [x('Haftalık konuşma pratiği başlat', 'Start weekly speaking practice', 'Wöchentliche Sprechpraxis starten'), 0],
  [x('Bir İngilizce kitap bitir', 'Finish one book in English', 'Ein englisches Buch beenden'), 0],
  [x('Deneme sınavını çöz', 'Take a mock exam', 'Probeprüfung ablegen'), 0],
];
const kursMs = msKurs.map(([t, c], i) => ({ id: `ms-kurs-000${i}-bb`, goal_id: 'goal-kurs-0001', title: t, completed: c, position: i, updated_at: ts(6 - i) }));
const gitarMs = [
  [x('Temel akorları öğren', 'Learn the basic chords', 'Grundakkorde lernen'), 0],
  [x('İlk şarkı', 'First song', 'Erstes Lied'), 0],
  [x('İkinci şarkı', 'Second song', 'Zweites Lied'), 0],
  [x('Üçüncü şarkı', 'Third song', 'Drittes Lied'), 0],
].map(([t, c], i) => ({ id: `ms-gitar-00${i}-cc`, goal_id: 'goal-gitar-0001', title: t, completed: c, position: i, updated_at: ts(6) }));
const milestones = ms.map(([t, c], i) => ({ id: `ms-ing-000${i}-aa`, goal_id: 'goal-ing-0001', title: t, completed: c, position: i, updated_at: ts(5 - i) }));

const tags = [
  { id: 'tag-is-000001', name: x('İş', 'Work', 'Arbeit'), color: '#4f46e5', position: 0, updated_at: ts(30) },
  { id: 'tag-kisisel-01', name: x('Kişisel', 'Personal', 'Privat'), color: '#10b981', position: 1, updated_at: ts(30) },
  { id: 'tag-alisveris1', name: x('Alışveriş', 'Shopping', 'Einkauf'), color: '#f59e0b', position: 2, updated_at: ts(30) },
  { id: 'tag-saglik-001', name: x('Sağlık', 'Health', 'Gesundheit'), color: '#ef4444', position: 3, updated_at: ts(30) },
];
const T = (id, title, due, pri, icon, tagIds, extra = {}) => ({
  id: 'task-' + id + '-0001', title, due_date: due, priority: pri, icon,
  tag_ids: JSON.stringify(tagIds), completed_at: null, updated_at: ts(1), ...extra,
});
const tasks = [
  T('sunum', x('Müşteri sunumunu hazırla', 'Prepare the client presentation', 'Kundenpräsentation vorbereiten'), day(0) + 'T14:00', 'high', 'computer', ['tag-is-000001'], { end_time: '15:30' }),
  T('dr', x('Diş hekimi randevusu', 'Dentist appointment', 'Zahnarzttermin'), day(0) + 'T17:30', 'medium', 'doctor', ['tag-saglik-001'], { end_time: '18:15' }),
  T('market', x('Haftalık market alışverişi', 'Weekly grocery shopping', 'Wocheneinkauf'), day(0), 'low', 'cart', ['tag-alisveris1']),
  T('anne', x('Annemi ara', 'Call Mom', 'Mama anrufen'), day(0), 'medium', 'call', ['tag-kisisel-01']),
  T('fatura', x('Elektrik faturasını öde', 'Pay the electricity bill', 'Stromrechnung bezahlen'), day(-1), 'high', 'bill', []),
  T('kargo', x('Kargoyu teslim al', 'Pick up the parcel', 'Paket abholen'), day(0), 'low', 'package', [], { completed_at: ts(0) }),
  T('rapor', x('Aylık raporu gönder', 'Send the monthly report', 'Monatsbericht senden'), day(1), 'high', 'mail', ['tag-is-000001']),
  T('hediye', x('Ayşe için doğum günü hediyesi al', 'Buy Anna a birthday present', 'Geburtstagsgeschenk für Anna kaufen'), day(2), 'medium', 'gift', ['tag-kisisel-01', 'tag-alisveris1']),
  T('toplanti', x('Ekip toplantısı', 'Team meeting', 'Teambesprechung'), day(3) + 'T10:00', 'medium', 'meeting', ['tag-is-000001'], { end_time: '11:00' }),
  T('arac', x('Araç bakımına götür', 'Take the car in for service', 'Auto zur Inspektion bringen'), day(4), 'medium', 'car', []),
];
const sub = (task, arr) => arr.map(([t, c], i) => ({ id: `sub-${task}-00${i}-a`, task_id: `task-${task}-0001`, title: t, completed: c, position: i, updated_at: ts(1) }));
const subtasks = [
  ...sub('sunum', [[x('Slayt taslağını bitir', 'Finish the slide draft', 'Folienentwurf fertigstellen'), 1], [x('Rakamları kontrol et', 'Check the numbers', 'Zahlen prüfen'), 0], [x('Provayı yap', 'Do a dry run', 'Probelauf machen'), 0], [x('PDF olarak dışa aktar', 'Export as PDF', 'Als PDF exportieren'), 0]]),
  ...sub('market', [[x('Süt ve yumurta', 'Milk and eggs', 'Milch und Eier'), 0], [x('Sebze ve meyve', 'Fruit and vegetables', 'Obst und Gemüse'), 0], [x('Kahve', 'Coffee', 'Kaffee'), 0]]),
];
const doc = { app: 'Erek', formatVersion: 1, exportedAt: ts(0), counts: {}, habits, habitLogs: logs, tasks, subtasks, tags, goals, goalMilestones: [...milestones, ...kursMs, ...gitarMs], goalEntries: entries, reminders: [] };
fs.writeFileSync(process.argv[2], JSON.stringify(doc));
console.log(lang, logs.length, 'logs ->', process.argv[2]);
