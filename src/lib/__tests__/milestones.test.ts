// Streak kilometre taşı rozetlerinin seçim mantığı.

import { highestMilestone } from '../milestones';

describe('highestMilestone', () => {
  it('ilk eşiğin altında null döner', () => {
    expect(highestMilestone(0)).toBeNull();
    expect(highestMilestone(6)).toBeNull();
  });

  it('eşiğe tam ulaşınca o rozeti döner', () => {
    expect(highestMilestone(7)?.days).toBe(7);
    expect(highestMilestone(30)?.days).toBe(30);
  });

  it('birden çok eşik geçildiyse EN YÜKSEĞİNİ döner', () => {
    expect(highestMilestone(45)?.days).toBe(30);
    expect(highestMilestone(150)?.days).toBe(100);
  });

  it('en yüksek eşiğin çok üstünde en yükseği döner (💎 1 yıl)', () => {
    expect(highestMilestone(1000)?.days).toBe(365);
  });
});
