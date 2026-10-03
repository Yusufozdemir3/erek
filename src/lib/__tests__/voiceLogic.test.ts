// Sesli girişin karar mantığı: hangi tanıyıcı, ne zaman onay, hata metinleri.
// Gizlilik sözü: çevrim içi tanıma ONAYSIZ asla seçilmez.

import { localeInstalled, planVoice, speechLocale, voiceErrorKind, type VoiceSupport } from '../voiceLogic';

describe('planVoice', () => {
  it('cihazda tanıma varsa onaydan bağımsız cihazda dinler', () => {
    expect(planVoice('onDevice', false)).toBe('onDevice');
    expect(planVoice('onDevice', true)).toBe('onDevice');
  });

  it('çevrim içi tanıma onaysız ASLA seçilmez', () => {
    const supports: VoiceSupport[] = ['unavailable', 'onDevice', 'needsModel', 'onlineOnly'];
    for (const s of supports) expect(planVoice(s, false)).not.toBe('online');
  });

  it('eski Android: önce onay sorulur, onay varsa çevrim içi', () => {
    expect(planVoice('onlineOnly', false)).toBe('askConsent');
    expect(planVoice('onlineOnly', true)).toBe('online');
  });

  it('paket yoksa indirme önerilir; onay verilmişse her seferinde sorulmaz', () => {
    expect(planVoice('needsModel', false)).toBe('offerModel');
    expect(planVoice('needsModel', true)).toBe('online');
  });

  it('tanıyıcı yoksa kullanılamaz', () => {
    expect(planVoice('unavailable', true)).toBe('unavailable');
  });
});

describe('speechLocale', () => {
  it('cihaz dilini değil uygulama dilini izler', () => {
    expect(speechLocale('tr')).toBe('tr-TR');
    expect(speechLocale('en')).toBe('en-US');
    expect(speechLocale('de')).toBe('de-DE');
  });
});

describe('localeInstalled', () => {
  it('aynı dilin farklı yazımlarını kabul eder', () => {
    expect(localeInstalled(['tr-TR'], 'tr-TR')).toBe(true);
    expect(localeInstalled(['tr_TR'], 'tr-TR')).toBe(true);
    expect(localeInstalled(['tr'], 'tr-TR')).toBe(true);
    expect(localeInstalled(['en-GB'], 'en-US')).toBe(true);
  });

  it('başka dilin paketini saymaz', () => {
    expect(localeInstalled(['en-US', 'de-DE'], 'tr-TR')).toBe(false);
    expect(localeInstalled([], 'tr-TR')).toBe(false);
  });
});

describe('voiceErrorKind', () => {
  it('bizim iptalimiz sessizdir', () => {
    expect(voiceErrorKind('aborted')).toBe('silent');
  });

  it('bilinen kodları eşler, bilinmeyeni genel hataya düşürür', () => {
    expect(voiceErrorKind('no-speech')).toBe('noSpeech');
    expect(voiceErrorKind('speech-timeout')).toBe('noSpeech');
    expect(voiceErrorKind('network')).toBe('network');
    expect(voiceErrorKind('not-allowed')).toBe('permission');
    expect(voiceErrorKind('service-not-allowed')).toBe('unavailable');
    expect(voiceErrorKind('language-not-supported')).toBe('language');
    expect(voiceErrorKind('busy')).toBe('busy');
    expect(voiceErrorKind('client')).toBe('generic');
    expect(voiceErrorKind('beklenmedik')).toBe('generic');
  });
});
