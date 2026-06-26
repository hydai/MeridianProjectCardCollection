import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import App from "../../src/client/App";

describe("App", () => {
  it("renders title", () => {
    render(<App />);
    expect(screen.getByText("子午卡包收藏")).toBeInTheDocument();
  });
});
