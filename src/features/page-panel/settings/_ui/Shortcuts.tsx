import * as stylex from "@stylexjs/stylex";
import { colorVars, spacingVars, typo } from "@bolerish/tokens/semantic.stylex";
import { Kbd, KbdGroup } from "@bolerish/ui/kbd";
import { usePanelMessage } from "~shared/locale/use-panel-message";

export function Shortcuts() {
  const message = usePanelMessage();
  return (
    <div className={["shortcuts", stylex.props(styles.groups).className].join(" ")}>
      {(
        [
          {
            title: "panel_shortcuts_page",
            rows: [
              { label: "panel_shortcut_selection", keys: ["Ctrl", "Shift", "E"] },
              { label: "panel_shortcut_undo", keys: ["Ctrl", "Shift", "Z"] },
            ],
          },
          {
            title: "panel_shortcuts_selection",
            rows: [
              { label: "panel_shortcut_shift", keys: ["Shift"] },
              { label: "panel_shortcut_wider", keys: ["↑"] },
              { label: "panel_shortcut_previous", keys: ["↓"] },
              { label: "panel_shortcut_hide", keys: ["Enter"] },
              { label: "panel_shortcut_exit", keys: ["Esc"] },
            ],
          },
        ] as const
      ).map(({ title, rows }) => (
        <section key={title} aria-labelledby={title}>
          <h2 id={title} {...stylex.props(styles.heading)}>
            {message(title)}
          </h2>
          {title === "panel_shortcuts_page" ? (
            <p {...stylex.props(styles.help)}>{message("panel_shortcuts_help")}</p>
          ) : null}
          <dl {...stylex.props(styles.list)}>
            {rows.map(({ label, keys }) => (
              <div key={label} data-shortcut={label} {...stylex.props(styles.row)}>
                <dt>{message(label)}</dt>
                <dd {...stylex.props(styles.keys)}>
                  <KbdGroup xstyle={styles.keyGroup}>
                    {keys.map((key) => (
                      <Kbd key={key}>{key}</Kbd>
                    ))}
                  </KbdGroup>
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}

const styles = stylex.create({
  groups: { display: "grid", gap: spacingVars.space6 },
  heading: {
    fontSize: typo.fontSizeSm,
    fontWeight: typo.fontWeightSemibold,
    margin: 0,
    marginBottom: spacingVars.space3,
  },
  help: { color: colorVars.fgSecondary, margin: 0, marginBottom: spacingVars.space3 },
  list: { display: "grid", gap: spacingVars.space3, margin: 0 },
  row: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: spacingVars.space2,
    overflowWrap: "anywhere",
  },
  keys: { margin: 0 },
  keyGroup: { flexWrap: "wrap" },
});
