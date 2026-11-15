import { useLanguage } from "~shared/locale/use-locale";
import * as stylex from "@stylexjs/stylex";
import { colorVars, spacingVars, typo } from "@bolerish/tokens/semantic.stylex";
import { Badge } from "@bolerish/ui/badge";
import {
  Timeline,
  TimelineContent,
  TimelineIndicator,
  TimelineItem,
  TimelineTime,
  TimelineTitle,
} from "@bolerish/ui/timeline";
import { usePanelMessage } from "~shared/locale/use-panel-message";
import { productUpdates } from "~features/updates/releases";
import { getLatestReleasedUpdate } from "~features/updates/notice";

export function Updates() {
  const message = usePanelMessage();
  const language = useLanguage();
  const latest = getLatestReleasedUpdate(productUpdates, browser.runtime.getManifest().version);
  return (
    <section
      className={["updates", stylex.props(styles.updates).className].join(" ")}
      aria-label={message("panel_updates")}
    >
      <p
        className={[
          "muted",
          stylex.props(styles.paragraph, styles.muted, styles.updatesHelp).className,
        ].join(" ")}
      >
        {message("panel_updates_help")}
      </p>
      <Timeline>
        {productUpdates.map((update) => (
          <TimelineItem key={update.version}>
            <TimelineIndicator />
            <TimelineContent>
              <TimelineTitle>
                <div
                  className={["update-heading", stylex.props(styles.updateHeading).className].join(
                    " ",
                  )}
                >
                  <h2
                    className={[
                      "update-version",
                      stylex.props(styles.updateVersion).className,
                    ].join(" ")}
                  >
                    {update.version}
                  </h2>
                  <Badge variant="outline">
                    {update.status === "unreleased"
                      ? message("panel_unreleased")
                      : message("panel_released")}
                  </Badge>
                  {update === latest ? (
                    <Badge variant="primary">{message("panel_latest")}</Badge>
                  ) : null}
                </div>
              </TimelineTitle>
              <TimelineTime dateTime={update.date}>
                {new Date(`${update.date}T00:00:00`).toLocaleDateString(language, {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}
              </TimelineTime>
              <h3 {...stylex.props(styles.updateTitle)}>{message(update.titleKey)}</h3>
              <ul {...stylex.props(styles.updateList)}>
                {update.changeKeys.map((change) => (
                  <li key={change} {...stylex.props(styles.updateChange)}>
                    {message(change)}
                  </li>
                ))}
              </ul>
            </TimelineContent>
          </TimelineItem>
        ))}
      </Timeline>
      <p
        className={[
          "installed-version muted",
          stylex.props(styles.installedVersion, styles.muted).className,
        ].join(" ")}
      >
        {message("panel_installed_version", [browser.runtime.getManifest().version])}
      </p>
    </section>
  );
}

const styles = stylex.create({
  updates: {
    overflowWrap: "anywhere",
    flex: "1",
    minHeight: "0",
    overflow: "auto",
  },
  paragraph: {
    marginBlock: spacingVars.space2,
  },
  muted: {
    color: colorVars.fgSecondary,
  },
  updatesHelp: {
    marginBlock: `${spacingVars.space3} ${spacingVars.space5}`,
  },
  updateHeading: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: spacingVars.space2,
  },
  updateVersion: {
    fontSize: typo.fontSizeSm,
    margin: 0,
    fontWeight: typo.fontWeightSemibold,
  },
  updateTitle: {
    fontSize: typo.fontSizeSm,
    fontWeight: typo.fontWeightMedium,
    marginTop: spacingVars.space3,
  },
  updateList: {
    paddingInlineStart: spacingVars.space4,
    marginBlock: `${spacingVars.space2} 0`,
  },
  updateChange: {
    marginBlock: spacingVars.space2,
  },
  installedVersion: {
    marginTop: spacingVars.space6,
    fontSize: typo.fontSizeXs,
  },
});
