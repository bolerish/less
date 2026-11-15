import * as stylex from "@stylexjs/stylex";
import { colorVars, spacingVars, radiusVars, shadowVars } from "@bolerish/tokens/semantic.stylex";
import { Button } from "@bolerish/ui/button";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from "@bolerish/ui/alert-dialog";
import { AlertDialog as AlertDialogPrimitive } from "@bolerish/ui/primitives";
import { useRef, type RefObject } from "react";
import { usePanelMessage } from "~shared/locale/use-panel-message";

export function ResetDialog({
  open,
  onOpenChange,
  count,
  busy,
  error,
  heading,
  portalContainer,
  onBeforeOpen,
  onReset,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  count: number | null;
  busy: boolean;
  error: string;
  heading: RefObject<HTMLHeadingElement | null>;
  portalContainer?: HTMLElement;
  onBeforeOpen: () => void;
  onReset: () => void;
}) {
  const message = usePanelMessage();
  const resetButton = useRef<HTMLButtonElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  return (
    <AlertDialog
      open={open}
      onOpenChange={(open) => {
        if (!busy) onOpenChange(open);
      }}
    >
      {count !== null && count > 0 ? (
        <AlertDialogTrigger
          ref={resetButton}
          render={
            <Button
              className={[
                "reset-button less-control",
                stylex.props(styles.controlFocus).className,
              ].join(" ")}
              xstyle={styles.resetButton}
              variant="outline"
              size="sm"
              disabled={busy}
            >
              {message("panel_reset")}
            </Button>
          }
          onClick={onBeforeOpen}
        >
          {message("panel_reset")}
        </AlertDialogTrigger>
      ) : null}
      {/* Keep the portal in the styled native modal; Content portals to document.body. */}
      <AlertDialogPrimitive.Portal container={portalContainer}>
        <AlertDialogPrimitive.Backdrop {...stylex.props(styles.resetBackdrop)} />
        <AlertDialogPrimitive.Viewport {...stylex.props(styles.resetViewport)}>
          <AlertDialogPrimitive.Popup
            className={[
              "reset-confirmation",
              stylex.props(styles.resetConfirmation).className,
            ].join(" ")}
            initialFocus={cancelButton}
            finalFocus={() => (count ? resetButton.current : heading.current)}
            aria-busy={busy}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                if (!busy) onOpenChange(false);
              }
            }}
          >
            <AlertDialogHeader>
              <AlertDialogTitle>{message("panel_reset_group")}</AlertDialogTitle>
              <AlertDialogDescription>{message("panel_reset_confirm")}</AlertDialogDescription>
            </AlertDialogHeader>
            {error ? (
              <p role="alert" {...stylex.props(styles.dialogError)}>
                {error}
              </p>
            ) : null}
            <AlertDialogFooter>
              <AlertDialogCancel ref={cancelButton} disabled={busy}>
                {message("panel_cancel")}
              </AlertDialogCancel>
              <Button
                className="reset-submit"
                disabled={busy}
                focusableWhenDisabled
                onClick={onReset}
              >
                {message(busy ? "panel_saving" : "panel_reset_all")}
              </Button>
            </AlertDialogFooter>
          </AlertDialogPrimitive.Popup>
        </AlertDialogPrimitive.Viewport>
      </AlertDialogPrimitive.Portal>
    </AlertDialog>
  );
}

const styles = stylex.create({
  resetButton: {
    flexShrink: "0",
  },
  resetBackdrop: {
    position: "absolute",
    inset: 0,
    backgroundColor: colorVars.bgOverlay,
    zIndex: 2,
  },
  resetViewport: {
    position: "absolute",
    inset: 0,
    padding: spacingVars.space4,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 3,
  },
  resetConfirmation: {
    boxSizing: "border-box",
    minWidth: 0,
    width: "100%",
    maxWidth: "28rem",
    maxHeight: "100%",
    overflow: "auto",
    padding: spacingVars.space6,
    display: "flex",
    flexDirection: "column",
    gap: spacingVars.space4,
    backgroundColor: colorVars.bgRaised,
    border: `1px solid ${colorVars.strokeDefault}`,
    borderRadius: radiusVars.md,
    boxShadow: shadowVars.overlay,
  },
  dialogError: {
    color: colorVars.fgFeedbackError,
    margin: 0,
  },
  controlFocus: {
    outline: { ":is(.less-control):focus-visible": `2px solid ${colorVars.fgFeedbackInfo}` },
    outlineOffset: { ":is(.less-control):focus-visible": 3 },
    scrollMarginBlock: `calc(${spacingVars.space8} * 2) ${spacingVars.space4}`,
  },
});
