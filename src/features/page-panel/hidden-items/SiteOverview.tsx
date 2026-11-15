import * as stylex from "@stylexjs/stylex";
import { colorVars, spacingVars, typo } from "@bolerish/tokens/semantic.stylex";
import { Card, CardContent } from "@bolerish/ui/card";
import { Button } from "@bolerish/ui/button";
import { Heading } from "@bolerish/ui/heading";
import { Switch } from "@bolerish/ui/switch";
import { CursorClickIcon } from "@phosphor-icons/react";
import { useEffect, useRef, useState, type RefObject } from "react";
import { getPanelMessage as message } from "~features/record/management-messages";
import {
  getSiteHidingEnabled,
  setSiteHidingEnabled,
  subscribeSiteHidingEnabled,
} from "~features/hiding-preference";

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
  onError: (message: string) => void;
}) {
  const [selecting, setSelecting] = useState(false);
  const [selectionError, setSelectionError] = useState("");
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    let active = true;
    const refresh = () => {
      void getSiteHidingEnabled(origin).then((value) => {
        if (active) setEnabled(value);
      });
    };
    refresh();
    const unsubscribe = subscribeSiteHidingEnabled(origin, refresh);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [origin]);

  async function startSelection(): Promise<void> {
    setSelecting(true);
    setSelectionError("");
    try {
      onSelect();
    } catch {
      if (mounted.current) setSelectionError(message("panel_selection_error"));
    } finally {
      if (mounted.current) setSelecting(false);
    }
  }

  const hiddenCount = count === null ? null : getHiddenCount(count);
  return (
    <div className={["site-overview", stylex.props(styles.siteOverview).className].join(" ")}>
      <Card
        className="site-card"
        xstyle={styles.siteCard}
        role="group"
        lang={browser.i18n.getUILanguage()}
        aria-label={message("panel_current_site")}
        aria-description={message("panel_count_help")}
      >
        <CardContent xstyle={styles.siteCardContent}>
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
        </CardContent>
      </Card>
      <Button
        className={["select-button less-control", stylex.props(styles.controlFocus).className].join(
          " ",
        )}
        xstyle={styles.selectButton}
        size="sm"
        disabled={busy || selecting || enabled !== true}
        onClick={() => void startSelection()}
      >
        <CursorClickIcon {...stylex.props(styles.icon)} aria-hidden="true" />
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
            void setSiteHidingEnabled(origin, value).catch(() =>
              onError(message("panel_preference_error")),
            );
          }}
          className={["less-control", stylex.props(styles.controlFocus).className].join(" ")}
        />
      </label>
      {selectionError ? (
        <p
          className={["selection-error", stylex.props(styles.selectionError).className].join(" ")}
          role="alert"
        >
          {selectionError}
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

function getHiddenCount(count: number): { value: string; noun: string } {
  const formatted = new Intl.NumberFormat(browser.i18n.getUILanguage()).format(count);
  const singular = new Intl.PluralRules(browser.i18n.getUILanguage()).select(count) === "one";
  const suffix = singular ? "one" : "other";
  return {
    value: message(`panel_hidden_count_${suffix}`, [formatted]),
    noun: message(`panel_hidden_noun_${suffix}`),
  };
}

const styles = stylex.create({
  siteOverview: {
    flex: "0 1 auto",
    minHeight: "0",
    maxHeight: "45dvh",
    overflow: "auto",
    background: "var(--less-app-background)",
    paddingBlock: `${spacingVars.space3} ${spacingVars.space4}`,
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
    padding: spacingVars.space3,
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
      fontSize: typo.fontSizeLg,
      fontWeight: typo.fontWeightSemibold,
      marginBlock: spacingVars.space1,
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
    // Match CardContent plus its one-pixel card border.
    paddingInline: `calc(${spacingVars.space3} + 1px)`,
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
    outline: { ":is(.less-control):focus-visible": `2px solid ${colorVars.fgFeedbackInfo}` },
    outlineOffset: { ":is(.less-control):focus-visible": 3 },
    scrollMarginBlock: `calc(${spacingVars.space8} * 2) ${spacingVars.space4}`,
  },
});
