import type { ManagedRecord } from "~features/record/management";
import type { getPanelMessage } from "~features/record/management-messages";

export function getRecordLabel(record: ManagedRecord, message: typeof getPanelMessage) {
  const tag = record.target.tagName.toLowerCase();
  let kind = record.target.contentKind;
  if (!kind) {
    if (tag === "video") kind = "video";
    else if (tag === "img") kind = "image";
    else if (["iframe", "object", "embed"].includes(tag)) kind = "external";
    else if (["div", "section", "aside", "header", "footer", "nav", "main"].includes(tag))
      kind = "region";
    else kind = "content";
  }
  const name = message(`panel_kind_${kind}`);
  const text = record.target.displayText?.replace(/\s+/g, " ").trim();
  if (!text || text.toLocaleLowerCase() === name.toLocaleLowerCase())
    return { category: name, text: "" };
  const characters = Array.from(text);
  return {
    category: name,
    text: `${characters.slice(0, 24).join("").trimEnd()}${characters.length > 24 ? "…" : ""}`,
  };
}
