import test from "node:test";
import assert from "node:assert/strict";
import { attachGradeBlockReleases } from "../../src/features/grade-import/grade-block-releases.mjs";

const release = {
  id: "release-1", block_id: "block-old", term_id: "term-old",
  batch_ids: ["batch-1", "batch-2"], publication_reference: "GBR-BLOCK-OLD",
  published_at: "2026-10-10T08:00:00Z", status: "PUBLISHED",
  expected_subject_count: 2, expected_result_count: 4,
  expected_subject_snapshot: [{ subject_code: "IT101", count: 2 }, { subject_code: "GE101", count: 2 }],
};
const batches = [
  { id: "batch-1", term_id: "term-old", status: "PUBLISHED", publication_reference: "GIP-1" },
  { id: "batch-2", term_id: "term-old", status: "PUBLISHED", publication_reference: "GIP-2" },
  { id: "batch-3", term_id: "term-old", status: "VALIDATED", publication_reference: null },
];

test("collective ledger reference is joined to each published batch independently of batch publication reference", () => {
  const result = attachGradeBlockReleases({
    blocks: [{ id: "block-old", code: "BSIT-2A", termId: "term-old", termLabel: "Previous Term" }],
    batches, releases: [release],
  });
  assert.equal(result.blocks[0].release.publication_reference, "GBR-BLOCK-OLD");
  assert.equal(result.batches[0].block_publication_reference, "GBR-BLOCK-OLD");
  assert.equal(result.batches[1].block_publication_reference, "GBR-BLOCK-OLD");
  assert.equal(result.batches[0].publication_reference, "GIP-1");
  assert.equal(result.batches[2].block_publication_reference, null);
  assert.equal(result.releases[0].expected_result_count, 4);
});

test("historical release survives even if the current confirmed block checklist is empty", () => {
  const result = attachGradeBlockReleases({
    blocks: [], batches, releases: [release],
    blockCatalog: [{ id: "block-old", code: "BSIT-2A" }],
    terms: [{ id: "term-old", label: "Previous Term" }],
  });
  assert.deepEqual(result.blocks, []);
  assert.equal(result.releases[0].blockCode, "BSIT-2A");
  assert.equal(result.releases[0].termLabel, "Previous Term");
  assert.equal(result.batches[1].block_publication_reference, "GBR-BLOCK-OLD");
});

test("conflicting batch ownership in published release ledger fails closed", () => {
  assert.throws(() => attachGradeBlockReleases({
    blocks: [], batches,
    releases: [release, {
      ...release, id: "release-2", block_id: "other-block",
      publication_reference: "GBR-OTHER",
    }],
  }), /multiple block releases/);
});

test("release with missing batch or mismatched batch state fails closed", () => {
  assert.throws(() => attachGradeBlockReleases({
    blocks: [], batches: batches.slice(0, 1), releases: [release],
  }), /unavailable source batch/);
  assert.throws(() => attachGradeBlockReleases({
    blocks: [], batches: [{ ...batches[0], status: "VALIDATED" }, batches[1]], releases: [release],
  }), /conflicts with its block release/);
});
