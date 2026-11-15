export interface ProductUpdate {
  version: string;
  date: string;
  status: "unreleased" | "released";
  title: string;
  changes: readonly string[];
}

export const productUpdates: readonly ProductUpdate[] = [
  {
    version: "1.2.0",
    date: "2026-11-15",
    status: "unreleased",
    title: "A simpler panel, now called Less",
    changes: [
      "Less keeps your saved hiding rules and site settings.",
      "Refresh your hidden-item list with one icon, and open updates from the bottom of the panel.",
      "An unread indicator appears when there are released updates you have not opened yet.",
      "Click the Less toolbar icon to open your panel right on the current website.",
      "Restore an individual item or reset the site while keeping the page open.",
      "See the current site’s saved hiding rules. Restoring an item decreases the count.",
    ],
  },
];
