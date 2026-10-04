// State of one screen's guide: opens by itself on a new install's first visit
// (once, after the setup wizard), and open() is what the "?" button calls.

import { useCallback, useEffect, useState } from 'react';
import { markGuideSeen, shouldAutoShowGuide, type GuideId } from '@/lib/guides';

export function useFeatureGuide(guide: GuideId) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let alive = true;
    shouldAutoShowGuide(guide).then((show) => {
      if (alive && show) {
        setVisible(true);
        // Seen as soon as it opens: closing it any way (even killing the app) counts.
        markGuideSeen(guide);
      }
    });
    return () => {
      alive = false;
    };
  }, [guide]);

  const open = useCallback(() => setVisible(true), []);
  const close = useCallback(() => {
    setVisible(false);
    markGuideSeen(guide);
  }, [guide]);

  return { visible, open, close };
}
