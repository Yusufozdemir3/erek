// Katkı payı şeridi: iki kişi varsa görünür, yüzde + miktar yazar; tek kişide hiç çizilmez.

import { GoalContributors } from '../goal/GoalContributors';
import { renderUI } from '@/test/renderWithProviders';

const names: Record<string, string> = { a: 'Sen', b: 'Ayşe' };

describe('GoalContributors', () => {
  it('her kişiyi yüzde ve miktarla listeler', async () => {
    const u = await renderUI(
      <GoalContributors
        shares={[
          { key: 'a', amount: 30, share: 60 },
          { key: 'b', amount: 20, share: 40 },
        ]}
        unit="km"
        nameOf={(k) => names[k]}
      />
    );
    expect(await u.findByText('Katkı payı')).toBeTruthy();
    expect(u.getByText('Sen')).toBeTruthy();
    expect(u.getByText('%60 · 30 km')).toBeTruthy();
    expect(u.getByText('%40 · 20 km')).toBeTruthy();
  });

  it('tek kişide hiçbir şey çizmez', async () => {
    const u = await renderUI(<GoalContributors shares={[{ key: 'a', amount: 5, share: 100 }]} unit={null} nameOf={(k) => names[k]} />);
    expect(u.queryByText('Katkı payı')).toBeNull();
  });
});
