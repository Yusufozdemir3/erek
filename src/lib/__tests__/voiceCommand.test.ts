// Sesle yönetim: söylenen cümle → mevcut bir alışkanlık/görev üzerinde komut.
// Komut olmayan cümle (yeni görev) 'none' döner, asla komut diye yutulmaz.

import { parseVoiceCommand, type CommandItems } from '../voiceCommand';

const items = (over: Partial<CommandItems> = {}): CommandItems => ({
  habits: [
    { id: 'su', title: 'Su iç', kind: 'numeric' },
    { id: 'kitap', title: 'Kitap oku', kind: 'binary' },
    { id: 'kos', title: 'Koşu yap', kind: 'binary' },
    { id: 'zaman', title: 'Meditasyon', kind: 'timer' },
  ],
  tasks: [
    { id: 'alisveris', title: 'Alışveriş yap' },
    { id: 'anne', title: 'Annemi ara' },
  ],
  ...over,
});

const one = (text: string, lang: 'tr' | 'en' | 'de', set = items()) => {
  const r = parseVoiceCommand(text, lang, set);
  return r.kind === 'one' ? r.target : r;
};
const id = (t: any) => (t.kind === 'habit' ? t.habit.id : t.kind === 'task' ? t.task.id : t.kind);
const NONE = { kind: 'none' };

describe('Türkçe', () => {
  it('ikili alışkanlık: "kitap okudum"', () => {
    expect(id(one('kitap okudum', 'tr'))).toBe('kitap');
    expect(id(one('Bugün kitap okudum', 'tr'))).toBe('kitap');
  });

  it('sayılı alışkanlık: sayı söylenmişse o kadar, söylenmemişse +1', () => {
    expect(one('iki bardak su içtim', 'tr')).toMatchObject({ kind: 'habit', amount: 2 });
    expect(one('3 bardak su içtim', 'tr')).toMatchObject({ amount: 3 });
    const pages = items({ habits: [{ id: 'k', title: 'Sayfa oku', kind: 'numeric' }] });
    expect(one('yirmi beş sayfa okudum', 'tr', pages)).toMatchObject({ amount: 25 });
    expect(one('su içtim', 'tr')).toMatchObject({ amount: 1 });
    expect(one('bir bardak su içtim', 'tr')).toMatchObject({ amount: 1 });
  });

  it('ek ve yumuşama: "suyu içtim", "kitabı okudum", "koşuyu yaptım"', () => {
    expect(id(one('suyu içtim', 'tr'))).toBe('su');
    expect(id(one('kitabı okudum', 'tr'))).toBe('kitap');
    expect(id(one('koşuyu yaptım', 'tr'))).toBe('kos');
  });

  it('görev: "alışveriş görevini bitirdim", "annemi aradım"', () => {
    expect(one('alışveriş görevini bitirdim', 'tr')).toMatchObject({ kind: 'task', task: { id: 'alisveris' } });
    expect(id(one('alışverişi yaptım', 'tr'))).toBe('alisveris');
    expect(id(one('annemi aradım', 'tr'))).toBe('anne');
  });

  it('birim sözcüğü eşleşmemesi cezalandırmaz: "5 kilometre koştum"', () => {
    const set = items({ habits: [{ id: 'kos', title: 'Koş', kind: 'numeric' }] });
    expect(one('5 kilometre koştum', 'tr', set)).toMatchObject({ habit: { id: 'kos' }, amount: 5 });
  });

  it('kelime başı benzerliği eşleşme sayılmaz: "okul" ≠ "oku", "sunum" ≠ "su"', () => {
    expect(parseVoiceCommand('okula gittim', 'tr', items())).toEqual(NONE);
    expect(parseVoiceCommand('sunum hazırladım', 'tr', items())).toEqual(NONE);
  });

  it('"bitti" gibi genel sözcük yalnız niyeti belirtir; eşleşme yine isim ister', () => {
    expect(id(one('kitap bitti', 'tr'))).toBe('kitap');
    expect(parseVoiceCommand('bitti', 'tr', items())).toEqual(NONE);
  });

  it('yeni görev cümleleri komut değildir', () => {
    for (const s of ['yarın annemi ara', 'kitap okumayı hatırlat', 'su iç', 'alışveriş yap']) {
      expect(parseVoiceCommand(s, 'tr', items())).toEqual(NONE);
    }
  });

  it('tek sözcüklü başlıkta fiil eşleşmese de olur ("su içtim" → "Su"), uzun başlıkta farklı fiil olmaz', () => {
    const bare = items({ habits: [{ id: 'su', title: 'Su', kind: 'numeric' }, { id: 'kitap', title: 'Kitap oku', kind: 'binary' }], tasks: [] });
    expect(id(one('su içtim', 'tr', bare))).toBe('su');
    expect(id(one('iki bardak su içtim', 'tr', bare))).toBe('su');
    expect(parseVoiceCommand('kitap sattım', 'tr', bare)).toEqual(NONE);
  });

  it('bugün 3 sayfa okudum: sayıdan sonraki birim cezalandırmaz', () => {
    const set = items({ habits: [{ id: 'kitap', title: 'Kitap oku', kind: 'numeric' }], tasks: [] });
    expect(one('bugün 3 sayfa okudum', 'tr', set)).toMatchObject({ habit: { id: 'kitap' }, amount: 3 });
  });

  it('zamanlayıcı alışkanlığına komut verilmez', () => {
    expect(parseVoiceCommand('meditasyon yaptım', 'tr', items())).toEqual(NONE);
  });

  it('tanınmayan çok kelime eşiği düşürür → komut değil', () => {
    expect(parseVoiceCommand('arkadaşımla parkta kitap okudum', 'tr', items())).toEqual(NONE);
  });
});

