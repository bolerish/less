import * as stylex from "@stylexjs/stylex";
import { colorVars, spacingVars, typo } from "@bolerish/tokens/semantic.stylex";
import { Button } from "@bolerish/ui/button";
import { Heading } from "@bolerish/ui/heading";
import { TooltipProvider } from "@bolerish/ui/tooltip";
import { CaretLeftIcon, XIcon } from "@phosphor-icons/react";
import type { ReactNode, RefObject } from "react";
import { usePanelMessage } from "~shared/locale/use-panel-message";

export function PanelLayout({
  language,
  title,
  onBack,
  onClose,
  closeButton,
  heading,
  children,
}: {
  language: string;
  title?: string;
  onBack?: () => void;
  onClose: () => void;
  closeButton: RefObject<HTMLButtonElement | null>;
  heading: RefObject<HTMLHeadingElement | null>;
  children: ReactNode;
}) {
  const message = usePanelMessage();
  return (
    <main
      lang={language}
      className={["panel", stylex.props(styles.panel).className].join(" ")}
      onKeyDown={(event) => {
        if (event.defaultPrevented || event.nativeEvent.defaultPrevented) return;
        if (event.key === "Escape" && onBack) {
          event.preventDefault();
          event.stopPropagation();
          onBack();
        }
      }}
    >
      <header className={["panel-header", stylex.props(styles.header).className].join(" ")}>
        {onBack ? (
          <>
            <Button variant="ghost" size="sm" onClick={onBack} aria-label={message("panel_back")}>
              <CaretLeftIcon size={16} aria-hidden="true" />
              <span {...stylex.props(styles.backLabel)}>{message("panel_back")}</span>
            </Button>
            <Heading
              level={1}
              size="subsection"
              ref={heading}
              tabIndex={-1}
              className={["updates-heading", stylex.props(styles.heading).className].join(" ")}
            >
              {title}
            </Heading>
          </>
        ) : (
          <div {...stylex.props(styles.brand)}>
            <span className={["brand-name", stylex.props(styles.brandName).className].join(" ")}>
              Less
            </span>
            <span
              className={["preview-label", stylex.props(styles.previewLabel).className].join(" ")}
            >
              {message("panel_preview_title")}
            </span>
          </div>
        )}
        <Button
          ref={closeButton}
          variant="ghost"
          size="icon"
          aria-label={message("panel_close")}
          onClick={onClose}
          xstyle={styles.closeButton}
        >
          <XIcon size={16} aria-hidden="true" />
        </Button>
      </header>
      <TooltipProvider>
        <div className={["panel-body", stylex.props(styles.body).className].join(" ")}>
          {children}
        </div>
      </TooltipProvider>
    </main>
  );
}

const styles = stylex.create({
  panel: {
    "--less-panel-inset": spacingVars.space4,
    container: "less-panel / inline-size",
    boxSizing: "border-box",
    height: "100%",
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  header: {
    flexShrink: 0,
    zIndex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: spacingVars.space2,
    paddingBlock: spacingVars.space3,
    paddingInline: "var(--less-panel-inset)",
    background: "var(--less-app-background)",
  },
  body: {
    display: { default: "flex", "@container less-panel (max-width: 14rem)": "block" },
    flexDirection: "column",
    flex: 1,
    minHeight: 0,
    overflowY: { "@container less-panel (max-width: 14rem)": "auto" },
    padding: "var(--less-panel-inset)",
    paddingBottom: "max(var(--less-panel-inset), env(safe-area-inset-bottom))",
  },
  backLabel: { display: { default: "inline", "@container less-panel (max-width: 14rem)": "none" } },
  closeButton: { marginInlineStart: "auto" },
  brand: { fontWeight: typo.fontWeightSemibold },
  brandName: { display: { default: "inline", ":is([data-preview='true'] *)": "none" } },
  previewLabel: { display: { default: "none", ":is([data-preview='true'] *)": "inline" } },
  heading: {
    flex: 1,
    order: { "@container less-panel (max-width: 14rem)": 1 },
    flexBasis: { "@container less-panel (max-width: 14rem)": "100%" },
    minWidth: 0,
    overflowWrap: "anywhere",
    margin: 0,
    outline: { ":focus-visible": `2px solid ${colorVars.strokeFocus}` },
    outlineOffset: { ":focus-visible": 3 },
  },
});
