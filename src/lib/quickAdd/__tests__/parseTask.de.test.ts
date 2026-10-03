// Almanca ayrıştırıcı sözleşmesi. Referans an: Çarşamba 7 Ekim 2026, 14:00.

import { parseTask, type ParsedTask } from '../parseTask';

const NOW = new Date(2026, 9, 7, 14, 0);

const exp = (o: Partial<ParsedTask>): ParsedTask => ({
  title: '',
  date: null,
  time: null,
  priority: null,
  remind: false,
  ...o,
});

const cases: [string, Partial<ParsedTask>][] = [
  // Datum + Uhrzeit
  ['morgen um 9 Uhr Zahnarzt anrufen', { title: 'Zahnarzt anrufen', date: '2026-10-08', time: '09:00' }],
  ['heute Abend Müll rausbringen', { title: 'Müll rausbringen', date: '2026-10-07', time: '19:00' }],
  ['heute Morgen Yoga', { title: 'Yoga', date: '2026-10-07', time: '09:00' }],
  ['morgen früh joggen', { title: 'Joggen', date: '2026-10-08', time: '09:00' }],
  ['Freitagabend Party', { title: 'Party', date: '2026-10-09', time: '19:00' }],
  ['Freitag Abend Kino', { title: 'Kino', date: '2026-10-09', time: '19:00' }],
  ['nächsten Dienstag um halb drei Meeting', { title: 'Meeting', date: '2026-10-13', time: '14:30' }],
  ['um viertel nach vier Tee trinken', { title: 'Tee trinken', date: '2026-10-07', time: '16:15' }],
  ['um viertel vor fünf Bus', { title: 'Bus', date: '2026-10-07', time: '16:45' }],
  ['halb drei Kaffee', { title: 'Kaffee', date: '2026-10-07', time: '14:30' }],
  ['um 15:30 Uhr Arzt', { title: 'Arzt', date: '2026-10-07', time: '15:30' }],
  ['um 15.30 Arzt', { title: 'Arzt', date: '2026-10-07', time: '15:30' }],
  ['um 20 Uhr Sport', { title: 'Sport', date: '2026-10-07', time: '20:00' }],
  ['15 Uhr 30 Friseur', { title: 'Friseur', date: '2026-10-07', time: '15:30' }],
  ['Montag um 8 Training', { title: 'Training', date: '2026-10-12', time: '08:00' }],
  ['bis 17 Uhr Bericht', { title: 'Bericht', date: '2026-10-07', time: '17:00' }],

  // Datum
  ['übermorgen Auto waschen', { title: 'Auto waschen', date: '2026-10-09' }],
  ['am Freitag Bericht abgeben', { title: 'Bericht abgeben', date: '2026-10-09' }],
  ['bis Freitag Bericht schreiben', { title: 'Bericht schreiben', date: '2026-10-09' }],
  ['am nächsten Freitag Grillen', { title: 'Grillen', date: '2026-10-16' }],
  ['nächste Woche Garage aufräumen', { title: 'Garage aufräumen', date: '2026-10-14' }],
  ['in drei Tagen Rechnung bezahlen', { title: 'Rechnung bezahlen', date: '2026-10-10' }],
  ['in einer Woche Ölwechsel', { title: 'Ölwechsel', date: '2026-10-14' }],
  ['am 3. November Geburtstag Oma', { title: 'Geburtstag Oma', date: '2026-11-03' }],
  ['am 15.10. Steuer', { title: 'Steuer', date: '2026-10-15' }],
  ['am 20. Miete zahlen', { title: 'Miete zahlen', date: '2026-10-20' }],

  // relative Zeit
  ['in 2 Stunden Wäsche aufhängen', { title: 'Wäsche aufhängen', date: '2026-10-07', time: '16:00' }],
  ['in einer halben Stunde Ofen aus', { title: 'Ofen aus', date: '2026-10-07', time: '14:30' }],

  // Priorität
  ['Steuererklärung machen dringend', { title: 'Steuererklärung machen', priority: 'high' }],
  ['Milch kaufen mit hoher Priorität', { title: 'Milch kaufen', priority: 'high' }],
  ['niedrige Priorität Keller ausmisten', { title: 'Keller ausmisten', priority: 'low' }],

  // Erinnerung + Grammatik
  ['erinnere mich morgen daran, Mama anzurufen', { title: 'Mama anrufen', date: '2026-10-08', remind: true }],
  [
    'erinnere mich an den Zahnarzttermin am 15. Oktober',
    { title: 'Zahnarzttermin', date: '2026-10-15', remind: true },
  ],
  ['vergiss nicht Blumen zu gießen', { title: 'Blumen gießen', remind: true }],
  ['Erinnerung Wasser trinken in 30 Minuten', { title: 'Wasser trinken', date: '2026-10-07', time: '14:30', remind: true }],
  ['bitte morgen Brot kaufen', { title: 'Brot kaufen', date: '2026-10-08' }],
  ['ich muss morgen Milch kaufen', { title: 'Milch kaufen', date: '2026-10-08' }],
];

describe('parseTask (de)', () => {
  it.each(cases)('%s', (text, expected) => {
    expect(parseTask(text, 'de', NOW)).toEqual(exp(expected));
  });
});

describe('parseTask (de) — konservative Regeln', () => {
  it('eine nackte Zahl ist keine Uhrzeit', () => {
    expect(parseTask('3 Äpfel kaufen', 'de', NOW)).toEqual(exp({ title: '3 Äpfel kaufen' }));
  });

  it('"am Bahnhof" / "zu Hause" bleiben erhalten', () => {
    expect(parseTask('am Bahnhof Ticket kaufen', 'de', NOW)).toEqual(exp({ title: 'Am Bahnhof Ticket kaufen' }));
    expect(parseTask('zu Hause aufräumen', 'de', NOW)).toEqual(exp({ title: 'Zu Hause aufräumen' }));
  });

  it('"Montag Meeting": Datum ja, Wort bleibt', () => {
    expect(parseTask('Montag Meeting vorbereiten', 'de', NOW)).toEqual(
      exp({ title: 'Montag Meeting vorbereiten', date: '2026-10-12' })
    );
  });

  it('ein vorangestelltes "dringend" setzt nur die Priorität', () => {
    expect(parseTask('dringend Steuererklärung machen', 'de', NOW)).toEqual(
      exp({ title: 'Dringend Steuererklärung machen', priority: 'high' })
    );
  });

  it('"15.10" ohne Punkt und ohne "am" ist kein Datum', () => {
    expect(parseTask('Preis 15.10 Euro', 'de', NOW)).toEqual(exp({ title: 'Preis 15.10 Euro' }));
  });
});
