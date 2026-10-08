// Görev ikonu ve etiketleri: formda seçme ve yerinde yeni etiket, Görevler
// sekmesinde kartta görünme ve etikete göre süzme, Profil › Etiketler ekranı.

import { Alert } from 'react-native';
import { fireEvent } from '@testing-library/react-native';
import TasksScreen from '../../../app/(tabs)/tasks';
import TagsScreen from '../../../app/tags';
import { TaskForm } from '@/ui/TaskForm';
import { renderUI } from '@/test/renderWithProviders';
import { resetTestDb } from '@/test/dbTestUtils';
import { tagRepo, taskRepo, userRepo } from '@/db';

let mockUserId = '';
const mockNotify = jest.fn();

jest.mock('expo-router', () => {
  const React = require('react');
  return { useFocusEffect: (cb: () => void | (() => void)) => React.useEffect(cb, [cb]) };
});
jest.mock('@/ui/AppData', () => {
  const app = () => ({ user: { id: mockUserId }, dataVersion: 0, notifyDataChanged: mockNotify });
  return { useAppData: app, useOptionalAppData: app };
});
jest.mock('@/lib/notifications', () => ({
  refreshTaskReminders: jest.fn(),
  cancelTaskReminders: jest.fn(async () => {}),
  scheduleTaskReminders: jest.fn(),
  rescheduleEverything: jest.fn(async () => {}),
}));
jest.mock('@/ui/ProfileButton', () => ({ ProfileButton: () => null }));
jest.mock('@/ui/sharedTaskUi', () => ({
  ...jest.requireActual('@/ui/sharedTaskUi'),
  toggleSharedTaskOptimistic: jest.fn(),
  useFriendNames: () => new Map(),
  useSharedTasksFreshness: jest.fn(),
  useFriends: () => [],
}));
jest.mock('react-native-reanimated', () => {
  const RN = require('react-native');
  return { __esModule: true, default: { View: RN.View, createAnimatedComponent: (c: unknown) => c }, LinearTransition: { duration: () => ({}) } };
});

beforeEach(async () => {
  await resetTestDb();
  mockUserId = userRepo.getOrCreateLocal().id;
  mockNotify.mockClear();
});
afterEach(() => jest.restoreAllMocks());

// The first render of a screen starts cold; under load the defaults (1 s per
// query, 5 s per test) may not be enough.
jest.setTimeout(20000);
const SLOW = { timeout: 5000 };

