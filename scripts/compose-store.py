"""Frame raw emulator screenshots into Play Store images (headline + phone frame).

Usage: python scripts/compose-store.py [tr|en|de ...]
Reads  docs/store-screenshots/raw/<lang>/NN-name.png   (1080x2400 emulator captures)
Writes docs/store-screenshots/<lang>/NN-name.png        (1242x2688 framed images)
       docs/store-feature/feature-<lang>.png            (1024x500 feature graphic)
"""
import os
import sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = os.path.join(os.path.dirname(__file__), '..')
RAW = os.path.join(ROOT, 'docs', 'store-screenshots', 'raw')
OUT = os.path.join(ROOT, 'docs', 'store-screenshots')
FEAT = os.path.join(ROOT, 'docs', 'store-feature')
ICON = os.path.join(ROOT, 'assets', 'icon.png')
BOLD = 'C:/Windows/Fonts/segoeuib.ttf'
SEMI = 'C:/Windows/Fonts/seguisb.ttf'
REG = 'C:/Windows/Fonts/segoeui.ttf'

W, H = 1242, 2688
GREEN_DARK, GREEN, GREEN_LIGHT = (20, 61, 46), (47, 106, 80), (226, 240, 232)

# key -> (output order, gradient top, gradient bottom, headline color, {lang: (title, subtitle)})
SHOTS = {
    '01-today': (1, (232, 244, 237), (190, 222, 204), GREEN_DARK, {
        'tr': ('Günün tek ekranda', 'Görevlerin ve alışkanlıkların bir arada'),
        'en': ('Your whole day, one screen', 'Tasks and habits together'),
        'de': ('Dein Tag auf einen Blick', 'Aufgaben und Gewohnheiten vereint'),
    }),
    '05-goal-stats': (2, (255, 240, 220), (252, 214, 170), (92, 46, 8), {
        'tr': ('Hedefe ne zaman varacağını bil', 'Hızına göre tahmini bitiş tarihi'),
        'en': ('Know when you will reach your goal', 'A finish date based on your pace'),
        'de': ('Erfahre, wann du dein Ziel erreichst', 'Voraussichtliches Zieldatum nach deinem Tempo'),
    }),
    '03-habits': (3, (226, 232, 255), (186, 198, 250), (30, 33, 96), {
        'tr': ('Alışkanlıkların seriye dönüşsün', 'Her gün küçük bir adım'),
        'en': ('Turn habits into streaks', 'One small step every day'),
        'de': ('Aus Gewohnheiten werden Serien', 'Jeden Tag ein kleiner Schritt'),
    }),
    '02-tasks': (4, (255, 228, 236), (250, 188, 208), (110, 20, 52), {
        'tr': ('Görevlerin düzenli kalsın', 'İkon, renkli etiket ve alt görevler'),
        'en': ('Keep every task in order', 'Icons, colored tags and subtasks'),
        'de': ('Aufgaben im Griff', 'Icons, farbige Tags und Unteraufgaben'),
    }),
    '04-goals': (5, (220, 244, 246), (170, 222, 228), (8, 70, 80), {
        'tr': ('Büyük hedefleri adımlara böl', 'İlerlemen her an gözünün önünde'),
        'en': ('Break big goals into milestones', 'Your progress, always in sight'),
        'de': ('Große Ziele in Etappen', 'Dein Fortschritt immer im Blick'),
    }),
    '06-habit-stats': (6, (240, 232, 252), (212, 192, 244), (56, 26, 110), {
        'tr': ('İlerlemeni gör, motive ol', 'Seri, tamamlama oranı ve takvim'),
        'en': ('See your progress, stay motivated', 'Streaks, completion rate and calendar'),
        'de': ('Fortschritt sehen, motiviert bleiben', 'Serie, Erledigungsquote und Kalender'),
    }),
}
SHOTS['09-review'] = (9, (225, 244, 236), (170, 218, 196), (10, 70, 50), {
    'tr': ('Haftanı bir bakışta değerlendir', 'Tamamlama oranın, en istikrarlı ve ilgi bekleyen alışkanlıkların'),
    'en': ('Review your week at a glance', 'Completion rate, most consistent habit and what needs attention'),
    'de': ('Deine Woche auf einen Blick', 'Erledigungsquote, beständigste Gewohnheit und was Aufmerksamkeit braucht'),
})
# Dark theme
SHOTS['08-habits-dark'] = (8, (24, 34, 31), (8, 12, 11), (232, 244, 237), {
    'tr': ('Alışkanlıkların koyu temada', 'Gece de rahat kullan'),
    'en': ('Your habits in dark theme', 'Comfortable at night'),
    'de': ('Gewohnheiten im Dunkelmodus', 'Angenehm bei Nacht'),
})
SHOTS['07-today-dark'] = (7, (24, 34, 31), (8, 12, 11), (232, 244, 237), {
    'tr': ('Koyu tema da hazır', 'Geceleri gözünü yormaz'),
    'en': ('Dark theme included', 'Easy on the eyes at night'),
    'de': ('Dunkelmodus inklusive', 'Schonend für die Augen'),
})


def font(path, size):
    return ImageFont.truetype(path, size)


