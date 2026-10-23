// A block publication reference is authoritative only when it is joined to
// the immutable, protected collective release ledger.
export function attachGradeBlockReleases({
  blocks = [], batches = [], releases = [], blockCatalog = [], terms = [],
}) {
  const releaseByBlock = new Map();
  const releaseByBatch = new Map();
  const blockById = new Map(blocks.map((block) => [block.id, block]));
  const catalogById = new Map(blockCatalog.map((block) => [block.id, block]));
  const termsById = new Map(terms.map((term) => [term.id, term.label]));

  for (const release of releases) {
    if (!release.id || !release.block_id || !release.term_id ||
      !Array.isArray(release.batch_ids) ||
      (release.status === "PUBLISHED" && (!release.publication_reference ||
        !release.published_at || !release.batch_ids.length))) {
      throw new Error("The protected block publication ledger is incomplete.");
    }
    if (release.status !== "PUBLISHED") continue;
    const blockKey = `${release.block_id}|${release.term_id}`;
    if (releaseByBlock.has(blockKey) || new Set(release.batch_ids).size !== release.batch_ids.length) {
      throw new Error("The protected block publication ledger has conflicting releases.");
    }
    releaseByBlock.set(blockKey, release);
    for (const batchId of release.batch_ids) {
      if (releaseByBatch.has(batchId)) {
        throw new Error("A grade source batch is assigned to multiple block releases.");
      }
      releaseByBatch.set(batchId, release);
    }
  }

  const annotatedBatches = batches.map((batch) => {
    const release = releaseByBatch.get(batch.id);
    if (release && (batch.status !== "PUBLISHED" || batch.term_id !== release.term_id ||
      !batch.publication_reference)) {
      throw new Error("A published grade batch conflicts with its block release.");
    }
    return {
      ...batch,
      block_publication_reference: release?.publication_reference ?? null,
      block_release_id: release?.id ?? null,
      block_release_block_id: release?.block_id ?? null,
    };
  });
  if ([...releaseByBatch.keys()].some((batchId) => !batches.some((batch) => batch.id === batchId))) {
    throw new Error("The block release references an unavailable source batch.");
  }

  const annotatedBlocks = blocks.map((block) => ({
    ...block,
    release: releaseByBlock.get(`${block.id}|${block.termId}`) ?? null,
  }));
  const annotatedReleases = releases.map((release) => {
    const block = blockById.get(release.block_id);
    const blockRecord = catalogById.get(release.block_id);
    return {
      ...release,
      blockCode: block?.code || blockRecord?.code || null,
      termLabel: block?.termLabel || termsById.get(release.term_id) || release.term_id,
    };
  }).sort((a, b) => String(b.published_at || "").localeCompare(String(a.published_at || "")));

  return {
    blocks: annotatedBlocks,
    batches: annotatedBatches,
    releases: annotatedReleases,
  };
}