describe('belirsizlik', () => {
  it('eşit uyan öğeler seçenek olarak sunulur (en fazla 3)', () => {
    const set = items({
      habits: [
        { id: 'a', title: 'Kitap oku', kind: 'binary' },
        { id: 'b', title: 'Kitap oku akşam', kind: 'binary' },
      ],
      tasks: [
        { id: 'c', title: 'Kitap oku' },
        { id: 'd', title: 'Kitap oku bitir' },
      ],
    });
    const r = parseVoiceCommand('kitap okudum', 'tr', set);
    expect(r.kind).toBe('choose');
    if (r.kind === 'choose') expect(r.options.length).toBe(3);
  });

  it('belirgin biçimde daha iyi uyan tek başına seçilir', () => {
    const set = items({
      habits: [
        { id: 'a', title: 'Kitap oku', kind: 'binary' },
        { id: 'b', title: 'Kitap satın al', kind: 'binary' },
      ],
      tasks: [],
    });
    expect(id(one('kitap okudum', 'tr', set))).toBe('a');
  });

  it('boş listeler ve boş cümle', () => {
    expect(parseVoiceCommand('kitap okudum', 'tr', { habits: [], tasks: [] })).toEqual(NONE);
    expect(parseVoiceCommand('', 'tr', items())).toEqual(NONE);
    expect(parseVoiceCommand('   ', 'en', items())).toEqual(NONE);
  });
});

describe('English', () => {
  const set = items({
    habits: [
      { id: 'water', title: 'Drink water', kind: 'numeric' },
      { id: 'read', title: 'Read a book', kind: 'binary' },
      { id: 'med', title: 'Meditate', kind: 'binary' },
      { id: 'study', title: 'Study', kind: 'binary' },
    ],
    tasks: [
      { id: 'shop', title: 'Buy groceries' },
      { id: 'mom', title: 'Call mom' },
    ],
  });

  it('irregular and regular pasts', () => {
    expect(one('I drank two glasses of water', 'en', set)).toMatchObject({ habit: { id: 'water' }, amount: 2 });
    expect(id(one('I read a book', 'en', set))).toBe('read');
    expect(id(one('I meditated', 'en', set))).toBe('med');
    expect(id(one('I studied today', 'en', set))).toBe('study');
    expect(id(one('I called mom', 'en', set))).toBe('mom');
    expect(id(one('I bought the groceries', 'en', set))).toBe('shop');
  });

  it('generic done words', () => {
    expect(id(one('finished the groceries task', 'en', set))).toBe('shop');
    expect(id(one('water done', 'en', set))).toBe('water');
  });

  it('a new to-do is not a command', () => {
    expect(parseVoiceCommand('call mom tomorrow', 'en', set)).toEqual(NONE);
    expect(parseVoiceCommand('buy groceries', 'en', set)).toEqual(NONE);
  });
});

describe('Deutsch', () => {
  const set = items({
    habits: [
      { id: 'wasser', title: 'Wasser trinken', kind: 'numeric' },
      { id: 'buch', title: 'Buch lesen', kind: 'binary' },
      { id: 'lauf', title: 'Laufen', kind: 'binary' },
    ],
    tasks: [{ id: 'einkauf', title: 'Einkaufen' }],
  });

  it('Partizipien', () => {
    expect(one('Ich habe drei Gläser Wasser getrunken', 'de', set)).toMatchObject({ habit: { id: 'wasser' }, amount: 3 });
    expect(id(one('Ich habe ein Buch gelesen', 'de', set))).toBe('buch');
    expect(id(one('Heute gelaufen', 'de', set))).toBe('lauf');
  });

  it('erledigt / fertig', () => {
    expect(id(one('Einkaufen erledigt', 'de', set))).toBe('einkauf');
    expect(id(one('Buch lesen fertig', 'de', set))).toBe('buch');
  });

  it('neue Aufgabe ist kein Befehl', () => {
    expect(parseVoiceCommand('Morgen einkaufen', 'de', set)).toEqual(NONE);
  });
});

