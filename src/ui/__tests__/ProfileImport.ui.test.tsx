// Profil › Verileri içe aktar: dosya seç → ne olduğunu göster → onayla → ekle.
// Dosya seçici ve dosya sistemi taklit edilir; veritabanı gerçektir.

import { Alert } from 'react-native';
import { fireEvent, waitFor } from '@testing-library/react-native';
import ProfileScreen from '../../../app/profile';
import { renderUI } from '@/test/renderWithProviders';
import { resetTestDb } from '@/test/dbTestUtils';
import { habitRepo, taskRepo, userRepo } from '@/db';
import { buildExport } from '@/db/exportData';

let mockUserId = '';
const mockNotify = jest.fn();
const mockPick = jest.fn();
const mockRead = jest.fn();
const mockDelete = jest.fn(async () => {});
const mockReschedule = jest.fn(async () => {});

jest.mock('expo-document-picker', () => ({ getDocumentAsync: (...a: unknown[]) => mockPick(...a) }));
jest.mock('expo-file-system', () => ({
  cacheDirectory: 'file:///cache/',
  readAsStringAsync: (...a: unknown[]) => mockRead(...a),
  deleteAsync: (...a: unknown[]) => (mockDelete as any)(...a),
  writeAsStringAsync: jest.fn(),
}));
jest.mock('expo-sharing', () => ({ isAvailableAsync: async () => true, shareAsync: jest.fn() }));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('@/lib/notifications', () => ({ rescheduleEverything: (...a: unknown[]) => (mockReschedule as any)(...a) }));
jest.mock('@/ui/AppData', () => ({
  useAppData: () => ({ authUser: null, user: { id: mockUserId }, notifyDataChanged: mockNotify }),
}));

const ROW = 'Verileri içe aktar';

beforeEach(async () => {
  await resetTestDb();
  jest.clearAllMocks();
  mockUserId = userRepo.getOrCreateLocal().id;
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

const picked = (text: string, size = text.length) => {
  mockPick.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///cache/x.json', size }] });
  mockRead.mockResolvedValue(text);
};

// A file produced by another phone.
function otherPhoneFile(): string {
  habitRepo.create({ user_id: mockUserId, title: 'Su' });
  habitRepo.create({ user_id: mockUserId, title: 'Kitap' });
  taskRepo.create({ user_id: mockUserId, title: 'Market' });
  const text = JSON.stringify(buildExport(mockUserId));
  return text;
}

async function press(u: Awaited<ReturnType<typeof renderUI>>) {
  fireEvent.press(await u.findByLabelText(ROW));
}

const lastAlert = () => {
  const calls = (Alert.alert as jest.Mock).mock.calls;
  return calls[calls.length - 1] as [string, string, { text: string; onPress?: () => void }[]?];
};

describe('Profil › içe aktar', () => {
  it('seçimi iptal edince hiçbir şey olmaz', async () => {
    mockPick.mockResolvedValue({ canceled: true, assets: null });
    const u = await renderUI(<ProfileScreen />);
    await press(u);
    await waitFor(() => expect(mockPick).toHaveBeenCalled());
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('onay penceresi dosyadakini söyler; onaylayınca eklenir, hatırlatmalar kurulur, ekranlar yenilenir', async () => {
    const text = otherPhoneFile();
    await resetTestDb(); // yeni telefon
    mockUserId = userRepo.getOrCreateLocal().id;
    picked(text);
    const u = await renderUI(<ProfileScreen />);

    await press(u);
    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
    const [title, body, buttons] = lastAlert();
    expect(title).toBe(ROW);
    expect(body).toContain('2 alışkanlık, 1 görev ve 0 hedef');
    expect(habitRepo.listByUser(mockUserId)).toHaveLength(0); // onaydan önce yazılmadı

    buttons!.find((b) => b.text === 'İçe aktar')!.onPress!();
    await waitFor(() => expect(habitRepo.listByUser(mockUserId)).toHaveLength(2));
    expect(taskRepo.listByUser(mockUserId)).toHaveLength(1);
    expect(mockReschedule).toHaveBeenCalledWith(mockUserId);
    expect(mockNotify).toHaveBeenCalled();
    await waitFor(() => expect(lastAlert()[1]).toContain('3 kayıt eklendi'));
    expect(mockDelete).toHaveBeenCalled(); // geçici kopya silindi
  });

  it('vazgeçilirse hiçbir şey eklenmez', async () => {
    const text = otherPhoneFile();
    await resetTestDb();
    mockUserId = userRepo.getOrCreateLocal().id;
    picked(text);
    const u = await renderUI(<ProfileScreen />);
    await press(u);
    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
    lastAlert()[2]!.find((b) => b.text === 'İptal')?.onPress?.();
    expect(habitRepo.listByUser(mockUserId)).toHaveLength(0);
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it('Erek dosyası olmayan ya da bozuk dosya anlaşılır hata verir, veri değişmez', async () => {
    picked('{"merhaba": 1}');
    const u = await renderUI(<ProfileScreen />);
    await press(u);
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith(ROW, expect.stringContaining('Erek dışa aktarma dosyası değil')));
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it('aşırı büyük dosya okunmadan reddedilir', async () => {
    picked('{}', 50 * 1024 * 1024);
    const u = await renderUI(<ProfileScreen />);
    await press(u);
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith(ROW, 'Dosya çok büyük.'));
    expect(mockRead).not.toHaveBeenCalled();
    expect(mockDelete).toHaveBeenCalled();
  });

  it('okuma hatası: genel uyarı, çökmez', async () => {
    mockPick.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///cache/x.json', size: 10 }] });
    mockRead.mockRejectedValue(new Error('io'));
    const u = await renderUI(<ProfileScreen />);
    await press(u);
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith(ROW, expect.stringContaining('Hiçbir şey değişmedi')));
  });
});
