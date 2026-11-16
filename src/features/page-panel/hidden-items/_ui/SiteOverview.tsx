import { useSiteHiding } from "../_model/useSiteHiding";
import { getHiddenCount } from "../_lib/hidden-count";
import type { PanelMessage } from "~features/record/management-messages";
import { useLanguage } from "~shared/locale/use-locale";
import * as stylex from "@stylexjs/stylex";
import { colorVars, spacingVars, sizeVars, typo } from "@bolerish/tokens/semantic.stylex";
import { Card, CardHeader } from "@bolerish/ui/card";
import { Button } from "@bolerish/ui/button";
import { Heading } from "@bolerish/ui/heading";
import { Switch } from "@bolerish/ui/switch";
import { CursorIcon } from "@phosphor-icons/react";
import { useEffect, useRef, useState, type RefObject } from "react";
import { usePanelMessage } from "~shared/locale/use-panel-message";

export function SiteOverview({
  origin,
  count,
  busy,
  heading,
  onSelect,
  onError,
}: {
  origin: string;
  count: number | null;
  busy: boolean;
  heading: RefObject<HTMLHeadingElement | null>;
  onSelect: () => void;
  onError: (message: PanelMessage) => void;
}) {
  const message = usePanelMessage();
  const language = useLanguage();
  const [selecting, setSelecting] = useState(false);
  const [selectionError, setSelectionError] = useState(false);
  const { enabled, setEnabled } = useSiteHiding(origin);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  async function startSelection(): Promise<void> {
    setSelecting(true);
    setSelectionError(false);
    try {
      onSelect();
    } catch {
      if (mounted.current) setSelectionError(true);
    } finally {
      if (mounted.current) setSelecting(false);
    }
  }

  const hiddenCount = count === null ? null : getHiddenCount(count, language, message);
  return (
    <div className={["site-overview", stylex.props(styles.siteOverview).className].join(" ")}>
      <Card
        className="site-card"
        xstyle={styles.siteCard}
        role="group"
        lang={language}
        aria-label={message("panel_current_site")}
        aria-description={message("panel_count_help")}
      >
        <CardHeader xstyle={styles.siteCardContent}>
          <div className={["site-identity", stylex.props(styles.siteIdentity).className].join(" ")}>
            <p className={["eyebrow", stylex.props(styles.eyebrow).className].join(" ")}>
              {message("panel_current_site")}
            </p>
            <Heading
              level={1}
              size="section"
              ref={heading}
              tabIndex={-1}
              className={["site-title", stylex.props(styles.siteTitle).className].join(" ")}
            >
              {origin.replace(/^https?:\/\//, "")}
            </Heading>
          </div>
          <p
            className={["hidden-count", stylex.props(styles.hiddenCount).className].join(" ")}
            aria-live="polite"
          >
            <span className={["count-value", stylex.props(styles.countValue).className].join(" ")}>
              {hiddenCount?.value ?? "…"}
            </span>{" "}
            <span className={["count-noun", stylex.props(styles.countNoun).className].join(" ")}>
              {hiddenCount?.noun ?? message("panel_hidden_items")}
            </span>
          </p>
        </CardHeader>
      </Card>
      <Button
        className={["select-button less-control", stylex.props(styles.controlFocus).className].join(
          " ",
        )}
        xstyle={styles.selectButton}
        style={{ whiteSpace: "normal", height: "auto", minHeight: sizeVars.controlSm }}
        size="sm"
        disabled={busy || selecting || enabled !== true}
        onClick={() => void startSelection()}
      >
        <CursorIcon {...stylex.props(styles.icon)} aria-hidden="true" />
        {selecting ? message("panel_starting") : message("panel_select")}
      </Button>
      <label className={["preference", stylex.props(styles.preference).className].join(" ")}>
        <span style={{ minWidth: 0 }}>{message("panel_enable_hiding")}</span>
        <Switch
          style={{ flexShrink: 0 }}
          size="sm"
          checked={enabled ?? true}
          disabled={enabled === null || busy}
          onCheckedChange={(value) => {
            void setEnabled(value).catch(() => onError("panel_preference_error"));
          }}
          className={["less-control", stylex.props(styles.controlFocus).className].join(" ")}
        />
      </label>
      {selectionError ? (
        <p
          className={["selection-error", stylex.props(styles.selectionError).className].join(" ")}
          role="alert"
        >
          {message("panel_selection_error")}
        </p>
      ) : null}
      {enabled === false ? (
        <p className={["muted", stylex.props(styles.muted).className].join(" ")}>
          {message("panel_paused")}
        </p>
      ) : null}
    </div>
  );
}

const styles = stylex.create({
  siteOverview: {
    flex: "0 1 auto",
    minHeight: "0",
    maxHeight: "45dvh",
    overflow: "auto",
    background: "var(--less-app-background)",
    display: { default: "block", ":is([data-preview-layout='compact'] *)": "none" },
  },
  siteCard: {
    container: "site-card / inline-size",
    marginBlockEnd: spacingVars.space4,
  },
  siteCardContent: {
    display: "grid",
    gridTemplateColumns: {
      default: "minmax(0, 1fr) auto",
      "@container site-card (max-width: 14em)": "minmax(0, 1fr)",
    },
    alignItems: "center",
    gap: spacingVars.space4,
  },
  siteIdentity: {
    minWidth: "0",
  },
  eyebrow: {
    fontSize: typo.fontSizeXs,
    color: colorVars.fgSecondary,
    margin: "0",
  },
  siteTitle: {
    ":is(.site-title)": {
      outline: { ":focus-visible": `2px solid ${colorVars.fgFeedbackInfo}` },
      outlineOffset: { ":focus-visible": 3 },
      scrollMarginBlock: `calc(${spacingVars.space8} * 2) ${spacingVars.space4}`,
      overflowWrap: "anywhere",
      minWidth: 0,
      outlineColor: colorVars.fgFeedbackInfo,
    },
  },
  hiddenCount: {
    display: "flex",
    flexDirection: "column",
    flexShrink: "0",
    width: "max-content",
    maxWidth: "100%",
    margin: "0",
    textAlign: { default: "end", "@container site-card (max-width: 14em)": "start" },
  },
  countValue: {
    fontSize: typo.fontSizeXl,
    fontWeight: typo.fontWeightSemibold,
    lineHeight: typo.lineHeightTight,
    overflowWrap: "anywhere",
  },
  countNoun: {
    fontSize: typo.fontSizeXs,
    color: colorVars.fgSecondary,
  },
  selectButton: {
    width: "100%",
    marginBlockEnd: spacingVars.space4,
  },
  icon: {
    width: 16,
    height: 16,
    flexShrink: 0,
  },
  preference: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacingVars.space2,
    marginBlock: `${spacingVars.space5} ${spacingVars.space3}`,
  },
  selectionError: {
    marginBlock: spacingVars.space2,
    color: colorVars.fgFeedbackError,
    overflowWrap: "anywhere",
  },
  muted: {
    marginBlock: spacingVars.space2,
    color: colorVars.fgSecondary,
  },
  controlFocus: {
    scrollMarginBlock: `calc(${spacingVars.space8} * 2) ${spacingVars.space4}`,
  },
});
