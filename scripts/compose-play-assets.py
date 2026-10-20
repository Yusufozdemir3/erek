"""Build Play Store phone screenshots (1080x1920, 9:16) from genuine emulator captures.

Usage: python scripts/compose-play-assets.py
Reads  play_store_assets/original/<lang>/<raw-key>.png  (untouched 1080x2400 captures)
Writes play_store_assets/final/<lang>/NN-name.png       (1080x1920 PNG, 24-bit, no alpha)
       play_store_assets/preview/contact-<lang>.png     (overview only, not for upload)

No device frame (Play guidance: avoid device imagery); headline band stays under 20% of
the image height; the app capture is only scaled and rounded, never edited.
"""
import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = os.path.join(os.path.dirname(__file__), '..', 'play_store_assets')
ORIG, FINAL, PREVIEW = (os.path.join(ROOT, d) for d in ('original', 'final', 'preview'))
BOLD = 'C:/Windows/Fonts/segoeuib.ttf'
REG = 'C:/Windows/Fonts/segoeui.ttf'

W, H = 1080, 1920
HEADLINE_MAX = int(H * 0.20)
SHOT_W = 880

# Dark theme first: deep tinted backgrounds for the dark captures, one light shot at the end.
# (output name, raw key, gradient top, gradient bottom, text color, {lang: (title, subtitle)})
SHOTS = [
    ('01-today-overview', '01-today', (22, 46, 36), (8, 14, 12), (226, 244, 234), {
        'tr': ('Günün tek ekranda', 'Görevlerin ve alışkanlıkların bir arada'),
        'en': ('Your whole day, one screen', 'Tasks and habits together'),
        'de': ('Dein Tag auf einen Blick', 'Aufgaben und Gewohnheiten vereint'),
    }),
    ('02-goal-forecast', '05-goal-stats', (56, 36, 14), (14, 10, 6), (255, 226, 190), {
        'tr': ('Hedefe ne zaman varacağını gör', 'Hızına göre tahmini bitiş tarihi'),
        'en': ('See when you will reach your goal', 'A finish date based on your pace'),
        'de': ('Sieh, wann du dein Ziel erreichst', 'Zieldatum nach deinem Tempo'),
    }),
    ('03-habit-streaks', '03-habits', (30, 32, 66), (9, 9, 18), (214, 220, 255), {
        'tr': ('Alışkanlıklarını takip et', 'Her gün küçük bir adım'),
        'en': ('Keep track of your habits', 'One small step every day'),
        'de': ('Behalte deine Gewohnheiten im Blick', 'Jeden Tag ein kleiner Schritt'),
    }),
    ('04-tasks-tags', '02-tasks', (58, 20, 36), (14, 7, 10), (255, 214, 228), {
        'tr': ('Görevlerin düzenli kalsın', 'İkon, renkli etiket ve alt görevler'),
        'en': ('Keep every task in order', 'Icons, colored tags and subtasks'),
        'de': ('Aufgaben im Griff', 'Icons, farbige Tags und Unteraufgaben'),
    }),
    ('05-goals-progress', '04-goals', (12, 46, 52), (6, 14, 16), (200, 240, 244), {
        'tr': ('Büyük hedefleri adımlara böl', 'İlerlemen her an gözünün önünde'),
        'en': ('Break big goals into milestones', 'Your progress, always in sight'),
        'de': ('Große Ziele in Etappen', 'Dein Fortschritt immer im Blick'),
    }),
    ('06-habit-stats', '06-habit-stats', (40, 24, 62), (11, 8, 18), (230, 214, 255), {
        'tr': ('İlerlemeni gör', 'Seri, tamamlama oranı ve puan grafiği'),
        'en': ('See your progress', 'Streaks, completion rate and score chart'),
        'de': ('Fortschritt im Blick', 'Serie, Erledigungsquote und Punkteverlauf'),
    }),
    ('07-weekly-review', '07-review', (16, 48, 38), (6, 14, 11), (206, 244, 226), {
        'tr': ('Haftanı bir bakışta değerlendir', 'Neyin iyi gittiğini, neyin ilgi beklediğini gör'),
        'en': ('Review your week at a glance', 'See what went well and what needs attention'),
        'de': ('Deine Woche auf einen Blick', 'Was gut lief und was Aufmerksamkeit braucht'),
    }),
    ('08-light-theme', '08-today-light', (232, 244, 237), (190, 222, 204), (20, 61, 46), {
        'tr': ('Açık tema da var', 'Gündüz ya da gece, sana uyanı seç'),
        'en': ('Light theme too', 'Day or night, pick what suits you'),
        'de': ('Auch im hellen Design', 'Tag oder Nacht, ganz wie du magst'),
    }),
]

