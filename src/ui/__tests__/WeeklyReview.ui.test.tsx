// Haftalık özet ekranı (gerçek veritabanıyla) ve Bugün'deki Pazar/Pazartesi kartı.

import { fireEvent, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ReviewScreen from '../../../app/review';
import { ReviewCard, REVIEW_DISMISSED_KEY } from '@/ui/ReviewCard';
import { renderUI } from '@/test/renderWithProviders';
import { resetTestDb } from '@/test/dbTestUtils';
import { habitRepo, taskRepo, userRepo } from '@/db';
import { toYmd } from '@/lib/helpers';

let mockUserId = '';
const mockPush = jest.fn();

jest.mock('expo-router', () => {
  const React = require('react');
  return {
    useFocusEffect: (cb: () => void | (() => void)) => React.useEffect(cb, [cb]),
    router: { push: (...a: unknown[]) => mockPush(...a) },
  };
});
jest.mock('@/ui/AppData', () => ({
  useAppData: () => ({ user: { id: mockUserId }, dataVersion: 0 }),
}));

const ago = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return toYmd(d);
};

beforeEach(async () => {
  await resetTestDb();
  await AsyncStorage.clear();
  jest.clearAllMocks();
  mockUserId = userRepo.getOrCreateLocal().id;
});

describe('ReviewScreen', () => {
  it('alışkanlık yokken açıklama gösterir', async () => {
    const u = await renderUI(<ReviewScreen />);
    expect(await u.findByText(/henüz planlı alışkanlık yok/)).toBeTruthy();
  });

  it('oran, tam gün, görev sayısı ve en istikrarlı alışkanlık görünür', async () => {
    const h = habitRepo.create({ user_id: mockUserId, title: 'Kitap oku', start_date: ago(6) });
    for (const n of [0, 1, 2, 3, 4]) habitRepo.toggleLog(h.id, ago(n), true);
    const t = taskRepo.create({ user_id: mockUserId, title: 'İş' });
    taskRepo.setCompleted(t.id, true);

    const u = await renderUI(<ReviewScreen />);

    expect(await u.findByText('%71')).toBeTruthy(); // 5/7
    expect(u.getByText('5/7')).toBeTruthy(); // tam gün
    expect(u.getByText('1')).toBeTruthy(); // görev
    expect(u.getByText('görev tamamlandı')).toBeTruthy();
    expect(u.getByText('Kitap oku')).toBeTruthy();
    expect(u.getByText('5/7 gün')).toBeTruthy();
    expect(u.getByText('İyi gidiyorsun, devam.')).toBeTruthy();
  });

  it('birden çok alışkanlıkta hepsi oranlarıyla listelenir', async () => {
    const a = habitRepo.create({ user_id: mockUserId, title: 'Kitap oku', start_date: ago(6) });
    const b = habitRepo.create({ user_id: mockUserId, title: 'Yoga', start_date: ago(6) });
    for (const n of [0, 1, 2]) habitRepo.toggleLog(a.id, ago(n), true);
    habitRepo.toggleLog(b.id, ago(0), true);
    const u = await renderUI(<ReviewScreen />);
    expect(await u.findByText('Tüm alışkanlıklar')).toBeTruthy();
    expect(u.getByText('3/7')).toBeTruthy();
    expect(u.getAllByText('1/7').length).toBe(2); // Yoga + tam gün çipi
  });

  it('önceki haftadan iyi gidiyorsa artışı söyler', async () => {
    const h = habitRepo.create({ user_id: mockUserId, title: 'Su', start_date: ago(13) });
    for (const n of [0, 1, 2, 3, 4, 5, 6]) habitRepo.toggleLog(h.id, ago(n), true);
    const u = await renderUI(<ReviewScreen />);
    expect(await u.findByText('%100')).toBeTruthy();
    expect(u.getByText('Önceki haftadan 100 puan yukarıda')).toBeTruthy();
    expect(u.getByText('Harika bir hafta geçirdin.')).toBeTruthy();
  });
});

describe('ReviewCard', () => {
  const P = { rate: 78, delta: 12 };
  const MONDAY = '2026-10-05';
  const TUESDAY = '2026-10-06';

  it('Pazartesi veri varsa görünür; açınca özet sayfasına gider ve o hafta bir daha çıkmaz', async () => {
    const u = await renderUI(<ReviewCard today={MONDAY} preview={P} />);
    fireEvent.press(await u.findByLabelText(/Haftanın özeti hazır/));
    expect(mockPush).toHaveBeenCalledWith('/review');
    await waitFor(() => expect(u.queryByText('Haftanın özeti hazır')).toBeNull());
    expect(await AsyncStorage.getItem(REVIEW_DISMISSED_KEY)).toBe(MONDAY);
  });

  it('kartta oran ve önceki haftaya göre değişim yazar', async () => {
    const a = await renderUI(<ReviewCard today={MONDAY} preview={{ rate: 78, delta: 12 }} />);
    expect(await a.findByText('%78 · Önceki haftadan 12 puan yukarıda')).toBeTruthy();
    a.unmount();
    const b = await renderUI(<ReviewCard today={MONDAY} preview={{ rate: 50, delta: null }} />);
    expect(await b.findByText('%50')).toBeTruthy();
  });

  it('Kapat da o haftayı hatırlar; sonraki hafta yeniden görünür', async () => {
    const u = await renderUI(<ReviewCard today="2026-10-04" preview={P} />); // Pazar, haftanın sonu
    fireEvent.press(await u.findByLabelText('Kapat'));
    await waitFor(() => expect(u.queryByText('Haftanın özeti hazır')).toBeNull());
    u.unmount();
    const later = await renderUI(<ReviewCard today="2026-10-12" preview={P} />); // sonraki Pazartesi
    expect(await later.findByText('Haftanın özeti hazır')).toBeTruthy();
  });

  it('hafta ortasında ya da veri yokken görünmez', async () => {
    const a = await renderUI(<ReviewCard today={TUESDAY} preview={P} />);
    expect(a.queryByText('Haftanın özeti hazır')).toBeNull();
    const b = await renderUI(<ReviewCard today={MONDAY} preview={null} />);
    expect(b.queryByText('Haftanın özeti hazır')).toBeNull();
  });
});
