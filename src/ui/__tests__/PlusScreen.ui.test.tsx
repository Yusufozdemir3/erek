// Erek Plus ekranı: planlar, tasarruf, deneme, satın alma, geri yükleme, etkin durumlar.

import { fireEvent, waitFor } from '@testing-library/react-native';
import PlusScreen from '../../../app/plus';
import { renderUI } from '@/test/renderWithProviders';
import type { Plan } from '@/plus/purchases';

const mockFetchPlans = jest.fn();
const mockBuy = jest.fn();
const mockRestore = jest.fn();
jest.mock('@/plus/purchases', () => ({
  fetchPlans: (...a: unknown[]) => mockFetchPlans(...a),
  buyPlan: (...a: unknown[]) => mockBuy(...a),
  restorePurchases: (...a: unknown[]) => mockRestore(...a),
  purchasesAvailable: () => true,
  configurePurchases: async () => false,
  currentCustomerInfo: async () => null,
  listenCustomerInfo: () => () => {},
}));

const mockApply = jest.fn();
let mockState = { billing: true, plus: false, adsFree: false, introEndsAt: null as number | null };
jest.mock('@/plus/plusStore', () => ({
  usePlusState: () => mockState,
  applyCustomerInfo: (...a: unknown[]) => mockApply(...a),
  useFeaturesUnlocked: () => false,
}));

const plan = (id: string, kind: Plan['kind'], price: number, priceString: string, trial: number | null = null): Plan => ({
  id,
  kind,
  price,
  priceString,
  trialDays: trial,
  raw: {} as Plan['raw'],
});

const PLANS = [
  plan('$rc_monthly', 'monthly', 2.99, '$2.99'),
  plan('$rc_annual', 'annual', 19.99, '$19.99', 7),
  plan('$rc_lifetime', 'adsfree', 3.99, '$3.99'),
];

beforeEach(() => {
  jest.clearAllMocks();
  mockState = { billing: true, plus: false, adsFree: false, introEndsAt: null };
  mockFetchPlans.mockResolvedValue(PLANS);
});

describe('PlusScreen', () => {
  it('yıllık plan seçili gelir, tasarruf ve deneme gösterilir', async () => {
    const u = await renderUI(<PlusScreen />);
    await waitFor(() => expect(u.getByLabelText('Yıllık, $19.99')).toBeTruthy());
    expect(u.getByLabelText('Yıllık, $19.99').props.accessibilityState.checked).toBe(true);
    expect(u.getByText('%44 tasarruf')).toBeTruthy();
    expect(u.getByText('7 gün ücretsiz başla')).toBeTruthy();
  });

  it('plan seçip satın alır; sonucu uygular', async () => {
    const info = { entitlements: { active: { plus: {} } } };
    mockBuy.mockResolvedValue({ status: 'success', info });
    const u = await renderUI(<PlusScreen />);
    await waitFor(() => u.getByLabelText('Aylık, $2.99'));
    fireEvent.press(u.getByLabelText('Aylık, $2.99'));
    fireEvent.press(u.getByText('Plus’a geç'));
    await waitFor(() => expect(mockBuy).toHaveBeenCalledWith(PLANS[0]));
    await waitFor(() => expect(mockApply).toHaveBeenCalledWith(info));
    expect(u.getByText('Teşekkürler! Hepsi açıldı.')).toBeTruthy();
  });

  it('vazgeçilen satın alma sessizdir', async () => {
    mockBuy.mockResolvedValue({ status: 'cancelled' });
    const u = await renderUI(<PlusScreen />);
    await waitFor(() => u.getByText('7 gün ücretsiz başla'));
    fireEvent.press(u.getByText('7 gün ücretsiz başla'));
    await waitFor(() => expect(mockBuy).toHaveBeenCalled());
    expect(mockApply).not.toHaveBeenCalled();
    expect(u.queryByText('Bir sorun oldu. Biraz sonra tekrar dene.')).toBeNull();
  });

  it('reklamsız kartı ayrı satın alınır', async () => {
    mockBuy.mockResolvedValue({ status: 'cancelled' });
    const u = await renderUI(<PlusScreen />);
    await waitFor(() => u.getByLabelText('Yalnızca reklamsız, $3.99'));
    fireEvent.press(u.getByLabelText('Yalnızca reklamsız, $3.99'));
    await waitFor(() => expect(mockBuy).toHaveBeenCalledWith(PLANS[2]));
  });

  it('geri yükleme: bulunamazsa söyler', async () => {
    mockRestore.mockResolvedValue({ status: 'success', info: { entitlements: { active: {} } } });
    const u = await renderUI(<PlusScreen />);
    await waitFor(() => u.getByText('Satın alımları geri yükle'));
    fireEvent.press(u.getByText('Satın alımları geri yükle'));
    await waitFor(() => u.getByText('Geri yüklenecek bir satın alım bulunamadı.'));
  });

  it('plan yoksa kullanılamıyor der', async () => {
    mockFetchPlans.mockResolvedValue([]);
    const u = await renderUI(<PlusScreen />);
    await waitFor(() => u.getByText('Satın alma şu an kullanılamıyor.'));
  });

  it('Plus etkinse yönet düğmesi var, plan listesi yok', async () => {
    mockState = { ...mockState, plus: true };
    const u = await renderUI(<PlusScreen />);
    await waitFor(() => u.getByText('Erek Plus etkin'));
    expect(u.getByText('Aboneliği yönet')).toBeTruthy();
    expect(u.queryByText('Satın alımları geri yükle')).toBeNull();
  });

  it('deneme sürerken kalan günü söyler', async () => {
    mockState = { ...mockState, introEndsAt: Date.now() + 10 * 24 * 60 * 60 * 1000 - 1000 };
    const u = await renderUI(<PlusScreen />);
    await waitFor(() => u.getByText('Deneme sürenin bitmesine 10 gün var; şimdilik her şey açık.'));
  });
});
