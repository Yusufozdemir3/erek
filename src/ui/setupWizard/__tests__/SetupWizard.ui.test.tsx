// Kurulum sihirbazı: gerçek veritabanıyla (bellek içi SQLite) uçtan uca. Bildirim
// katmanı, Google girişi ve AppData taklit edilir; repolar GERÇEK.

import { Platform } from 'react-native';
import { fireEvent, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { goalRepo, habitRepo, reminderRepo, taskRepo, userRepo } from '@/db';
import { resetTestDb } from '@/test/dbTestUtils';
import { renderUI } from '@/test/renderWithProviders';
import { SetupWizard } from '../SetupWizard';
import { deadlineIn } from '../wizardLogic';
import { todayDate } from '@/lib/helpers';

let mockUserId = 'placeholder';
let mockAuthUser: { id: string; email: string; isAnonymous: boolean } | null = null;
let mockSyncConfigured = true;
const mockNotifyDataChanged = jest.fn();
const mockPermission = jest.fn();
const mockEnsure = jest.fn();
const mockReschedule = jest.fn(async () => {});
const mockSignIn = jest.fn();

jest.mock('@/config', () => ({ ACCOUNTS_ENABLED: true }));
jest.mock('@/sync', () => ({
  isGoogleSignInConfigured: true,
  get isSyncConfigured() {
    return mockSyncConfigured;
  },
}));
jest.mock('@/ui/AppData', () => ({
  useAppData: () => ({
    user: { id: mockUserId },
    authUser: mockAuthUser,
    notifyDataChanged: mockNotifyDataChanged,
  }),
  useOptionalAppData: () => null,
}));
jest.mock('@/lib/notifications', () => ({
  notificationPermission: (...a: unknown[]) => mockPermission(...a),
  ensurePermission: (...a: unknown[]) => mockEnsure(...a),
  rescheduleEverything: (...a: unknown[]) => (mockReschedule as any)(...a),
}));
jest.mock('@/ui/useGoogleSignIn', () => ({
  useGoogleSignIn: () => ({ available: true, busy: false, error: null, signIn: mockSignIn }),
}));

const DAY = 24 * 3600 * 1000;
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

type Utils = Awaited<ReturnType<typeof renderUI>>;

const next = (u: Utils) => fireEvent.press(u.getByLabelText('Devam'));
// Moves on without adding anything: "Skip this step" where offered, else Continue.
const pass = (u: Utils) => fireEvent.press(u.queryByText('Bu adımı atla') ?? u.getByLabelText('Devam'));
const continueDisabled = (u: Utils) => u.getByLabelText('Devam').props.accessibilityState?.disabled === true;
const start = (u: Utils) => fireEvent.press(u.getByLabelText('Kuruluma başla'));

beforeEach(async () => {
  await resetTestDb();
  await AsyncStorage.clear();
  mockUserId = userRepo.getOrCreateLocal().id;
  mockAuthUser = null;
  mockSyncConfigured = true;
  jest.clearAllMocks();
  mockPermission.mockResolvedValue({ granted: false, canAskAgain: true });
  mockEnsure.mockResolvedValue(true);
  jest.replaceProperty(Platform, 'OS', 'android');
});

afterEach(() => jest.restoreAllMocks());

describe('SetupWizard — çerçeve', () => {
  it('karşılamayla açılır; ilerleme çubuğu yoktur', async () => {
    const u = await renderUI(<SetupWizard onDone={jest.fn()} />);
    expect(u.getByText('Erek’e hoş geldin')).toBeTruthy();
    expect(u.queryByText(/Adım \d+\/\d+/)).toBeNull();
    expect(u.queryByText('Bu adımı atla')).toBeNull(); // karşılama atlanmaz, "hepsini atla" var
  });

  it('"Hepsini atla" hiçbir şey eklemeden kapatır', async () => {
    const onDone = jest.fn();
    const u = await renderUI(<SetupWizard onDone={onDone} />);
    fireEvent.press(u.getByLabelText('Kurulum sihirbazının tamamını atla'));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith({ skippedAll: true, accountSeen: false }));
    expect(habitRepo.listByUser(mockUserId)).toHaveLength(0);
    expect(taskRepo.listByUser(mockUserId)).toHaveLength(0);
    expect(goalRepo.listByUser(mockUserId)).toHaveLength(0);
    expect(mockReschedule).not.toHaveBeenCalled(); // yapılan bir şey yok
  });

  it('"Hepsini atla" izin verilmiş olsa bile hiçbir şey planlamaz', async () => {
    mockPermission.mockResolvedValue({ granted: true, canAskAgain: true });
    const onDone = jest.fn();
    const u = await renderUI(<SetupWizard onDone={onDone} />);
    fireEvent.press(u.getByLabelText('Kurulum sihirbazının tamamını atla'));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(mockReschedule).not.toHaveBeenCalled();
  });

  it('her adımı atlayınca son sayfa boş durumu söyler', async () => {
    const onDone = jest.fn();
    const u = await renderUI(<SetupWizard onDone={onDone} />);
    start(u);
    expect(u.getByText('Adım 1/7')).toBeTruthy(); // dil ve görünüm … hesap = 7 adım
    for (let i = 0; i < 7; i++) pass(u);
    expect(u.getByText('Hazırsın!')).toBeTruthy();
    expect(u.getByText(/Şimdilik bir şey eklemedin/)).toBeTruthy();
    expect(u.queryByText('Hepsini atla')).toBeNull(); // son sayfada anlamsız
    fireEvent.press(u.getByLabelText('Erek’i aç'));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith({ skippedAll: false, accountSeen: true }));
  });

  it('Geri önceki adıma döner; adım sayısı ve ilerleme tutarlı', async () => {
    const u = await renderUI(<SetupWizard onDone={jest.fn()} />);
    start(u);
    pass(u);
    expect(u.getByText('Adım 2/7')).toBeTruthy();
    fireEvent.press(u.getByLabelText('Geri'));
    expect(u.getByText('Adım 1/7')).toBeTruthy();
    fireEvent.press(u.getByLabelText('Geri'));
    expect(u.getByText('Erek’e hoş geldin')).toBeTruthy();
    expect(u.queryByLabelText('Geri')).toBeNull(); // ilk sayfada geri yok
  });

  it('"Bu adımı atla" sonraki adıma geçirir; iş yapılınca düğme kaybolur', async () => {
    const u = await renderUI(<SetupWizard onDone={jest.fn()} />);
    start(u); // dil ve görünüm
    pass(u); // alışkanlık
    expect(u.getByText('Bu adımı atla')).toBeTruthy();
    fireEvent.changeText(u.getByPlaceholderText('Alışkanlığın adı'), 'Su iç');
    fireEvent.press(u.getByText('Alışkanlığı ekle'));
    expect(u.queryByText('Bu adımı atla')).toBeNull(); // artık yapıldı: yalnız Devam
    next(u);
    expect(u.getByText('Adım 3/7')).toBeTruthy();
    fireEvent.press(u.getByText('Bu adımı atla'));
    expect(u.getByText('Adım 4/7')).toBeTruthy();
  });

  it('adım sayısı cihaza göre değişir: widget Android\'e, hesap yapılandırmaya bağlı', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    mockSyncConfigured = false;
    const u = await renderUI(<SetupWizard onDone={jest.fn()} />);
    start(u);
    expect(u.getByText('Adım 1/5')).toBeTruthy(); // görünüm, alışkanlık, görev, hedef, bildirim
  });

  it('hesap adımına varılmadıysa accountSeen=false (giriş ekranı ayrıca gelir)', async () => {
    const onDone = jest.fn();
    const u = await renderUI(<SetupWizard onDone={onDone} />);
    start(u);
    pass(u); // görünüm → alışkanlık
    fireEvent.press(u.getByLabelText('Kurulum sihirbazının tamamını atla'));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith({ skippedAll: true, accountSeen: false }));
  });
});

