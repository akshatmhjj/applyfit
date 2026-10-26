// Content script for the autofill fill step. Built as an IIFE and injected with
// chrome.scripting.executeScript only after the user confirms the preview, into the top frame.
// It writes the confirmed values and never submits or clicks anything.
import { fillDocument, type FillPayload, type FillResult } from "../autofill/fill";

export function fillForm(payload: FillPayload): FillResult {
  return fillDocument(document, payload);
}
