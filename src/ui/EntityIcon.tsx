// Görev/Alışkanlık/Hedef "tür" ikonu — alt sekme çubuğuyla BİREBİR aynı çizgi
// ikon setini kullanır (Feather check-square / Ionicons flame / Feather target)
// ki uygulamanın her yerinde bu üç türün görsel kimliği tutarlı kalsın.
// Kullanım: ＋ menüsü (AddSheet, AddFab), Bugün özet çubuğu (DailySummary).
// Alışkanlığın kendi seçtiği emoji ikonu (HabitEditModal) bundan AYRI — o
// kullanıcı özelleştirmesi, tür kimliği değil.

import { Feather, Ionicons } from '@expo/vector-icons';

export type EntityType = 'task' | 'habit' | 'goal';

export function EntityIcon({
  type,
  size = 22,
  color,
}: {
  type: EntityType;
  size?: number;
  color: string;
}) {
  if (type === 'habit') return <Ionicons name="flame" size={size} color={color} />;
  if (type === 'goal') return <Feather name="target" size={size} color={color} />;
  return <Feather name="check-square" size={size} color={color} />;
}