# Screens with a known on-screen app defect in that language; left out until the app is fixed.
EXCLUDE = {
    ('en', '07-weekly-review'): 'rate shown as "%58" instead of "58%"',
    ('de', '07-weekly-review'): 'rate shown as "%58" instead of "58 %"',
    ('de', '01-today-overview'): '"Gewohnheiten" label overlaps its progress bar',
    ('de', '08-light-theme'): '"Gewohnheiten" label overlaps its progress bar',
    ('de', '06-habit-stats'): 'chart y-axis label "100 %" truncated to "100…"',
}


def gradient(top, bottom, w, h):
    col = Image.new('RGB', (1, h))
    for y in range(h):
        t = y / (h - 1)
        col.putpixel((0, y), tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3)))
    return col.resize((w, h))


def wrap(draw, text, fnt, max_w):
    """One line if it fits, else two lines split where their widths are most even."""
    if draw.textlength(text, font=fnt) <= max_w:
        return [text]
    words = text.split()
    splits = [(' '.join(words[:i]), ' '.join(words[i:])) for i in range(1, len(words))]
    fitting = [s for s in splits if max(draw.textlength(l, font=fnt) for l in s) <= max_w] or splits
    return list(min(fitting, key=lambda s: abs(draw.textlength(s[0], font=fnt) - draw.textlength(s[1], font=fnt))))


def headline(canvas, title, sub, color, sub_color):
    """Title + subtitle centered vertically in the headline band; returns the band's text bottom."""
    d = ImageDraw.Draw(canvas)
    ft, fs = ImageFont.truetype(BOLD, 70), ImageFont.truetype(REG, 38)
    tl, sl = wrap(d, title, ft, W - 120), wrap(d, sub, fs, W - 140)
    block = len(tl) * 84 + 12 + len(sl) * 50
    y = max(40, (HEADLINE_MAX + 10 - block) // 2)
    for line in tl:
        d.text((W // 2, y), line, font=ft, fill=color, anchor='ma')
        y += 84
    y += 12
    for line in sl:
        d.text((W // 2, y), line, font=fs, fill=sub_color, anchor='ma')
        y += 50
    return y


def framed_shot(raw, dark):
    """Scaled capture with rounded top corners and a hairline edge; bleeds off the bottom."""
    s = raw.resize((SHOT_W, round(raw.height * SHOT_W / raw.width)), Image.LANCZOS).convert('RGBA')
    r = 56
    mask = Image.new('L', s.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, s.width - 1, s.height + r), r, fill=255)
    s.putalpha(mask)
    edge = Image.new('RGBA', s.size, (0, 0, 0, 0))
    ImageDraw.Draw(edge).rounded_rectangle(
        (0, 0, s.width - 1, s.height + r), r,
        outline=(255, 255, 255, 60) if dark else (0, 0, 0, 40), width=2)
    s.alpha_composite(edge)
    return s


def compose(lang, name, key, top, bot, color, texts):
    raw = Image.open(os.path.join(ORIG, lang, key + '.png')).convert('RGB')
    dark = sum(top) < 300
    canvas = gradient(top, bot, W, H).convert('RGBA')
    sub_color = tuple(int(c * 0.74) for c in color) if dark else tuple(int(c * 0.78 + 40) for c in color)
    bottom = headline(canvas, *texts[lang], color, sub_color)
    assert bottom <= HEADLINE_MAX, f'{lang}/{name}: headline band {bottom}px > {HEADLINE_MAX}px'
    shot = framed_shot(raw, dark)
    x, y = (W - SHOT_W) // 2, HEADLINE_MAX + 20
    shadow = Image.new('RGBA', canvas.size, (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle((x, y + 18, x + SHOT_W, H + 100), 56, fill=(0, 0, 0, 70))
    canvas.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(28)))
    canvas.alpha_composite(shot, (x, y))
    out = os.path.join(FINAL, lang)
    os.makedirs(out, exist_ok=True)
    path = os.path.join(out, name + '.png')
    canvas.convert('RGB').save(path, optimize=True)
    return path


def contact_sheet(lang, paths):
    tw, th, gap = 270, 480, 24
    sheet = Image.new('RGB', (gap + len(paths) * (tw + gap), th + gap * 2), (245, 246, 248))
    for i, p in enumerate(paths):
        sheet.paste(Image.open(p).resize((tw, th), Image.LANCZOS), (gap + i * (tw + gap), gap))
    os.makedirs(PREVIEW, exist_ok=True)
    sheet.save(os.path.join(PREVIEW, f'contact-{lang}.png'), optimize=True)


if __name__ == '__main__':
    for lang in ('tr', 'en', 'de'):
        paths = []
        for name, key, top, bot, color, texts in SHOTS:
            if (lang, name) in EXCLUDE:
                print('skip', lang, name, '-', EXCLUDE[(lang, name)])
                continue
            paths.append(compose(lang, name, key, top, bot, color, texts))
            print('wrote', paths[-1])
        contact_sheet(lang, paths)
