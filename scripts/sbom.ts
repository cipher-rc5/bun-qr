// file: scripts/sbom.ts
// description: generate a CycloneDX SBOM for the published package from bun.lock
// reference: https://cyclonedx.org/docs/1.6/json/

/**
 * Emits a CycloneDX 1.6 JSON SBOM describing this package and its dependency graph.
 *
 * This is generated from `bun.lock` rather than by `@cyclonedx/cyclonedx-npm`, for two
 * reasons. The npm-based generators do not run under Bun — `@cyclonedx/cyclonedx-npm`
 * segfaults loading its native `libxmljs2` binding, and `cyclonedx-bom` fails to parse
 * under Bun's transpiler — so using them would drag `npm` and `actions/setup-node` back
 * into a Bun-only release pipeline. More importantly, they inventory the *build host*
 * (the CI machine's Node install, the platform-specific TypeScript binary that happened
 * to be fetched) rather than the artifact actually published. This package ships with
 * zero runtime dependencies; an SBOM that lists `node` as a component misrepresents it.
 *
 * Integrity hashes are carried over verbatim from the lockfile, so the SBOM is only as
 * trustworthy as `bun.lock` — which is exactly the guarantee `--frozen-lockfile` enforces
 * everywhere else in CI.
 *
 * Usage: `bun run scripts/sbom.ts [output-path]` (defaults to `dist-artifacts/sbom.cdx.json`).
 */

interface LockfilePackage {
  /** Integrity hash, e.g. `sha512-...`. Absent for workspace-local entries. */
  integrity?: string;
  name: string;
  version: string;
}

interface CycloneDxComponent {
  'bom-ref': string;
  hashes?: Array<{ alg: string, content: string }>;
  name: string;
  purl: string;
  scope: 'excluded' | 'optional' | 'required';
  type: 'library';
  version: string;
}

/**
 * Parse `bun.lock`, which is JSONC: it permits trailing commas that `JSON.parse` rejects.
 * The lockfile is machine-generated and contains no string literals with a trailing comma
 * before a closing brace, so this substitution is safe here even though it would not be a
 * correct JSONC parser in general.
 */
function parse_lockfile(text: string): unknown {
  return JSON.parse(text.replace(/,(\s*[}\]])/g, '$1'));
}

/**
 * Split a lockfile package key into name and version.
 *
 * Keys are `name@version`, where scoped names themselves begin with `@`
 * (`@types/bun@1.3.14`), so the separator is the last `@` rather than the first.
 */
function split_spec(spec: string): { name: string, version: string } {
  const at = spec.lastIndexOf('@');
  if (at <= 0) return { name: spec, version: '0.0.0' };
  return { name: spec.slice(0, at), version: spec.slice(at + 1) };
}

/** Build a Package URL for an npm-registry component. */
function purl(name: string, version: string): string {
  // The name is percent-encoded per the purl spec, but the `/` separating an npm scope
  // from the package name is structural and must survive encoding.
  return `pkg:npm/${encodeURIComponent(name).replace(/%40/g, '@').replace(/%2F/gi, '/')}@${version}`;
}

function to_hashes(integrity: string | undefined): Array<{ alg: string, content: string }> | undefined {
  if (integrity === undefined) return undefined;
  const [algorithm, value] = integrity.split('-', 2);
  if (algorithm === undefined || value === undefined) return undefined;
  const alg = { sha256: 'SHA-256', sha384: 'SHA-384', sha512: 'SHA-512' }[algorithm];
  if (alg === undefined) return undefined;
  // CycloneDX expects hex; npm integrity strings are base64.
  return [{ alg, content: Buffer.from(value, 'base64').toString('hex') }];
}

const output_path = Bun.argv[2] ?? 'dist-artifacts/sbom.cdx.json';

const pkg = (await Bun.file('package.json').json()) as {
  dependencies?: Record<string, string>,
  description?: string,
  devDependencies?: Record<string, string>,
  license?: string,
  name: string,
  repository?: { url?: string },
  version: string
};

const lock = parse_lockfile(await Bun.file('bun.lock').text()) as { packages?: Record<string, [string, ...unknown[]]> };

// Every entry in the lockfile that is not the workspace root itself.
const installed = new Map<string, LockfilePackage>();
for (const [key, entry] of Object.entries(lock.packages ?? {})) {
  const spec = entry[0];
  if (typeof spec !== 'string') continue;
  const { name, version } = split_spec(spec);
  // The integrity hash is the last element when present.
  const last = entry[entry.length - 1];
  const integrity = typeof last === 'string' && last.includes('-') ? last : undefined;
  installed.set(key, integrity === undefined ? { name, version } : { integrity, name, version });
}

// `dependencies` is absent entirely — this package has no runtime dependencies, which is
// the single most important fact this document records. Everything installed is tooling.
const runtime_names = new Set(Object.keys(pkg.dependencies ?? {}));
const dev_names = new Set(Object.keys(pkg.devDependencies ?? {}));

const components: CycloneDxComponent[] = [];
for (const [key, entry] of installed) {
  // Direct devDependencies are `required` for a build; everything else reached only
  // through them is transitive tooling and is marked `excluded` from the published
  // artifact, since none of it ships.
  const direct = dev_names.has(key) || runtime_names.has(key);
  const hashes = to_hashes(entry.integrity);
  const component: CycloneDxComponent = {
    'bom-ref': purl(entry.name, entry.version),
    name: entry.name,
    purl: purl(entry.name, entry.version),
    scope: runtime_names.has(key) ? 'required' : direct ? 'optional' : 'excluded',
    type: 'library',
    version: entry.version
  };
  if (hashes !== undefined) component.hashes = hashes;
  components.push(component);
}

components.sort((a, b) => a.purl.localeCompare(b.purl));

const repository = pkg.repository?.url?.replace(/^git\+/, '').replace(/\.git$/, '');

const sbom = {
  bomFormat: 'CycloneDX',
  specVersion: '1.6',
  version: 1,
  metadata: {
    // No timestamp: a byte-reproducible SBOM lets a verifier confirm that the document
    // for a given commit is unchanged. The release it belongs to is dated by its tag.
    lifecycles: [{ phase: 'build' }],
    tools: { components: [{ name: 'sbom.ts', type: 'application', version: pkg.version }] },
    component: {
      'bom-ref': purl(pkg.name, pkg.version),
      type: 'library',
      name: pkg.name,
      version: pkg.version,
      ...(pkg.description === undefined ? {} : { description: pkg.description }),
      ...(pkg.license === undefined ? {} : { licenses: [{ expression: pkg.license }] }),
      purl: purl(pkg.name, pkg.version),
      ...(repository === undefined ? {} : { externalReferences: [{ type: 'vcs', url: repository }] })
    }
  },
  components,
  dependencies: [
    // The published package depends on nothing at runtime. Stating this explicitly is
    // more useful than omitting the section, which a consumer cannot distinguish from
    // "not analysed".
    { ref: purl(pkg.name, pkg.version), dependsOn: [] }
  ]
};

await Bun.write(output_path, `${JSON.stringify(sbom, null, 2)}\n`);

const runtime_count = components.filter((c) => c.scope === 'required').length;
console.log(`SBOM written to ${output_path}: ${components.length} components catalogued, ${runtime_count} shipped at runtime.`);