describe('güvenlik', () => {
  it('çok uzun / garip girdi hızlı biter', () => {
    const t0 = Date.now();
    parseVoiceCommand('okudum '.repeat(5000), 'tr', items());
    parseVoiceCommand('9'.repeat(10000) + ' içtim', 'tr', items());
    expect(Date.now() - t0).toBeLessThan(1500);
  });

  it('sayı sınırlanır', () => {
    expect(one('9999 bardak su içtim', 'tr')).toMatchObject({ amount: 999 });
  });
});

describe('görevi yarına erteleme', () => {
  const postponed = (text: string, lang: 'tr' | 'en' | 'de') => {
    const r = one(text, lang);
    return r.kind === 'postpone' ? r.task.id : r;
  };

  it('üç dilde ertelenir', () => {
    expect(postponed('alışveriş yapmayı yarına ertele', 'tr')).toBe('alisveris');
    expect(postponed('Annemi ara görevini yarına ertele', 'tr')).toBe('anne');
    expect(postponed('postpone the Annemi ara task to tomorrow', 'en')).toBe('anne');
    expect(postponed('move alisveris yap to tomorrow', 'en')).toBe('alisveris');
    expect(postponed('verschiebe Alışveriş yap auf morgen', 'de')).toBe('alisveris');
  });

  it('"yarın" tek başına erteleme değildir; "ertele" tek başına da değil', () => {
    expect(one('yarın alışveriş yap', 'tr')).toEqual(NONE);
    expect(one('alışveriş yapmayı ertele', 'tr')).toEqual(NONE);
  });

  it('alışkanlık ertelenmez, eşleşmeyen cümle komut olmaz', () => {
    expect(one('kitap okumayı yarına ertele', 'tr')).toEqual(NONE);
    expect(one('dişçiyi yarına ertele', 'tr')).toEqual(NONE);
  });
});

describe('hedefe ilerleme ekleme', () => {
  const goals = [
    { id: 'kos', title: 'Koşu mesafesi' },
    { id: 'kitap', title: 'Kitap sayfası' },
  ];
  const set = items({ goals });
  const goal = (text: string, lang: 'tr' | 'en' | 'de') => {
    const r = parseVoiceCommand(text, lang, set);
    return r.kind === 'one' && r.target.kind === 'goal' ? [r.target.goal.id, r.target.amount] : r;
  };

  it('üç dilde sayıyı hedefe ekler', () => {
    expect(goal('koşu mesafesi hedefime 5 km ekle', 'tr')).toEqual(['kos', 5]);
    expect(goal('kitap sayfası hedefine yirmi sayfa ekledim', 'tr')).toEqual(['kitap', 20]);
    expect(goal('add 5 km to my Koşu mesafesi goal', 'en')).toEqual(['kos', 5]);
    expect(goal('ich habe 30 Seiten zum Ziel Kitap sayfası hinzugefügt', 'de')).toEqual(['kitap', 30]);
  });

  it('sayı yoksa, hedef eşleşmiyorsa komut değildir', () => {
    expect(parseVoiceCommand('koşu mesafesi hedefime ekle', 'tr', set)).toEqual(NONE);
    expect(parseVoiceCommand('diş hedefime 5 ekle', 'tr', set)).toEqual(NONE);
  });

  it('hedef eşleşmezse "ekledim" alışkanlık olarak sürer', () => {
    const r = parseVoiceCommand('iki bardak su ekledim', 'tr', set);
    expect(r).toMatchObject({ kind: 'one', target: { kind: 'habit', amount: 2 } });
  });
});

describe('ondalık ve buçuklu sayılar', () => {
  const dec = items({
    habits: [{ id: 'su', title: 'Su iç', kind: 'numeric' }],
    goals: [{ id: 'kos', title: 'Koşu' }],
  });
  const amt = (text: string, lang: 'tr' | 'en' | 'de') => {
    const r = parseVoiceCommand(text, lang, dec);
    return r.kind === 'one' && (r.target.kind === 'habit' || r.target.kind === 'goal') ? r.target.amount : r;
  };

  it('rakamla: 2,5 ve 2.5', () => {
    expect(amt('2,5 bardak su içtim', 'tr')).toBe(2.5);
    expect(amt('koşu hedefime 2.5 km ekle', 'tr')).toBe(2.5);
    expect(amt('0,25 bardak su içtim', 'tr')).toBe(0.25);
  });
  it('sözle: buçuk / and a half / point / einhalb / komma', () => {
    expect(amt('iki buçuk bardak su içtim', 'tr')).toBe(2.5);
    expect(amt('bir buçuk bardak su içtim', 'tr')).toBe(1.5);
    expect(amt('add two and a half km to my Koşu goal', 'en')).toBe(2.5);
    expect(amt('add two point five km to my Koşu goal', 'en')).toBe(2.5);
    expect(amt('zweieinhalb km zum Ziel Koşu hinzugefügt', 'de')).toBe(2.5);
    expect(amt('drei komma fünf km zum Ziel Koşu hinzugefügt', 'de')).toBe(3.5);
  });
  it('0,5 gibi küçük miktar 1\'e yuvarlanmaz', () => {
    expect(amt('0,5 bardak su içtim', 'tr')).toBe(0.5);
  });
});
