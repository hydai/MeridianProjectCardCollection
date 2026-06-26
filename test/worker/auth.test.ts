import { describe, expect, it } from "vitest";
import { isAuthorized } from "../../src/worker/auth";

const OWNER = "z54981220@gmail.com";

describe("isAuthorized", () => {
  it("allows the owner email with a matching aud", () => {
    expect(isAuthorized({ email: OWNER, aud: ["AUD1"] }, OWNER, "AUD1")).toBe(
      true,
    );
  });

  it("accepts aud provided as a bare string", () => {
    expect(isAuthorized({ email: OWNER, aud: "AUD1" }, OWNER, "AUD1")).toBe(
      true,
    );
  });

  it("rejects a different email", () => {
    expect(
      isAuthorized({ email: "evil@example.com", aud: ["AUD1"] }, OWNER, "AUD1"),
    ).toBe(false);
  });

  it("rejects a wrong aud", () => {
    expect(isAuthorized({ email: OWNER, aud: ["OTHER"] }, OWNER, "AUD1")).toBe(
      false,
    );
  });

  it("rejects when the email is missing", () => {
    expect(isAuthorized({ aud: ["AUD1"] }, OWNER, "AUD1")).toBe(false);
  });
});
