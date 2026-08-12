# Security Policy

## Scope

**bun-qr** is a QR code encoding library. It accepts arbitrary user input (URLs, WiFi credentials, vCard data, plain text) and encodes it into QR image formats. The library does not make network requests, access the filesystem, execute user input, or connect to external services.

Security issues relevant to this library include:

- Input validation bypasses that allow malicious payloads to be embedded silently
- Memory exhaustion via unbounded output sizes
- Denial-of-service vectors in the encoding pipeline

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