describe('TaskForm: ikon ve etiketler', () => {
  type U = Awaited<ReturnType<typeof renderUI>>;
  const SEARCH = 'Ara ya da yeni etiket yaz';
  const openTags = (u: U) => fireEvent.press(u.getByLabelText('Etiket seç ya da ekle'));
  const done = (u: U) => fireEvent.press(u.getByText('Tamam'));

  it('formda yalnız seçili etiketler ve "＋ Etiket" durur; pencerede seçilir, ikon seçilir', async () => {
    const work = tagRepo.create(mockUserId, 'İş', '#3b82f6')!;
    tagRepo.create(mockUserId, 'Ev', null);
    const onSubmit = jest.fn();
    const u = await renderUI(<TaskForm submitLabel="Kaydet" onSubmit={onSubmit} />);
    expect(u.queryByLabelText('İş etiketi')).toBeNull(); // seçilmemiş etiket formda yok
    fireEvent.changeText(u.getByPlaceholderText('Görev başlığı'), 'Rapor');

    openTags(u);
    fireEvent.press(u.getByLabelText('İş'));
    done(u);
    expect(u.getByLabelText('İş etiketi')).toBeTruthy();
    expect(u.queryByLabelText('Ev etiketi')).toBeNull();

    fireEvent.press(u.getByLabelText('İkon: Yok'));
    fireEvent.press(u.getByLabelText('E-posta'));
    expect(u.getByLabelText('İkon: E-posta')).toBeTruthy();
    fireEvent.press(u.getByText('Kaydet'));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ title: 'Rapor', icon: 'mail', tag_ids: [work.id] }));
  });

  it('seçili etikete dokununca pencere açılır, tik kaldırılır; seçili ikon tekrar basınca kalkar', async () => {
    const work = tagRepo.create(mockUserId, 'İş', null)!;
    const onSubmit = jest.fn();
    const u = await renderUI(
      <TaskForm submitLabel="Kaydet" onSubmit={onSubmit} initial={{ title: 'Rapor', icon: 'mail', tag_ids: [work.id] }} />
    );
    fireEvent.press(u.getByLabelText('İş etiketi'));
    fireEvent.press(u.getByLabelText('İş'));
    done(u);
    expect(u.queryByLabelText('İş etiketi')).toBeNull();
    fireEvent.press(u.getByLabelText('İkon: E-posta'));
    fireEvent.press(u.getByLabelText('E-posta'));
    fireEvent.press(u.getByText('Kaydet'));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ icon: null, tag_ids: [] }));
  });

  it('aramaya yazılan yeni ad tek dokunuşla oluşur ve seçilir; renk paletten boş olanı alır', async () => {
    tagRepo.create(mockUserId, 'Ev', '#4f46e5'); // paletin ilk rengi dolu
    const onSubmit = jest.fn();
    const u = await renderUI(<TaskForm submitLabel="Kaydet" onSubmit={onSubmit} />);
    fireEvent.changeText(u.getByPlaceholderText('Görev başlığı'), 'Fatura');
    openTags(u);
    fireEvent.changeText(u.getByLabelText(SEARCH), '  Acil  ');
    fireEvent.press(u.getByText('“Acil” etiketini oluştur'));
    const acil = tagRepo.findByName(mockUserId, 'Acil')!;
    expect(acil).toMatchObject({ name: 'Acil', color: '#0ea5e9' });
    expect(mockNotify).toHaveBeenCalled();
    expect(u.getByLabelText(SEARCH).props.value).toBe(''); // arama temizlendi, liste geri geldi
    done(u);
    fireEvent.press(u.getByText('Kaydet'));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ tag_ids: [acil.id] }));
  });

  it('var olan adı yazmak yeni etiket açmaz; klavyeden "bitti" onu seçer', async () => {
    const home = tagRepo.create(mockUserId, 'Ev', null)!;
    const onSubmit = jest.fn();
    const u = await renderUI(<TaskForm submitLabel="Kaydet" onSubmit={onSubmit} />);
    fireEvent.changeText(u.getByPlaceholderText('Görev başlığı'), 'Temizlik');
    openTags(u);
    fireEvent.changeText(u.getByLabelText(SEARCH), 'EV');
    expect(u.queryByText(/etiketini oluştur/)).toBeNull();
    fireEvent(u.getByLabelText(SEARCH), 'submitEditing');
    done(u);
    expect(tagRepo.listByUser(mockUserId)).toHaveLength(1);
    fireEvent.press(u.getByText('Kaydet'));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ tag_ids: [home.id] }));
  });

  it('arama listeyi süzer; eşleşme yoksa söyler; hiç etiket yoksa nasıl oluşturulacağını söyler', async () => {
    const u0 = await renderUI(<TaskForm submitLabel="Kaydet" onSubmit={jest.fn()} />);
    openTags(u0);
    expect(u0.getByText('Henüz etiketin yok. Yukarıya bir ad yaz, oluştur.')).toBeTruthy();
    u0.unmount();

    for (const n of ['İş', 'Market', 'Okul']) tagRepo.create(mockUserId, n, null);
    const u = await renderUI(<TaskForm submitLabel="Kaydet" onSubmit={jest.fn()} />);
    openTags(u);
    fireEvent.changeText(u.getByLabelText(SEARCH), 'mar');
    expect(u.getByLabelText('Market')).toBeTruthy();
    expect(u.queryByLabelText('İş')).toBeNull();
    fireEvent.changeText(u.getByLabelText(SEARCH), 'iş'); // İ/i farkı yok
    expect(u.getByLabelText('İş')).toBeTruthy();
    fireEvent.changeText(u.getByLabelText(SEARCH), 'zzz');
    expect(u.getByText('Eşleşen etiket yok')).toBeTruthy();
  });
});

