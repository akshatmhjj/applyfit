import { byId, setText } from "../shared/ui/dom";

export interface ConfirmIds {
  panel: string;
  summary: string;
  warning: string;
  send: string;
  cancel: string;
}

// Shows exactly what will leave the device, and waits for an explicit Send or Cancel.
export function askToSend(ids: ConfirmIds, summary: string, warning: string | null): Promise<boolean> {
  const panel = byId(ids.panel);
  setText(ids.summary, summary);
  byId(ids.warning).hidden = warning === null;
  setText(ids.warning, warning ?? "");
  panel.hidden = false;

  return new Promise((resolve) => {
    const send = byId(ids.send);
    const cancel = byId(ids.cancel);
    const finish = (answer: boolean) => {
      panel.hidden = true;
      send.removeEventListener("click", onSend);
      cancel.removeEventListener("click", onCancel);
      resolve(answer);
    };
    const onSend = () => finish(true);
    const onCancel = () => finish(false);
    send.addEventListener("click", onSend);
    cancel.addEventListener("click", onCancel);
  });
}
