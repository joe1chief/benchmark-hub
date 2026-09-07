import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderFallback } from './sync_detail_fallbacks_from_arch.mjs';

// Publication state is registered in the manifest; review notes retain source-stage history.
export function assertPublishedContract(id, detail, { publicDir, readSpec }) {
  const entries = JSON.parse(readFileSync(join(publicDir, 'benchmarks_build_process_manifest.json'), 'utf8'));
  const entry = entries.find(candidate => candidate.id === id);
  assert.ok(entry, `${id} published manifest entry`);
  assert.equal(entry.review_status, 'visually_reviewed', `${id} published review status`);
  assert.equal(entry.paper_alignment_review?.status, 'passed', `${id} paper alignment`);
  assert.ok(entry.visual_review?.reviewed_at, `${id} visual review date`);
  assert.ok(entry.paper_alignment_review?.source_url, `${id} reviewed source`);
  assert.ok(entry.paper_alignment_review?.source_locator, `${id} reviewed source locator`);
  for (const language of ['en', 'zh']) {
    assert.equal(entry.strict_validation?.[language], 'passed', `${id}.${language} strict validation`);
    for (const [kind, extension] of [['flowchart', 'svg'], ['source', 'drawio'], ['spec', 'spec.yaml'], ['arch', 'arch.json']]) {
      const field = `drawio_${kind}_${language}`;
      const expected = `drawio/${id}/${id}.${language}.${extension}`;
      assert.equal(entry.assets?.[field], expected, `${id} manifest ${field}`);
      assert.equal(detail[field], expected, `${id} detail ${field}`);
    }
    assert.equal(detail[`flowchart_${language}`], renderFallback(readSpec(id, language)), `${id}.${language} published fallback matches canonical spec`);
  }
  assert.equal(detail.mermaid_flowchart, detail.flowchart_en, `${id} canonical English fallback`);
}

