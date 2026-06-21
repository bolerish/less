import { ArrowCounterClockwiseIcon, CaretRightIcon, CursorClickIcon } from "@phosphor-icons/react";
import { useState } from "react";
import wxtLogo from "~assets/logo.svg";
import { clearCSSCacheForOrigin, deleteRecordsByOrigin } from "~features/record";
import { Button } from "~shared/components/ui/button";
import { Kbd, KbdGroup } from "~shared/components/ui/kbd";
import { Switch } from "~shared/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "~shared/components/ui/tooltip";
import { useCurrentTab } from "./hooks/useCurrentTab";
import { useHiddenCount } from "./hooks/useHiddenCount";
import { useSiteHidingPreference } from "./hooks/useSiteHidingPreference";
import { useUndoCount } from "./hooks/useUndoCount";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "~shared/components/ui/accordion";

function App() {
  const currentTab = useCurrentTab();
  const origin = currentTab?.origin ?? null;
  const tabId = currentTab?.id;

  const { enabled, loaded, toggle } = useSiteHidingPreference(origin);
  const [refreshKey, setRefreshKey] = useState(0);
  const hiddenCount = useHiddenCount(origin, refreshKey);
  const [isResetting, setIsResetting] = useState(false);
  const { count: undoCount, restore } = useUndoCount(tabId);

  const handleSelectToHide = async (): Promise<void> => {
    if (!tabId) return;
    try {
      await browser.tabs.sendMessage(tabId, { type: "SET_SELECTION_ENABLED", enabled: true });
    } catch (error) {
      console.warn("[Bare] failed to start selection mode", error);
    }
    window.close();
  };

  const handleReset = async (): Promise<void> => {
    if (!origin) return;
    setIsResetting(true);
    try {
      await deleteRecordsByOrigin(origin);
      await clearCSSCacheForOrigin(origin);
      setRefreshKey((k) => k + 1);
      if (tabId !== undefined) {
        await browser.tabs.sendMessage(tabId, { type: "REFRESH_HIDING" }).catch(() => {});
      }
    } catch (error) {
      console.warn("[Bare] reset failed", error);
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="w-72 flex flex-col bg-zinc-50 text-zinc-900">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <div className="flex gap-1.5 items-center">
          <img src={wxtLogo} alt="Bare logo" width={22} />
          <span className="text-sm font-semibold tracking-tight">Bare</span>
        </div>
        <Switch id="site-hiding" checked={enabled} disabled={!loaded} onCheckedChange={toggle} />
      </div>

      {/* Hidden count + restore */}
      <div className="flex items-center justify-between px-4 pb-2">
        <span className="flex items-center gap-1.5  font-medium  cursor-pointer select-none list-none  text-zinc-800">
          Hidden
        </span>
        <div className="flex items-center gap-3">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon-sm"
                variant="ghost"
                disabled={!enabled || !loaded || !currentTab}
                onClick={handleSelectToHide}
                className="w-fit"
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
                variant="ghost"
                disabled={undoCount === 0}
                onClick={restore}
                aria-label="Undo"
                className="w-fit"
              >
                <ArrowCounterClockwiseIcon />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">Undo</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {!(isResetting || hiddenCount === 0) && (
        <div className="mx-3 mb-3 rounded-lg border  overflow-hidden">
          <Button
            className="w-full rounded-none border-0 justify-center h-8 px-3 font-normal"
            onClick={handleReset}
            variant="default"
          >
            <span>Reset</span>
          </Button>
        </div>
      )}

      {/* Shortcuts disclosure */}
      <Accordion type="single" collapsible defaultValue="shortcuts">
        <AccordionItem value="shortcuts">
          <AccordionTrigger className="flex items-center gap-1.5 px-4 py-2 text-[10px] font-medium  cursor-pointer select-none list-none text-zinc-400">
            Shortcuts
          </AccordionTrigger>
          <AccordionContent className="flex flex-col gap-1.5 px-1  h-fit">
            <div className="flex items-center gap-2 text-zinc-400">
              <KbdGroup>
                <Kbd>⇧</Kbd>
                <Kbd>Ctrl</Kbd>
                <Kbd>E</Kbd>
              </KbdGroup>
              <span className="text-xs">Select</span>
            </div>
            <div className="flex items-center gap-2 text-zinc-400">
              <KbdGroup>
                <Kbd>⇧</Kbd>
                <Kbd>Ctrl</Kbd>
                <Kbd>Z</Kbd>
              </KbdGroup>
              <span className="text-xs">Restore</span>
            </div>
            <div className="flex items-center gap-2 text-zinc-400">
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
