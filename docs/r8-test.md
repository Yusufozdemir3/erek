# R8 (kod + kaynak küçültme) test sürümü

Varsayılan olarak **kapalı**. Yalnızca `EREK_R8=1` ile derlenen sürümde açılır
(`app.config.js`). Amaç: APK/AAB'yi küçültmek ve biraz daha hızlı açılış; riski:
yansıma (reflection) kullanan yerel modüllerin (bildirim, SQLite, widget'lar)
yalnızca gerçek cihazda ortaya çıkan çökmeleri.

## Derleme

```bash
# yerel Gradle (bkz. proje notlarındaki yerel build reçetesi)
EREK_R8=1 npx expo prebuild --platform android --clean
```

Sonra her zamanki gibi Gradle ile APK/AAB derle. EAS için profil ortamına
`EREK_R8=1` eklemek yeter.

## Cihazda gezilecekler (hepsi, sırayla)

- Açılış, kurulum sihirbazı, tema (açık/koyu/sistem)
- Bugün: alışkanlık/görev işaretle, sayaç +/−, zamanlayıcı başlat/durdur
- Bildirimler: hatırlatma kur, izin ver, bildirim gel, dokununca doğru ekran
- Hedefler: ekle, ilerleme, istatistik, ortak hedef
- Alışkanlık istatistiği + takvim + mola günü
- Widget'lar (Bugün, Sayaç, Görevler, Hedefler): ekle, dokun, yenilenmeyi bekle
- Uygulama kilidi, dışa/içe aktarma, Google ile giriş + eşitleme, arkadaş hatırlatması

Hepsi sorunsuzsa `app.config.js`'te koşulu kaldır (ya da `EREK_R8` varsayılanını
aç). Bir şey bozulursa logcat'teki `ClassNotFoundException` / `NoSuchMethodError`
satırından ilgili sınıf için `extraProguardRules` ile keep kuralı yaz.
