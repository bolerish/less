import { ArrowCounterClockwiseIcon, CursorClickIcon } from "@phosphor-icons/react";
import { useState } from "react";
import wxtLogo from "~assets/logo.svg";
import { deleteRecordsByOrigin } from "~features/record";
import { Button } from "~shared/components/ui/button";
import { Switch } from "~shared/components/ui/switch";
import { useCurrentTab } from "./hooks/useCurrentTab";
import { useHiddenCount } from "./hooks/useHiddenCount";
import { useSiteHidingPreference } from "./hooks/useSiteHidingPreference";

function App() {
  const currentTab = useCurrentTab();
  const origin = currentTab?.origin ?? null;

  const { enabled, loaded, toggle } = useSiteHidingPreference(origin);
  const [refreshKey, setRefreshKey] = useState(0);
  const hiddenCount = useHiddenCount(origin, refreshKey);
  const [isResetting, setIsResetting] = useState(false);

  const handleSelectToHide = async (): Promise<void> => {
    if (!currentTab) return;
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab?.id === undefined) return;
    try {
      await browser.tabs.sendMessage(tab.id, { type: "SET_SELECTION_ENABLED", enabled: true });
    } catch (error) {
      console.warn("[pare] failed to start selection mode", error);
    }
    window.close();
  };

  const handleReset = async (): Promise<void> => {
    if (!origin) return;
    setIsResetting(true);
    try {
      await deleteRecordsByOrigin(origin);
      setRefreshKey((k) => k + 1);
    } catch (error) {
      console.warn("[pare] reset failed", error);
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="w-72 px-6 py-3 text-base flex flex-col gap-2 bg-zinc-50">
      <header className="flex gap-1 items-center">
        <img src={wxtLogo} alt="Pare logo" width={32} />
        <h1 className="text-lg">Pare</h1>
      </header>
      <hr />
      <main className="flex flex-col gap-1">
        <div className="flex items-center justify-between px-1 py-2">
          <p className="text-sm text-zinc-600">
            Hidden <span className="font-semibold text-zinc-900">{hiddenCount}</span>
          </p>
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={isResetting || hiddenCount === 0}
            onClick={handleReset}
            aria-label="Reset all hidden elements"
          >
            <ArrowCounterClockwiseIcon />
          </Button>
        </div>
        <div className="flex items-center justify-between px-1 py-2">
          <label htmlFor="site-hiding" className="text-sm text-zinc-700 cursor-pointer select-none">
            Enable hiding
          </label>
          <Switch
            id="site-hiding"
            checked={enabled}
            disabled={!loaded}
            onCheckedChange={toggle}
          />
        </div>
        <div className="px-1 pt-1 pb-2">
          <Button
            className="w-full"
            disabled={!enabled || !loaded || !currentTab}
            onClick={handleSelectToHide}
          >
            <CursorClickIcon />
            Select to hide
          </Button>
        </div>
      </main>
    </div>
  );
}

export default App;
