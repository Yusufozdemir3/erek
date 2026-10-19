// Opens the quick tour by itself, once, for everyone (lib/guides.ts explains
// when). Mounted once in the root layout; renders nothing otherwise.

import { useAppData } from '@/ui/AppData';
import { FeatureGuide } from '@/ui/guide/FeatureGuide';
import { useFeatureGuide } from '@/ui/guide/useFeatureGuide';

export function TourGate() {
  const { authUser } = useAppData();
  const guide = useFeatureGuide('tour');
  return <FeatureGuide guide="tour" visible={guide.visible} onClose={guide.close} canShare={authUser != null} />;
}