describe('Görevler sekmesi: etiketler', () => {
  function seed() {
    const work = tagRepo.create(mockUserId, 'İş', '#3b82f6')!;
    const home = tagRepo.create(mockUserId, 'Ev', '#10b981')!;
    tagRepo.create(mockUserId, 'Kullanılmayan', null);
    taskRepo.create({ user_id: mockUserId, title: 'Rapor', tag_ids: [work.id], icon: 'document' });
    taskRepo.create({ user_id: mockUserId, title: 'Market', tag_ids: [home.id] });
    taskRepo.create({ user_id: mockUserId, title: 'Etiketsiz' });
    return { work, home };
  }

  it('kartta etiket adı görünür; süzme çubuğunda yalnız kullanılan etiketler var', async () => {
    seed();
    const u = await renderUI(<TasksScreen />);
    expect(await u.findByText('Rapor', {}, SLOW)).toBeTruthy();
    expect(u.getByText('Tümü')).toBeTruthy();
    expect(u.getByLabelText('Yalnız İş etiketli görevler')).toBeTruthy();
    expect(u.getByLabelText('Yalnız Ev etiketli görevler')).toBeTruthy();
    expect(u.queryByLabelText('Yalnız Kullanılmayan etiketli görevler')).toBeNull();
    expect(u.getByLabelText('Etiketler: İş')).toBeTruthy(); // Rapor kartındaki haplar
  });

  it('etikete dokununca yalnız o etiketli görevler kalır; tekrar dokunmak ya da Tümü geri açar', async () => {
    seed();
    const u = await renderUI(<TasksScreen />);
    await u.findByText('Rapor', {}, SLOW);
    fireEvent.press(u.getByLabelText('Yalnız İş etiketli görevler'));
    expect(u.getByText('Rapor')).toBeTruthy();
    expect(u.queryByText('Market')).toBeNull();
    expect(u.queryByText('Etiketsiz')).toBeNull();

    fireEvent.press(u.getByLabelText('Yalnız İş etiketli görevler'));
    expect(u.getByText('Market')).toBeTruthy();

    fireEvent.press(u.getByLabelText('Yalnız Ev etiketli görevler'));
    expect(u.queryByText('Rapor')).toBeNull();
    fireEvent.press(u.getByText('Tümü'));
    expect(u.getByText('Rapor')).toBeTruthy();
    expect(u.getByText('Etiketsiz')).toBeTruthy();
  });

  it('etiketi olmayan listede süzme çubuğu yok', async () => {
    tagRepo.create(mockUserId, 'İş', null);
    taskRepo.create({ user_id: mockUserId, title: 'Tek' });
    const u = await renderUI(<TasksScreen />);
    await u.findByText('Tek', {}, SLOW);
    expect(u.queryByText('Tümü')).toBeNull();
  });

  it('arama etiket adını da bulur', async () => {
    seed();
    for (let i = 0; i < 8; i++) taskRepo.create({ user_id: mockUserId, title: `Dolgu ${i}` });
    const u = await renderUI(<TasksScreen />);
    fireEvent.changeText(await u.findByLabelText('Görevlerde ara', {}, SLOW), 'ev');
    expect(await u.findByText('Market', {}, SLOW)).toBeTruthy();
    expect(u.queryByText('Rapor')).toBeNull();
  });
});

describe('Profil › Etiketler', () => {
  it('boşken nasıl oluşturulacağını söyler', async () => {
    const u = await renderUI(<TagsScreen />);
    expect(u.getByText('Henüz etiket yok')).toBeTruthy();
  });

  it('yeniden adlandırır; başka etiketin adını reddeder', async () => {
    const work = tagRepo.create(mockUserId, 'İş', null)!;
    tagRepo.create(mockUserId, 'Ev', null);
    const u = await renderUI(<TagsScreen />);
    fireEvent.press(u.getByLabelText('İş etiketini düzenle'));
    const input = u.getByDisplayValue('İş');
    fireEvent.changeText(input, 'ev');
    fireEvent.press(u.getByText('Kaydet'));
    expect(u.getByText('“Ev” zaten var')).toBeTruthy();
    expect(tagRepo.getById(work.id)!.name).toBe('İş');

    fireEvent.changeText(u.getByDisplayValue('ev'), 'Ofis');
    fireEvent.press(u.getByText('Kaydet'));
    expect(tagRepo.getById(work.id)!.name).toBe('Ofis');
    expect(u.getByText('Ofis')).toBeTruthy();
  });

  it('silmeden önce kaç görevde kullanıldığını söyler; onaylanınca siler, görev kalır', async () => {
    const work = tagRepo.create(mockUserId, 'İş', null)!;
    const task = taskRepo.create({ user_id: mockUserId, title: 'Rapor', tag_ids: [work.id] });
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const u = await renderUI(<TagsScreen />);
    expect(u.getByText('1 görev')).toBeTruthy();
    fireEvent.press(u.getByLabelText('İş, sil'));
    expect(alert).toHaveBeenCalledWith('“İş” silinsin mi?', '1 görevden kaldırılır. Görevlerin kendisi silinmez.', expect.any(Array));
    const buttons = alert.mock.calls[0][2] as { text: string; onPress?: () => void }[];
    buttons.find((b) => b.text === 'Sil')!.onPress!();
    expect(tagRepo.listByUser(mockUserId)).toHaveLength(0);
    expect(taskRepo.getById(task.id)).not.toBeNull();
  });
});
