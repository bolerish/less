export const HIDDEN_ELEMENT_ATTRIBUTE = "data-bare-hidden";
export const HIDDEN_INLINE_STYLE_ATTRIBUTE = "data-bare-hidden-style";

export const isHiddenElement = (element: Element): boolean =>
  element.getAttribute(HIDDEN_ELEMENT_ATTRIBUTE) === "true";

export const isHideExcludedElement = (element: Element): boolean => {
  const tag = element.tagName.toLowerCase();
  return tag === "html" || tag === "body" || tag === "head";
};
