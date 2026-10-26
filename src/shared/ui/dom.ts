// DOM helpers for the extension's own pages. Only the extension's own strings reach
// these helpers. Anything from a job page must go through textContent, never innerHTML.

export function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (element === null) {
    throw new Error(`missing element #${id}`);
  }
  return element as T;
}

export function setText(id: string, text: string): void {
  byId(id).textContent = text;
}

// Shows exactly one view and hides the rest.
export function showOnly(ids: readonly string[], active: string): void {
  for (const id of ids) {
    byId(id).hidden = id !== active;
  }
}

// Any input counts as activity for auto-lock. Capture phase, so inputs that stop
// propagation still count.
export function watchActivity(onActivity: () => void): void {
  for (const type of ["pointerdown", "keydown"] as const) {
    document.addEventListener(type, onActivity, { capture: true, passive: true });
  }
}
