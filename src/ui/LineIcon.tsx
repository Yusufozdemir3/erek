// Line-vector icons for the setup wizard and the feature guides, in the same
// language as the tab bar and the habit icons (Feather/Ionicons, one color,
// tintable) — instead of emoji, which render differently per phone and clash
// with the rest of the UI. Callers pass a semantic id (like habitIcons.tsx), so
// the data files (guide/guideContent.ts) stay plain text with no icon imports.

import { Feather, Ionicons } from '@expo/vector-icons';

type FeatherName = React.ComponentProps<typeof Feather>['name'];
type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

type Spec = { family: 'feather'; name: FeatherName } | { family: 'ionicons'; name: IoniconName };

const f = (name: FeatherName): Spec => ({ family: 'feather', name });
const i = (name: IoniconName): Spec => ({ family: 'ionicons', name });

export const LINE_ICONS = {
  welcome: f('smile'),
  appearance: f('droplet'),
  habit: i('flame-outline'),
  task: f('check-square'),
  goal: f('target'),
  bell: f('bell'),
  widget: f('layout'),
  cloud: f('cloud'),
  done: f('check-circle'),
  celebrate: f('award'),
  number: f('hash'),
  add: f('plus-circle'),
  link: f('link'),
  trend: f('trending-up'),
  people: f('users'),
  sprout: i('leaf-outline'),
  calendar: f('calendar'),
  moon: f('moon'),
  key: f('key'),
  upload: f('upload'),
  download: f('download'),
  lock: f('lock'),
  edit: f('edit-3'),
  repeat: f('repeat'),
  tap: f('mouse-pointer'),
  home: f('home'),
  search: f('search'),
  mic: f('mic'),
  chart: f('bar-chart-2'),
  puzzle: f('grid'),
  refresh: f('refresh-cw'),
  sound: f('volume-2'),
  clock: f('clock'),
} as const;

export type LineIconId = keyof typeof LINE_ICONS;

export function LineIcon({ id, size, color }: { id: LineIconId; size: number; color: string }) {
  const spec: Spec = LINE_ICONS[id];
  return spec.family === 'feather' ? (
    <Feather name={spec.name} size={size} color={color} />
  ) : (
    <Ionicons name={spec.name} size={size} color={color} />
  );
}
