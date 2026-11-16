type Property = "overflow-x" | "overflow-y" | "scrollbar-gutter";
type Declaration = { value: string; priority: string; applied: string };
type PageScroll = {
  document: Document;
  root: HTMLElement;
  originalStyle: string | null;
  lastStyle: string | null;
  changedByPage: boolean;
  hiding: boolean;
  lock?: { token: symbol; gutter: boolean };
  owned: Map<Property, Declaration>;
  observer?: MutationObserver;
};
const pages = new WeakMap<Document, PageScroll>();

export function preservePageScrollbar(document: Document): void {
  const view = document.defaultView;
  const root = document.documentElement;
  const existing = pages.get(document);
  const lockedGutter = existing?.root === root && existing.lock?.gutter;
  if (!view || (!lockedGutter && view.innerWidth <= root.clientWidth)) return;
  const page = getPage(document);
  if (page.hiding) return;
  page.hiding = true;
  update(page);
}

export function releasePageScrollbar(document: Document): void {
  const page = pages.get(document);
  if (!page) return;
  page.hiding = false;
  update(page);
}

export function lockPageScroll(document: Document): () => void {
  const page = getPage(document);
  const token = Symbol();
  page.lock = {
    token,
    // clientWidth alone does not describe space already reserved by scrollbar-gutter.
    gutter:
      page.hiding ||
      document.defaultView?.getComputedStyle(page.root).scrollbarGutter.includes("stable") ===
        true ||
      (document.defaultView?.innerWidth ?? page.root.clientWidth) > page.root.clientWidth,
  };
  update(page);
  page.observer?.disconnect();
  page.observer = new MutationObserver(() => {
    if (page.lock && page.root.getAttribute("style") !== page.lastStyle) update(page);
  });
  page.observer.observe(page.root, { attributes: true, attributeFilter: ["style"] });
  return () => {
    if (page.lock?.token !== token) return;
    page.observer?.disconnect();
    page.observer = undefined;
    page.lock = undefined;
    update(page);
  };
}

function getPage(document: Document): PageScroll {
  const previous = pages.get(document);
  if (previous?.root === document.documentElement) return previous;
  const originalStyle = document.documentElement.getAttribute("style");
  const page: PageScroll = {
    document,
    root: document.documentElement,
    originalStyle,
    lastStyle: originalStyle,
    changedByPage: false,
    hiding: false,
    owned: new Map(),
  };
  pages.set(document, page);
  return page;
}

function update(page: PageScroll): void {
  const { root } = page;
  if (root.getAttribute("style") !== page.lastStyle) page.changedByPage = true;
  let gutter: string | undefined;
  if (page.lock) gutter = page.lock.gutter ? "stable" : "auto";
  else if (page.hiding) gutter = "stable";
  const desired: Record<Property, string | undefined> = {
    "overflow-x": page.lock ? "hidden" : undefined,
    "overflow-y": page.lock ? "hidden" : undefined,
    "scrollbar-gutter": gutter,
  };
  for (const property of Object.keys(desired) as Property[]) {
    const value = root.style.getPropertyValue(property);
    const priority = root.style.getPropertyPriority(property);
    const owned = page.owned.get(property);
    const desiredValue = desired[property];
    if (desiredValue !== undefined) {
      // A page's own later declaration becomes the value restored when our claims end.
      if (!owned || value !== owned.applied || priority !== "important")
        page.owned.set(property, { value, priority, applied: desiredValue });
      else owned.applied = desiredValue;
      if (value !== desiredValue || priority !== "important")
        root.style.setProperty(property, desiredValue, "important");
    } else if (owned) {
      if (value === owned.applied && priority === "important") {
        if (owned.value) root.style.setProperty(property, owned.value, owned.priority);
        else root.style.removeProperty(property);
      }
      page.owned.delete(property);
    }
  }
  if (!page.hiding && !page.lock) {
    if (!page.changedByPage) {
      if (page.originalStyle === null) root.removeAttribute("style");
      else root.setAttribute("style", page.originalStyle);
    } else if (page.originalStyle === null && root.getAttribute("style") === "") {
      root.removeAttribute("style");
    }
    if (pages.get(page.document) === page) pages.delete(page.document);
  }
  page.lastStyle = root.getAttribute("style");
}
