import { ArrowCounterClockwiseIcon, CursorClickIcon } from "@phosphor-icons/react";
import { useState } from "react";
import wxtLogo from "~assets/logo.png";

import { Button } from "@bolerish/ui/button";
import { Kbd, KbdGroup } from "@bolerish/ui/kbd";
import { Switch } from "@bolerish/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@bolerish/ui/tooltip";
import { useCurrentTab } from "./hooks/useCurrentTab";
import { useSiteHidingPreference } from "./hooks/useSiteHidingPreference";
import { useUndoCount } from "./hooks/useUndoCount";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@bolerish/ui/accordion";

function App() {
  const currentTab = useCurrentTab();
  const origin = currentTab?.origin ?? null;
  const tabId = currentTab?.id;

  const { enabled, loaded, toggle } = useSiteHidingPreference(origin);
  const [panelError, setPanelError] = useState("");
  const { count: undoCount, restore } = useUndoCount(tabId);

  const handleSelectToHide = async (): Promise<void> => {
    if (!tabId) return;
    try {
      await browser.tabs.sendMessage(tabId, { type: "SET_SELECTION_ENABLED", enabled: true });
    } catch (error) {
      console.warn("[Veil] failed to start selection mode", error);
    }
    window.close();
  };

  const handleOpenPanel = (): void => {
    setPanelError("");
    if (!currentTab) return;
    void browser.tabs
      .sendMessage(currentTab.id, { type: "TOGGLE_PAGE_PANEL" }, { frameId: 0 })
      .then(() => window.close())
      .catch(() => setPanelError("Reload the website, then click the Less toolbar icon."));
  };

  return (
    <div className="popup">
      <div className="popup-header">
        <div className="popup-brand">
          <img src={wxtLogo} alt="Less logo" width={22} />
          <span className="popup-title">Less</span>
        </div>
        <Switch
          aria-label="Hide saved items on this site"
          id="site-hiding"
          checked={enabled}
          disabled={!loaded}
          onCheckedChange={toggle}
        />
      </div>

      <div className="popup-actions">
        <span className="popup-hidden-label">Hidden</span>
        <div role="group" className="popup-button-group">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  size="icon"
                  className="popup-icon-button"
                  disabled={!enabled || !loaded || !origin}
                  aria-label="Select items to hide"
                  onClick={handleSelectToHide}
                  variant="outline"
                >
                  <CursorClickIcon />
                </Button>
              }
            />
            <TooltipContent side="top" className="popup-tooltip">
              Select
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  size="icon"
                  className="popup-icon-button"
                  disabled={undoCount === 0}
                  onClick={restore}
                  aria-label="Undo"
                  variant="outline"
                >
                  <ArrowCounterClockwiseIcon />
                </Button>
              }
            />
            <TooltipContent side="top" className="popup-tooltip">
              Undo
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      <div className="popup-manage">
        <Button
          size="sm"
          className="popup-manage-button"
          variant="outline"
          disabled={!currentTab}
          onClick={handleOpenPanel}
        >
          Manage hidden items
        </Button>
        {panelError ? (
          <p role="alert" className="popup-error">
            {panelError}
          </p>
        ) : null}
      </div>

      <Accordion className="popup-shortcuts" defaultValue={["shortcuts"]}>
        <AccordionItem value="shortcuts">
          <AccordionTrigger className="popup-shortcuts-trigger">Shortcuts</AccordionTrigger>
          <AccordionContent className="popup-shortcuts-content">
            <div className="popup-shortcut">
              <KbdGroup>
                <Kbd>⇧</Kbd>
                <Kbd>Ctrl</Kbd>
                <Kbd>E</Kbd>
              </KbdGroup>
              <span className="popup-shortcut-label">Select</span>
            </div>
            <div className="popup-shortcut">
              <KbdGroup>
                <Kbd>⇧</Kbd>
                <Kbd>Ctrl</Kbd>
                <Kbd>Z</Kbd>
              </KbdGroup>
              <span className="popup-shortcut-label">Restore</span>
            </div>
            <div className="popup-shortcut">
              <Kbd>Esc</Kbd>
              <span className="popup-shortcut-label">Exit</span>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}

export default App;
