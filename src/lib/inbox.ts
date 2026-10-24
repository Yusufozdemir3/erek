// The Notifications inbox — the pure parts: what a row is, which are unread,
// what a row says and where a tap opens. Fetching lives in sync/inbox.ts; the
// server side is get_inbox() (supabase/phase11-inbox.sql).

export type InboxType = 'congrats' | 'finished' | 'nudge';
export type InboxKind = 'habit' | 'goal' | 'task';

export interface InboxItem {
  id: string;
  type: InboxType;
  kind: InboxKind;
  itemId: string;
  senderId: string;
  senderName: string | null;
  itemTitle: string | null; // null: the item was deleted since
  createdAt: string; // ISO
}

const TYPES: InboxType[] = ['congrats', 'finished', 'nudge'];
const KINDS: InboxKind[] = ['habit', 'goal', 'task'];

// The RPC's rows -> items; anything malformed is dropped, not guessed.
export function parseInbox(rows: unknown): InboxItem[] {
  if (!Array.isArray(rows)) return [];
  const out: InboxItem[] = [];
  for (const r of rows as Record<string, unknown>[]) {
    if (!r || typeof r !== 'object') continue;
    const type = r.type as InboxType;
    const kind = r.item_kind as InboxKind;
    if (!TYPES.includes(type) || !KINDS.includes(kind)) continue;
    if (typeof r.id !== 'string' || typeof r.item_id !== 'string' || typeof r.sender_id !== 'string') continue;
    if (typeof r.created_at !== 'string') continue;
    out.push({
      id: r.id,
      type,
      kind,
      itemId: r.item_id,
      senderId: r.sender_id,
      senderName: typeof r.sender_name === 'string' ? r.sender_name : null,
      itemTitle: typeof r.item_title === 'string' ? r.item_title : null,
      createdAt: r.created_at,
    });
  }
  return out;
}

// Newer than the last time the inbox was opened (seenAt: ISO or null = never).
export function unreadCount(items: InboxItem[], seenAt: string | null): number {
  if (!seenAt) return items.length;
  const seen = Date.parse(seenAt);
  return items.filter((i) => Date.parse(i.createdAt) > seen).length;
}

// The newest row's time: what "seen up to" becomes when the inbox is opened.
export function newestAt(items: InboxItem[]): string | null {
  let best: string | null = null;
  for (const i of items) if (!best || Date.parse(i.createdAt) > Date.parse(best)) best = i.createdAt;
  return best;
}

// i18n key of the row's sentence ({name}, {title}).
export function inboxTextKey(item: InboxItem): string {
  return `inbox.${item.type}`;
}

// Where a tap opens. Congratulations and nudges are about MY item; a finished
// notice about the friend's shared one. Tasks have no screen of their own.
export function inboxRoute(item: InboxItem): string | null {
  if (item.kind === 'task' || item.itemTitle == null) return null;
  return item.type === 'finished' ? `/shared-${item.kind}/${item.itemId}` : `/${item.kind}/${item.itemId}`;
}
