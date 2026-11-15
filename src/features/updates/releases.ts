export interface ProductUpdate {
  version: string;
  date: string;
  status: "unreleased" | "released";
  title: string;
  changes: readonly string[];
}

export const productUpdates: readonly ProductUpdate[] = [
  {
    version: "Next update",
    date: "2026-11-13",
    status: "unreleased",
    title: "Your hidden items, in one place",
    changes: [
      "Click the Less toolbar icon to open your panel right on the current website.",
      "Restore an individual item or reset the site while keeping the page open.",
      "See the current site’s saved hiding rules. Restoring an item decreases the count.",
    ],
  },
];
