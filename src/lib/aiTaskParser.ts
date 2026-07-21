// Doğal dil → görev alanları. Supabase Edge Function'a (parse-task) metni
// gönderir, Gemini'nin ayrıştırdığı görev(ler)in title/due_date/due_time/priority'sini
// döner. Metinde birden fazla görev olabilir (sunucu HER ZAMAN bir dizi döner,
// tek görev olsa da dizi içinde tek öğe) — çağıran dizi boyuna göre tek-form
// (tam düzenleme) ya da çoklu-liste (toplu ekleme) akışını seçer.
//
// AÇIKÇA OPT-IN: yalnızca kullanıcı AddSheet'teki "AI ile ayrıştır" düğmesine
// basınca çağrılır — otomatik/arka plan çağrısı YOK. Bu, uygulamanın "hiçbir
// veri cihazdan çıkmaz" ilkesinin bilinçli TEK istisnasıdır (bkz. aiPrefs.ts +
// gizlilik politikası "AI ile hızlı ekleme" bölümü). Sonuç HER ZAMAN kullanıcıya
// gösterilir, kaydetmeden önce düzenlenebilir/reddedilebilir — asla otomatik
// kaydetmez.
//
// Sunucu tarafı: supabase/functions/parse-task (Gemini API anahtarı orada secret
// olarak tutulur, istemciye HİÇ gömülmez).

import { supabase } from '@/sync/supabase';
import { todayDate } from '@/lib/helpers';
import type { Priority } from '@/db';

export interface ParsedTaskFields {
  title: string;
  due_date: string | null; // "YYYY-MM-DD"
  due_time: string | null; // "HH:MM"
  priority: Priority | null;
  remind_times: string[]; // "HH:MM"[]
}

const PRIORITIES: Priority[] = ['low', 'medium', 'high'];
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

function toParsedTask(raw: unknown): ParsedTaskFields | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.title !== 'string' || !r.title.trim()) return null;
  return {
    title: r.title,
    due_date: typeof r.due_date === 'string' ? r.due_date : null,
    due_time: typeof r.due_time === 'string' ? r.due_time : null,
    priority: PRIORITIES.includes(r.priority as Priority) ? (r.priority as Priority) : null,
    remind_times: Array.isArray(r.remind_times)
      ? r.remind_times.filter((v): v is string => typeof v === 'string' && HHMM.test(v))
      : [],
  };
}

export async function parseTaskText(text: string, lang: string): Promise<ParsedTaskFields[] | null> {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (!supabase) return null; // Supabase yapılandırılmamış (.env eksik)

  const { data, error } = await supabase.functions.invoke('parse-task', {
    body: { text: trimmed, today: todayDate(), lang },
  });
  const tasks = Array.isArray((data as { tasks?: unknown } | null)?.tasks)
    ? ((data as { tasks: unknown[] }).tasks.map(toParsedTask).filter((t): t is ParsedTaskFields => t !== null))
    : [];

  if (error || tasks.length === 0) {
    // FunctionsHttpError'da asıl hata mesajı error değil error.context (Response)
    // içinde — onu okumadan sadece "non-2xx status code" gibi anlamsız bir metin
    // görünür. context bir Response; body'si TEK SEFER okunabilir.
    let detail: unknown = error ?? data;
    const context = (error as { context?: Response })?.context;
    if (context && typeof context.json === 'function') {
      try {
        detail = await context.clone().json();
      } catch {
        try {
          detail = await context.clone().text();
        } catch {
          // olduğu gibi bırak
        }
      }
    }
    console.warn('[AI] Görev ayrıştırma başarısız:', detail);
    return null;
  }

  return tasks;
}
