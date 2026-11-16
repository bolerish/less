import { PanelFooter } from "./_ui/PanelFooter";
import { Settings, type SettingsPage } from "./settings/_ui/Settings";
import { useLanguage } from "~shared/locale/use-locale";
import * as stylex from "@stylexjs/stylex";
import { colorVars, spacingVars, sizeVars, typo } from "@bolerish/tokens/semantic.stylex";
import { TooltipProvider } from "@bolerish/ui/tooltip";
import { Button } from "@bolerish/ui/button";
import { Heading } from "@bolerish/ui/heading";
import { CaretLeftIcon, XIcon } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import type { HiddenItemPreview } from "~features/element-hiding/preview";
import { usePanelMessage } from "~shared/locale/use-panel-message";
import { useUpdateNotice } from "~features/updates/use-update-notice";
import { HiddenItems } from "./hidden-items/_ui/HiddenItems";
import { Updates } from "./updates/Updates";

export default function Panel({
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
  const viewHeading = useRef<HTMLHeadingElement>(null);
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
      (previousView.current === "language" || previousView.current === "theme")
    )
      closeButton.current
        ?.closest("dialog")
        ?.querySelector<HTMLElement>(`[data-settings-page="${previousView.current}"]`)
        ?.focus({ preventScroll: true });
    else if (view !== "hidden") viewHeading.current?.focus();
    else if (previousView.current === "updates")
      updatesButton.current?.focus({ preventScroll: true });
    else if (previousView.current === "settings")
      settingsButton.current?.focus({ preventScroll: true });
    previousView.current = view;
    viewHeading.current?.closest("dialog")?.scrollTo(0, 0);
  }, [view]);

  function back() {
    setView(view === "language" || view === "theme" ? "settings" : "hidden");
  }

  return (
    <main
      lang={language}
      className={["panel", stylex.props(styles.panel).className].join(" ")}
      onKeyDown={(event) => {
        if (event.defaultPrevented) return;
        if (event.key === "Escape" && view !== "hidden") {
          event.preventDefault();
          event.stopPropagation();
          back();
        }
      }}
    >
      <header className={["panel-header", stylex.props(styles.panelHeader).className].join(" ")}>
        {view === "hidden" ? (
          <div className={["brand", stylex.props(styles.brand).className].join(" ")}>
            <span className="brand-name">Less</span>
          </div>
        ) : (
          <>
            <Button
              variant="ghost"
              size="sm"
              xstyle={styles.back}
              onClick={back}
              className={["less-control", stylex.props(styles.controlFocus).className].join(" ")}
            >
              <CaretLeftIcon {...stylex.props(styles.icon)} aria-hidden="true" />
              {message("panel_back")}
            </Button>
            <Heading
              level={1}
              size="subsection"
              ref={viewHeading}
              tabIndex={-1}
              className={["updates-heading", stylex.props(styles.viewHeading).className].join(" ")}
            >
              {message(view === "updates" ? "panel_updates" : `panel_${view}`)}
            </Heading>
          </>
        )}
        <Button
          ref={closeButton}
          variant="ghost"
          size="icon"
          xstyle={styles.close}
          aria-label={message("panel_close")}
          onClick={onClose}
          className={["less-control", stylex.props(styles.controlFocus).className].join(" ")}
        >
          <XIcon {...stylex.props(styles.icon)} aria-hidden="true" />
        </Button>
      </header>
      <div
        className={[
          "panel-body",
          stylex.props(styles.body, view === "hidden" && styles.hiddenBody).className,
        ].join(" ")}
      >
        <div hidden={view !== "hidden"} {...stylex.props(styles.content)}>
          <TooltipProvider>
            <HiddenItems
              origin={origin}
              onSelect={onSelect}
              preview={preview}
              portalContainer={portalContainer}
            />
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
          </TooltipProvider>
        </div>
        {view === "updates" ? <Updates /> : null}
        {view === "settings" || view === "language" || view === "theme" ? (
          <Settings page={view} onNavigate={setView} portalContainer={portalContainer} />
        ) : null}
      </div>
    </main>
  );
}

const styles = stylex.create({
  panel: {
    boxSizing: "border-box",
    height: "100%",
    minHeight: "0",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  panelHeader: {
    flexShrink: "0",
    zIndex: "1",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: spacingVars.space2,
    padding: spacingVars.space4,
    background: "var(--less-app-background)",
  },
  back: { marginInlineStart: `calc((${spacingVars.space3} + ${sizeVars.stroke}) * -1)` },
  close: {
    marginInlineStart: "auto",
    marginInlineEnd: `calc((${sizeVars.controlMd} - ${sizeVars.iconMd}) / -2)`,
  },
  body: {
    flex: 1,
    minHeight: 0,
    padding: spacingVars.space4,
    paddingBottom: `max(${spacingVars.space4}, env(safe-area-inset-bottom))`,
    overflow: "auto",
  },
  hiddenBody: { display: "flex", flexDirection: "column", overflow: "hidden" },
  brand: {
    flexShrink: "0",
    display: "flex",
    alignItems: "center",
    gap: spacingVars.space2,
    fontWeight: typo.fontWeightSemibold,
  },
  icon: {
    width: sizeVars.iconMd,
    height: sizeVars.iconMd,
    flexShrink: 0,
  },
  viewHeading: {
    ":is(.updates-heading)": {
      outline: { ":focus-visible": `2px solid ${colorVars.fgFeedbackInfo}` },
      outlineOffset: { ":focus-visible": 3 },
      scrollMarginBlock: `calc(${spacingVars.space8} * 2) ${spacingVars.space4}`,
      flex: "1",
      fontSize: typo.fontSizeSm,
      margin: "0",
    },
  },
  content: {
    flex: 1,
    minHeight: 0,
    display: { default: "flex", ":is([hidden])": "none" },
    flexDirection: "column",
  },
  controlFocus: {
    outline: { ":is(.less-control):focus-visible": `2px solid ${colorVars.fgFeedbackInfo}` },
    outlineOffset: { ":is(.less-control):focus-visible": 3 },
    scrollMarginBlock: `calc(${spacingVars.space8} * 2) ${spacingVars.space4}`,
  },
});
