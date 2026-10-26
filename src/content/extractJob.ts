// Content script for the extract step. Built as a classic IIFE by esbuild and injected
// with chrome.scripting.executeScript only after the user clicks Analyze, into the
// active tab's top frame. It exposes one function on a global, which the side panel calls.
import { extractJob, type JobExtraction } from "../jobs/extract";

export function extractPage(): JobExtraction {
  return extractJob(document);
}
