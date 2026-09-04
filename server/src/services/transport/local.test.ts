import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { AGENT_WIRE_FORMAT } from './agent.js';
import { localTransport } from './local.js';

describe('local transport', () => {
  it('round-trips write/read/copy/rename and exec', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'vigil-t-'));
    const a = path.join(dir, 'a.txt');
    const b = path.join(dir, 'b.txt');
    const c = path.join(dir, 'c.txt');
    await localTransport.writeFile(a, Buffer.from('hello'), 0o600);
    assert.equal((await localTransport.readFile(a)).toString(), 'hello');
    assert.equal(await localTransport.exists(a), true);
    await localTransport.copy(a, b);
    await localTransport.rename(b, c);
    assert.equal((await localTransport.readFile(c)).toString(), 'hello');
    const st = await localTransport.stat(c);
    assert.equal(st.isFile, true);
    const names = await localTransport.readdir(dir);
    assert.ok(names.includes('a.txt'));
    const result = await localTransport.exec(process.execPath, ['-e', 'process.stdout.write("ok")'], { timeoutMs: 10_000 });
    assert.equal(result.code, 0);
    assert.equal(result.stdout, 'ok');
    await localTransport.unlink(c);
    assert.equal(await localTransport.exists(c), false);
  });
});

describe('agent wire format', () => {
  it('documents poll/result paths and ops', () => {
    assert.equal(AGENT_WIRE_FORMAT.pollPath, '/agent/v1/poll');
    assert.equal(AGENT_WIRE_FORMAT.resultPath, '/agent/v1/result');
    assert.ok(AGENT_WIRE_FORMAT.ops.includes('exec'));
    assert.ok(AGENT_WIRE_FORMAT.ops.includes('writeFile'));
  });
});
