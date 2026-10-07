// Görev formunda sesli giriş: mikrofon, onay akışı, forma doldurma, geri alma.
// Tanıyıcı '@/lib/voice' üzerinden taklit edilir; olaylar `emit` ile verilir.

import { AccessibilityInfo, Alert, AppState } from 'react-native';
import { act, fireEvent, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { TaskForm } from '@/ui/TaskForm';
import { renderUI } from '@/test/renderWithProviders';
import * as voice from '@/lib/voice';

const mockListeners: Record<string, Set<(e: unknown) => void>> = {};

jest.mock('@/lib/voice', () => {
  const React = require('react');
  return {
    getVoiceSupport: jest.fn(async () => 'onDevice'),
    getMicPermission: jest.fn(async () => 'granted'),
    requestMicPermission: jest.fn(async () => true),
    downloadOfflinePack: jest.fn(async () => 'done'),
    startListening: jest.fn(),
    stopListening: jest.fn(),
    abortListening: jest.fn(),
    useSpeechRecognitionEvent: (name: string, listener: (e: unknown) => void) => {
      const ref = React.useRef(listener);
      ref.current = listener;
      React.useEffect(() => {
        const fn = (e: unknown) => ref.current(e);
        (mockListeners[name] ??= new Set()).add(fn);
        return () => {
          mockListeners[name].delete(fn);
        };
      }, [name]);
    },
  };
});

const mocked = voice as jest.Mocked<typeof voice>;

async function emit(name: string, payload: unknown = null) {
  await act(async () => {
    mockListeners[name]?.forEach((l) => l(payload));
  });
}

const finalResult = (transcript: string) => ({ isFinal: true, results: [{ transcript, confidence: 1, segments: [] }] });

// Presses the button with the given text in the most recent Alert.alert call.
async function pressAlertButton(text: string) {
  const calls = (Alert.alert as jest.Mock).mock.calls;
  const buttons = calls[calls.length - 1][2] as { text: string; onPress?: () => void }[];
  await act(async () => {
    buttons.find((b) => b.text === text)?.onPress?.();
  });
}

function tomorrowYmd(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

beforeEach(async () => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  // "Reduce motion" on: the mic's pulse loop would keep ticking timers.
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
  mocked.getVoiceSupport.mockResolvedValue('onDevice');
  mocked.getMicPermission.mockResolvedValue('granted');
  await AsyncStorage.clear();
});

describe('TaskForm — sesli giriş', () => {
  it('düzenleme kipinde (enableVoice yok) mikrofon görünmez', async () => {
    const { queryByLabelText } = await renderUI(<TaskForm submitLabel="Kaydet" onSubmit={jest.fn()} />);
    expect(queryByLabelText('Sesle doldur')).toBeNull();
    expect(mocked.getVoiceSupport).not.toHaveBeenCalled();
  });

  it('tanıyıcı olmayan cihazda mikrofon görünmez', async () => {
    mocked.getVoiceSupport.mockResolvedValue('unavailable');
    const { queryByLabelText } = await renderUI(<TaskForm submitLabel="Ekle" onSubmit={jest.fn()} enableVoice />);
    expect(queryByLabelText('Sesle doldur')).toBeNull();
  });

  it('autoStartVoice: form açılınca mikrofon kendiliğinden dinlemeye başlar, bir kez', async () => {
    const { getByPlaceholderText } = await renderUI(
      <TaskForm submitLabel="Ekle" onSubmit={jest.fn()} enableVoice autoStartVoice />
    );
    await waitFor(() => expect(mocked.startListening).toHaveBeenCalledWith('tr-TR', true));
    // A re-render (typing) must not start it again.
    fireEvent.changeText(getByPlaceholderText('Görev başlığı'), 'Süt al');
    await act(async () => {});
    expect(mocked.startListening).toHaveBeenCalledTimes(1);
  });

  it('autoStartVoice yoksa mikrofon kendiliğinden açılmaz', async () => {
    await renderUI(<TaskForm submitLabel="Ekle" onSubmit={jest.fn()} enableVoice />);
    await act(async () => {});
    expect(mocked.startListening).not.toHaveBeenCalled();
  });

  it('cümle forma dolar; gönderilen değerler doğru; hiçbir şey kendiliğinden kaydedilmez', async () => {
    const onSubmit = jest.fn();
    const { getByLabelText, getByText, getByDisplayValue } = await renderUI(
      <TaskForm submitLabel="Ekle" onSubmit={onSubmit} enableVoice />
    );
    fireEvent.press(getByLabelText('Sesle doldur'));
    await waitFor(() => expect(mocked.startListening).toHaveBeenCalledWith('tr-TR', true));

    await emit('result', { isFinal: false, results: [{ transcript: 'yarın akşam', confidence: 1, segments: [] }] });
    expect(getByText('“yarın akşam”')).toBeTruthy();

    await emit('result', finalResult("yarın akşam 7'de annemi ara acil"));
    expect(getByDisplayValue('Annemi ara')).toBeTruthy();
    expect(getByText('19:00')).toBeTruthy();
    expect(getByText("Duyulan: “yarın akşam 7'de annemi ara acil”")).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.press(getByText('Ekle'));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Annemi ara', priority: 'high', due_date: `${tomorrowYmd()}T19:00:00` })
    );
  });

  it('"Geri al" sesle doldurmadan önceki değerlere döner', async () => {
    const { getByLabelText, getByText, getByPlaceholderText, queryByText } = await renderUI(
      <TaskForm submitLabel="Ekle" onSubmit={jest.fn()} enableVoice />
    );
    fireEvent.changeText(getByPlaceholderText('Görev başlığı'), 'Eski başlık');
    fireEvent.press(getByLabelText('Sesle doldur'));
    await waitFor(() => expect(mocked.startListening).toHaveBeenCalled());
    await emit('result', finalResult("yarın saat 3'te dişçi"));
    expect(getByPlaceholderText('Görev başlığı').props.value).toBe('Dişçi');

    fireEvent.press(getByText('Geri al'));
    expect(getByPlaceholderText('Görev başlığı').props.value).toBe('Eski başlık');
    expect(queryByText('15:00')).toBeNull();
    expect(queryByText(/Duyulan/)).toBeNull();
  });

  it('başlık elle düzenlenince geri alma notu kalkar', async () => {
    const { getByLabelText, getByPlaceholderText, queryByText } = await renderUI(
      <TaskForm submitLabel="Ekle" onSubmit={jest.fn()} enableVoice />
    );
    fireEvent.press(getByLabelText('Sesle doldur'));
    await waitFor(() => expect(mocked.startListening).toHaveBeenCalled());
    await emit('result', finalResult('süt al'));
    expect(queryByText('Geri al')).toBeTruthy();
    fireEvent.changeText(getByPlaceholderText('Görev başlığı'), 'Süt ve ekmek al');
    expect(queryByText('Geri al')).toBeNull();
  });

  it('eski Android: çevrim içi tanıma önce sorulur; vazgeçilirse dinlenmez', async () => {
    mocked.getVoiceSupport.mockResolvedValue('onlineOnly');
    const { getByLabelText } = await renderUI(<TaskForm submitLabel="Ekle" onSubmit={jest.fn()} enableVoice />);
    fireEvent.press(getByLabelText('Sesle doldur'));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith('Çevrim içi konuşma tanıma', expect.any(String), expect.any(Array), expect.anything()));
    await pressAlertButton('İptal');
    expect(mocked.startListening).not.toHaveBeenCalled();
    expect(await AsyncStorage.getItem('voice:onlineConsent')).toBeNull();
  });

  it('onay verilince saklanır ve çevrim içi dinlenir; ikinci seferde sorulmaz', async () => {
    mocked.getVoiceSupport.mockResolvedValue('onlineOnly');
    const { getByLabelText } = await renderUI(<TaskForm submitLabel="Ekle" onSubmit={jest.fn()} enableVoice />);
    fireEvent.press(getByLabelText('Sesle doldur'));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
    await pressAlertButton('İzin ver');
    await waitFor(() => expect(mocked.startListening).toHaveBeenCalledWith('tr-TR', false));
    expect(await AsyncStorage.getItem('voice:onlineConsent')).toBe('1');

    await emit('end');
    (Alert.alert as jest.Mock).mockClear();
    fireEvent.press(getByLabelText('Sesle doldur'));
    await waitFor(() => expect(mocked.startListening).toHaveBeenCalledTimes(2));
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('mikrofon izni kalıcı reddedildiyse ayarlara yönlendirir, dinlemez', async () => {
    mocked.getMicPermission.mockResolvedValue('blocked');
    const { getByLabelText } = await renderUI(<TaskForm submitLabel="Ekle" onSubmit={jest.fn()} enableVoice />);
    fireEvent.press(getByLabelText('Sesle doldur'));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith('Mikrofon izni kapalı', expect.any(String), expect.any(Array)));
    expect(mocked.startListening).not.toHaveBeenCalled();
  });

  it('dinlerken ikinci dokunuş dinlemeyi bitirir', async () => {
    const { getByLabelText } = await renderUI(<TaskForm submitLabel="Ekle" onSubmit={jest.fn()} enableVoice />);
    fireEvent.press(getByLabelText('Sesle doldur'));
    await waitFor(() => expect(mocked.startListening).toHaveBeenCalled());
    fireEvent.press(getByLabelText('Dinlemeyi bitir'));
    expect(mocked.stopListening).toHaveBeenCalled();
  });

  it('uygulama arka plana geçince dinleme iptal edilir', async () => {
    const changeListeners: ((s: string) => void)[] = [];
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, l) => {
      changeListeners.push(l as (s: string) => void);
      return { remove: jest.fn() } as unknown as ReturnType<typeof AppState.addEventListener>;
    });
    const { getByLabelText } = await renderUI(<TaskForm submitLabel="Ekle" onSubmit={jest.fn()} enableVoice />);
    fireEvent.press(getByLabelText('Sesle doldur'));
    await waitFor(() => expect(mocked.startListening).toHaveBeenCalled());
    act(() => changeListeners.forEach((l) => l('background')));
    expect(mocked.abortListening).toHaveBeenCalled();
  });

  it('izin diyaloğu açıkken form kapanırsa mikrofon hiç açılmaz', async () => {
    mocked.getMicPermission.mockResolvedValue('ask');
    let grant: (v: boolean) => void = () => {};
    mocked.requestMicPermission.mockImplementation(() => new Promise<boolean>((r) => (grant = r)));
    const { getByLabelText, unmount } = await renderUI(
      <TaskForm submitLabel="Ekle" onSubmit={jest.fn()} enableVoice />
    );
    fireEvent.press(getByLabelText('Sesle doldur'));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith('Mikrofon', expect.any(String), expect.any(Array), expect.anything()));
    await pressAlertButton('Devam');
    await waitFor(() => expect(mocked.requestMicPermission).toHaveBeenCalled());
    unmount();
    await act(async () => grant(true));
    expect(mocked.startListening).not.toHaveBeenCalled();
  });

  it('boş sonuç "duyamadım" der, formu değiştirmez', async () => {
    const { getByLabelText, findByText, getByPlaceholderText } = await renderUI(
      <TaskForm submitLabel="Ekle" onSubmit={jest.fn()} enableVoice />
    );
    fireEvent.press(getByLabelText('Sesle doldur'));
    await waitFor(() => expect(mocked.startListening).toHaveBeenCalled());
    await emit('result', finalResult('   '));
    expect(await findByText('Bir şey duyamadım, tekrar dener misin?')).toBeTruthy();
    expect(getByPlaceholderText('Görev başlığı').props.value).toBe('');
  });

  it('hata metni gösterilir; bizim iptalimiz sessizdir', async () => {
    const { getByLabelText, findByText, queryByText } = await renderUI(
      <TaskForm submitLabel="Ekle" onSubmit={jest.fn()} enableVoice />
    );
    fireEvent.press(getByLabelText('Sesle doldur'));
    await waitFor(() => expect(mocked.startListening).toHaveBeenCalledTimes(1));
    await emit('error', { error: 'aborted', message: '' });
    expect(queryByText(/tekrar/)).toBeNull();

    fireEvent.press(getByLabelText('Sesle doldur'));
    await waitFor(() => expect(mocked.startListening).toHaveBeenCalledTimes(2));
    await emit('error', { error: 'no-speech', message: '' });
    expect(await findByText('Bir şey duyamadım, tekrar dener misin?')).toBeTruthy();
  });
});
