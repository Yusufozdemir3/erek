// Verilerim › dışa aktar: dosya yazılır, paylaşım menüsü açılır, geçici
// dosya her durumda silinir; paylaşım yoksa ya da hata olursa kullanıcı bilgilendirilir.

import { Alert } from 'react-native';
import { fireEvent, waitFor } from '@testing-library/react-native';
import DataScreen from '../../../app/data';
import { renderUI } from '@/test/renderWithProviders';
import { exportFileName, shareDataExport } from '@/lib/shareExport';

const mockWrite = jest.fn(async () => {});
const mockDelete = jest.fn(async () => {});
const mockShare = jest.fn(async () => {});
const mockAvailable = jest.fn(async () => true);
const mockBuild = jest.fn(() => ({ app: 'Erek', habits: [] }));

jest.mock('expo-file-system', () => ({
  cacheDirectory: 'file:///cache/',
  writeAsStringAsync: (...a: unknown[]) => (mockWrite as any)(...a),
  deleteAsync: (...a: unknown[]) => (mockDelete as any)(...a),
}));
jest.mock('expo-sharing', () => ({
  isAvailableAsync: () => mockAvailable(),
  shareAsync: (...a: unknown[]) => (mockShare as any)(...a),
}));
jest.mock('@/db/exportData', () => ({ buildExport: (...a: unknown[]) => (mockBuild as any)(...a) }));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('@/ui/AppData', () => ({ useAppData: () => ({ authUser: null, user: { id: 'u1' } }) }));

beforeEach(() => {
  jest.clearAllMocks();
  mockAvailable.mockResolvedValue(true);
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

describe('shareDataExport', () => {
  it('JSON yazar, paylaşır, geçici dosyayı siler', async () => {
    await expect(shareDataExport('u1', 'Başlık')).resolves.toBe('shared');
    const uri = `file:///cache/${exportFileName()}`;
    expect(mockBuild).toHaveBeenCalledWith('u1');
    expect(mockWrite).toHaveBeenCalledWith(uri, JSON.stringify({ app: 'Erek', habits: [] }, null, 2));
    expect(mockShare).toHaveBeenCalledWith(uri, expect.objectContaining({ mimeType: 'application/json', dialogTitle: 'Başlık' }));
    expect(mockDelete).toHaveBeenCalledWith(uri, { idempotent: true });
  });

  it('paylaşım menüsü yoksa hiçbir şey yazılmaz', async () => {
    mockAvailable.mockResolvedValue(false);
    await expect(shareDataExport('u1', 'x')).resolves.toBe('unavailable');
    expect(mockWrite).not.toHaveBeenCalled();
  });

  it('paylaşım hata verse de geçici dosya silinir', async () => {
    mockShare.mockRejectedValueOnce(new Error('boom'));
    await expect(shareDataExport('u1', 'x')).rejects.toThrow('boom');
    expect(mockDelete).toHaveBeenCalled();
  });

  it('dosya adı tarih taşır', () => {
    expect(exportFileName('2026-10-03')).toBe('erek-data-2026-10-03.json');
  });
});

describe('Verilerim ekranı: dışa aktar', () => {
  it('dokununca paylaşım açılır', async () => {
    const u = await renderUI(<DataScreen />);
    fireEvent.press(await u.findByLabelText('Verilerimi dışa aktar'));
    await waitFor(() => expect(mockShare).toHaveBeenCalledTimes(1));
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('paylaşım yoksa açıklayıcı uyarı', async () => {
    mockAvailable.mockResolvedValue(false);
    const u = await renderUI(<DataScreen />);
    fireEvent.press(await u.findByLabelText('Verilerimi dışa aktar'));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith('Verilerimi dışa aktar', expect.stringContaining('paylaşma menüsü')));
  });

  it('hata olursa uyarı verir, çökmez', async () => {
    mockShare.mockRejectedValueOnce(new Error('x'));
    const u = await renderUI(<DataScreen />);
    fireEvent.press(await u.findByLabelText('Verilerimi dışa aktar'));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith('Verilerimi dışa aktar', expect.stringContaining('aktarılamadı')));
  });
});
