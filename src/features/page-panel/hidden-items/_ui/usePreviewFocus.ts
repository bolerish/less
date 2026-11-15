import { useLayoutEffect, useRef } from "react";

export function usePreviewFocus(selected: boolean) {
  const button = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    const element = button.current;
    if (!selected || !element) return;
    const shadow = element.getRootNode();
    if (!(shadow instanceof ShadowRoot) || shadow.activeElement !== element) return;
    const list = element.closest<HTMLElement>(".records");
    if (!list) return;
    const row = element.getBoundingClientRect();
    const viewport = list.getBoundingClientRect();
    if (row.bottom > viewport.bottom) list.scrollTop += row.bottom - viewport.bottom;
    else if (row.top < viewport.top) list.scrollTop -= viewport.top - row.top;
  }, [selected]);
  return button;
}
