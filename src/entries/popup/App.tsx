import { ArrowCounterClockwiseIcon, PlusIcon } from "@phosphor-icons/react";
import { useState } from "react";
import wxtLogo from "~assets/logo.svg";
import { Button } from "~shared/components/ui/button";

function App() {
  const [hiddenElementCount, _setHiddenElementCount] = useState(0);

  return (
    <div className="w-72 px-6 py-3 text-base flex flex-col gap-2 bg-zinc-50">
      <header className="flex gap-1 items-center">
        <img src={wxtLogo} alt="Pare logo" width={32} className="" />
        <h1 className="text-lg ">Pare</h1>
      </header>
      <hr />
      <main>
        <div className="flex items-center justify-between p-1">
          <p className="flex gap-2 text-sm">
            Hidden
            <span>{hiddenElementCount}</span>
          </p>
          <span>
            <Button className="" variant="ghost">
              <PlusIcon />
            </Button>
            <Button className="" variant="ghost">
              <ArrowCounterClockwiseIcon />
            </Button>
          </span>
        </div>
      </main>
    </div>
  );
}

export default App;