describe('SetupWizard — dil ve görünüm', () => {
  it('dil seçince sayfa hemen o dilde çizilir', async () => {
    const u = await renderUI(<SetupWizard onDone={jest.fn()} />);
    start(u);
    expect(u.getByText('Dil ve görünüm')).toBeTruthy();
    fireEvent.press(u.getByText('English'));
    expect(await u.findByText('Language and look')).toBeTruthy();
    expect(u.getByLabelText('Continue')).toBeTruthy();
  });
});

describe('SetupWizard — ilk alışkanlık', () => {
  it('ad + sıklık + hatırlatma: doğru kayıt oluşur', async () => {
    const u = await renderUI(<SetupWizard onDone={jest.fn()} />);
    start(u);
    pass(u);
    fireEvent.changeText(u.getByPlaceholderText('Alışkanlığın adı'), 'Kitap oku');
    fireEvent.press(u.getByLabelText('Hafta içi'));
    fireEvent.press(u.getByLabelText('21:00'));
    fireEvent.press(u.getByText('Alışkanlığı ekle'));

    const [h] = habitRepo.listByUser(mockUserId);
    expect(h).toMatchObject({ title: 'Kitap oku', kind: 'binary', icon: null, start_date: todayDate() });
    expect(h.schedule).toEqual({ freq: 'weekly', weekdays: [1, 2, 3, 4, 5] });
    expect(reminderRepo.listByEntity('habit', h.id).map((r) => r.time)).toEqual(['21:00']);
    expect(u.getByText('✓ “Kitap oku” eklendi')).toBeTruthy();
    expect(mockNotifyDataChanged).toHaveBeenCalled();
  });

  it('"Haftada 3 kez" kota olarak kaydedilir', async () => {
    const u = await renderUI(<SetupWizard onDone={jest.fn()} />);
    start(u);
    pass(u);
    fireEvent.press(u.getByLabelText('Haftada 3 kez'));
    fireEvent.changeText(u.getByPlaceholderText('Alışkanlığın adı'), 'Boks');
    fireEvent.press(u.getByText('Alışkanlığı ekle'));
    const [h] = habitRepo.listByUser(mockUserId);
    expect(h).toMatchObject({ title: 'Boks', icon: null });
    expect(h.schedule).toEqual({ freq: 'weekly', weekdays: [], timesPerWeek: 3 });
    expect(reminderRepo.listByEntity('habit', h.id)).toHaveLength(0); // hatırlatma "Yok"
  });

  it('boş adla eklenemez', async () => {
    const u = await renderUI(<SetupWizard onDone={jest.fn()} />);
    start(u);
    pass(u);
    fireEvent.press(u.getByText('Alışkanlığı ekle'));
    expect(habitRepo.listByUser(mockUserId)).toHaveLength(0);
  });

  it('"Bir tane daha ekle" formu sıfırlar; ikisi de kaydedilir', async () => {
    const u = await renderUI(<SetupWizard onDone={jest.fn()} />);
    start(u);
    pass(u);
    fireEvent.changeText(u.getByPlaceholderText('Alışkanlığın adı'), 'Su iç');
    fireEvent.press(u.getByText('Alışkanlığı ekle'));
    fireEvent.press(u.getByText('Bir tane daha ekle'));
    expect(u.getByPlaceholderText('Alışkanlığın adı').props.value).toBe('');
    fireEvent.changeText(u.getByPlaceholderText('Alışkanlığın adı'), 'Erken yat');
    fireEvent.press(u.getByText('Alışkanlığı ekle'));
    expect(habitRepo.listByUser(mockUserId).map((x) => x.title).sort()).toEqual(['Erken yat', 'Su iç']);
  });
});

