// Widget'ın "yeni görev" bağlantısı: rota, form sahibi (sekme düzeni) henüz
// dinlemiyorken de istek kaybolmamalı (soğuk açılış).

import { onAddRequest, parseAddStep, requestAdd } from '../addRequest';

describe('parseAddStep', () => {
  it('bilinen adımı döndürür, bilinmeyeni menüye çevirir', () => {
    expect(parseAddStep('task')).toBe('task');
    expect(parseAddStep('habit')).toBe('habit');
    expect(parseAddStep('goal')).toBe('goal');
    expect(parseAddStep(undefined)).toBe('menu');
    expect(parseAddStep('nonsense')).toBe('menu');
    expect(parseAddStep(['goal', 'task'])).toBe('goal');
  });
});

describe('requestAdd / onAddRequest', () => {
  it('dinleyici varken istek hemen iletilir', () => {
    const got: string[] = [];
    const off = onAddRequest((s) => got.push(s));
    requestAdd('task');
    expect(got).toEqual(['task']);
    off();
  });

  it('dinleyici yokken gelen istek, ilk dinleyiciye abone olurken bir kez verilir', () => {
    requestAdd('task');
    const first: string[] = [];
    const off = onAddRequest((s) => first.push(s));
    expect(first).toEqual(['task']);
    off();

    const second: string[] = [];
    const off2 = onAddRequest((s) => second.push(s));
    expect(second).toEqual([]); // tüketildi, tekrar gelmez
    off2();
  });

  it('abonelikten çıkınca artık dinlemez', () => {
    const got: string[] = [];
    const off = onAddRequest((s) => got.push(s));
    off();
    requestAdd('habit'); // dinleyici yok → bekletilir
    expect(got).toEqual([]);
    // sonraki testi etkilemesin
    onAddRequest(() => {})();
  });
});
