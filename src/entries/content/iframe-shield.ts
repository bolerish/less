export const SHIELD_ATTR = "data-veil-iframe-shield";

const iframeShields = new Map<HTMLIFrameElement, HTMLDivElement>();
const iframeOriginalPointerEvents = new Map<HTMLIFrameElement, string>();
let shieldObserver: MutationObserver | null = null;

export function shieldIframes(): void {
  document.querySelectorAll<HTMLIFrameElement>("iframe").forEach(shieldOneIframe);

  shieldObserver = new MutationObserver((mutations) => {
    let changed = false;
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node instanceof HTMLIFrameElement) {
          shieldOneIframe(node);
          changed = true;
        } else if (node instanceof HTMLElement) {
          node.querySelectorAll<HTMLIFrameElement>("iframe").forEach((iframe) => {
            shieldOneIframe(iframe);
            changed = true;
          });
        }
      }
      for (const node of mutation.removedNodes) {
        if (node instanceof HTMLIFrameElement) removeShield(node);
      }
    }
    if (changed) syncShieldPositions();
  });

  shieldObserver.observe(document.body ?? document.documentElement, {
    childList: true,
    subtree: true,
  });
}

export function syncShieldPositions(): void {
  iframeShields.forEach((shield, iframe) => {
    const rect = iframe.getBoundingClientRect();
    Object.assign(shield.style, {
      top: `${rect.top}px`,
      left: `${rect.left}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    });
  });
}

export function unshieldAllIframes(): void {
  Array.from(iframeShields.keys()).forEach(removeShield);
  shieldObserver?.disconnect();
  shieldObserver = null;
}

function shieldOneIframe(iframe: HTMLIFrameElement): void {
  if (iframeShields.has(iframe)) return;

  iframeOriginalPointerEvents.set(iframe, iframe.style.pointerEvents);
  iframe.style.pointerEvents = "none";

  const rect = iframe.getBoundingClientRect();
  const zIndex = getComputedZIndex(iframe);

  const shield = document.createElement("div");
  shield.setAttribute(SHIELD_ATTR, "true");
  shield.setAttribute("aria-hidden", "true");
  Object.assign(shield.style, {
    position: "fixed",
    top: `${rect.top}px`,
    left: `${rect.left}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    zIndex: String(zIndex + 1),
    background: "transparent",
    pointerEvents: "auto",
  });

  document.documentElement.appendChild(shield);
  iframeShields.set(iframe, shield);
}

function removeShield(iframe: HTMLIFrameElement): void {
  const shield = iframeShields.get(iframe);
  if (shield) {
    shield.remove();
    iframeShields.delete(iframe);
  }
  const original = iframeOriginalPointerEvents.get(iframe);
  if (original !== undefined) {
    iframe.style.pointerEvents = original;
    iframeOriginalPointerEvents.delete(iframe);
  }
}

function getComputedZIndex(el: HTMLElement): number {
  const z = Number.parseInt(window.getComputedStyle(el).zIndex, 10);
  return Number.isNaN(z) ? 0 : z;
}
