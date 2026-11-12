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
      "Open Manage hidden items from the popup to see what you have hidden on the current site.",
      "Restore an individual item or reset the site while keeping the page open.",
      "Switch tabs and the list follows the site you are viewing.",
    ],
  },
];
