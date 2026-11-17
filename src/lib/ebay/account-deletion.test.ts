import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { challengeResponse } from "./account-deletion";

describe("challengeResponse", () => {
  it("hache code + token + URL dans cet ordre", () => {
    const expected = createHash("sha256").update("abc" + "tok" + "https://x.fr/api").digest("hex");
    expect(challengeResponse("abc", "tok", "https://x.fr/api")).toBe(expected);
  });
});
