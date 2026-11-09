import {
  deckMessage,
  isTyping,
  toggleTheme,
  type DeckContext,
  type DeckMessage,
} from "./shared";
import { updateMarks } from "./marks";
import { applyStep, lastStep } from "./steps";
import { initWidgets } from "./widgets";

const SLIDE_WIDTH = 1920;
const NOTES_SIZE_KEY = "slides:notes-size";

/** A static, scaled copy of a slide at a given step. */
function mountPreview(
  frame: HTMLElement,
  slide: HTMLElement | undefined,
  step: number,
): void {
  frame.replaceChildren();
  if (!slide) {
    const end = document.createElement("p");
    end.className = "speaker-end";
    end.textContent = "Fim";
    frame.append(end);
    return;
  }
  const clone = slide.cloneNode(true);
  if (!(clone instanceof HTMLElement)) return;
  clone.removeAttribute("id");
  clone.removeAttribute("data-current");
  clone
    .querySelectorAll("[data-marks], [data-marks-under]")
    .forEach((svg) => svg.replaceChildren());
  clone
    .querySelectorAll<HTMLElement>("[data-widget-ready]")
    .forEach((widget) => {
      widget.removeAttribute("data-widget-ready");
    });
  const holder = document.createElement("div");
  holder.className = "speaker-scale";
  holder.append(clone);
  frame.append(holder);
  holder.style.transform = `scale(${frame.clientWidth / SLIDE_WIDTH})`;
  initWidgets(clone);
  applyStep(clone, step, false);
  requestAnimationFrame(() => updateMarks(clone, step, false));
}

function rescale(frame: HTMLElement): void {
  const holder = frame.querySelector<HTMLElement>(".speaker-scale");
  if (holder)
    holder.style.transform = `scale(${frame.clientWidth / SLIDE_WIDTH})`;
}

const formatTime = (ms: number) => {
  const total = Math.floor(ms / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return hours
    ? `${hours}:${pad(minutes)}:${pad(seconds)}`
    : `${pad(minutes)}:${pad(seconds)}`;
};

export function initSpeaker({ root, slides, channel }: DeckContext): void {
  const speaker = root.querySelector<HTMLElement>("[data-speaker]");
  if (!speaker) return;
  speaker.hidden = false;
  document.title = `Orador · ${document.title}`;
  const get = (name: string) =>
    speaker.querySelector<HTMLElement>(`[data-speaker-${name}]`);
  const current = get("current");
  const upcoming = get("next");
  const upcomingLabel = get("next-label");
  const notes = get("notes");
  const title = get("title");
  const position = get("position");
  const timer = get("timer");
  const clock = get("clock");
  if (!current || !upcoming || !notes) return;

  let index = 0;
  let step = 0;
  let elapsed = 0;
  let startedAt = 0;
  let running = false;

  const show = (target: number, targetStep: number, broadcast: boolean) => {
    index = Math.min(slides.length - 1, Math.max(0, target));
    const slide = slides[index];
    step = Math.min(lastStep(slide), Math.max(0, targetStep));
    mountPreview(current, slide, step);
    const moreSteps = step < lastStep(slide);
    mountPreview(
      upcoming,
      moreSteps ? slide : slides[index + 1],
      moreSteps ? step + 1 : 0,
    );
    if (upcomingLabel) {
      upcomingLabel.textContent = moreSteps
        ? `A seguir: passo ${step + 1} de ${lastStep(slide)}`
        : "A seguir: próximo slide";
    }
    const source = slide.querySelector("[data-notes]");
    notes.innerHTML =
      source?.innerHTML ?? "<p class='speaker-empty'>Sem notas.</p>";
    // Each "[→]" in the script is one click: dim what was said, mark the next.
    const clicks = [...notes.querySelectorAll<HTMLElement>("strong")].filter(
      (element) => element.textContent?.trim() === "[→]",
    );
    clicks.forEach((click, index) => {
      click.dataset.click =
        index < step ? "done" : index === step ? "next" : "later";
    });
    const next = clicks[step];
    if (next && step > 0) next.scrollIntoView({ block: "center" });
    else notes.scrollTop = 0;
    if (title)
      title.textContent = `${slide.dataset.chapter ?? ""} · ${slide.dataset.title ?? ""}`;
    if (position) {
      const steps = lastStep(slide);
      position.textContent = `${index + 1} / ${slides.length}${steps ? ` · passo ${step}/${steps}` : ""}`;
    }
    if (broadcast) {
      if (!running && elapsed === 0) toggleTimer();
      channel?.postMessage({
        type: "state",
        index,
        step,
      } satisfies DeckMessage);
    }
  };

  const next = () => {
    if (step < lastStep(slides[index])) show(index, step + 1, true);
    else if (index < slides.length - 1) show(index + 1, 0, true);
  };
  const prev = () => {
    if (step > 0) show(index, step - 1, true);
    else if (index > 0) show(index - 1, lastStep(slides[index - 1]), true);
  };

  const elapsedNow = () =>
    elapsed + (running ? performance.now() - startedAt : 0);
  const toggleTimer = () => {
    if (running) {
      elapsed = elapsedNow();
      running = false;
    } else {
      startedAt = performance.now();
      running = true;
    }
    speaker.dataset.timer = running ? "running" : "paused";
  };
  const resetTimer = () => {
    elapsed = 0;
    startedAt = performance.now();
  };
  window.setInterval(() => {
    if (timer) timer.textContent = formatTime(elapsedNow());
    if (clock) {
      clock.textContent = new Date().toLocaleTimeString("pt-PT", {
        hour: "2-digit",
        minute: "2-digit",
      });
    }
  }, 250);

  let notesSize = 26;
  try {
    notesSize =
      Number(window.localStorage.getItem(NOTES_SIZE_KEY)) || notesSize;
  } catch {
    // Keep the default size.
  }
  const setNotesSize = (size: number) => {
    notesSize = Math.min(48, Math.max(16, size));
    speaker.style.setProperty("--notes-size", `${notesSize}px`);
    try {
      window.localStorage.setItem(NOTES_SIZE_KEY, String(notesSize));
    } catch {
      // Size still applies to this view.
    }
  };
  setNotesSize(notesSize);

  const actions = new Map<string, () => void>(
    Object.entries({
      prev,
      next,
      timer: toggleTimer,
      reset: resetTimer,
      theme: toggleTheme,
      smaller: () => setNotesSize(notesSize - 2),
      larger: () => setNotesSize(notesSize + 2),
    }),
  );
  speaker.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const button = target?.closest<HTMLElement>("[data-speaker-action]");
    if (button?.dataset.speakerAction)
      actions.get(button.dataset.speakerAction)?.();
  });

  window.addEventListener("keydown", (event) => {
    if (
      isTyping(event.target) ||
      event.metaKey ||
      event.ctrlKey ||
      event.altKey
    )
      return;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
      case "PageDown":
      case " ":
      case "Enter":
        next();
        break;
      case "ArrowLeft":
      case "ArrowUp":
      case "PageUp":
        prev();
        break;
      case "t":
        toggleTimer();
        break;
      case "d":
        toggleTheme();
        break;
      case "+":
      case "=":
        setNotesSize(notesSize + 2);
        break;
      case "-":
        setNotesSize(notesSize - 2);
        break;
      default:
        return;
    }
    event.preventDefault();
  });

  const observer = new ResizeObserver(() => {
    rescale(current);
    rescale(upcoming);
  });
  observer.observe(current);
  observer.observe(upcoming);

  channel?.addEventListener("message", (event) => {
    const message = deckMessage.safeParse(event.data);
    if (message.success && message.data.type === "state") {
      show(message.data.index, message.data.step, false);
    }
  });

  const hash = /^#?\/?(\d+)(?:\.(\d+))?$/.exec(window.location.hash);
  void document.fonts.ready.then(() => {
    show(
      hash ? Number(hash[1]) - 1 : 0,
      hash ? Number(hash[2] ?? 0) : 0,
      false,
    );
    channel?.postMessage({ type: "hello" } satisfies DeckMessage);
    root.removeAttribute("data-loading");
  });
}

