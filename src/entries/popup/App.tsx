import { ArrowCounterClockwiseIcon, CursorClickIcon } from "@phosphor-icons/react";
import { useState } from "react";
import wxtLogo from "~assets/logo.svg";

import { Button } from "~shared/components/ui/button";
import { Kbd, KbdGroup } from "~shared/components/ui/kbd";
import { Switch } from "~shared/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "~shared/components/ui/tooltip";
import { useCurrentTab } from "./hooks/useCurrentTab";
import { useSiteHidingPreference } from "./hooks/useSiteHidingPreference";
import { useUndoCount } from "./hooks/useUndoCount";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "~shared/components/ui/accordion";
import { ButtonGroup } from "~shared/components/ui/button-group";

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
      .catch(() => setPanelError("Reload the website, then click the Veil toolbar icon."));
  };

  return (
    <div className="w-72 flex flex-col bg-background text-foreground">
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <div className="flex gap-1.5 items-center">
          <img src={wxtLogo} alt="Veil logo" width={22} />
          <span className="text-sm font-semibold tracking-tight">Veil</span>
        </div>
        <Switch
          aria-label="Hide saved items on this site"
          id="site-hiding"
          checked={enabled}
          disabled={!loaded}
          onCheckedChange={toggle}
        />
      </div>

      <div className="flex items-center justify-between px-4 pb-2">
        <span className="flex items-center gap-1.5  font-medium  cursor-pointer select-none list-none  text-foreground">
          Hidden
        </span>
        <ButtonGroup>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon-sm"
                disabled={!enabled || !loaded || !origin}
                aria-label="Select items to hide"
                onClick={handleSelectToHide}
                variant="outline"
              >
                <CursorClickIcon />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">Select</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon-sm"
                disabled={undoCount === 0}
                onClick={restore}
                aria-label="Undo"
                variant="outline"
              >
                <ArrowCounterClockwiseIcon />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">Undo</TooltipContent>
          </Tooltip>
        </ButtonGroup>
      </div>

      <div className="px-4 pb-3">
        <Button
          className="w-full"
          variant="outline"
          disabled={!currentTab}
          onClick={handleOpenPanel}
        >
          Manage hidden items
        </Button>
        {panelError ? (
          <p role="alert" className="text-xs mt-2">
            {panelError}
          </p>
        ) : null}
      </div>

      <Accordion type="single" collapsible defaultValue="shortcuts">
        <AccordionItem value="shortcuts">
          <AccordionTrigger className="flex items-center gap-1.5 px-4 py-2 text-[10px] font-medium  cursor-pointer select-none list-none text-muted-foreground">
            Shortcuts
          </AccordionTrigger>
          <AccordionContent className="flex flex-col gap-1.5 px-1  h-fit">
            <div className="flex items-center gap-2 text-muted-foreground">
              <KbdGroup>
                <Kbd>⇧</Kbd>
                <Kbd>Ctrl</Kbd>
                <Kbd>E</Kbd>
              </KbdGroup>
              <span className="text-xs">Select</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <KbdGroup>
                <Kbd>⇧</Kbd>
                <Kbd>Ctrl</Kbd>
                <Kbd>Z</Kbd>
              </KbdGroup>
              <span className="text-xs">Restore</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Kbd>Esc</Kbd>
              <span className="text-xs">Exit</span>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}

export default App;
