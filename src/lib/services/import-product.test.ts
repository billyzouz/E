import { describe, expect, it } from "vitest";
import { sanitizeHtml } from "./import-product";

describe("sanitizeHtml", () => {
  it("retire scripts et handlers", () => {
    const out = sanitizeHtml('<p onclick="x()">ok</p><script>alert(1)</script>');
    expect(out).toBe("<p>ok</p>");
  });
});
