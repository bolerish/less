import * as stylex from "@stylexjs/stylex";
import { colorVars, spacingVars, radiusVars, sizeVars } from "@bolerish/tokens/semantic.stylex";
import { Button } from "@bolerish/ui/button";
import { Badge } from "@bolerish/ui/badge";
import { Banner, BannerContent, BannerDescription } from "@bolerish/ui/banner";
import { Tooltip, TooltipTrigger, TooltipContent } from "@bolerish/ui/tooltip";
import { GearSixIcon, InfoIcon } from "@phosphor-icons/react";
import { useId, useState, type RefObject } from "react";
import { usePanelMessage } from "~shared/locale/use-panel-message";

export function PanelFooter({
  settingsButton,
  onSettings,
  hasUnreadUpdates,
  updatesButton,
  onUpdates,
  portalContainer,
}: {
  settingsButton: RefObject<HTMLButtonElement | null>;
  onSettings: () => void;
  hasUnreadUpdates: boolean;
  updatesButton: RefObject<HTMLButtonElement | null>;
  onUpdates: () => void;
  portalContainer?: HTMLElement;
}) {
  const message = usePanelMessage();
  const [tooltipOpen, setTooltipOpen] = useState<"help" | "settings" | null>(null);
  const tooltipId = useId();
  const [helpPending, setHelpPending] = useState(false);
  const [helpError, setHelpError] = useState(false);

  async function openHelp() {
    setHelpPending(true);
    setHelpError(false);
    try {
      const response = await browser.runtime.sendMessage({ type: "OPEN_HELP" });
      if (!response?.ok) throw new Error("Could not open help");
    } catch {
      setHelpError(true);
    } finally {
      setHelpPending(false);
    }
  }
  return (
    <footer className={["panel-footer", stylex.props(styles.panelFooter).className].join(" ")}>
      <Button
        size="sm"
        variant="ghost"
        ref={updatesButton}
        className={[
          "updates-button less-control",
          stylex.props(styles.controlFocus).className,
        ].join(" ")}
        xstyle={styles.updatesButton}
        style={{
          flexWrap: "wrap",
          whiteSpace: "normal",
          height: "auto",
          minHeight: sizeVars.controlSm,
        }}
        aria-label={message(
          hasUnreadUpdates ? "panel_version_updates_unread" : "panel_version_updates",
          [browser.runtime.getManifest().version],
        )}
        onClick={onUpdates}
      >
        {message("panel_update_history")}{" "}
        <Badge variant="secondary">{browser.runtime.getManifest().version}</Badge>
        {hasUnreadUpdates ? (
          <span
            className={["update-notice-dot", stylex.props(styles.updateNoticeDot).className].join(
              " ",
            )}
            aria-hidden="true"
          />
        ) : null}
      </Button>
      <div {...stylex.props(styles.actions)}>
        {(
          [
            { action: "help", icon: InfoIcon, label: "panel_help" },
            { action: "settings", icon: GearSixIcon, label: "panel_settings" },
          ] as const
        ).map(({ action, icon: Icon, label }) => (
          <Tooltip
            key={action}
            open={tooltipOpen === action}
            onOpenChange={(open) =>
              setTooltipOpen((current) => {
                if (open) return action;
                return current === action ? null : current;
              })
            }
          >
            <TooltipTrigger
              render={
                <Button
                  ref={action === "settings" ? settingsButton : undefined}
                  variant="ghost"
                  size="icon"
                  disabled={action === "help" && helpPending}
                  aria-label={message(label)}
                  aria-describedby={tooltipOpen === action ? `${tooltipId}-${action}` : undefined}
                  onFocus={() => setTooltipOpen(action)}
                  onBlur={() => setTooltipOpen(null)}
                  onPointerEnter={() => setTooltipOpen(action)}
                  onPointerLeave={() => setTooltipOpen(null)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape" && tooltipOpen === action) {
                      setTooltipOpen(null);
                      event.preventDefault();
                      event.stopPropagation();
                    }
                  }}
                  onClick={() => {
                    setTooltipOpen(null);
                    if (action === "help") void openHelp();
                    else onSettings();
                  }}
                  className={[
                    `${action}-button less-control`,
                    stylex.props(styles.controlFocus).className,
                  ].join(" ")}
                >
                  <Icon size={16} aria-hidden="true" />
                </Button>
              }
            />
            <TooltipContent portalContainer={portalContainer} id={`${tooltipId}-${action}`}>
              {message(label)}
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
      {helpError ? (
        <Banner size="sm" announce="assertive" xstyle={styles.error}>
          <BannerContent>
            <BannerDescription>{message("panel_help_error")}</BannerDescription>
          </BannerContent>
        </Banner>
      ) : null}
    </footer>
  );
}

const styles = stylex.create({
  panelFooter: {
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: spacingVars.space2,
    alignItems: "center",
    marginTop: "auto",
    paddingTop: spacingVars.space3,
    borderTop: `1px solid ${colorVars.strokeDefault}`,
    display: { default: "flex", ":is([data-preview-layout='compact'] *)": "none" },
    flexShrink: 0,
  },
  actions: { display: "flex", gap: spacingVars.space1, marginInlineStart: "auto" },
  error: { flexBasis: "100%" },
  updatesButton: {
    flexShrink: "0",
    maxWidth: "100%",
  },
  updateNoticeDot: {
    position: "absolute",
    top: "2px",
    right: "2px",
    width: "6px",
    height: "6px",
    borderRadius: radiusVars.full,
    background: colorVars.fgPrimary,
    boxShadow: "0 0 0 2px var(--less-app-background)",
    pointerEvents: "none",
  },
  controlFocus: {
    scrollMarginBlock: `calc(${spacingVars.space8} * 2) ${spacingVars.space4}`,
  },
});
