# Security Policy

## Scope

**bun-qr** is a Bun-only QR code encoder and CLI. The encoder and link helpers format caller-supplied data
(URLs, WiFi credentials, vCard data, plain text) without built-in network or filesystem access.
The CLI writes output files and creates parent directories; without `--force`, destination creation is exclusive
and refuses existing files or links. Development and release tooling installs packages and communicates with registries and GitHub.

A custom `text_encoder` is caller-provided code that receives raw input. Keep it a pure byte conversion.
The general encoder accepts arbitrary text; HTTP/HTTPS restrictions apply to the URL helper and CLI, rather than all QR payloads.
Helper validation does not establish that a URL, WiFi network, contact, or payment recipient is trustworthy.
vCard/calendar free-text validation and geo serialization have current limits documented in
[LINK_ENCODING.md](docs/LINK_ENCODING.md). Consumers should validate fields for their receiving application.

Security issues relevant to this library include:

- Input validation bypasses that allow malicious payloads to be embedded silently
- Memory exhaustion via unbounded output sizes
- Denial-of-service vectors in the encoding pipeline
- CLI overwrite-protection bypasses and unsafe output path handling
- Package, toolchain, or release-artifact integrity failures

## Supported Versions

| Version | Supported |
| ------- | --------- |
| 0.2.x   | ✅        |

While the package is pre-1.0, only the latest minor version receives security fixes.

## Reporting a Vulnerability

Please **do not** open a public GitHub issue for security vulnerabilities.

Report security issues via [GitHub Private Security Advisories](https://github.com/cipher-rc5/bun-qr/security/advisories/new).

If private advisories are disabled, unavailable to you, or you receive no acknowledgement
within the window below, fall back to contacting the maintainer directly through the contact
details listed on the [repository owner's GitHub profile](https://github.com/cipher-rc5).
Please state that the message concerns a security vulnerability in `bun-qr`, and do not
include exploit details in a public channel such as an issue, discussion, or pull request.

Include:

- A description of the vulnerability and its potential impact
- Steps to reproduce (minimal code sample preferred)
- Any suggested mitigations

You can expect an acknowledgement within **72 hours** and a resolution or status update within **14 days**.

## Disclosure Policy

Once a fix is available, a coordinated disclosure will be made via a GitHub Security Advisory. The advisory will credit the reporter unless anonymity is requested.
