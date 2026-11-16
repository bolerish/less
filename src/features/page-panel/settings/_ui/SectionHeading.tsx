import * as stylex from "@stylexjs/stylex";
import { spacingVars, sizeVars, colorVars, typo } from "@bolerish/tokens/semantic.stylex";
import type { Icon } from "@phosphor-icons/react";
import type { ReactNode } from "react";

export function SettingsSectionHeading({
  id,
  icon: Icon,
  children,
}: {
  id?: string;
  icon: Icon;
  children: ReactNode;
}) {
  return (
    <h2 id={id} {...stylex.props(styles.heading)}>
      <Icon {...stylex.props(styles.icon)} aria-hidden="true" />
      <span className={["settings-section-label", stylex.props(styles.label).className].join(" ")}>
        {children}
      </span>
    </h2>
  );
}

const styles = stylex.create({
  heading: {
    display: "flex",
    alignItems: "center",
    gap: spacingVars.space2,
    color: colorVars.fgTertiary,
    fontWeight: typo.fontWeightSemibold,
    fontSize: typo.fontSizeSm,
    margin: 0,
    marginBottom: spacingVars.space2,
  },
  icon: { width: sizeVars.iconSm, height: sizeVars.iconSm, flexShrink: 0 },
  label: { minWidth: 0, overflowWrap: "anywhere" },
});
