import type { PanelMessage } from "../record/management-messages";

export interface ProductUpdate {
  version: string;
  date: string;
  status: "unreleased" | "released";
  titleKey: PanelMessage;
  changeKeys: readonly PanelMessage[];
}

export const productUpdates: readonly ProductUpdate[] = [
  {
    version: "1.2.0",
    date: "2026-11-15",
    status: "unreleased",
    titleKey: "panel_release_1_2_0_title",
    changeKeys: [
      "panel_release_1_2_0_change_1",
      "panel_release_1_2_0_change_2",
      "panel_release_1_2_0_change_3",
      "panel_release_1_2_0_change_4",
      "panel_release_1_2_0_change_5",
      "panel_release_1_2_0_change_6",
    ],
  },
];
