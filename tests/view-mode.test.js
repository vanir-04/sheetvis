import test from "node:test";
import assert from "node:assert/strict";
import { createPageIndexes, scrollTopForPage } from "../src/ui/view-mode.js";

test("createPageIndexes returns one-based page numbers", () => {
  assert.deepEqual(createPageIndexes(4), [1, 2, 3, 4]);
  assert.deepEqual(createPageIndexes(0), []);
});

test("scrollTopForPage returns the top offset for a stacked page", () => {
  assert.equal(scrollTopForPage({ pageNumber: 1, pageHeight: 720, gap: 24 }), 0);
  assert.equal(scrollTopForPage({ pageNumber: 3, pageHeight: 720, gap: 24 }), 1488);
});
