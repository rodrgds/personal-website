// Interface sounds (cuelume, synthesized live, no files). One rule: a sound
// answers something the visitor did, and says what kind of thing happened.
//
//   select     choosing in a group: filters, sources, sort, ranges
//   toggle     switching a state: theme, sound, a tag, pause
//   open/close dialogs, the tty, link hints, inception, disclosures
//   navigate   page changes, carousels, stepping through periods
//   type       keys in the tty and in search fields; the boot's login
//   success    copied, saved;  error  failed or refused;  ready  an answer
//
// Never: hover, scrolling, vim motions, automatic changes (the life.exe
// timer, live clocks, refreshes) or anything that streams. Sound is on by
// default, stored per browser, and the footer toggle turns it off.
import {
  bind,
  play,
  setEnabled,
  setTheme,
  setVolume,
  unlock,
  type PlayOptions,
  type SoundName,
} from "cuelume";

const STORAGE_KEY = "rgo-sound-enabled";
const root = (): HTMLElement => document.documentElement;

/** Play a cue; a no-op while sound is off or before the first gesture. */
export function cue(name: SoundName, options?: PlayOptions): void {
  play(name, options);
}

function preference(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== "false";
  } catch {
    return true;
  }
}

function showPreference(enabled: boolean): void {
  root().dataset.soundEnabled = String(enabled);
  setEnabled(enabled);
  const label = enabled ? "Mute interface sounds" : "Turn on interface sounds";
  for (const button of document.querySelectorAll<HTMLElement>(
    "[data-sound-toggle]",
  )) {
    button.setAttribute("aria-label", label);
    button.setAttribute("aria-pressed", String(enabled));
    button.setAttribute("title", label);
    button.dataset.soundState = enabled ? "on" : "off";
  }
}

function toggleSound(): void {
  const enabled = root().dataset.soundEnabled === "false";
  if (enabled) {
    // Turning sound on is the gesture that may start audio at all.
    showPreference(true);
    void unlock().then(() => cue("toggle"));
  } else {
    // Let the switch be heard before going quiet.
    cue("toggle", { direction: "back" });
    showPreference(false);
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, String(enabled));
  } catch {
    // The toggle still works for this page without storage.
  }
}

let mounted = false;

export function mountSound(): void {
  if (mounted) {
    showPreference(preference());
    return;
  }
  mounted = true;
  // Dry and precise, like the keyboard the site pretends to be.
  setTheme("mech");
  setVolume(0.6);
  bind();
  showPreference(preference());

  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest("[data-sound-toggle]")) toggleSound();
    // Copy buttons on code blocks in posts.
    if (target?.closest(".rehype-pretty-copy"))
      cue("success", { emphasis: "subtle" });
  });

  // Page changes through the client router; history back falls.
  document.addEventListener("astro:before-preparation", (event) => {
    cue("navigate", {
      emphasis: "subtle",
      direction: event.direction === "back" ? "back" : "forward",
    });
  });

  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY) showPreference(event.newValue !== "false");
  });
  document.addEventListener("astro:after-swap", () =>
    showPreference(preference()),
  );
}
