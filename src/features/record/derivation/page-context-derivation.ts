export function deriveCurrentPageContext(windowRef: Window) {
  return {
    origin: windowRef.location.origin,
    path: windowRef.location.pathname,
    search: windowRef.location.search,
  };
}
