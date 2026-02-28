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
}];

const reset = '\x1b[0m';
const info = Bun.color('deepskyblue', 'ansi') ?? '';
const success = Bun.color('mediumseagreen', 'ansi') ?? '';

console.log(`${info}bun-qr benchmark suite${reset}`);

for (const benchmark of cases) {
  for (let i = 0;i < 10;i++) {
    benchmark.run();
  }

  const started = Bun.nanoseconds();
  for (let i = 0;i < benchmark.iterations;i++) {
    benchmark.run();
  }
  const elapsedNs = Bun.nanoseconds() - started;
  const elapsedMs = Number(elapsedNs) / 1_000_000;
  const opsPerSec = (benchmark.iterations / elapsedMs) * 1000;

  console.log(
    `${success}${benchmark.name}${reset}: ${benchmark.iterations} iters in ${elapsedMs.toFixed(2)}ms (${opsPerSec.toFixed(2)} ops/s)`
  );
}
