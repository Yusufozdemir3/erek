// The button on the right of every tab's large title: the profile photo.
// (A Friends 👥 button used to sit next to it; Friends now lives inside the
// Profile menu, so the header stays a single button.)

import { ProfileButton } from '@/ui/ProfileButton';

export function HeaderActions() {
  return <ProfileButton />;
}
