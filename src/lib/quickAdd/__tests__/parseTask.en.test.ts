// İngilizce ayrıştırıcı sözleşmesi. Referans an: Çarşamba 7 Ekim 2026, 14:00.

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
  // date + time
  ['call mom tomorrow at 3pm', { title: 'Call mom', date: '2026-10-08', time: '15:00' }],
  ['call mom tomorrow at 3 p.m.', { title: 'Call mom', date: '2026-10-08', time: '15:00' }],
  ['dentist next tuesday at 10:30', { title: 'Dentist', date: '2026-10-13', time: '10:30' }],
  ['meeting on monday at 2', { title: 'Meeting', date: '2026-10-12', time: '14:00' }],
  ['friday 3pm meeting', { title: 'Meeting', date: '2026-10-09', time: '15:00' }],
  ['this friday evening party', { title: 'Party', date: '2026-10-09', time: '19:00' }],
  ['buy milk tonight', { title: 'Buy milk', date: '2026-10-07', time: '21:00' }],
  ['tomorrow morning run 5k', { title: 'Run 5k', date: '2026-10-08', time: '09:00' }],
  ['call John at 8 in the evening', { title: 'Call John', date: '2026-10-07', time: '20:00' }],
  ['yoga at half past four', { title: 'Yoga', date: '2026-10-07', time: '16:30' }],
  ['call at quarter to five', { title: 'Call', date: '2026-10-07', time: '16:45' }],
  ["tea at four o'clock", { title: 'Tea', date: '2026-10-07', time: '16:00' }],
  ['lunch with Ana at noon', { title: 'Lunch with Ana', date: '2026-10-08', time: '12:00' }], // noon passed
  ['gym at 7:30 am', { title: 'Gym', date: '2026-10-08', time: '07:30' }], // 7:30 passed
  ['at 3', { date: '2026-10-07', time: '15:00' }],

  // dates
  ['submit report by friday', { title: 'Submit report', date: '2026-10-09' }],
  ['call mom friday', { title: 'Call mom', date: '2026-10-09' }], // sentence-final weekday
  ['the day after tomorrow', { date: '2026-10-09' }],
  ['next week clean garage', { title: 'Clean garage', date: '2026-10-14' }],
  ['water plants in 3 days', { title: 'Water plants', date: '2026-10-10' }],
  ['pay bills in 2 weeks', { title: 'Pay bills', date: '2026-10-21' }],
  ['pay rent on the 15th', { title: 'Pay rent', date: '2026-10-15' }],
  ['birthday gift october 20', { title: 'Birthday gift', date: '2026-10-20' }],
  ['birthday gift october 20th', { title: 'Birthday gift', date: '2026-10-20' }],
  ['birthday gift on the 20th of october', { title: 'Birthday gift', date: '2026-10-20' }],
  ['may 5 dentist', { title: 'Dentist', date: '2027-05-05' }], // May 5 passed this year
  ['buy a gift for tomorrow', { title: 'Buy a gift', date: '2026-10-08' }],

  // relative time
  ['take out the trash in 2 hours', { title: 'Take out the trash', date: '2026-10-07', time: '16:00' }],
  ['check the oven in half an hour', { title: 'Check the oven', date: '2026-10-07', time: '14:30' }],
  ['stretch in 45 minutes', { title: 'Stretch', date: '2026-10-07', time: '14:45' }],

  // priority
  ['finish slides asap', { title: 'Finish slides', priority: 'high' }],
  ['pay the bill urgent', { title: 'Pay the bill', priority: 'high' }],
  ['read a book low priority', { title: 'Read a book', priority: 'low' }],
  ['file taxes with high priority', { title: 'File taxes', priority: 'high' }],

  // reminders and fillers
  ['remind me to call mom tomorrow at 9', { title: 'Call mom', date: '2026-10-08', time: '09:00', remind: true }],
  ['remind me tomorrow at 9 to call mom', { title: 'Call mom', date: '2026-10-08', time: '09:00', remind: true }],
  ["don't forget to buy bread", { title: 'Buy bread', remind: true }],
  ['don’t forget to buy bread', { title: 'Buy bread', remind: true }], // curly apostrophe
  ['add a task to clean the kitchen', { title: 'Clean the kitchen' }],
  ['please water the plants', { title: 'Water the plants' }],
  ['I need to renew my passport', { title: 'Renew my passport' }],
];

describe('parseTask (en)', () => {
  it.each(cases)('%s', (text, expected) => {
    expect(parseTask(text, 'en', NOW)).toEqual(exp(expected));
  });
});

describe('parseTask (en) — conservative rules', () => {
  it('a bare number is not a time', () => {
    expect(parseTask('buy 3 apples', 'en', NOW)).toEqual(exp({ title: 'Buy 3 apples' }));
  });

  it('"may" is a month only next to a day', () => {
    expect(parseTask('I may call', 'en', NOW)).toEqual(exp({ title: 'I may call' }));
  });

  it('"morning run" without a date stays a name', () => {
    expect(parseTask('morning run tomorrow', 'en', NOW)).toEqual(exp({ title: 'Morning run', date: '2026-10-08' }));
  });

  it('"Sunday school": the date is set but the word stays', () => {
    expect(parseTask('Sunday school prep', 'en', NOW)).toEqual(exp({ title: 'Sunday school prep', date: '2026-10-11' }));
  });

  it('a leading "urgent" sets the priority but stays', () => {
    expect(parseTask('urgent care appointment', 'en', NOW)).toEqual(
      exp({ title: 'Urgent care appointment', priority: 'high' })
    );
  });

  it('keeps a trailing "on"', () => {
    expect(parseTask('turn the heating on', 'en', NOW)).toEqual(exp({ title: 'Turn the heating on' }));
  });
});
