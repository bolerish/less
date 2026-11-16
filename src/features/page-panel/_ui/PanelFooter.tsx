import * as stylex from "@stylexjs/stylex";
import { colorVars, spacingVars, sizeVars, radiusVars } from "@bolerish/tokens/semantic.stylex";
import { Button } from "@bolerish/ui/button";
import { Badge } from "@bolerish/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@bolerish/ui/tooltip";
import { GearSixIcon } from "@phosphor-icons/react";
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
  const [settingsTooltipOpen, setSettingsTooltipOpen] = useState(false);
  const settingsTooltipId = useId();
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
        aria-label={message(
          hasUnreadUpdates ? "panel_version_updates_unread" : "panel_version_updates",
          [browser.runtime.getManifest().version],
        )}
        onClick={onUpdates}
      >
        {message("panel_update_history")}
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
      <Tooltip open={settingsTooltipOpen} onOpenChange={setSettingsTooltipOpen}>
        <TooltipTrigger
          render={
            <Button
              ref={settingsButton}
              variant="ghost"
              size="icon"
              aria-label={message("panel_settings")}
              aria-describedby={settingsTooltipOpen ? settingsTooltipId : undefined}
              onFocus={() => setSettingsTooltipOpen(true)}
              onBlur={() => setSettingsTooltipOpen(false)}
              onPointerEnter={() => setSettingsTooltipOpen(true)}
              onPointerLeave={() => setSettingsTooltipOpen(false)}
              onKeyDown={(event) => {
                if (event.key === "Escape" && settingsTooltipOpen) {
                  setSettingsTooltipOpen(false);
                  event.preventDefault();
                  event.stopPropagation();
                }
              }}
              onClick={() => {
                setSettingsTooltipOpen(false);
                onSettings();
              }}
              className={[
                "settings-button less-control",
                stylex.props(styles.controlFocus).className,
              ].join(" ")}
            >
              <GearSixIcon size={16} aria-hidden="true" />
            </Button>
          }
        />
        <TooltipContent
          portalContainer={portalContainer}
          side="top"
          role="tooltip"
          id={settingsTooltipId}
        >
          {message("panel_settings")}
        </TooltipContent>
      </Tooltip>
    </footer>
  );
}

const styles = stylex.create({
  panelFooter: {
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: "auto",
    paddingTop: spacingVars.space3,
    borderTopColor: colorVars.strokeDefault,
    borderTopStyle: "solid",
    borderTopWidth: sizeVars.stroke,
    display: { default: "flex", ":is([data-preview-layout='compact'] *)": "none" },
    flexShrink: 0,
  },
  updatesButton: {
    flexShrink: "0",
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
    outline: { ":is(.less-control):focus-visible": `2px solid ${colorVars.fgFeedbackInfo}` },
    outlineOffset: { ":is(.less-control):focus-visible": 3 },
    scrollMarginBlock: `calc(${spacingVars.space8} * 2) ${spacingVars.space4}`,
  },
});
