// State of one screen's guide: opens by itself on a new install's first visit
// (once, after the setup wizard), and open() is what the "?" button calls.

import { useCallback, useEffect, useState } from 'react';
import { markGuideSeen, onGatesClosed, shouldAutoShowGuide, type GuideId } from '@/lib/guides';

// enabled=false: the screen can't show the guide right now (e.g. signed out), so
// it must not open by itself nor be marked seen.
export function useFeatureGuide(guide: GuideId, enabled = true) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const check = () =>
      shouldAutoShowGuide(guide).then((show) => {
        if (alive && show) {
          setVisible(true);
          // Seen as soon as it opens: closing it any way (even killing the app) counts.
          markGuideSeen(guide);
        }
      });
    check();
    // The Today tab is already mounted behind the wizard and the login screen:
    // look again when they close.
    const unsubscribe = onGatesClosed(check);
    return () => {
      alive = false;
      unsubscribe();
    };
  }, [guide, enabled]);

  const open = useCallback(() => setVisible(true), []);
  const close = useCallback(() => {
    setVisible(false);
    markGuideSeen(guide);
  }, [guide]);

  return { visible, open, close };
}
