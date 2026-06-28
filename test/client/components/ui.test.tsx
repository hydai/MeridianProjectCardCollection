import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

describe("Button", () => {
  it("renders as a button with its label", () => {
    render(<Button>新增</Button>);
    expect(screen.getByRole("button", { name: "新增" })).toBeInTheDocument();
  });
  it("applies the primary (default) background utility", () => {
    render(<Button>金</Button>);
    expect(screen.getByRole("button", { name: "金" }).className).toContain(
      "bg-primary",
    );
  });
  it("applies the ghost variant (no primary background)", () => {
    render(<Button variant="ghost">幽靈</Button>);
    expect(
      screen.getByRole("button", { name: "幽靈" }).className,
    ).not.toContain("bg-primary");
  });
});

describe("Card", () => {
  it("renders title and content", () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>面板</CardTitle>
        </CardHeader>
        <CardContent>內容</CardContent>
      </Card>,
    );
    expect(screen.getByText("面板")).toBeInTheDocument();
    expect(screen.getByText("內容")).toBeInTheDocument();
  });
});
