// The centered modal shell of the add and edit forms: scrolls long content,
// rises with the keyboard, closes on a backdrop tap. No data.
//
// Only the outermost ModalCard is a native Modal. One opened inside it (a date,
// time, repeat or tag picker in a form) is drawn as a layer over the outer
// card, inside the same window: stacked native Modals on Android can leave an
// orphaned window behind (eating every touch, or a picker popping back up)
// until the app restarts. Android back closes the top layer first.

import {
  createContext,
  useContext,
  useEffect,
  useReducer,
  useRef,
  useState,
  type ComponentRef,
  type ReactNode,
} from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useTheme } from '@/ui/ThemeProvider';
import { useI18n } from '@/i18n/I18nProvider';

interface Props {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  scroll?: boolean;
}

interface Layer {
  id: number;
  node: ReactNode;
  close: () => void;
}

// The outer card's nested layers, in opening order. A small store rather than
// state, so a layer's update re-renders only the host (not the form that owns
// the layer, which would register it again: a loop).
class LayerStore {
  layers: Layer[] = [];
  private listeners = new Set<() => void>();

  set(id: number, node: ReactNode, close: () => void) {
    const i = this.layers.findIndex((l) => l.id === id);
    if (i === -1) this.layers = [...this.layers, { id, node, close }];
    else this.layers = this.layers.map((l) => (l.id === id ? { id, node, close } : l));
    this.emit();
  }

  remove(id: number) {
    if (!this.layers.some((l) => l.id === id)) return;
    this.layers = this.layers.filter((l) => l.id !== id);
    this.emit();
  }

  top(): Layer | undefined {
    return this.layers[this.layers.length - 1];
  }

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private emit() {
    this.listeners.forEach((fn) => fn());
  }
}

const LayerContext = createContext<LayerStore | null>(null);
type ScrollInstance = ComponentRef<typeof ScrollView>;
type Field = ComponentRef<typeof View>;
const RevealContext = createContext<((field: Field | null) => void) | null>(null);

// For a field low in a long card: scrolls it into view once the keyboard is up.
// The keyboard covers the card (the window isn't resized), so while it is open
// the card's content gets the keyboard's height as bottom padding — otherwise a
// field at the end of the form has nothing left to scroll over.
export function useRevealInModal(): (field: Field | null) => void {
  return useContext(RevealContext) ?? noopReveal;
}
const noopReveal = () => {};

let nextLayerId = 1;

function LayerHost({ store }: { store: LayerStore }) {
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    const unsubscribe = store.subscribe(rerender);
    // A layer opened together with the outer card registered before this
    // subscription (child effects run first): pick it up now.
    rerender();
    return unsubscribe;
  }, [store]);
  return (
    <>
      {store.layers.map((l) => (
        // Above the outer card's elevation (Android draws by elevation first).
        <View key={l.id} style={[StyleSheet.absoluteFill, styles.layer]}>
          {l.node}
        </View>
      ))}
    </>
  );
}

export function ModalCard({ visible, onClose, children, scroll = true }: Props) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const parent = useContext(LayerContext);
  const storeRef = useRef<LayerStore | null>(null);
  if (!parent && !storeRef.current) storeRef.current = new LayerStore();
  const idRef = useRef(0);
  if (idRef.current === 0) idRef.current = nextLayerId++;
  const scrollRef = useRef<ScrollInstance>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const keyboardHeightRef = useRef(0);
  const pendingField = useRef<Field | null>(null);

  const scrollToField = () => {
    const field = pendingField.current;
    const scroll = scrollRef.current;
    const inner = scroll?.getInnerViewRef?.();
    pendingField.current = null;
    if (!field || !scroll || !inner) return;
    field.measureLayout?.(
      inner as never,
      (_x: number, y: number) => scroll.scrollTo({ y: Math.max(0, y - 96), animated: true }),
      () => scroll.scrollToEnd({ animated: true })
    );
  };
  const reveal = (field: Field | null) => {
    pendingField.current = field;
    // Keyboard already up: go now. Otherwise keyboardDidShow's padding does it.
    if (keyboardHeightRef.current > 0) setTimeout(scrollToField, 50);
  };
  // The padding is laid out before this runs.
  useEffect(() => {
    if (keyboardHeight > 0 && pendingField.current) scrollToField();
  });

  // Android back with the keyboard open only closes the keyboard, so a reflexive
  // back press doesn't throw away what was typed.
  const keyboardVisible = useRef(false);
  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', (e) => {
      keyboardVisible.current = true;
      keyboardHeightRef.current = e.endCoordinates.height;
      setKeyboardHeight(e.endCoordinates.height);
    });
    const hideSub = Keyboard.addListener('keyboardDidHide', () => {
      keyboardVisible.current = false;
      keyboardHeightRef.current = 0;
      setKeyboardHeight(0);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const handleRequestClose = () => {
    if (keyboardVisible.current) {
      Keyboard.dismiss();
      return;
    }
    const top = storeRef.current?.top();
    if (top) top.close();
    else onClose();
  };

  const card = (
    <View style={styles.overlay}>
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel={t('common.close')}
      />
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={[styles.handle, { backgroundColor: colors.border }]} />
        {scroll ? (
          <ScrollView
            ref={scrollRef}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: keyboardHeight }}
          >
            <RevealContext.Provider value={reveal}>{children}</RevealContext.Provider>
          </ScrollView>
        ) : (
          children
        )}
      </View>
    </View>
  );

  // Nested: hand the card to the outer one's host (every render, so it stays
  // current); gone when hidden or unmounted.
  useEffect(() => {
    if (!parent) return;
    if (visible) parent.set(idRef.current, card, onClose);
    else parent.remove(idRef.current);
  });
  useEffect(() => {
    const id = idRef.current;
    return () => parent?.remove(id);
  }, [parent]);

  if (parent || !visible) return null;
  const store = storeRef.current!;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={handleRequestClose}>
      <LayerContext.Provider value={store}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.kav}
        >
          {card}
          <LayerHost store={store} />
        </KeyboardAvoidingView>
      </LayerContext.Provider>
    </Modal>
  );
}

const styles = StyleSheet.create({
  kav: { flex: 1 },
  layer: { elevation: 24, zIndex: 1 },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 460,
    borderRadius: 28,
    paddingHorizontal: 22,
    paddingTop: 14,
    paddingBottom: 22,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowOpacity: 0.28,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 16,
    maxHeight: '100%',
  },
  handle: {
    width: 40,
    height: 5,
    borderRadius: 3,
    alignSelf: 'center',
    marginBottom: 14,
    opacity: 0.7,
  },
});
