import { $ } from 'bun';
import encode_qr from '../src/index';
import { encode_email, encode_url, encode_wifi } from '../src/links';

interface BenchmarkFixtures {
  readonly payloads: { readonly shortText: string, readonly url: string, readonly longText: string };
}

const fixtures = await Bun.file(new URL('./fixtures/benchmark-fixtures.json', import.meta.url)).json() as BenchmarkFixtures;

const urlPayload = encode_url(fixtures.payloads.url);
const wifiPayload = encode_wifi({ ssid: 'BenchNet', password: 'bench-secret', security: 'WPA' });
const emailPayload = encode_email('bench@example.com', { subject: 'bun-qr bench', body: fixtures.payloads.longText });

type BenchmarkCase = { readonly name: string, readonly iterations: number, readonly run: () => void };

const cases: readonly BenchmarkCase[] = [{
  name: 'raw: short text',
  iterations: 400,
  run: () => {
    encode_qr(fixtures.payloads.shortText, 'raw');
  }
}, {
  name: 'svg: url',
  iterations: 300,
  run: () => {
    encode_qr(urlPayload, 'svg');
  }
}, {
  name: 'gif: url',
  iterations: 300,
  run: () => {
    encode_qr(urlPayload, 'gif');
  }
}, {
  name: 'ascii: long text',
  iterations: 200,
  run: () => {
    encode_qr(fixtures.payloads.longText, 'ascii');
  }
}, {
  name: 'svg: wifi payload',
  iterations: 200,
  run: () => {
    encode_qr(wifiPayload, 'svg', { ecc: 'high' });
  }
}, {
  name: 'svg: email payload',
  iterations: 150,
  run: () => {
    encode_qr(emailPayload, 'svg', { ecc: 'quartile' });
  }
}, {
  name: 'raw: near-capacity byte payload',
  iterations: 8,
  run: () => {
    encode_qr('x'.repeat(2300), 'raw', { encoding: 'byte', ecc: 'medium' });
  }
}, {
  name: 'gif: scaled url',
  iterations: 30,
  run: () => {
    encode_qr(urlPayload, 'gif', { border: 4, scale: 8 });
  }
}];

const platform = navigator.platform === 'Win32' ? 'win32' : navigator.platform === 'MacIntel' ? 'darwin' : 'linux';
const host_arch = platform === 'win32' ?
  Bun.env.PROCESSOR_ARCHITEW6432 ?? Bun.env.PROCESSOR_ARCHITECTURE ?? 'unknown' :
  (await $`uname -m`.text()).trim();

console.log('bun-qr benchmark suite');
console.log(`Bun ${Bun.version}, host ${platform}/${host_arch}; 10 warmups, 5 measured batches per case`);

for (const benchmark of cases) {
  for (let i = 0;i < 10;i++) {
    benchmark.run();
  }

  const batches: number[] = [];
  for (let batch = 0;batch < 5;batch++) {
    const started = Bun.nanoseconds();
    for (let i = 0;i < benchmark.iterations;i++) benchmark.run();
    batches.push((Bun.nanoseconds() - started) / 1_000_000);
  }
  batches.sort((a, b) => a - b);
  const elapsedMs = batches.reduce((sum, value) => sum + value, 0);
  const opsPerSec = (benchmark.iterations * batches.length / elapsedMs) * 1000;

  console.log(
    `${benchmark.name}: 5 × ${benchmark.iterations} iters, ${opsPerSec.toFixed(2)} ops/s; ` +
      `batch median ${(batches[2] ?? 0).toFixed(2)}ms, range ${(batches[0] ?? 0).toFixed(2)}–${(batches[4] ?? 0).toFixed(2)}ms`
  );
}
