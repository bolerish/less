import * as stylex from "@stylexjs/stylex";
import { colorVars, spacingVars, typo } from "@bolerish/tokens/semantic.stylex";
import { TooltipProvider } from "@bolerish/ui/tooltip";
import { Button } from "@bolerish/ui/button";
import { Heading } from "@bolerish/ui/heading";
import { CaretLeftIcon, XIcon } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import logo from "~assets/logo.png";
import type { HiddenItemPreview } from "~features/element-hiding/preview";
import { getPanelMessage as message } from "~features/record/management-messages";
import { useUpdateNotice } from "~features/updates/use-update-notice";
import { HiddenItems } from "./hidden-items/HiddenItems";
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
  const [view, setView] = useState<"hidden" | "updates">("hidden");
  const hasUnreadUpdates = useUpdateNotice(view === "updates");
  const updatesButton = useRef<HTMLButtonElement>(null);
  const updatesHeading = useRef<HTMLHeadingElement>(null);
  const previousView = useRef(view);
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeButton.current?.focus();
  }, []);

  useEffect(() => {
    if (view === "updates") updatesHeading.current?.focus();
    else if (previousView.current === "updates")
      updatesButton.current?.focus({ preventScroll: true });
    previousView.current = view;
    updatesHeading.current?.closest("dialog")?.scrollTo(0, 0);
  }, [view]);

  return (
    <main
      className={["panel", stylex.props(styles.panel).className].join(" ")}
      onKeyDown={(event) => {
        if (event.key === "Escape" && view === "updates") {
          event.preventDefault();
          event.stopPropagation();
          setView("hidden");
        }
      }}
    >
      <header className={["panel-header", stylex.props(styles.panelHeader).className].join(" ")}>
        {view === "hidden" ? (
          <div className={["brand", stylex.props(styles.brand).className].join(" ")}>
            <img src={logo} alt="" width="22" height="22" />
            <span className={["brand-name", stylex.props(styles.brandName).className].join(" ")}>
              Less
            </span>
            <span
              className={["preview-label", stylex.props(styles.previewLabel).className].join(" ")}
            >
              {message("panel_preview_title")}
            </span>
          </div>
        ) : (
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setView("hidden")}
              className={["less-control", stylex.props(styles.controlFocus).className].join(" ")}
            >
              <CaretLeftIcon {...stylex.props(styles.icon)} aria-hidden="true" />
              {message("panel_back")}
            </Button>
            <Heading
              level={1}
              size="subsection"
              ref={updatesHeading}
              tabIndex={-1}
              className={["updates-heading", stylex.props(styles.updatesHeading).className].join(
                " ",
              )}
            >
              {message("panel_updates")}
            </Heading>
          </>
        )}
        <Button
          ref={closeButton}
          variant="ghost"
          size="icon"
          aria-label={message("panel_close")}
          onClick={onClose}
          className={["less-control", stylex.props(styles.controlFocus).className].join(" ")}
        >
          <XIcon {...stylex.props(styles.icon)} aria-hidden="true" />
        </Button>
      </header>
      <div hidden={view !== "hidden"} {...stylex.props(styles.content)}>
        <TooltipProvider>
          <HiddenItems
            hasUnreadUpdates={hasUnreadUpdates}
            updatesButton={updatesButton}
            onUpdates={() => {
              preview?.clear();
              setView("updates");
            }}
            origin={origin}
            onSelect={onSelect}
            preview={preview}
            portalContainer={portalContainer}
          />
        </TooltipProvider>
      </div>
      {view === "updates" ? <Updates /> : null}
    </main>
  );
}

const styles = stylex.create({
  panel: {
    paddingInline: spacingVars.space4,
    paddingBottom: `max(${spacingVars.space4}, env(safe-area-inset-bottom))`,
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
    paddingBlock: spacingVars.space3,
    background: "var(--less-app-background)",
  },
  brand: {
    flexShrink: "0",
    display: "flex",
    alignItems: "center",
    gap: spacingVars.space2,
    fontWeight: typo.fontWeightSemibold,
  },
  brandName: {
    display: { default: "inline", ":is([data-preview='true'] *)": "none" },
  },
  previewLabel: {
    display: { default: "none", ":is([data-preview='true'] *)": "inline" },
  },
  icon: {
    width: 16,
    height: 16,
    flexShrink: 0,
  },
  updatesHeading: {
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
