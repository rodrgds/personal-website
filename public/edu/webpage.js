(() => {
  "use strict";

  const START_NODE_ID = "5ca11a74e4c8118e";
  const CANVAS_URL = "/edu/main.canvas";
  const SVG_NS = "http://www.w3.org/2000/svg";
  const GRID_SIZE = 10;
  const GRID_HIDE_SCALE = 0.45;
  const GRID_SHOW_SCALE = 0.55;
  const OVERVIEW_ENTER_SCALE = 0.24;
  const OVERVIEW_EXIT_SCALE = 0.28;
  const WHEEL_ZOOM_RATE = 0.0014;
  const MAX_WHEEL_ZOOM_DELTA = 80;
  const prefersReducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  );
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)");

  const elements = {
    app: document.querySelector(".app"),
    viewport: document.querySelector("#canvas-viewport"),
    world: document.querySelector("#canvas-world"),
    nodes: document.querySelector("#canvas-nodes"),
    edges: document.querySelector("#canvas-edges"),
    minimap: document.querySelector("#minimap"),
    minimapSvg: document.querySelector("#minimap-svg"),
    zoom: document.querySelector("#zoom-level"),
    readerDialog: document.querySelector("#reader-dialog"),
    readerSearch: document.querySelector("#reader-search"),
    readerCount: document.querySelector("#reader-count"),
    readerList: document.querySelector("#reader-list"),
    helpDialog: document.querySelector("#help-dialog"),
    liveStatus: document.querySelector("#live-status"),
    loading: document.querySelector(".loading-state"),
  };

  const state = {
    canvas: null,
    nodesById: new Map(),
    bounds: null,
    view: { x: 0, y: 0, scale: 1 },
    minScale: 0.04,
    maxScale: 2.5,
    selectedNodeId: null,
    pointers: new Map(),
    gesture: null,
    animationFrame: 0,
    viewFrame: 0,
  };

  const canvasColors = {
    1: "var(--canvas-red)",
    2: "var(--canvas-orange)",
    3: "var(--canvas-yellow)",
    4: "var(--canvas-green)",
    5: "var(--canvas-cyan)",
    6: "var(--canvas-purple)",
  };

  function setTheme(theme, persist = false) {
    document.documentElement.dataset.theme = theme;
    if (persist) localStorage.setItem("edu-theme", theme);
  }

  function initializeTheme() {
    const stored = localStorage.getItem("edu-theme");
    setTheme(
      stored === "light" || stored === "dark"
        ? stored
        : prefersDark.matches
          ? "dark"
          : "light",
    );
    prefersDark.addEventListener("change", (event) => {
      if (!localStorage.getItem("edu-theme"))
        setTheme(event.matches ? "dark" : "light");
    });
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function safeHttpUrl(value) {
    try {
      const url = new URL(value, window.location.href);
      return url.protocol === "http:" || url.protocol === "https:"
        ? url.href
        : "";
    } catch {
      return "";
    }
  }

  function renderInlineMarkdown(value) {
    const tokens = [];
    let source = String(value).replace(/\\([\\`*_[\]{}()#+.!~-])/g, "$1");

    source = source.replace(
      /\[([^\]]+)]\((https?:\/\/[^\s)]+)\)/g,
      (_match, label, href) => {
        const url = safeHttpUrl(href);
        if (!url) return label;
        const token = `\u0000LINK${tokens.length}\u0000`;
        tokens.push(
          `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${renderInlineMarkdown(label)}</a>`,
        );
        return token;
      },
    );

    source = source.replace(/`([^`]+)`/g, (_match, code) => {
      const token = `\u0000CODE${tokens.length}\u0000`;
      tokens.push(`<code>${escapeHtml(code)}</code>`);
      return token;
    });

    let html = escapeHtml(source)
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/__([^_]+)__/g, "<strong>$1</strong>")
      .replace(/~~([^~]+)~~/g, "<del>$1</del>")
      .replace(/==([^=]+)==/g, "<mark>$1</mark>")
      .replace(/(^|[\s(])\*([^*\n]+)\*(?=$|[\s).,!?])/g, "$1<em>$2</em>")
      .replace(/(^|[\s(])_([^_\n]+)_(?=$|[\s).,!?])/g, "$1<em>$2</em>");

    tokens.forEach((tokenHtml, index) => {
      html = html
        .replace(`\u0000LINK${index}\u0000`, tokenHtml)
        .replace(`\u0000CODE${index}\u0000`, tokenHtml);
    });
    return html;
  }

  function calloutIconMarkup(type) {
    if (["attention", "caution", "warning"].includes(type)) {
      return '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M10.3 3.6 2.2 18a2 2 0 0 0 1.75 3h16.1a2 2 0 0 0 1.75-3L13.7 3.6a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/></svg>';
    }
    if (["cite", "quote"].includes(type)) {
      return '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M3 21c3 0 7-1 7-8V5c0-1.25-.75-2-2-2H4c-1.25 0-2 .75-2 2v4c0 1.25.75 2 2 2h3c0 4-2 6-4 7v3ZM14 21c3 0 7-1 7-8V5c0-1.25-.75-2-2-2h-4c-1.25 0-2 .75-2 2v4c0 1.25.75 2 2 2h3c0 4-2 6-4 7v3Z"/></svg>';
    }
    return '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M21.17 6.81a1 1 0 0 0-3.98-3.98L3.84 16.17a2 2 0 0 0-.5.83l-1.32 4.35a.5.5 0 0 0 .62.63L7 20.66a2 2 0 0 0 .83-.5Z"/><path d="m15 5 4 4"/></svg>';
  }

  function renderCallout(calloutType, title, lines) {
    const type = calloutType.toLocaleLowerCase().replace(/\s+/g, "-");
    const contentLines = [...lines];
    while (contentLines[0] === "") contentLines.shift();
    while (contentLines.at(-1) === "") contentLines.pop();
    const content =
      type === "poem"
        ? contentLines
            .map((line) => (line ? renderInlineMarkdown(line) : ""))
            .join("<br>")
        : renderInlineMarkdown(contentLines.filter(Boolean).join(" "));
    const contentMarkup = contentLines.some(Boolean)
      ? `<div class="callout-content"><p>${content}</p></div>`
      : "";
    return `<aside class="callout" data-callout="${escapeHtml(type)}"><div class="callout-title">${calloutIconMarkup(type)}<span>${renderInlineMarkdown(title)}</span></div>${contentMarkup}</aside>`;
  }

  function listLine(value) {
    const match = String(value).match(/^(\s*)([-+*]|\d+[.)])\s+(.+)$/);
    if (!match) return null;
    return {
      indent: match[1].replaceAll("\t", "    ").length,
      ordered: /^\d/.test(match[2]),
      content: match[3],
    };
  }

  function renderList(lines, startIndex, baseIndent) {
    const ordered = listLine(lines[startIndex]).ordered;
    const tag = ordered ? "ol" : "ul";
    const items = [];
    let index = startIndex;

    while (index < lines.length) {
      const item = listLine(lines[index]);
      if (!item || item.indent !== baseIndent || item.ordered !== ordered)
        break;
      index += 1;
      let nested = "";
      while (index < lines.length) {
        const child = listLine(lines[index]);
        if (!child || child.indent <= baseIndent) break;
        const rendered = renderList(lines, index, child.indent);
        nested += rendered.html;
        index = rendered.index;
      }
      items.push(`<li>${renderInlineMarkdown(item.content)}${nested}</li>`);
    }

    return { html: `<${tag}>${items.join("")}</${tag}>`, index };
  }

  function renderMarkdown(markdown) {
    const lines = String(markdown).replace(/\r\n?/g, "\n").split("\n");
    const output = [];
    let index = 0;

    while (index < lines.length) {
      const raw = lines[index];
      const trimmed = raw.trim();

      if (!trimmed) {
        index += 1;
        continue;
      }

      const heading = trimmed.match(/^(#{1,4})\s+(.+)$/);
      if (heading) {
        const level = heading[1].length;
        output.push(
          `<h${level}>${renderInlineMarkdown(heading[2])}</h${level}>`,
        );
        index += 1;
        continue;
      }

      if (/^>\s?/.test(trimmed)) {
        const quoteLines = [];
        while (index < lines.length && /^>\s?/.test(lines[index].trim())) {
          quoteLines.push(lines[index].replace(/^\s*>\s?/, ""));
          index += 1;
        }
        const callout = quoteLines[0]?.match(/^\[!([^\]]+)]\s*(.*)$/);
        if (callout) {
          const restLines = [callout[2], ...quoteLines.slice(1)];
          const title =
            callout[1].charAt(0).toLocaleUpperCase() + callout[1].slice(1);
          output.push(renderCallout(callout[1], title, restLines));
        } else {
          output.push(
            `<blockquote>${renderMarkdown(quoteLines.join("\n"))}</blockquote>`,
          );
        }
        continue;
      }

      const listItem = listLine(raw);
      if (listItem) {
        const rendered = renderList(lines, index, listItem.indent);
        output.push(rendered.html);
        index = rendered.index;
        continue;
      }

      const paragraph = [trimmed];
      index += 1;
      while (index < lines.length) {
        const next = lines[index].trim();
        if (
          !next ||
          /^(#{1,4})\s+/.test(next) ||
          /^>\s?/.test(next) ||
          listLine(lines[index])
        )
          break;
        paragraph.push(next);
        index += 1;
      }
      output.push(`<p>${renderInlineMarkdown(paragraph.join(" "))}</p>`);
    }

    return output.join("");
  }

  function plainText(markdown) {
    return String(markdown)
      .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
      .replace(/^#{1,6}\s+/gm, "")
      .replace(/^>\s?/gm, "")
      .replace(/^[-+*]\s+/gm, "")
      .replace(/[*_~=`]/g, "")
      .replace(/\[![^\]]+]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function nodeTitle(node) {
    if (node.type === "link") return linkMetadata(node.url).title;
    const source = String(node.text || "");
    const heading = source.match(/^#{1,6}\s+(.+)$/m)?.[1];
    const text = plainText(heading || source);
    if (!text) return "Untitled idea";
    return text.length > 92 ? `${text.slice(0, 89).trim()}…` : text;
  }

  function titleFromSlug(slug) {
    const words = decodeURIComponent(slug || "")
      .replace(/-[a-f0-9]{8,}$/i, "")
      .replace(/[-_]+/g, " ")
      .trim();
    return words
      ? words.charAt(0).toUpperCase() + words.slice(1)
      : "External source";
  }

  function youtubeId(url) {
    const match = String(url).match(
      /(?:youtube\.com\/(?:embed\/|watch\?v=)|youtu\.be\/)([A-Za-z0-9_-]{6,})/,
    );
    return match?.[1] || "";
  }

  function linkMetadata(value) {
    const safeUrl = safeHttpUrl(value);
    if (!safeUrl)
      return {
        url: "",
        domain: "Invalid source",
        title: "Unavailable source",
        youtubeId: "",
        blocksEmbed: true,
      };
    const parsed = new URL(safeUrl);
    const domain = parsed.hostname.replace(/^www\./, "");
    const videoId = youtubeId(safeUrl);
    let title;

    if (videoId) title = "Video source";
    else if (domain === "news.ycombinator.com")
      title = "Hacker News discussion";
    else if (
      domain === "cs.stanford.edu" &&
      parsed.pathname.endsWith("advice.html")
    )
      title = "Advice for students: Andrej Karpathy";
    else
      title = titleFromSlug(parsed.pathname.split("/").filter(Boolean).at(-1));

    return {
      url: safeUrl,
      domain,
      title,
      youtubeId: videoId,
      blocksEmbed:
        domain === "substack.com" || domain.endsWith(".substack.com"),
    };
  }

  function iconMarkup(name) {
    const icons = {
      external:
        '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M14 5h5v5M19 5l-8 8"/><path d="M19 13v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/></svg>',
      article:
        '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M6 3h9l3 3v15H6Z"/><path d="M14 3v4h4M9 11h6M9 15h6M9 19h4"/></svg>',
      play: '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="m9 7 8 5-8 5Z"/></svg>',
      preview:
        '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 5h16v14H4Z"/><path d="M4 9h16M8 7h.01"/></svg>',
    };
    return icons[name] || "";
  }

  function createTextNode(node) {
    const body = document.createElement("div");
    body.className = "node-body markdown";
    body.innerHTML = renderMarkdown(node.text);
    return body;
  }

  function addEmbedNotice(media, metadata, message) {
    const notice = document.createElement("div");
    notice.className = "embed-notice";
    const copy = document.createElement("span");
    copy.textContent = message;
    const link = document.createElement("a");
    link.href = metadata.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "Open source";
    link.style.color = "inherit";
    notice.append(copy, link);
    media.append(notice);
    return notice;
  }

  function loadArticlePreview(media, metadata, trigger) {
    trigger.disabled = true;
    trigger.querySelector("span").textContent = "Loading preview…";
    const frame = document.createElement("iframe");
    frame.title = `Preview of ${metadata.title}`;
    frame.loading = "lazy";
    frame.referrerPolicy = "strict-origin-when-cross-origin";
    frame.setAttribute(
      "sandbox",
      "allow-forms allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts",
    );
    frame.src = metadata.url;
    const notice = addEmbedNotice(
      media,
      metadata,
      "Publisher previews can be blocked.",
    );
    frame.addEventListener(
      "load",
      () => {
        trigger.remove();
        notice.firstElementChild.textContent =
          "If this preview is blank, open the source.";
      },
      { once: true },
    );
    media.append(frame);
  }

  function loadYoutube(media, metadata, trigger) {
    const frame = document.createElement("iframe");
    frame.title = metadata.title;
    frame.src = `https://www.youtube-nocookie.com/embed/${metadata.youtubeId}?autoplay=1&rel=0`;
    frame.allow =
      "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
    frame.referrerPolicy = "strict-origin-when-cross-origin";
    frame.allowFullscreen = true;
    trigger.remove();
    media.append(frame);
  }

  function createLinkNode(node) {
    const metadata = linkMetadata(node.url);
    const wrapper = document.createElement("div");
    wrapper.className = "link-node-inner";

    const media = document.createElement("div");
    media.className = "link-media";

    if (metadata.youtubeId) {
      const image = document.createElement("img");
      image.src = `https://i.ytimg.com/vi/${metadata.youtubeId}/hqdefault.jpg`;
      image.alt = "";
      image.loading = "lazy";
      image.decoding = "async";
      media.append(image);

      const play = document.createElement("button");
      play.className = "link-placeholder media-trigger";
      play.type = "button";
      play.setAttribute("aria-label", `Play ${metadata.title}`);
      play.innerHTML = `${iconMarkup("play")}<span>Play video</span>`;
      play.addEventListener("click", () => loadYoutube(media, metadata, play));
      media.append(play);
    } else {
      const placeholder = document.createElement(
        metadata.blocksEmbed ? "div" : "button",
      );
      placeholder.className = "link-placeholder";
      if (!metadata.blocksEmbed) {
        placeholder.classList.add("media-trigger");
        placeholder.type = "button";
        placeholder.innerHTML = `${iconMarkup("preview")}<span>Preview article</span>`;
        placeholder.addEventListener("click", () =>
          loadArticlePreview(media, metadata, placeholder),
        );
      } else {
        placeholder.innerHTML = `${iconMarkup("article")}<span>This publisher blocks embedded reading.<br>Use the source link below.</span>`;
      }
      media.append(placeholder);
    }

    const info = document.createElement("div");
    info.className = "link-info";
    const copy = document.createElement("div");
    copy.className = "link-copy";
    const domain = document.createElement("span");
    domain.className = "link-domain";
    domain.textContent = metadata.domain;
    const title = document.createElement("span");
    title.className = "link-title";
    title.textContent = metadata.title;
    copy.append(domain, title);

    const actions = document.createElement("div");
    actions.className = "link-actions";
    const open = document.createElement("a");
    open.className = "link-action";
    open.href = metadata.url;
    open.target = "_blank";
    open.rel = "noopener noreferrer";
    open.setAttribute("aria-label", `Open ${metadata.title} in a new tab`);
    open.title = "Open source";
    open.innerHTML = iconMarkup("external");
    actions.append(open);
    info.append(copy, actions);
    wrapper.append(media, info);
    return wrapper;
  }

  function normalizeColor(color) {
    if (!color) return "var(--line-strong)";
    if (canvasColors[color]) return canvasColors[color];
    return /^#[0-9a-f]{6}$/i.test(color) ? color : "var(--line-strong)";
  }

  function validateCanvas(canvas) {
    if (
      !canvas ||
      !Array.isArray(canvas.nodes) ||
      !Array.isArray(canvas.edges)
    ) {
      throw new Error("The canvas must contain node and edge arrays.");
    }
    const ids = new Set();
    for (const node of canvas.nodes) {
      if (!node.id || ids.has(node.id))
        throw new Error(
          `Duplicate or missing node ID: ${node.id || "unknown"}`,
        );
      ids.add(node.id);
      if (!["text", "link", "file", "group"].includes(node.type))
        throw new Error(`Unsupported node type: ${node.type}`);
      for (const key of ["x", "y", "width", "height"]) {
        if (!Number.isFinite(node[key]))
          throw new Error(`Node ${node.id} has an invalid ${key}.`);
      }
      if (node.type === "text" && String(node.text) !== node.text)
        throw new Error(`Text node ${node.id} has no text.`);
      if (node.type === "link" && !safeHttpUrl(node.url))
        throw new Error(`Link node ${node.id} has an invalid URL.`);
    }
    for (const edge of canvas.edges) {
      if (!edge.id || ids.has(edge.id))
        throw new Error(
          `Duplicate or missing edge ID: ${edge.id || "unknown"}`,
        );
      ids.add(edge.id);
      if (!ids.has(edge.fromNode) || !ids.has(edge.toNode))
        throw new Error(`Edge ${edge.id} points to a missing node.`);
    }
  }

  function getBounds(nodes) {
    const padding = 240;
    const minX = Math.min(...nodes.map((node) => node.x)) - padding;
    const minY = Math.min(...nodes.map((node) => node.y)) - padding;
    const maxX =
      Math.max(...nodes.map((node) => node.x + node.width)) + padding;
    const maxY =
      Math.max(...nodes.map((node) => node.y + node.height)) + padding;
    return {
      minX,
      minY,
      maxX,
      maxY,
      width: maxX - minX,
      height: maxY - minY,
      padding,
    };
  }

  function localNode(node) {
    return {
      ...node,
      localX: node.x - state.bounds.minX,
      localY: node.y - state.bounds.minY,
    };
  }

  function renderNodes() {
    const fragment = document.createDocumentFragment();
    state.canvas.nodes.forEach((rawNode, index) => {
      const node = localNode(rawNode);
      state.nodesById.set(node.id, node);
      const element = document.createElement(
        node.type === "group" ? "section" : "article",
      );
      element.className = `canvas-node ${node.type === "link" ? "link-node" : ""}`;
      element.dataset.nodeId = node.id;
      element.dataset.color = node.color || "";
      element.dataset.type = node.type;
      element.style.left = `${node.localX}px`;
      element.style.top = `${node.localY}px`;
      element.style.width = `${node.width}px`;
      element.style.height = `${node.height}px`;
      element.style.zIndex = String(index + 1);
      element.style.setProperty("--node-accent", normalizeColor(node.color));
      element.tabIndex = 0;
      element.setAttribute("aria-label", nodeTitle(node));

      if (node.type === "text") element.append(createTextNode(node));
      else if (node.type === "link") element.append(createLinkNode(node));
      else if (node.type === "group") {
        const label = document.createElement("strong");
        label.className = "node-body";
        label.textContent = node.label || "Group";
        element.append(label);
      } else {
        const fallback = document.createElement("div");
        fallback.className = "node-body";
        fallback.textContent = node.file || "Referenced file";
        element.append(fallback);
      }

      element.addEventListener("dblclick", (event) => {
        if (event.target.closest("a, button, iframe")) return;
        focusNode(node.id);
      });
      element.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && !event.target.closest("a, button")) {
          event.preventDefault();
          focusNode(node.id);
        }
      });
      fragment.append(element);
    });
    elements.nodes.append(fragment);
  }

  function inferSide(node, other) {
    const dx = other.localX + other.width / 2 - (node.localX + node.width / 2);
    const dy =
      other.localY + other.height / 2 - (node.localY + node.height / 2);
    if (Math.abs(dx) > Math.abs(dy)) return dx >= 0 ? "right" : "left";
    return dy >= 0 ? "bottom" : "top";
  }

  function anchor(node, side) {
    if (side === "top")
      return { x: node.localX + node.width / 2, y: node.localY };
    if (side === "right")
      return { x: node.localX + node.width, y: node.localY + node.height / 2 };
    if (side === "bottom")
      return { x: node.localX + node.width / 2, y: node.localY + node.height };
    return { x: node.localX, y: node.localY + node.height / 2 };
  }

  function edgePath(start, end, fromSide, toSide) {
    const distance = Math.max(
      60,
      Math.min(260, Math.hypot(end.x - start.x, end.y - start.y) * 0.42),
    );
    const vectors = {
      top: [0, -distance],
      right: [distance, 0],
      bottom: [0, distance],
      left: [-distance, 0],
    };
    const from = vectors[fromSide];
    const to = vectors[toSide];
    return `M ${start.x} ${start.y} C ${start.x + from[0]} ${start.y + from[1]}, ${end.x + to[0]} ${end.y + to[1]}, ${end.x} ${end.y}`;
  }

  function renderEdges() {
    elements.edges.setAttribute("width", state.bounds.width);
    elements.edges.setAttribute("height", state.bounds.height);
    elements.edges.setAttribute(
      "viewBox",
      `0 0 ${state.bounds.width} ${state.bounds.height}`,
    );
    const defs = document.createElementNS(SVG_NS, "defs");
    const marker = document.createElementNS(SVG_NS, "marker");
    marker.setAttribute("id", "edge-arrow");
    marker.setAttribute("viewBox", "0 0 10 10");
    marker.setAttribute("refX", "9");
    marker.setAttribute("refY", "5");
    marker.setAttribute("markerWidth", "7");
    marker.setAttribute("markerHeight", "7");
    marker.setAttribute("orient", "auto-start-reverse");
    const arrow = document.createElementNS(SVG_NS, "path");
    arrow.setAttribute("d", "M 0 0 L 10 5 L 0 10 z");
    arrow.setAttribute("fill", "context-stroke");
    marker.append(arrow);
    defs.append(marker);
    elements.edges.append(defs);

    state.canvas.edges.forEach((edge) => {
      const fromNode = state.nodesById.get(edge.fromNode);
      const toNode = state.nodesById.get(edge.toNode);
      const fromSide = edge.fromSide || inferSide(fromNode, toNode);
      const toSide = edge.toSide || inferSide(toNode, fromNode);
      const start = anchor(fromNode, fromSide);
      const end = anchor(toNode, toSide);
      const path = document.createElementNS(SVG_NS, "path");
      path.classList.add("canvas-edge");
      path.setAttribute("d", edgePath(start, end, fromSide, toSide));
      path.style.setProperty("--edge-color", normalizeColor(edge.color));
      if ((edge.fromEnd || "none") === "arrow")
        path.setAttribute("marker-start", "url(#edge-arrow)");
      if ((edge.toEnd || "arrow") === "arrow")
        path.setAttribute("marker-end", "url(#edge-arrow)");
      elements.edges.append(path);

      if (edge.label) {
        const label = document.createElementNS(SVG_NS, "text");
        label.classList.add("canvas-edge-label");
        label.setAttribute("x", String((start.x + end.x) / 2));
        label.setAttribute("y", String((start.y + end.y) / 2 - 6));
        label.setAttribute("text-anchor", "middle");
        label.textContent = edge.label;
        elements.edges.append(label);
      }
    });
  }

  function renderMinimap() {
    elements.minimapSvg.setAttribute(
      "viewBox",
      `0 0 ${state.bounds.width} ${state.bounds.height}`,
    );
    elements.minimapSvg.setAttribute("preserveAspectRatio", "none");
    state.canvas.nodes.forEach((rawNode) => {
      const node = state.nodesById.get(rawNode.id);
      const rect = document.createElementNS(SVG_NS, "rect");
      rect.classList.add("minimap-node");
      if (node.color) rect.classList.add("is-accented");
      rect.setAttribute("x", node.localX);
      rect.setAttribute("y", node.localY);
      rect.setAttribute("width", node.width);
      rect.setAttribute("height", node.height);
      elements.minimapSvg.append(rect);
    });
    const viewportRect = document.createElementNS(SVG_NS, "rect");
    viewportRect.classList.add("minimap-viewport");
    viewportRect.dataset.viewport = "";
    elements.minimapSvg.append(viewportRect);
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function updateMinimapViewport() {
    const rect = elements.minimapSvg.querySelector("[data-viewport]");
    if (!rect) return;
    const width = elements.viewport.clientWidth / state.view.scale;
    const height = elements.viewport.clientHeight / state.view.scale;
    rect.setAttribute("x", String(-state.view.x / state.view.scale));
    rect.setAttribute("y", String(-state.view.y / state.view.scale));
    rect.setAttribute("width", String(width));
    rect.setAttribute("height", String(height));
  }

  function applyView(announce = false) {
    const { x, y, scale } = state.view;
    elements.world.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
    const wasOverview = elements.world.classList.contains("is-overview");
    const isOverview = wasOverview
      ? scale < OVERVIEW_EXIT_SCALE
      : scale < OVERVIEW_ENTER_SCALE;
    elements.world.classList.toggle("is-overview", isOverview);
    elements.zoom.value = `${Math.round(scale * 100)}%`;
    elements.zoom.textContent = elements.zoom.value;
    const wasGridHidden =
      elements.viewport.classList.contains("is-grid-hidden");
    const hideGrid = wasGridHidden
      ? scale < GRID_SHOW_SCALE
      : scale < GRID_HIDE_SCALE;
    elements.viewport.classList.toggle("is-grid-hidden", hideGrid);
    if (!hideGrid) {
      const grid = GRID_SIZE * scale;
      elements.viewport.style.backgroundSize = `${grid}px ${grid}px`;
      elements.viewport.style.backgroundPosition = `${x % grid}px ${y % grid}px`;
    }
    updateMinimapViewport();
    if (announce)
      elements.liveStatus.textContent = `Zoom ${Math.round(scale * 100)} percent`;
  }

  function scheduleViewUpdate() {
    if (state.viewFrame) return;
    state.viewFrame = requestAnimationFrame(() => {
      state.viewFrame = 0;
      applyView();
    });
  }

  function flushViewUpdate() {
    if (state.viewFrame) cancelAnimationFrame(state.viewFrame);
    state.viewFrame = 0;
    applyView();
  }

  function markInteraction() {
    elements.viewport.classList.add("has-interacted");
  }

  function cancelViewAnimation() {
    if (state.animationFrame) cancelAnimationFrame(state.animationFrame);
    state.animationFrame = 0;
  }

  function animateView(target, announce = false) {
    cancelViewAnimation();
    target.scale = clamp(target.scale, state.minScale, state.maxScale);
    if (prefersReducedMotion.matches) {
      state.view = target;
      applyView(announce);
      return;
    }
    const start = { ...state.view };
    const startedAt = performance.now();
    const duration = 420;
    const frame = (time) => {
      const progress = clamp((time - startedAt) / duration, 0, 1);
      const eased = 1 - Math.pow(1 - progress, 4);
      state.view = {
        x: start.x + (target.x - start.x) * eased,
        y: start.y + (target.y - start.y) * eased,
        scale: start.scale + (target.scale - start.scale) * eased,
      };
      applyView(false);
      if (progress < 1) state.animationFrame = requestAnimationFrame(frame);
      else {
        state.animationFrame = 0;
        if (announce) applyView(true);
      }
    };
    state.animationFrame = requestAnimationFrame(frame);
  }

  function fitViewTarget() {
    const width = elements.viewport.clientWidth;
    const height = elements.viewport.clientHeight;
    const margin = width < 700 ? 30 : 64;
    const scale = Math.min(
      (width - margin * 2) / state.bounds.width,
      (height - margin * 2) / state.bounds.height,
    );
    return {
      scale,
      x: (width - state.bounds.width * scale) / 2,
      y: (height - state.bounds.height * scale) / 2,
    };
  }

  function fitAll() {
    markInteraction();
    animateView(fitViewTarget(), true);
    elements.liveStatus.textContent = "Showing the entire map";
  }

  function selectNode(nodeId, updateHash = true) {
    if (state.selectedNodeId) {
      elements.nodes
        .querySelector(`[data-node-id="${CSS.escape(state.selectedNodeId)}"]`)
        ?.classList.remove("is-selected");
    }
    state.selectedNodeId = nodeId;
    elements.nodes
      .querySelector(`[data-node-id="${CSS.escape(nodeId)}"]`)
      ?.classList.add("is-selected");
    if (updateHash)
      history.replaceState(null, "", `#node=${encodeURIComponent(nodeId)}`);
  }

  function focusNode(nodeId, options = {}) {
    const node = state.nodesById.get(nodeId);
    if (!node) return;
    markInteraction();
    selectNode(nodeId, options.updateHash !== false);
    const viewportWidth = elements.viewport.clientWidth;
    const viewportHeight = elements.viewport.clientHeight;
    const margin = viewportWidth < 700 ? 46 : 120;
    const scale = clamp(
      Math.min((viewportWidth - margin) / node.width, 1.15),
      state.minScale,
      state.maxScale,
    );
    animateView({
      scale,
      x: viewportWidth / 2 - (node.localX + node.width / 2) * scale,
      y: viewportHeight / 2 - (node.localY + node.height / 2) * scale,
    });
    elements.liveStatus.textContent = `Focused: ${nodeTitle(node)}`;
  }

  function zoomAt(screenX, screenY, factor, announce = false) {
    cancelViewAnimation();
    const oldScale = state.view.scale;
    const scale = clamp(oldScale * factor, state.minScale, state.maxScale);
    const worldX = (screenX - state.view.x) / oldScale;
    const worldY = (screenY - state.view.y) / oldScale;
    state.view = {
      scale,
      x: screenX - worldX * scale,
      y: screenY - worldY * scale,
    };
    applyView(announce);
    markInteraction();
  }

  function setupPointerNavigation() {
    elements.viewport.addEventListener(
      "wheel",
      (event) => {
        event.preventDefault();
        cancelViewAnimation();
        if (event.ctrlKey || event.metaKey) {
          let delta = event.deltaY;
          if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) delta *= 16;
          if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE)
            delta *= elements.viewport.clientHeight;
          const boundedDelta = clamp(
            delta,
            -MAX_WHEEL_ZOOM_DELTA,
            MAX_WHEEL_ZOOM_DELTA,
          );
          zoomAt(
            event.clientX,
            event.clientY - elements.viewport.getBoundingClientRect().top,
            Math.exp(-boundedDelta * WHEEL_ZOOM_RATE),
          );
        } else {
          state.view.x -=
            event.shiftKey && !event.deltaX ? event.deltaY : event.deltaX;
          state.view.y -= event.shiftKey ? 0 : event.deltaY;
          applyView();
          markInteraction();
        }
      },
      { passive: false },
    );

    elements.viewport.addEventListener("pointerdown", (event) => {
      if (event.target.closest("a, button, input, iframe")) return;
      if (event.pointerType !== "mouse") event.preventDefault();
      cancelViewAnimation();
      try {
        elements.viewport.setPointerCapture(event.pointerId);
      } catch {
        // The pointer may already have ended before capture on older mobile browsers.
      }
      state.pointers.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
      });
      if (state.pointers.size === 1) {
        state.gesture = {
          type: "pan",
          startX: event.clientX,
          startY: event.clientY,
          viewX: state.view.x,
          viewY: state.view.y,
          moved: false,
          nodeId: event.target.closest("[data-node-id]")?.dataset.nodeId || "",
        };
      } else if (state.pointers.size === 2) {
        const [a, b] = [...state.pointers.values()];
        const midX = (a.x + b.x) / 2;
        const midY =
          (a.y + b.y) / 2 - elements.viewport.getBoundingClientRect().top;
        state.gesture = {
          type: "pinch",
          startDistance: Math.hypot(b.x - a.x, b.y - a.y),
          startScale: state.view.scale,
          worldX: (midX - state.view.x) / state.view.scale,
          worldY: (midY - state.view.y) / state.view.scale,
          moved: true,
        };
      }
      elements.viewport.classList.add("is-panning");
    });

    elements.viewport.addEventListener("pointermove", (event) => {
      if (!state.pointers.has(event.pointerId) || !state.gesture) return;
      event.preventDefault();
      state.pointers.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
      });
      if (state.gesture.type === "pan" && state.pointers.size === 1) {
        const dx = event.clientX - state.gesture.startX;
        const dy = event.clientY - state.gesture.startY;
        if (Math.hypot(dx, dy) > 3) state.gesture.moved = true;
        state.view.x = state.gesture.viewX + dx;
        state.view.y = state.gesture.viewY + dy;
        scheduleViewUpdate();
      } else if (state.pointers.size >= 2) {
        const [a, b] = [...state.pointers.values()];
        const distance = Math.max(1, Math.hypot(b.x - a.x, b.y - a.y));
        const scale = clamp(
          (state.gesture.startScale * distance) / state.gesture.startDistance,
          state.minScale,
          state.maxScale,
        );
        const midX = (a.x + b.x) / 2;
        const midY =
          (a.y + b.y) / 2 - elements.viewport.getBoundingClientRect().top;
        state.view = {
          scale,
          x: midX - state.gesture.worldX * scale,
          y: midY - state.gesture.worldY * scale,
        };
        scheduleViewUpdate();
      }
      markInteraction();
    });

    const endPointer = (event) => {
      if (!state.pointers.has(event.pointerId)) return;
      const endedGesture = state.gesture;
      state.pointers.delete(event.pointerId);
      flushViewUpdate();
      if (state.pointers.size === 0) {
        elements.viewport.classList.remove("is-panning");
        if (
          endedGesture?.type === "pan" &&
          !endedGesture.moved &&
          endedGesture.nodeId
        )
          selectNode(endedGesture.nodeId);
        state.gesture = null;
      } else if (state.pointers.size === 1) {
        const remaining = [...state.pointers.values()][0];
        state.gesture = {
          type: "pan",
          startX: remaining.x,
          startY: remaining.y,
          viewX: state.view.x,
          viewY: state.view.y,
          moved: true,
          nodeId: "",
        };
      }
    };
    elements.viewport.addEventListener("pointerup", endPointer);
    elements.viewport.addEventListener("pointercancel", endPointer);
    elements.viewport.addEventListener("lostpointercapture", endPointer);
  }

  function setupKeyboardNavigation() {
    elements.viewport.addEventListener("keydown", (event) => {
      if (event.target.closest("a, button, input")) return;
      const centerX = elements.viewport.clientWidth / 2;
      const centerY = elements.viewport.clientHeight / 2;
      const panStep = event.shiftKey ? 180 : 80;
      if (["+", "="].includes(event.key)) {
        event.preventDefault();
        zoomAt(centerX, centerY, 1.2, true);
      } else if (event.key === "-") {
        event.preventDefault();
        zoomAt(centerX, centerY, 1 / 1.2, true);
      } else if (event.key === "0") {
        event.preventDefault();
        fitAll();
      } else if (event.key === "Home") {
        event.preventDefault();
        focusNode(START_NODE_ID);
      } else if (event.key.startsWith("Arrow")) {
        event.preventDefault();
        if (event.key === "ArrowLeft") state.view.x += panStep;
        if (event.key === "ArrowRight") state.view.x -= panStep;
        if (event.key === "ArrowUp") state.view.y += panStep;
        if (event.key === "ArrowDown") state.view.y -= panStep;
        applyView();
        markInteraction();
      }
    });
  }

  function setupMinimap() {
    let activePointerId = null;

    const moveToPointer = (event, animate = false) => {
      const rect = elements.minimap.getBoundingClientRect();
      const relativeX = clamp(event.clientX - rect.left, 0, rect.width);
      const relativeY = clamp(event.clientY - rect.top, 0, rect.height);
      const worldX = (relativeX / rect.width) * state.bounds.width;
      const worldY = (relativeY / rect.height) * state.bounds.height;
      const target = {
        ...state.view,
        x: elements.viewport.clientWidth / 2 - worldX * state.view.scale,
        y: elements.viewport.clientHeight / 2 - worldY * state.view.scale,
      };
      if (animate) animateView(target);
      else {
        state.view = target;
        scheduleViewUpdate();
      }
      markInteraction();
    };

    elements.minimap.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      cancelViewAnimation();
      activePointerId = event.pointerId;
      elements.minimap.classList.add("is-dragging");
      try {
        elements.minimap.setPointerCapture(event.pointerId);
      } catch {
        // The pointer may already have ended before capture on older mobile browsers.
      }
      moveToPointer(event);
    });

    elements.minimap.addEventListener("pointermove", (event) => {
      if (event.pointerId !== activePointerId) return;
      event.preventDefault();
      moveToPointer(event);
    });

    const endMinimapPointer = (event) => {
      if (event.pointerId !== activePointerId) return;
      activePointerId = null;
      elements.minimap.classList.remove("is-dragging");
      flushViewUpdate();
    };

    elements.minimap.addEventListener("pointerup", endMinimapPointer);
    elements.minimap.addEventListener("pointercancel", endMinimapPointer);
    elements.minimap.addEventListener("lostpointercapture", endMinimapPointer);
    elements.minimap.addEventListener("keydown", (event) => {
      if (!["Enter", " "].includes(event.key)) return;
      event.preventDefault();
      fitAll();
    });
    elements.minimap.addEventListener("click", (event) => {
      if (event.detail === 0) fitAll();
    });
  }

  function readerItem(node) {
    const title = nodeTitle(node);
    const fullText =
      node.type === "text" ? plainText(node.text) : linkMetadata(node.url).url;
    const excerpt =
      fullText.length > 180 ? `${fullText.slice(0, 177).trim()}…` : fullText;
    const item = document.createElement("li");
    item.className = "reader-item";
    item.dataset.search = `${title} ${fullText}`.toLocaleLowerCase();

    const details = document.createElement("details");
    const summary = document.createElement("summary");
    const titleElement = document.createElement("span");
    titleElement.className = "reader-title";
    titleElement.textContent = title;
    const excerptElement = document.createElement("span");
    excerptElement.className = "reader-excerpt";
    excerptElement.textContent = excerpt;
    const meta = document.createElement("span");
    meta.className = "reader-meta";
    meta.textContent =
      node.type === "link" ? linkMetadata(node.url).domain : "Idea";
    summary.append(titleElement, excerptElement, meta);

    const full = document.createElement("div");
    full.className = "reader-full markdown";
    if (node.type === "text") full.innerHTML = renderMarkdown(node.text);
    else {
      const source = document.createElement("a");
      source.href = linkMetadata(node.url).url;
      source.target = "_blank";
      source.rel = "noopener noreferrer";
      source.textContent = `Open ${title}`;
      full.append(source);
    }

    const locate = document.createElement("button");
    locate.type = "button";
    locate.className = "reader-map-action";
    locate.textContent = "Show on map";
    locate.addEventListener("click", () => {
      elements.readerDialog.close();
      focusNode(node.id);
      window.setTimeout(() => elements.viewport.focus(), 0);
    });
    full.append(locate);
    details.append(summary, full);
    item.append(details);
    return item;
  }

  function renderReader() {
    const ordered = [...state.canvas.nodes];
    const fragment = document.createDocumentFragment();
    ordered.forEach((node) => fragment.append(readerItem(node)));
    elements.readerList.append(fragment);

    const filter = () => {
      const query = elements.readerSearch.value.trim().toLocaleLowerCase();
      let visible = 0;
      elements.readerList.querySelectorAll(".reader-item").forEach((item) => {
        const matches = !query || item.dataset.search.includes(query);
        item.hidden = !matches;
        if (matches) visible += 1;
      });
      elements.readerCount.textContent = `${visible} ${visible === 1 ? "entry" : "entries"}`;
    };
    elements.readerSearch.addEventListener("input", filter);
    filter();
  }

  function openDialog(dialog) {
    if (dialog.open) return;
    dialog.showModal();
  }

  function setupControls() {
    document.addEventListener("click", (event) => {
      const action = event.target.closest("[data-action]")?.dataset.action;
      if (!action) return;
      const centerX = elements.viewport.clientWidth / 2;
      const centerY = elements.viewport.clientHeight / 2;
      if (action === "zoom-in") zoomAt(centerX, centerY, 1.22, true);
      if (action === "zoom-out") zoomAt(centerX, centerY, 1 / 1.22, true);
      if (action === "fit") fitAll();
      if (action === "start" || action === "locate") focusNode(START_NODE_ID);
      if (action === "reader") {
        openDialog(elements.readerDialog);
        window.setTimeout(() => elements.readerSearch.focus(), 0);
      }
      if (action === "help") openDialog(elements.helpDialog);
      if (action === "theme") {
        setTheme(
          document.documentElement.dataset.theme === "dark" ? "light" : "dark",
          true,
        );
      }
    });

    document.querySelectorAll("[data-close]").forEach((button) => {
      button.addEventListener("click", () => button.closest("dialog").close());
    });

    [elements.readerDialog, elements.helpDialog].forEach((dialog) => {
      dialog.addEventListener("click", (event) => {
        if (event.target === dialog) dialog.close();
      });
    });
  }

  function setupResizeHandling() {
    let previousWidth = elements.viewport.clientWidth;
    let previousHeight = elements.viewport.clientHeight;
    const observer = new ResizeObserver(() => {
      if (!state.canvas) return;
      const nextWidth = elements.viewport.clientWidth;
      const nextHeight = elements.viewport.clientHeight;
      const crossedMobileBreakpoint = previousWidth < 700 !== nextWidth < 700;
      const substantiallyNarrower = nextWidth < previousWidth * 0.78;
      const worldCenterX =
        (previousWidth / 2 - state.view.x) / state.view.scale;
      const worldCenterY =
        (previousHeight / 2 - state.view.y) / state.view.scale;
      previousWidth = nextWidth;
      previousHeight = nextHeight;
      state.view.x = previousWidth / 2 - worldCenterX * state.view.scale;
      state.view.y = previousHeight / 2 - worldCenterY * state.view.scale;
      const fitScale = fitViewTarget().scale;
      state.minScale = Math.max(0.025, fitScale * 0.72);
      if (
        state.selectedNodeId &&
        (crossedMobileBreakpoint || substantiallyNarrower)
      ) {
        focusNode(state.selectedNodeId, { updateHash: false });
        return;
      }
      applyView();
    });
    observer.observe(elements.viewport);
  }

  function showLoadError(error) {
    console.error(error);
    elements.loading.replaceChildren();
    const wrapper = document.createElement("div");
    wrapper.className = "link-placeholder";
    const title = document.createElement("strong");
    title.textContent = "The map could not be opened.";
    const message = document.createElement("span");
    message.textContent =
      "The source file is still available as open JSON Canvas.";
    const link = document.createElement("a");
    link.href = CANVAS_URL;
    link.textContent = "Download main.canvas";
    wrapper.append(title, message, link);
    elements.loading.append(wrapper);
    elements.app.setAttribute("aria-busy", "false");
  }

  async function initialize() {
    initializeTheme();
    setupControls();
    try {
      const response = await fetch(CANVAS_URL, { cache: "no-cache" });
      if (!response.ok)
        throw new Error(`Canvas request failed with ${response.status}.`);
      const canvas = await response.json();
      validateCanvas(canvas);
      state.canvas = canvas;
      state.bounds = getBounds(canvas.nodes);
      elements.world.style.width = `${state.bounds.width}px`;
      elements.world.style.height = `${state.bounds.height}px`;
      elements.nodes.style.width = `${state.bounds.width}px`;
      elements.nodes.style.height = `${state.bounds.height}px`;
      renderNodes();
      renderEdges();
      renderMinimap();
      renderReader();
      setupPointerNavigation();
      setupKeyboardNavigation();
      setupMinimap();
      setupResizeHandling();

      const fitTarget = fitViewTarget();
      state.minScale = Math.max(0.025, fitTarget.scale * 0.72);
      state.view = fitTarget;
      applyView();
      elements.app.setAttribute("aria-busy", "false");

      const hashNode = new URLSearchParams(location.hash.slice(1)).get("node");
      requestAnimationFrame(() =>
        focusNode(state.nodesById.has(hashNode) ? hashNode : START_NODE_ID, {
          updateHash: false,
        }),
      );
    } catch (error) {
      showLoadError(error);
    }
  }

  initialize();
})();
