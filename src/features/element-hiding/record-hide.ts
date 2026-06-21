import type { HiddenElementRecord } from "~features/record/schema";

import { applyHiddenElement, restoreHiddenElement } from "./element-hide";
import { resolveMatchedElement } from "./match/record-match-resolver";

export function applyRecordHiding(documentRef: Document, record: HiddenElementRecord): boolean {
  const result = resolveMatchedElement(documentRef, record);
  if (result.status !== "matched") return false;
  applyHiddenElement(result.matchedElement);
  return true;
}

export function applyRecordsHiding(documentRef: Document, records: HiddenElementRecord[]): void {
  for (const record of records) {
    applyRecordHiding(documentRef, record);
  }
}

export function restoreRecordHiding(documentRef: Document, record: HiddenElementRecord): boolean {
  const result = resolveMatchedElement(documentRef, record);
  if (result.status !== "matched") return false;
  restoreHiddenElement(result.matchedElement);
  return true;
}
