import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyIncomingAppUrl,
  getRequestedOfferId,
  getRequestedPublicBatchId,
  getIncomingConsumerListingId,
  leavePublicBatchView,
} from "./appLinks.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

function setWindow(url) {
  const parsed = new URL(url);
  const replaceState = vi.fn();
  vi.stubGlobal("window", {
    location: {
      href: parsed.href,
      pathname: parsed.pathname,
      search: parsed.search,
    },
    history: { replaceState },
  });
  return replaceState;
}

describe("app links", () => {
  it("reads public batches from both path and legacy query links", () => {
    setWindow("https://example.test/batch/ABC%20123");
    expect(getRequestedPublicBatchId()).toBe("ABC 123");

    setWindow("https://example.test/?batch=LEGACY-1");
    expect(getRequestedPublicBatchId()).toBe("LEGACY-1");
  });

  it("keeps offer links out of the public batch route", () => {
    setWindow("https://example.test/?offer=offer-1&batch=batch-1");
    expect(getRequestedOfferId()).toBe("offer-1");
    expect(getRequestedPublicBatchId()).toBe("");
  });

  it("routes incoming offer links to the existing offers tab", () => {
    const replaceState = setWindow("https://example.test/");
    const setBuyerActiveOfferId = vi.fn();
    const setActiveTab = vi.fn();

    applyIncomingAppUrl("https://example.test/?offer=offer-42", {
      setBuyerActiveOfferId,
      setActiveTab,
    });

    expect(replaceState).toHaveBeenCalledWith({}, "", "/?offer=offer-42");
    expect(setBuyerActiveOfferId).toHaveBeenCalledWith("offer-42");
    expect(setActiveTab).toHaveBeenCalledWith("offers");
  });

  it("routes incoming batch links and can leave the public view", () => {
    const replaceState = setWindow("https://example.test/");
    const setPublicBatchId = vi.fn();

    applyIncomingAppUrl("https://example.test/batch/BATCH%207", { setPublicBatchId });
    expect(setPublicBatchId).toHaveBeenCalledWith("BATCH 7");

    leavePublicBatchView();
    expect(replaceState).toHaveBeenLastCalledWith({}, "", "/");
  });

  it("routes public consumer listing links without mixing them with B2B offers", () => {
    const replaceState = setWindow("https://example.test/");
    const setConsumerListingId = vi.fn();
    const setActiveTab = vi.fn();
    applyIncomingAppUrl("https://example.test/kuluttaja/era/listing%2042", { setConsumerListingId, setActiveTab });
    expect(getIncomingConsumerListingId("https://example.test/kuluttaja/era/listing%2042")).toBe("listing 42");
    expect(getIncomingConsumerListingId("fi.suoraankalastajalta.app:///kuluttaja/era/listing%2042")).toBe("listing 42");
    expect(replaceState).toHaveBeenCalledWith({}, "", "/kuluttaja/era/listing%2042");
    expect(setConsumerListingId).toHaveBeenCalledWith("listing 42");
    expect(setActiveTab).not.toHaveBeenCalled();
  });
});
