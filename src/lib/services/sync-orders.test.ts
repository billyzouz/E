import { describe, expect, it } from "vitest";
import { carrierCode } from "./sync-orders";

describe("carrierCode", () => {
  it("reconnaît les transporteurs CJ courants", () => {
    expect(carrierCode("YunExpress Europe")).toBe("YunExpress");
    expect(carrierCode("CJPacket Ordinary")).toBe("Other");
    expect(carrierCode(undefined)).toBe("Other");
  });
});
