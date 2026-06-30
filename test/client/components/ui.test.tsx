import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Panel } from "@/views/shared";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

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

describe("Table", () => {
  it("renders headers and cells", () => {
    render(
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>系列</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>NEW YEAR</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );
    expect(screen.getByText("系列")).toBeInTheDocument();
    expect(screen.getByText("NEW YEAR")).toBeInTheDocument();
  });
});

describe("Badge", () => {
  it("renders its label", () => {
    render(<Badge>SR</Badge>);
    expect(screen.getByText("SR")).toBeInTheDocument();
  });
});

describe("Progress", () => {
  it("reflects its value in ARIA", () => {
    render(<Progress value={42} />);
    const bar = screen.getByRole("progressbar");
    expect(bar).toBeInTheDocument();
    expect(bar).toHaveAttribute("aria-valuenow", "42");
  });
  it("clamps an out-of-range value to 0–100", () => {
    render(<Progress value={150} />);
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "100",
    );
  });
  it("scales value and ARIA to a custom max", () => {
    render(<Progress value={3} max={6} />);
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "3");
    expect(bar).toHaveAttribute("aria-valuemax", "6");
  });
});

describe("Alert", () => {
  it("renders with role=alert and shows title + description", () => {
    render(
      <Alert>
        <AlertTitle>警告</AlertTitle>
        <AlertDescription>內容說明</AlertDescription>
      </Alert>,
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("警告")).toBeInTheDocument();
    expect(screen.getByText("內容說明")).toBeInTheDocument();
  });
});

describe("ToggleGroup", () => {
  it("selects a single value and reports changes", () => {
    const onValueChange = vi.fn();
    render(
      <ToggleGroup type="single" value="all" onValueChange={onValueChange}>
        <ToggleGroupItem value="all" aria-label="全部">
          全部
        </ToggleGroupItem>
        <ToggleGroupItem value="ur" aria-label="UR">
          UR
        </ToggleGroupItem>
      </ToggleGroup>,
    );
    // Radix single-select ToggleGroup renders items as role="radio".
    fireEvent.click(screen.getByRole("radio", { name: "UR" }));
    expect(onValueChange).toHaveBeenCalledWith("ur");
  });
});

describe("Panel", () => {
  it("renders an h3 title, a sub, and its children", () => {
    render(
      <Panel title="待售" sub="3 張">
        <div>row</div>
      </Panel>,
    );
    expect(
      screen.getByRole("heading", { level: 3, name: "待售" }),
    ).toBeInTheDocument();
    expect(screen.getByText("3 張")).toBeInTheDocument();
    expect(screen.getByText("row")).toBeInTheDocument();
  });
});
