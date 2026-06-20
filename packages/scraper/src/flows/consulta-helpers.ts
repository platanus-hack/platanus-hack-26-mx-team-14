import type { Session } from "../types.js";

/** ISO yyyy-mm-dd → dd/mm/yyyy (the format the SAT calendar inputs expect). */
export function toDdMmYyyy(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

/**
 * Sets an AjaxControlToolkit calendar text input. The visible field may be
 * read-only and its hidden companion (`hf*`) is populated by a change handler —
 * so we set `.value` directly and dispatch input/change/blur to trigger it.
 */
export async function setCalendarDate(
  session: Session,
  selector: string,
  ddmmyyyy: string,
): Promise<void> {
  const expr = `(function () {
    var el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return false;
    el.removeAttribute('readonly');
    el.value = ${JSON.stringify(ddmmyyyy)};
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
    return true;
  })()`;
  const ok = await session.evaluate<boolean>(expr).catch(() => false);
  // Fallback to a normal fill if the JS path didn't find the element.
  if (!ok) await session.fill(selector, ddmmyyyy).catch(() => void 0);
}
