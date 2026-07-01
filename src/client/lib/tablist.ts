import type { KeyboardEvent } from "react";
import { useRef } from "react";

/**
 * Roving-tabindex + arrow-key focus navigation for a bespoke ARIA tablist.
 *
 * The public + admin nav bars are hand-rolled `<button role="tab">` lists (not
 * Radix `Tabs`), so they need the WAI-ARIA "tabs" keyboard contract added by
 * hand. This hook supplies it with *automatic activation* (the panel reveal is
 * instant, so moving focus also selects) — the recommended pattern for tabs
 * whose content is cheap to show. Roving tabindex without arrow keys would make
 * the inactive tabs unreachable by keyboard, so both ship together.
 *
 * Spread `tabProps(index, selected)` onto each tab button:
 *   - `tabIndex` is 0 for the selected tab, -1 for the rest (roving tabindex:
 *     the whole tablist is a single Tab stop; Arrow keys move within it).
 *   - `onKeyDown` handles ArrowLeft/ArrowRight (wrapping) + Home/End, moving DOM
 *     focus and calling `select` with the new id.
 *   - `ref` registers the button so the handler can focus its sibling.
 */
export function useRovingTablist<Id extends string>(
  ids: readonly Id[],
  select: (id: Id) => void,
) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = ids.length - 1;
    let next: number;
    switch (e.key) {
      case "ArrowRight":
        next = index === last ? 0 : index + 1;
        break;
      case "ArrowLeft":
        next = index === 0 ? last : index - 1;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = last;
        break;
      default:
        return;
    }
    e.preventDefault();
    select(ids[next]);
    refs.current[next]?.focus();
  }

  return function tabProps(index: number, selected: boolean) {
    return {
      ref: (el: HTMLButtonElement | null) => {
        refs.current[index] = el;
      },
      tabIndex: selected ? 0 : -1,
      onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => onKeyDown(e, index),
    };
  };
}
