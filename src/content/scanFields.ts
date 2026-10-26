// Content script for the autofill scan. Built as an IIFE and injected with
// chrome.scripting.executeScript only after the user clicks Autofill, into the top frame.
// It reads the form and changes nothing on the page.
import { scanDocument, type FieldDescriptor } from "../autofill/fields";

export interface ScanResult {
  fingerprint: string;
  fields: FieldDescriptor[];
}

export function scanForm(): ScanResult {
  const { fingerprint, fields } = scanDocument(document);
  return { fingerprint, fields };
}
