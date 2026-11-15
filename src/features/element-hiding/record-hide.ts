import type { HiddenElementRecord } from "~features/record/schema";

import { applyHiddenElement } from "./element-hide";
import { resolveMatchedElement } from "./match/record-match-resolver";

export function applyRecordsHiding(
  documentRef: Document,
  records: HiddenElementRecord[],
  onMatched?: (record: HiddenElementRecord, element: HTMLElement) => void,
): void {
  for (const record of records) {
    const result = resolveMatchedElement(documentRef, record);
    if (result.status !== "matched") continue;
    const el = result.matchedElement;
    onMatched?.(record, el);
    applyHiddenElement(el, false);
  }
}
