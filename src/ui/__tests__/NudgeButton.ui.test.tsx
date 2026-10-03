// "Arkadaşına hatırlat": önce push; ulaşamazsa paylaş penceresi yedek olarak
// sunulur, "mesajla hatırlat" bağlantısı da hep durur.

import { Alert, Share } from 'react-native';
import { act, fireEvent, waitFor } from '@testing-library/react-native';
import { NudgeButton } from '@/ui/NudgeButton';
import { renderUI } from '@/test/renderWithProviders';
import { sendNudge } from '@/sync';

jest.mock('@/sync', () => ({ sendNudge: jest.fn() }));
const mockSend = sendNudge as jest.Mock;

const ITEM = '22222222-2222-4222-8222-222222222222';
const props = { kind: 'habit' as const, itemId: ITEM, ownerName: 'Ayşe', message: 'Hey Ayşe, koşu? (Erek)' };

async function pressAlertButton(text: string) {
  const calls = (Alert.alert as jest.Mock).mock.calls;
  const buttons = calls[calls.length - 1][2] as { text: string; onPress?: () => void }[];
  await act(async () => {
    buttons.find((b) => b.text === text)?.onPress?.();
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' } as never);
});

describe('NudgeButton', () => {
  it('gönderilince düğme "hatırlatıldı" olur ve bir daha basılamaz', async () => {
    mockSend.mockResolvedValue('sent');
    const { getByText, getByLabelText } = await renderUI(<NudgeButton {...props} />);
    fireEvent.press(getByText('Arkadaşına hatırlat'));
    await waitFor(() => expect(getByText('Ayşe hatırlatıldı')).toBeTruthy());
    expect(mockSend).toHaveBeenCalledWith('habit', ITEM);
    fireEvent.press(getByLabelText('Ayşe hatırlatıldı'));
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it('12 saat içinde ikinci kez: açıklama gösterilir', async () => {
    mockSend.mockResolvedValue('alreadyToday');
    const { getByText, findByText } = await renderUI(<NudgeButton {...props} />);
    fireEvent.press(getByText('Arkadaşına hatırlat'));
    expect(await findByText('Bunu zaten hatırlattın; 12 saat sonra yeniden hatırlatabilirsin.')).toBeTruthy();
  });

  it('arkadaşın cihazı kayıtlı değilse mesajla hatırlatma önerilir', async () => {
    mockSend.mockResolvedValue('noDevice');
    const { getByText } = await renderUI(<NudgeButton {...props} />);
    fireEvent.press(getByText('Arkadaşına hatırlat'));
    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith(
        'Bildirim gönderilemiyor',
        'Ayşe şu an Erek bildirimi almıyor. Mesajla hatırlatmak ister misin?',
        expect.any(Array)
      )
    );
    await pressAlertButton('Mesajla hatırlat');
    expect(Share.share).toHaveBeenCalledWith({ message: props.message });
    // Düğme yeniden denenebilir kalır.
    expect(getByText('Arkadaşına hatırlat')).toBeTruthy();
  });

  it('hata/çevrimdışı: aynı yedek sunulur, vazgeçilirse hiçbir şey paylaşılmaz', async () => {
    mockSend.mockResolvedValue('failed');
    const { getByText } = await renderUI(<NudgeButton {...props} />);
    fireEvent.press(getByText('Arkadaşına hatırlat'));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith('Gönderilemedi', expect.any(String), expect.any(Array)));
    await pressAlertButton('İptal');
    expect(Share.share).not.toHaveBeenCalled();
  });

  it('"ya da mesajla hatırlat" her zaman paylaş penceresini açar', async () => {
    const { getByText } = await renderUI(<NudgeButton {...props} />);
    fireEvent.press(getByText('ya da mesajla hatırlat'));
    expect(Share.share).toHaveBeenCalledWith({ message: props.message });
    expect(mockSend).not.toHaveBeenCalled();
  });
});
