import { loadModules, createApp, collect, request, ASAR_NM } from './harness.mjs';
import { pathToFileURL } from 'node:url';

const VALS = pathToFileURL(ASAR_NM + '/@deepseek-ai/dsh-util-values/lib/index.js').href;
const { snapshotJsonValue } = await import(VALS);

await loadModules();
const { app } = await createApp({ mockConfig: { providers: ['mock-local'], behaviors: { 'mock-local': [{ mode: 'timeout' }] }, retryPolicy: { mode: 'normal', maxRetries: 2, initialDelayMs: 10, maxDelayMs: 40 } } });
const chunks = await collect(app.llm.stream(request({ provider: 'mock-local' })));
const fin = chunks.filter(c => c.type === 'finish').pop();
const failure = fin.reason.failure;

function report(label, obj) {
  const s = snapshotJsonValue(obj);
  console.log(label, s === undefined ? 'REJECTED' : 'ok');
  if (s === undefined && obj !== null && typeof obj === 'object') {
    for (const k of Object.keys(obj)) {
      const sub = snapshotJsonValue(obj[k]);
      console.log('   field', k, '=>', sub === undefined ? 'REJECTED' : 'ok');
      if (sub === undefined) console.log('      value:', obj[k], 'proto:', obj[k] !== null && typeof obj[k] === 'object' ? Object.getPrototypeOf(obj[k]) : typeof obj[k]);
    }
  }
}
console.log('failure:', JSON.stringify(failure));
report('failure', failure);
const eventData = { retryId: 'abc', turn: 1, step: 1, provider: 'mock-local', mode: 'normal', policyKey: 'k', retry: 1, maxRetries: 2, delayMs: 10, failure };
report('eventData', eventData);
process.exit(0);