describe('SetupWizard — ilk görev', () => {
  async function toTask(u: Utils) {
    start(u);
    pass(u); // görünüm
    pass(u); // alışkanlık (atla)
  }

  it('yazılan cümleden başlık, tarih ve saat çıkar', async () => {
    const u = await renderUI(<SetupWizard onDone={jest.fn()} />);
    await toTask(u);
    fireEvent.changeText(u.getByPlaceholderText('Ne yapman gerekiyor?'), "yarın saat 3'te annemi ara");
    expect(u.getByText(/Zamanı:/)).toBeTruthy();
    fireEvent.press(u.getByText('Görevi ekle'));

    const tomorrow = ymd(new Date(Date.now() + DAY));
    const [t] = taskRepo.listByUser(mockUserId);
    expect(t.title).toBe('Annemi ara');
    expect(t.due_date).toBe(`${tomorrow}T15:00:00`);
    expect(u.getByText('✓ “Annemi ara” eklendi')).toBeTruthy();
  });

  it('tarihsiz cümle bugüne yazılır, öncelik "acil"den gelir', async () => {
    const u = await renderUI(<SetupWizard onDone={jest.fn()} />);
    await toTask(u);
    fireEvent.changeText(u.getByPlaceholderText('Ne yapman gerekiyor?'), 'faturayı öde acil');
    expect(u.queryByText(/Zamanı:/)).toBeNull();
    fireEvent.press(u.getByText('Görevi ekle'));
    const [t] = taskRepo.listByUser(mockUserId);
    expect(t).toMatchObject({ title: 'Faturayı öde', priority: 'high', due_date: todayDate() });
  });

  it('boşken eklenemez; çok uzun metin başlığa sığacak şekilde kısalır', async () => {
    const u = await renderUI(<SetupWizard onDone={jest.fn()} />);
    await toTask(u);
    fireEvent.press(u.getByText('Görevi ekle'));
    expect(taskRepo.listByUser(mockUserId)).toHaveLength(0);
    fireEvent.changeText(u.getByPlaceholderText('Ne yapman gerekiyor?'), 'kelime '.repeat(30));
    fireEvent.press(u.getByText('Görevi ekle'));
    expect(taskRepo.listByUser(mockUserId)[0].title.length).toBeLessThanOrEqual(60);
  });
});

