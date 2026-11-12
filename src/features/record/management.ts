import type { HiddenElementRecord } from "./schema";

export interface ManagedRecord {
  id: string;
  createdAt: number;
  scope: HiddenElementRecord["scope"];
  target: HiddenElementRecord["target"];
  path: string;
}

export type ManagementRequest =
  | { type: "LIST_HIDDEN_ITEMS"; origin: string }
  | { type: "RESTORE_HIDDEN_ITEM"; origin: string; id: string }
  | { type: "RESET_HIDDEN_SITE"; origin: string }
  | { type: "SYNC_HIDDEN_SITE"; origin: string };

export type ManagementResponse =
  | { ok: true; records: ManagedRecord[]; unsyncedTabs: number }
  | { ok: false; error: string };

export async function manageRecords(
  request: ManagementRequest,
): Promise<ManagementResponse & { ok: true }> {
  const response: ManagementResponse = await browser.runtime.sendMessage(request);
  if (!response?.ok)
    throw new Error(response?.error ?? "Veil could not reach its background service. Try again.");
  return response;
}
