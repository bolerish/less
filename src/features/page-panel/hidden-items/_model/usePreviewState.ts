import { useEffect, useState } from "react";
import type { HiddenItemPreview, PreviewState } from "~features/element-hiding/preview";

export function usePreviewState(preview?: HiddenItemPreview): PreviewState {
  const [state, setState] = useState<PreviewState>({ id: null, message: "" });
  useEffect(() => preview?.subscribe(setState), [preview]);
  return state;
}
