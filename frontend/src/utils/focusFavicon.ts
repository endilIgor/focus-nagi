export type FocusFaviconState = "idle" | "focusing" | "completed";

const FAVICON_COLORS: Record<FocusFaviconState, string> = {
  idle: "#3B82F6",
  focusing: "#A855F7",
  completed: "#D8D4E6",
};

/** Updates the browser-tab icon to reflect the current timer state. */
export function setFocusFaviconState(state: FocusFaviconState): void {
  if (typeof document === "undefined") return;

  const currentFavicon = document.head.querySelector<HTMLLinkElement>('link[rel="icon"]');
  const favicon = currentFavicon
    ? (currentFavicon.cloneNode(false) as HTMLLinkElement)
    : document.createElement("link");
  favicon.rel = "icon";
  favicon.type = "image/svg+xml";

  const color = FAVICON_COLORS[state];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path fill="${color}" d="M4 4h56v39L43 60H4z"/><text x="32" y="38" fill="#07070C" font-family="ui-monospace,monospace" font-size="23" font-weight="700" text-anchor="middle">FN</text></svg>`;

  favicon.dataset.focusState = state;
  favicon.href = `data:image/svg+xml,${encodeURIComponent(svg)}`;

  if (currentFavicon) currentFavicon.replaceWith(favicon);
  else document.head.append(favicon);
}