export function initScript({ root, slides }: DeckContext): void {
  const script = root.querySelector<HTMLElement>("[data-script]");
  const list = root.querySelector<HTMLElement>("[data-script-list]");
  const stats = root.querySelector<HTMLElement>("[data-script-stats]");
  if (!script || !list) return;
  script.hidden = false;
  document.title = `Guião · ${document.title}`;
  let words = 0;
  let chapter = "";
  for (const slide of slides) {
    if (slide.dataset.chapter && slide.dataset.chapter !== chapter) {
      chapter = slide.dataset.chapter;
      const heading = document.createElement("h2");
      heading.textContent = chapter;
      list.append(heading);
    }
    const item = document.createElement("article");
    item.className = "script-item";
    const frame = document.createElement("a");
    frame.className = "script-preview";
    frame.href = `${window.location.pathname}#${Number(slide.dataset.index) + 1}`;
    frame.setAttribute(
      "aria-label",
      `Abrir slide ${Number(slide.dataset.index) + 1}`,
    );
    const body = document.createElement("div");
    body.className = "script-notes";
    const heading = document.createElement("h3");
    heading.textContent = `${Number(slide.dataset.index) + 1}. ${slide.dataset.title ?? ""}`;
    const notes = slide.querySelector("[data-notes]");
    const text = document.createElement("div");
    text.innerHTML = notes?.innerHTML ?? "";
    words += (notes?.textContent ?? "").split(/\s+/).filter(Boolean).length;
    body.append(heading, text);
    item.append(frame, body);
    list.append(item);
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        observer.disconnect();
        mountPreview(frame, slide, lastStep(slide));
      }
    });
    observer.observe(frame);
  }
  if (stats) {
    stats.textContent = `${slides.length} slides · ${words.toLocaleString("pt-PT")} palavras · cerca de ${Math.round(words / 150)} min a 150 palavras/min`;
  }
  window.addEventListener("resize", () => {
    list.querySelectorAll<HTMLElement>(".script-preview").forEach(rescale);
  });
  root.removeAttribute("data-loading");
}
