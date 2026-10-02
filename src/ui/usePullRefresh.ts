// Pull-to-refresh for the list screens: runs a cloud sync round (a no-op when
// accounts are off or nobody is signed in — syncNow reports 'disabled') and
// then reloads the screen's own data. The spinner stays until both are done.

import { useCallback, useState } from 'react';
import { useAppData } from '@/ui/AppData';

export function usePullRefresh(reload: () => void) {
  const { syncNow } = useAppData();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await syncNow();
    } catch (e) {
      // syncNow reports failures through its result; this is a belt-and-braces catch.
      console.warn('[Refresh] sync failed:', e);
    } finally {
      reload();
      setRefreshing(false);
    }
  }, [syncNow, reload]);

  return { refreshing, onRefresh };
}
