// webNavigation is already granted. Do not require the broader tabs permission
// just to read the active site's URL after the popup's activeTab grant expires.
export async function getTabURL(tab: { id?: number; url?: string }): Promise<string | undefined> {
  if (tab.url) return tab.url;
  if (tab.id === undefined) return undefined;
  const frame = await browser.webNavigation.getFrame({ tabId: tab.id, frameId: 0 });
  return frame?.url;
}
