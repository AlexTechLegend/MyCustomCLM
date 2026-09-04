import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { before, describe, it } from 'node:test';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vigil-approve-'));
process.env.VIGIL_DATA_DIR = dir;
process.env.VIGIL_SCHEDULER = '0';
process.env.VIGIL_LOG_LEVEL = 'error';

const { resetDbHandle, db } = await import('../db.js');
const { approvePipelineRun, createPipeline, executePipeline, getPipelineRun } = await import('./pipelines.js');

describe('pipeline approval notes', () => {
  before(() => {
    process.env.VIGIL_DATA_DIR = dir;
    resetDbHandle();
    db();
  });

  it('stores the decision note on approve', async () => {
    const pipe = createPipeline({
      name: 'Gate',
      steps: [{ type: 'approval', name: 'Wait', config: { message: 'Hold' }, continueOnError: false, condition: 'always' }],
    });
    const run = await executePipeline({ pipelineId: pipe.id });
    assert.equal(run.state, 'awaiting-approval');
    const decided = await approvePipelineRun(run.id, { userId: 'usr_test', note: 'Looks good' });
    assert.equal(getPipelineRun(run.id)?.decisionNote, 'Looks good');
    assert.equal(decided.params.decisionNote, 'Looks good');
  });

  it('stores the decision note on reject', async () => {
    const pipe = createPipeline({
      name: 'Gate reject',
      steps: [{ type: 'approval', name: 'Wait', config: {}, continueOnError: false, condition: 'always' }],
    });
    const run = await executePipeline({ pipelineId: pipe.id });
    const decided = await approvePipelineRun(run.id, { userId: 'usr_test', reject: true, note: 'Wrong host' });
    assert.equal(decided.state, 'rejected');
    assert.equal(decided.decisionNote, 'Wrong host');
    assert.match(decided.steps[0]?.error ?? '', /Wrong host/);
  });
});
