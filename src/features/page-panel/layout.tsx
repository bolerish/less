import * as stylex from "@stylexjs/stylex";
import { colorVars, spacingVars, sizeVars } from "@bolerish/tokens/semantic.stylex";
import { Button } from "@bolerish/ui/button";
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@bolerish/ui/breadcrumb";
import { TooltipProvider } from "@bolerish/ui/tooltip";
import { XIcon } from "@phosphor-icons/react";
import { Fragment, type ReactNode, type RefObject } from "react";
import { usePanelMessage } from "~shared/locale/use-panel-message";

export function PanelLayout({
  language,
  breadcrumbs,
  onBack,
  onClose,
  closeButton,
  heading,
  children,
}: {
  language: string;
  breadcrumbs: { id: string; label: string; onNavigate?: () => void }[];
  onBack?: () => void;
  onClose: () => void;
  closeButton: RefObject<HTMLButtonElement | null>;
  heading: RefObject<HTMLSpanElement | null>;
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
        <Breadcrumb aria-label={message("panel_location")} xstyle={styles.breadcrumb}>
          <BreadcrumbList>
            {breadcrumbs.map(({ id, label, onNavigate }, index) => (
              <Fragment key={id}>
                {index > 0 ? <BreadcrumbSeparator /> : null}
                <BreadcrumbItem xstyle={styles.breadcrumbItem}>
                  {onNavigate ? (
                    <BreadcrumbLink
                      href="#"
                      data-panel-destination={id}
                      onClick={(event) => {
                        event.preventDefault();
                        onNavigate();
                      }}
                    >
                      {label}
                    </BreadcrumbLink>
                  ) : (
                    <BreadcrumbPage
                      ref={heading}
                      role="heading"
                      aria-level={1}
                      tabIndex={-1}
                      className={[
                        "panel-current updates-heading",
                        stylex.props(styles.heading).className,
                      ].join(" ")}
                    >
                      {onBack ? (
                        label
                      ) : (
                        <>
                          <span
                            className={[
                              "brand-name",
                              stylex.props(styles.brandName).className,
                            ].join(" ")}
                          >
                            {label}
                          </span>
                          <span
                            className={[
                              "preview-label",
                              stylex.props(styles.previewLabel).className,
                            ].join(" ")}
                          >
                            {message("panel_preview_title")}
                          </span>
                        </>
                      )}
                    </BreadcrumbPage>
                  )}
                </BreadcrumbItem>
              </Fragment>
            ))}
          </BreadcrumbList>
        </Breadcrumb>
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
    "--less-panel-inset": `calc(${spacingVars.space4} + var(--less-control-inset))`,
    "--less-control-inset": `calc(${spacingVars.space4} + ${sizeVars.stroke})`,
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
    paddingBlock: spacingVars.space4,
    paddingInline: "var(--less-panel-inset)",
    paddingBottom: `max(${spacingVars.space4}, env(safe-area-inset-bottom))`,
  },
  breadcrumb: { flex: 1, minWidth: 0 },
  breadcrumbItem: { minWidth: 0, overflowWrap: "anywhere" },
  closeButton: { marginInlineStart: "auto" },
  brandName: { display: { default: "inline", ":is([data-preview='true'] *)": "none" } },
  previewLabel: { display: { default: "none", ":is([data-preview='true'] *)": "inline" } },
  heading: {
    minWidth: 0,
    overflowWrap: "anywhere",
    margin: 0,
    outline: { ":focus-visible": `2px solid ${colorVars.strokeFocus}` },
    outlineOffset: { ":focus-visible": 3 },
  },
});
