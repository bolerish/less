import Dexie, { type Table } from "dexie";

import type { HiddenElementRecord } from "~features/record/schema";

export interface MetaEntry {
  key: string;
  value: unknown;
}

class VeilDB extends Dexie {
  records!: Table<HiddenElementRecord>;
  meta!: Table<MetaEntry>;

  constructor() {
    super("veil-db");
    this.version(1).stores({
      records: [
        "&id",
        "scope",
        "[pageContext.origin+pageContext.path+pageContext.search]",
        "pageContext.origin",
        "matchFailureCount",
        "lastMatchedAt",
      ].join(", "),
      meta: "&key",
    });
  }
}

export const db = new VeilDB();