describe('SetupWizard — ilk hedef', () => {
  async function toGoal(u: Utils) {
    start(u);
    for (let i = 0; i < 3; i++) pass(u); // görünüm, alışkanlık, görev
  }

  it('alanlar doldurulunca kayıt oluşur; 3 ay varsayılan son tarih', async () => {
    const u = await renderUI(<SetupWizard onDone={jest.fn()} />);
    await toGoal(u);
    fireEvent.changeText(u.getByPlaceholderText('Hedefin adı'), 'Koş');
    fireEvent.changeText(u.getByPlaceholderText('100'), '100');
    fireEvent.changeText(u.getByPlaceholderText('km'), 'km');
    fireEvent.press(u.getByText('Hedefi ekle'));

    const [g] = goalRepo.listByUser(mockUserId);
    expect(g).toMatchObject({ title: 'Koş', goal_type: 'numeric', target_value: 100, unit: 'km', start_date: todayDate() });
    expect(g.deadline).toBe(deadlineIn(90));
  });

  it('son tarih seçeneği uygulanır', async () => {
    const u = await renderUI(<SetupWizard onDone={jest.fn()} />);
    await toGoal(u);
    fireEvent.changeText(u.getByPlaceholderText('Hedefin adı'), 'Piyano');
    fireEvent.changeText(u.getByPlaceholderText('100'), '20,5');
    fireEvent.press(u.getByLabelText('1 yıl'));
    fireEvent.press(u.getByText('Hedefi ekle'));
    const [g] = goalRepo.listByUser(mockUserId);
    expect(g).toMatchObject({ title: 'Piyano', target_value: 20.5, unit: null });
    expect(g.deadline).toBe(deadlineIn(365));
  });

  it('geçersiz miktarda (boş/sıfır/harf) eklenmez', async () => {
    const u = await renderUI(<SetupWizard onDone={jest.fn()} />);
    await toGoal(u);
    fireEvent.changeText(u.getByPlaceholderText('Hedefin adı'), 'Piyano');
    for (const bad of ['', '0', 'abc']) {
      fireEvent.changeText(u.getByPlaceholderText('100'), bad);
      fireEvent.press(u.getByText('Hedefi ekle'));
    }
    expect(goalRepo.listByUser(mockUserId)).toHaveLength(0);
  });
});

