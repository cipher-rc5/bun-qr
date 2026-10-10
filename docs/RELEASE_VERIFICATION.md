# Verifying a release

The release workflow uses Bun 1.4.2, enforces the supported toolchain and local validation gates,
and checks the tag against `package.json`. It packs once and verifies the resulting archive's public imports
and TypeScript declarations from a clean consumer. It generates SHA-256 checksums and a CycloneDX SBOM,
then uses the immutable-pinned [GitHub attestation action](https://github.com/actions/attest)
to create signed SLSA build provenance for that archive. Bun publishes the same archive bytes.

GitHub Releases include the tarball, `SHA256SUMS.txt`, `sbom.cdx.json`, and `provenance.sigstore.json`.
The SBOM inventories development/build dependencies and labels them separately from shipped runtime dependencies
(there are none). The attestation is GitHub/Sigstore provenance; it does not claim npm registry provenance.

After downloading these files from the same release, check their contents with:

```sh
shasum -a 256 -c SHA256SUMS.txt
gh attestation verify bun-qr-0.2.0.tgz \
  --repo cipher-rc5/bun-qr \
  --signer-workflow cipher-rc5/bun-qr/.github/workflows/release.yml \
  --deny-self-hosted-runners \
  --bundle provenance.sigstore.json
```

Replace the archive name with the version being checked. The checksum detects changed bytes;
the attestation verifies the archive digest, signed provenance and expected repository/workflow identity.
The [GitHub CLI verification reference](https://cli.github.com/manual/gh_attestation_verify) describes these controls.
The package can also be checked locally from a repository checkout with built declarations and development tools:

```sh
bun run build
bun run verify:package /absolute/path/to/bun-qr-0.2.0.tgz
```

## First release validation

Attestation signing requires GitHub Actions OIDC and the repository's `attestations: write` permission.
The workflow requests both, verifies that a nonempty bundle was produced, and fails before publishing if signing fails.
This integration is exercised by the tag-triggered release job, not by local tests. Maintainers should verify the
first released archive with the commands above and confirm its attestation appears in the repository's attestations API.
Release execution also requires the configured registry token. Local success does not prove remote credentials,
branch protection or release execution status.
