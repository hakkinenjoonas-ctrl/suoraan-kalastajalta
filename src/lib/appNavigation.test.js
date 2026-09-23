import { describe, expect, it } from "vitest";
import {
  CONSUMER_SALES_TAB,
  WHOLESALE_SALES_TAB,
  getSalesTabLabel,
  getSellerSalesTabs,
} from "./appNavigation.js";

describe("seller sales navigation", () => {
  it("separates consumer and wholesale sales for fishers and owners", () => {
    expect(getSellerSalesTabs("member")).toEqual([CONSUMER_SALES_TAB, WHOLESALE_SALES_TAB]);
    expect(getSellerSalesTabs("owner")).toEqual([CONSUMER_SALES_TAB, WHOLESALE_SALES_TAB]);
  });

  it("keeps processors and buyers on the existing wholesale offers route", () => {
    expect(getSellerSalesTabs("processor")).toEqual([WHOLESALE_SALES_TAB]);
    expect(getSellerSalesTabs("buyer")).toEqual([WHOLESALE_SALES_TAB]);
  });

  it("uses role-specific labels without renaming the legacy offers route", () => {
    expect(getSalesTabLabel(CONSUMER_SALES_TAB, "member")).toBe("Kuluttajamyynti");
    expect(getSalesTabLabel(WHOLESALE_SALES_TAB, "member")).toBe("Tukkumyynti");
    expect(getSalesTabLabel(WHOLESALE_SALES_TAB, "buyer")).toBe("Tarjoukset");
  });
});
