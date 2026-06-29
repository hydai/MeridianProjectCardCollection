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
  it("renders with a value", () => {
    render(<Progress value={42} />);
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });
});
