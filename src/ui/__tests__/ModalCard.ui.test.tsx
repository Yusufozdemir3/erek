// ModalCard: yalnız en dıştaki yerel pencere (Modal); içinde açılan ikinci
// pencere aynı pencerede katman olur. Geri tuşu önce üstteki katmanı kapatır.

import { useState } from 'react';
import { act, fireEvent } from '@testing-library/react-native';
import { Modal, Pressable, Text } from 'react-native';
import { ModalCard } from '@/ui/ModalCard';
import { renderUI } from '@/test/renderWithProviders';

const outerClose = jest.fn();
const innerClose = jest.fn();

function Harness() {
  const [inner, setInner] = useState(false);
  return (
    <ModalCard
      visible
      onClose={() => {
        outerClose();
      }}
    >
      <Text>Form</Text>
      <Pressable onPress={() => setInner(true)} accessibilityLabel="Tarih seç">
        <Text>Tarih</Text>
      </Pressable>
      <ModalCard
        visible={inner}
        onClose={() => {
          innerClose();
          setInner(false);
        }}
      >
        <Text>Takvim</Text>
      </ModalCard>
    </ModalCard>
  );
}

const backPress = (u: Awaited<ReturnType<typeof renderUI>>) =>
  act(() => {
    u.UNSAFE_getByType(Modal).props.onRequestClose();
  });

beforeEach(() => jest.clearAllMocks());

describe('ModalCard', () => {
  it('tek başına bir yerel pencere açar', async () => {
    const u = await renderUI(
      <ModalCard visible onClose={() => {}}>
        <Text>Form</Text>
      </ModalCard>
    );
    expect(u.UNSAFE_getAllByType(Modal)).toHaveLength(1);
    expect(u.getByText('Form')).toBeTruthy();
  });

  it('içteki pencere ikinci bir Modal açmaz, katman olarak görünür', async () => {
    const u = await renderUI(<Harness />);
    expect(u.queryByText('Takvim')).toBeNull();

    fireEvent.press(u.getByLabelText('Tarih seç'));

    expect(u.getByText('Takvim')).toBeTruthy();
    expect(u.UNSAFE_getAllByType(Modal)).toHaveLength(1);
  });

  it('geri tuşu önce üstteki katmanı, sonra dıştaki pencereyi kapatır', async () => {
    const u = await renderUI(<Harness />);
    fireEvent.press(u.getByLabelText('Tarih seç'));

    backPress(u);
    expect(innerClose).toHaveBeenCalledTimes(1);
    expect(outerClose).not.toHaveBeenCalled();
    expect(u.queryByText('Takvim')).toBeNull();
    expect(u.getByText('Form')).toBeTruthy();

    backPress(u);
    expect(outerClose).toHaveBeenCalledTimes(1);
    expect(innerClose).toHaveBeenCalledTimes(1);
  });

  it('katmanın arka planına dokunmak yalnız katmanı kapatır', async () => {
    const u = await renderUI(<Harness />);
    fireEvent.press(u.getByLabelText('Tarih seç'));

    const closers = u.getAllByLabelText('Kapat');
    fireEvent.press(closers[closers.length - 1]);

    expect(innerClose).toHaveBeenCalledTimes(1);
    expect(outerClose).not.toHaveBeenCalled();
    expect(u.queryByText('Takvim')).toBeNull();
  });

  it('dıştaki pencere kapanınca katman da kalmaz', async () => {
    function Outer() {
      const [open, setOpen] = useState(true);
      return (
        <>
          <Pressable onPress={() => setOpen(false)} accessibilityLabel="Kapat dış">
            <Text>x</Text>
          </Pressable>
          <ModalCard visible={open} onClose={() => setOpen(false)}>
            <ModalCard visible onClose={() => {}}>
              <Text>Takvim</Text>
            </ModalCard>
          </ModalCard>
        </>
      );
    }
    const u = await renderUI(<Outer />);
    expect(u.getByText('Takvim')).toBeTruthy();

    fireEvent.press(u.getByLabelText('Kapat dış'));

    expect(u.queryByText('Takvim')).toBeNull();
    expect(u.UNSAFE_queryAllByType(Modal)).toHaveLength(0);
  });
});