describe('SetupWizard — bildirimler', () => {
  async function toNotifications(u: Utils) {
    start(u);
    for (let i = 0; i < 4; i++) pass(u);
  }

  it('izin verilmemişse sorar; verilince açık görünür ve adım yapılmış sayılır', async () => {
    const u = await renderUI(<SetupWizard onDone={jest.fn()} />);
    await toNotifications(u);
    mockPermission.mockResolvedValue({ granted: true, canAskAgain: true });
    fireEvent.press(await u.findByText('Bildirimlere izin ver'));
    expect(await u.findByText('Bildirimler açık ✓')).toBeTruthy();
    expect(mockEnsure).toHaveBeenCalled();
    expect(u.queryByText('Bu adımı atla')).toBeNull();
    expect(u.getByText('Ses')).toBeTruthy();
    expect(u.getByText('Titreşim')).toBeTruthy();
  });

  it('kalıcı reddedilmişse ayarlara yönlendirir, tekrar sormaz', async () => {
    mockPermission.mockResolvedValue({ granted: false, canAskAgain: false });
    const u = await renderUI(<SetupWizard onDone={jest.fn()} />);
    await toNotifications(u);
    expect(await u.findByText('Ayarları aç')).toBeTruthy();
    expect(u.queryByText('Bildirimlere izin ver')).toBeNull();
  });

  it('izin zaten varsa doğrudan açık görünür', async () => {
    mockPermission.mockResolvedValue({ granted: true, canAskAgain: true });
    const u = await renderUI(<SetupWizard onDone={jest.fn()} />);
    await toNotifications(u);
    expect(await u.findByText('Bildirimler açık ✓')).toBeTruthy();
  });

  it('bitirirken yapılanlar için hatırlatmalar BİR KEZ planlanır (izin varsa)', async () => {
    const onDone = jest.fn();
    const u = await renderUI(<SetupWizard onDone={onDone} />);
    start(u);
    pass(u);
    fireEvent.changeText(u.getByPlaceholderText('Alışkanlığın adı'), 'Su iç');
    fireEvent.press(u.getByLabelText('08:00'));
    fireEvent.press(u.getByText('Alışkanlığı ekle'));
    expect(mockReschedule).not.toHaveBeenCalled(); // eklerken planlanmaz (izin henüz sorulmadı)
    mockPermission.mockResolvedValue({ granted: true, canAskAgain: true });
    for (let i = 0; i < 6; i++) pass(u);
    fireEvent.press(u.getByLabelText('Erek’i aç'));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(mockReschedule).toHaveBeenCalledTimes(1);
    expect(mockReschedule).toHaveBeenCalledWith(mockUserId);
  });

  it('izin yoksa planlama denenmez (istem açılmaz)', async () => {
    const onDone = jest.fn();
    const u = await renderUI(<SetupWizard onDone={onDone} />);
    start(u);
    for (let i = 0; i < 7; i++) pass(u);
    fireEvent.press(u.getByLabelText('Erek’i aç'));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(mockReschedule).not.toHaveBeenCalled();
  });
});

describe('SetupWizard — widget ve hesap', () => {
  it('widget adımı üç adımlı yönerge gösterir', async () => {
    const u = await renderUI(<SetupWizard onDone={jest.fn()} />);
    start(u);
    for (let i = 0; i < 5; i++) pass(u);
    expect(u.getByText('Ana ekran widget’ı')).toBeTruthy();
    expect(u.getByText('Ana ekranda boş bir yere uzun bas.')).toBeTruthy();
    expect(u.getByText(/Erek — Bugün/)).toBeTruthy();
  });

  it('hesap adımında Google düğmesi girişi başlatır', async () => {
    const u = await renderUI(<SetupWizard onDone={jest.fn()} />);
    start(u);
    for (let i = 0; i < 6; i++) pass(u);
    fireEvent.press(u.getByLabelText('Google ile devam et'));
    expect(mockSignIn).toHaveBeenCalledTimes(1);
  });

  it('zaten bağlıysa bağlı hesabı gösterir, düğme yok', async () => {
    mockAuthUser = { id: 'u1', email: 'ada@example.com', isAnonymous: false };
    const u = await renderUI(<SetupWizard onDone={jest.fn()} />);
    start(u);
    for (let i = 0; i < 6; i++) pass(u);
    expect(u.getByText('Bağlandın ✓')).toBeTruthy();
    expect(u.getByText('Bağlı hesap: ada@example.com')).toBeTruthy();
    expect(u.queryByLabelText('Google ile devam et')).toBeNull();
  });
});

describe('SetupWizard — son sayfa özeti', () => {
  it('yalnız gerçekten yapılanları listeler', async () => {
    mockPermission.mockResolvedValue({ granted: true, canAskAgain: true });
    const u = await renderUI(<SetupWizard onDone={jest.fn()} />);
    start(u);
    pass(u);
    fireEvent.changeText(u.getByPlaceholderText('Alışkanlığın adı'), 'Su iç');
    fireEvent.press(u.getByText('Alışkanlığı ekle'));
    pass(u);
    fireEvent.changeText(u.getByPlaceholderText('Ne yapman gerekiyor?'), 'süt al');
    fireEvent.press(u.getByText('Görevi ekle'));
    pass(u);
    pass(u); // hedef atlandı
    await u.findByText('Bildirimler açık ✓');
    pass(u);
    pass(u); // widget
    pass(u); // hesap atlandı
    expect(u.getByText('Alışkanlık: Su iç')).toBeTruthy();
    expect(u.getByText('Görev: Süt al')).toBeTruthy();
    expect(u.queryByText(/^Hedef:/)).toBeNull();
    expect(u.getByText('Bildirimler açık')).toBeTruthy();
    expect(u.queryByText(/Hesabın bağlı/)).toBeNull();
  });
});

