import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { useRovingTablist } from "../../src/client/lib/tablist";

const IDS = ["a", "b", "c"] as const;

function Harness() {
  const [tab, setTab] = useState<(typeof IDS)[number]>("a");
  const tabProps = useRovingTablist(IDS, setTab);
  return (
    <div role="tablist">
      {IDS.map((id, i) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={tab === id}
          {...tabProps(i, tab === id)}
        >
          {id}
        </button>
      ))}
    </div>
  );
}

describe("useRovingTablist", () => {
  it("gives only the selected tab tabIndex 0 (roving tabindex)", () => {
    render(<Harness />);
    const [a, b, c] = screen.getAllByRole("tab");
    expect(a).toHaveAttribute("tabindex", "0");
    expect(b).toHaveAttribute("tabindex", "-1");
    expect(c).toHaveAttribute("tabindex", "-1");
  });

  it("ArrowRight moves focus + selection to the next tab", () => {
    render(<Harness />);
    const [a, b] = screen.getAllByRole("tab");
    a.focus();
    fireEvent.keyDown(a, { key: "ArrowRight" });
    expect(b).toHaveFocus();
    expect(b).toHaveAttribute("aria-selected", "true");
    expect(b).toHaveAttribute("tabindex", "0");
  });

  it("ArrowLeft from the first tab wraps to the last", () => {
    render(<Harness />);
    const tabs = screen.getAllByRole("tab");
    tabs[0].focus();
    fireEvent.keyDown(tabs[0], { key: "ArrowLeft" });
    expect(tabs[2]).toHaveFocus();
    expect(tabs[2]).toHaveAttribute("aria-selected", "true");
  });

  it("Home and End jump to the first and last tab", () => {
    render(<Harness />);
    const tabs = screen.getAllByRole("tab");
    tabs[0].focus();
    fireEvent.keyDown(tabs[0], { key: "End" });
    expect(tabs[2]).toHaveFocus();
    fireEvent.keyDown(tabs[2], { key: "Home" });
    expect(tabs[0]).toHaveFocus();
  });
});