def gradient(top, bottom, w=W, h=H):
    base = Image.new('RGB', (w, h), top)
    px = base.load()
    for y in range(h):
        t = y / (h - 1)
        c = tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3))
        for x in range(w):
            px[x, y] = c
    return base


def wrap(draw, text, fnt, max_w):
    words, lines, cur = text.split(), [], ''
    for w in words:
        trial = (cur + ' ' + w).strip()
        if draw.textlength(trial, font=fnt) <= max_w:
            cur = trial
        else:
            lines.append(cur)
            cur = w
    lines.append(cur)
    return lines


def rounded_mask(size, radius):
    m = Image.new('L', size, 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, size[0] - 1, size[1] - 1), radius, fill=255)
    return m


def phone(shot, width):
    """Screenshot inside a dark rounded bezel, returned as RGBA."""
    scale = width / shot.width
    sh = shot.resize((width, int(shot.height * scale)), Image.LANCZOS).convert('RGBA')
    r = int(width * 0.085)
    sh.putalpha(rounded_mask(sh.size, r))
    bz = int(width * 0.022)
    frame = Image.new('RGBA', (sh.width + bz * 2, sh.height + bz * 2), (0, 0, 0, 0))
    ImageDraw.Draw(frame).rounded_rectangle((0, 0, frame.width - 1, frame.height - 1), r + bz, fill=(17, 19, 22, 255))
    ImageDraw.Draw(frame).rounded_rectangle((2, 2, frame.width - 3, frame.height - 3), r + bz - 2, outline=(70, 74, 82, 255), width=3)
    frame.alpha_composite(sh, (bz, bz))
    return frame


def shadow(img, blur=40, offset=(0, 30), alpha=90):
    pad = blur * 3
    sh = Image.new('RGBA', (img.width + pad * 2, img.height + pad * 2), (0, 0, 0, 0))
    a = img.split()[3].point(lambda v: alpha if v > 0 else 0)
    sh.paste((0, 0, 0, 255), (pad, pad), a)
    return sh.filter(ImageFilter.GaussianBlur(blur)), pad


def paste_phone(canvas, ph, x, y):
    sh, pad = shadow(ph)
    canvas.alpha_composite(sh, (x - pad, y - pad + 30))
    canvas.alpha_composite(ph, (x, y))


def headline(canvas, title, sub, color, sub_color=None):
    d = ImageDraw.Draw(canvas)
    ft, fs = font(BOLD, 96), font(REG, 50)
    y = 150
    for line in wrap(d, title, ft, W - 160):
        d.text((W // 2, y), line, font=ft, fill=color, anchor='ma')
        y += 116
    y += 18
    for line in wrap(d, sub, fs, W - 200):
        d.text((W // 2, y), line, font=fs, fill=sub_color or tuple(int(c * 0.78 + 40) for c in color), anchor='ma')
        y += 62
    return y + 8


def make_single(lang, key, spec):
    _, top, bot, color, texts = spec
    src = os.path.join(RAW, lang, key + '.png')
    if not os.path.exists(src):
        return
    canvas = gradient(top, bot).convert('RGBA')
    bottom = headline(canvas, *texts[lang], color, sub_color=(160, 180, 172) if key.endswith('dark') else None)
    ph = phone(Image.open(src).convert('RGB'), 1000)
    paste_phone(canvas, ph, (W - ph.width) // 2, bottom + 50)
    save(canvas, lang, key)


def save(canvas, lang, key):
    d = os.path.join(OUT, lang)
    os.makedirs(d, exist_ok=True)
    canvas.convert('RGB').save(os.path.join(d, key + '.png'), optimize=True)
    print('wrote', lang, key)


def make_feature(lang):
    """1024x500 Play feature graphic: app name + tagline + two phones."""
    fw, fh = 1024, 500
    canvas = gradient(GREEN_DARK, (30, 84, 62), fw, fh).convert('RGBA')
    d = ImageDraw.Draw(canvas)
    icon = Image.open(ICON).convert('RGBA').resize((120, 120), Image.LANCZOS)
    icon.putalpha(rounded_mask(icon.size, 28))
    canvas.alpha_composite(icon, (60, 90))
    d.text((200, 90), 'Erek', font=font(BOLD, 84), fill=(255, 255, 255))
    tag = {
        'tr': 'Alışkanlık, görev ve hedeflerin\ntek uygulamada',
        'en': 'Habits, tasks and goals\nin one app',
        'de': 'Gewohnheiten, Aufgaben und Ziele\nin einer App',
    }[lang]
    d.multiline_text((62, 250), tag, font=font(SEMI, 34), fill=(214, 236, 224), spacing=10)
    for key, x, y in (('01-today', 590, 60), ('05-goal-stats', 810, 130)):
        p = os.path.join(RAW, lang, key + '.png')
        if os.path.exists(p):
            ph = phone(Image.open(p).convert('RGB'), 190)
            paste_phone(canvas, ph, x, y)
    os.makedirs(FEAT, exist_ok=True)
    canvas.convert('RGB').save(os.path.join(FEAT, f'feature-{lang}.png'), optimize=True)
    print('wrote feature', lang)


if __name__ == '__main__':
    for lang in sys.argv[1:] or ['tr', 'en', 'de']:
        for key, spec in SHOTS.items():
            make_single(lang, key, spec)
        make_feature(lang)
