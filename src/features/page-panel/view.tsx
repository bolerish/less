import { PanelLayout } from "./layout";
import { PanelFooter } from "./_ui/PanelFooter";
import { Settings, type SettingsPage } from "./settings/_ui/Settings";
import { useLanguage } from "~shared/locale/use-locale";
import * as stylex from "@stylexjs/stylex";
import { useEffect, useRef, useState } from "react";
import type { HiddenItemPreview } from "~features/element-hiding/preview";
import { usePanelMessage } from "~shared/locale/use-panel-message";
import { useUpdateNotice } from "~features/updates/use-update-notice";
import { HiddenItems } from "./hidden-items/_ui/HiddenItems";
import { Updates } from "./updates/Updates";

export default function PanelView({
  origin,
  onClose,
  onSelect,
  preview,
  portalContainer,
}: {
  preview?: HiddenItemPreview;
  portalContainer?: HTMLElement;
  origin: string;
  onClose: () => void;
  onSelect: () => void;
}) {
  const message = usePanelMessage();
  const language = useLanguage();
  const [view, setView] = useState<"hidden" | "updates" | SettingsPage>("hidden");
  const hasUnreadUpdates = useUpdateNotice(view === "updates");
  const updatesButton = useRef<HTMLButtonElement>(null);
  const settingsButton = useRef<HTMLButtonElement>(null);
  const viewHeading = useRef<HTMLSpanElement>(null);
  const previousView = useRef(view);
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const dialog = closeButton.current?.closest("dialog");
    if (dialog) {
      dialog.lang = language;
      dialog.setAttribute("aria-label", message("panel_dialog"));
    }
  }, [message, language]);

  useEffect(() => {
    closeButton.current?.focus();
  }, []);

  useEffect(() => {
    if (
      view === "settings" &&
      (previousView.current === "language" ||
        previousView.current === "theme" ||
        previousView.current === "motion")
    )
      closeButton.current
        ?.closest("dialog")
        ?.querySelector<HTMLElement>(`[data-settings-page="${previousView.current}"]`)
        ?.focus({ preventScroll: true });
    else if (view !== "hidden") viewHeading.current?.focus();
    else if (previousView.current === "updates")
      updatesButton.current?.focus({ preventScroll: true });
    else if (previousView.current !== "hidden")
      settingsButton.current?.focus({ preventScroll: true });
    previousView.current = view;
    closeButton.current?.closest("dialog")?.querySelector(".panel-body")?.scrollTo(0, 0);
  }, [view]);

  function back() {
    setView(view === "language" || view === "theme" || view === "motion" ? "settings" : "hidden");
  }

  return (
    <PanelLayout
      language={language}
      breadcrumbs={[
        {
          id: "hidden",
          label: "Less",
          onNavigate: view === "hidden" ? undefined : () => setView("hidden"),
        },
        ...(view === "language" || view === "theme" || view === "motion"
          ? [
              {
                id: "settings",
                label: message("panel_settings"),
                onNavigate: () => setView("settings"),
              },
            ]
          : []),
        ...(view === "hidden"
          ? []
          : [
              {
                id: view,
                label: message(view === "updates" ? "panel_update_history" : `panel_${view}`),
              },
            ]),
      ]}
      onBack={view === "hidden" ? undefined : back}
      onClose={onClose}
      closeButton={closeButton}
      heading={viewHeading}
    >
      <div hidden={view !== "hidden"} {...stylex.props(styles.content)}>
        <HiddenItems
          origin={origin}
          onSelect={onSelect}
          preview={preview}
          portalContainer={portalContainer}
        />
        {view === "hidden" ? (
          <PanelFooter
            settingsButton={settingsButton}
            onSettings={() => {
              preview?.clear();
              setView("settings");
            }}
            hasUnreadUpdates={hasUnreadUpdates}
            updatesButton={updatesButton}
            onUpdates={() => {
              preview?.clear();
              setView("updates");
            }}
            portalContainer={portalContainer}
          />
        ) : null}
      </div>
      {view === "updates" ? <Updates /> : null}
      {view === "settings" || view === "language" || view === "theme" || view === "motion" ? (
        <Settings key={view} page={view} onNavigate={setView} portalContainer={portalContainer} />
      ) : null}
    </PanelLayout>
  );
}

const styles = stylex.create({
  content: {
    flex: 1,
    minHeight: 0,
    display: { default: "flex", ":is([hidden])": "none" },
    flexDirection: "column",
  },
});
