// Doğal dil → görev alanları (başlık/tarih/saat/öncelik). Gemini'nin
// yapılandırılmış JSON çıkışını (responseSchema) kullanır — serbest metin
// ayrıştırmaktan çok daha güvenilir, ekstra parse mantığı gerektirmez.
//
// GEREKLİ SECRET: GEMINI_API_KEY (Google AI Studio'dan alınır).
//   supabase secrets set GEMINI_API_KEY=xxxxx
// Deploy: supabase functions deploy parse-task
//
// Bu fonksiyon kimlik doğrulaması gerektirmez (ACCOUNTS_ENABLED=false iken de
// çalışır) — istemci Supabase anon key'i ile çağırır, varsayılan JWT doğrulaması
// bunu zaten kabul eder (anon key geçerli bir imzalı JWT'dir).

// KRİTİK (2026-07): gemini-2.0-flash VE gemini-2.5-flash/flash-lite (2.x nesli)
// yeni Google hesaplarına "no longer available to new users" hatasıyla kapalı —
// billing bağlı/API etkin olsa bile. Çalışan model: 3.x nesli (gemini-3.1-flash-lite,
// bütçe-dostu). GEMINI_MODEL secret'ı ile kod değiştirmeden farklı model denenebilir.
const GEMINI_MODEL = Deno.env.get('GEMINI_MODEL') ?? 'gemini-3.1-flash-lite';

// Her zaman DİZİ döner (tek görev olsa da dizi içinde tek öğe) — istemci tarafı
// tek/çok görev ayrımını buna göre yapar (bkz. aiTaskParser.ts).
const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    tasks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          due_date: { type: 'string', nullable: true, description: 'YYYY-MM-DD veya null' },
          due_time: { type: 'string', nullable: true, description: 'HH:MM (24 saat) veya null' },
          priority: { type: 'string', enum: ['low', 'medium', 'high'], nullable: true },
          remind_times: {
            type: 'array',
            items: { type: 'string' },
            description: 'Bildirim/hatırlatma istenen saatler, "HH:MM" (24 saat) formatında. İstenmiyorsa boş dizi.',
          },
        },
        required: ['title'],
      },
    },
  },
  required: ['tasks'],
};

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

function buildPrompt(text: string, today: string, lang: string): string {
  return `Sen bir görev yöneticisi asistanısın. Kullanıcının serbest metnini GÖREVLERE ayrıştır.
Bugünün tarihi: ${today}. Kullanıcının uygulama dili: ${lang} (başlıkları bu dilde YAZMA, kullanıcının kendi metnindeki dili koru — yalnız tarih/saat ifadelerini başlıktan çıkar).

Metinde BİRDEN FAZLA görev olabilir (virgülle, "ve" ile, madde işaretiyle ya da satır satır ayrılmış olabilir) — her birini "tasks" dizisinde AYRI bir öğe olarak döndür. Tek bir görev varsa yine de dizi içinde TEK öğe döndür (dizi HER ZAMAN kullanılır).

Her görev için kurallar:
- title: kısa, eylem odaklı başlık. Tarih/saat ifadelerini başlıktan ÇIKAR (örn. "yarın 17:00 doktora git" -> "Doktora git").
- due_date: metinde bir tarih ifadesi varsa (yarın, gelecek hafta pazartesi, 25 Temmuz gibi) bugünün tarihine (${today}) göre çöz, "YYYY-MM-DD" formatında ver. Tarih ifadesi yoksa null.
- due_time: metinde bir saat ifadesi varsa "HH:MM" (24 saat) formatında ver. Saat ifadesi yoksa null.
- priority: "acil", "önemli", "mutlaka", "kritik" gibi aciliyet ifadesi varsa "high". Aksi halde null (varsayılanı zorlama).
- remind_times: kullanıcı açıkça hatırlatılmak/bildirim istediyse "HH:MM" (24 saat) formatında saat(ler) ver. Belirli bir saat söylediyse ("10:00'da hatırlat") onu aynen kullan. Göreli söylediyse ("yarım saat önce", "1 saat önce hatırlat") ve due_time biliniyorsa, due_time'dan o kadar geriye giderek hesapla. Hatırlatma istenmediyse boş dizi [] ver (null DEĞİL).
- Emin olmadığın alanları null bırak, TAHMİN YÜRÜTME.

Metin: "${text}"`;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  let body: { text?: string; today?: string; lang?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Geçersiz JSON gövdesi' }, 400);
  }

  const text = body.text?.trim();
  if (!text) {
    return jsonResponse({ error: "'text' alanı gerekli" }, 400);
  }

  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) {
    return jsonResponse({ error: 'GEMINI_API_KEY yapılandırılmamış (bkz. supabase secrets set)' }, 500);
  }

  const today = body.today ?? new Date().toISOString().slice(0, 10);
  const lang = body.lang ?? 'tr';
  const prompt = buildPrompt(text, today, lang);

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: RESPONSE_SCHEMA,
            temperature: 0.1,
          },
        }),
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      return jsonResponse({ error: `Gemini hatası (${res.status}): ${errText}` }, 502);
    }

    const data = await res.json();
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!raw) {
      return jsonResponse({ error: 'Gemini boş yanıt döndü' }, 502);
    }

    const parsed = JSON.parse(raw);
    return jsonResponse(parsed, 200);
  } catch (e) {
    return jsonResponse({ error: String(e) }, 500);
  }
});