describe('SetupWizard — Devam ve form', () => {
  it('boş formda Devam kapalı; basmak geçirmez, "Bu adımı atla" geçirir', async () => {
    const u = await renderUI(<SetupWizard onDone={jest.fn()} />);
    start(u);
    pass(u); // görünüm → alışkanlık
    expect(continueDisabled(u)).toBe(true);
    next(u);
    expect(u.getByText('Adım 2/7')).toBeTruthy();
    fireEvent.press(u.getByText('Bu adımı atla'));
    expect(u.getByText('Adım 3/7')).toBeTruthy();
    expect(habitRepo.listByUser(mockUserId)).toHaveLength(0);
  });

  it('yazıp Devam’a basınca kaydeder ve geçer; özette yapıldı görünür', async () => {
    const u = await renderUI(<SetupWizard onDone={jest.fn()} />);
    start(u);
    pass(u);
    fireEvent.changeText(u.getByPlaceholderText('Alışkanlığın adı'), 'Kitap oku');
    fireEvent.press(u.getByLabelText('21:00'));
    expect(continueDisabled(u)).toBe(false);
    next(u);
    expect(u.getByText('Adım 3/7')).toBeTruthy();
    const [h] = habitRepo.listByUser(mockUserId);
    expect(h).toMatchObject({ title: 'Kitap oku', kind: 'binary' });
    expect(reminderRepo.listByEntity('habit', h.id).map((r) => r.time)).toEqual(['21:00']);

    fireEvent.changeText(u.getByPlaceholderText('Ne yapman gerekiyor?'), 'süt al');
    next(u);
    expect(taskRepo.listByUser(mockUserId).map((t) => t.title)).toEqual(['Süt al']);

    fireEvent.changeText(u.getByPlaceholderText('Hedefin adı'), 'Koş');
    fireEvent.changeText(u.getByPlaceholderText('100'), '50');
    next(u);
    expect(goalRepo.listByUser(mockUserId)).toMatchObject([{ title: 'Koş', target_value: 50 }]);

    for (let i = 0; i < 3; i++) pass(u); // bildirim, widget, hesap
    expect(u.getByText('Alışkanlık: Kitap oku')).toBeTruthy();
    expect(u.getByText('Görev: Süt al')).toBeTruthy();
    expect(u.getByText(/^Hedef: Koş/)).toBeTruthy();
  });

  it('yarım hedef (adı var, miktarı yok) Devam’ı kapatır; kayıt oluşmaz', async () => {
    const u = await renderUI(<SetupWizard onDone={jest.fn()} />);
    start(u);
    for (let i = 0; i < 3; i++) pass(u); // görünüm, alışkanlık, görev
    fireEvent.changeText(u.getByPlaceholderText('Hedefin adı'), 'Piyano');
    expect(continueDisabled(u)).toBe(true);
    fireEvent.changeText(u.getByPlaceholderText('100'), '0');
    expect(continueDisabled(u)).toBe(true);
    fireEvent.changeText(u.getByPlaceholderText('100'), '20');
    expect(continueDisabled(u)).toBe(false);
    fireEvent.changeText(u.getByPlaceholderText('Hedefin adı'), '');
    expect(continueDisabled(u)).toBe(true); // miktar var, ad yok
    expect(goalRepo.listByUser(mockUserId)).toHaveLength(0);
  });

  it('ekledikten sonra boş "bir tane daha" formu Devam’ı kapatmaz; geri dönmek çift kayıt yapmaz', async () => {
    const u = await renderUI(<SetupWizard onDone={jest.fn()} />);
    start(u);
    pass(u);
    fireEvent.changeText(u.getByPlaceholderText('Alışkanlığın adı'), 'Su iç');
    fireEvent.press(u.getByText('Alışkanlığı ekle'));
    fireEvent.press(u.getByText('Bir tane daha ekle'));
    expect(continueDisabled(u)).toBe(false);
    next(u);
    expect(u.getByText('Adım 3/7')).toBeTruthy();
    fireEvent.press(u.getByLabelText('Geri'));
    expect(u.getByText('Adım 2/7')).toBeTruthy();
    expect(continueDisabled(u)).toBe(false); // adım zaten yapıldı
    next(u);
    expect(habitRepo.listByUser(mockUserId).map((h) => h.title)).toEqual(['Su iç']);
  });
});
