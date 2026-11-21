// Site-wide terminal behaviour: vim keys, link hints, the tty, peek cards and
// link previews.
// Mounted once from BaseHead; every listener is delegated, so it survives
// client-side navigation without re-binding.
import { mountEffects } from "./effects";
import { mountKeys } from "./keys";
import { mountLinkPeek } from "./link-peek";
import { mountPeek } from "./peek";
import { mountTty } from "./tty";

let mounted = false;

export function mountTerminalLayer(): void {
  if (mounted) return;
  mounted = true;
  mountKeys();
  mountTty();
  mountPeek();
  mountLinkPeek();
  mountEffects();
}
