// SwipeableRow: Düzenle düğmesi isteğe bağlı (paylaşılan satırda yalnız Kaldır),
// silme ikinci dokunuş ister, kendisi soran onDelete için istemez.

import { act, fireEvent } from '@testing-library/react-native';
import { Text } from 'react-native';
import { SwipeableRow } from '@/ui/SwipeableRow';
import { renderUI } from '@/test/renderWithProviders';

const row = (props: Partial<React.ComponentProps<typeof SwipeableRow>> = {}) => (
  <SwipeableRow isOpen onOpenChange={() => {}} onDelete={jest.fn()} deleteA11yLabel="Sil" {...props}>
    <Text>Kart</Text>
  </SwipeableRow>
);

describe('SwipeableRow', () => {
  it('onEdit varsa Düzenle de görünür', async () => {
    const u = await renderUI(row({ onEdit: jest.fn(), editA11yLabel: 'Düzenle' }));
    expect(u.getByLabelText('Düzenle')).toBeTruthy();
    expect(u.getByLabelText('Sil')).toBeTruthy();
  });

  it('onEdit yoksa yalnız silme düğmesi var', async () => {
    const u = await renderUI(row());
    expect(u.queryByLabelText('Düzenle')).toBeNull();
    expect(u.getByLabelText('Sil')).toBeTruthy();
  });

  it('varsayılan: silme ikinci dokunuşta çalışır', async () => {
    const onDelete = jest.fn();
    const u = await renderUI(row({ onDelete }));
    fireEvent.press(u.getByLabelText('Sil'));
    expect(onDelete).not.toHaveBeenCalled();
    fireEvent.press(u.getByLabelText('Silmek için tekrar bas'));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  // The sliding card: only PanResponder sets onMoveShouldSetResponder.
  const slider = (u: Awaited<ReturnType<typeof renderUI>>) =>
    u.UNSAFE_root.findAll((n: { props: Record<string, unknown> }) => typeof n.props.onMoveShouldSetResponder === 'function')[0];

  it('kayan kart hareketi listenin kaydırmasına bırakmaz', async () => {
    const u = await renderUI(row({ isOpen: false }));
    expect(slider(u).props.onResponderTerminationRequest({})).toBe(false);
  });

  it('hareket yine de kesilirse kart yarıda kalmaz, durum güncellenir', async () => {
    const onOpenChange = jest.fn();
    const u = await renderUI(row({ isOpen: false, onOpenChange }));
    act(() => slider(u).props.onResponderTerminate({ nativeEvent: {}, touchHistory: {} }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('confirmDelete={false}: ilk dokunuşta çalışır', async () => {
    const onDelete = jest.fn();
    const onOpenChange = jest.fn();
    const u = await renderUI(row({ onDelete, onOpenChange, confirmDelete: false }));
    fireEvent.press(u.getByLabelText('Sil'));
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
