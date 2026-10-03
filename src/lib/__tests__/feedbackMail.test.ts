import { CONTACT_EMAIL, feedbackMailto } from '../feedbackMail';

const f = { appVersion: '1.1.0', androidVersion: 30, lang: 'tr' };

describe('feedbackMailto', () => {
  it('adres, konu ve gövde doğru kodlanır; altbilgi yalnızca teknik', () => {
    const url = feedbackMailto('Erek geri bildirimi', 'Merhaba,', f);
    expect(url.startsWith(`mailto:${CONTACT_EMAIL}?subject=`)).toBe(true);
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.get('subject')).toBe('Erek geri bildirimi');
    expect(params.get('body')).toBe('Merhaba,\n\n\n— — —\nErek 1.1.0 · Android 30 · tr');
  });

  it('özel karakterler (& ? # boşluk satır sonu) bağlantıyı bozmaz', () => {
    const url = feedbackMailto('a&b?c#d', 'x=1&y=2\nsatır', f);
    expect(url.split('?')).toHaveLength(2);
    expect(url.split('&')).toHaveLength(2); // yalnızca subject ile body arasında
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.get('subject')).toBe('a&b?c#d');
    expect(params.get('body')).toContain('x=1&y=2\nsatır');
  });
});
