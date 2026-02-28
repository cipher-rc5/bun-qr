# bun-qr Project Structure

```
bun-qr/
├──  package.json                 # Bun-optimized package configuration
├──  tsconfig.json                # TypeScript configuration for Bun
├──  README.md                    # Project documentation
├──  .gitignore                   # Git ignore patterns
├──  TREE.md                      # This file - project structure
│
├──  src/                         # Source code
│   ├──  index.ts                 # Main QR encoder (snake_case API)
│   ├──  decode.ts                # QR decoder module (TODO)
│   └──  dom.ts                   # Browser/DOM utilities (TODO)
│
├──  examples/                    # Usage examples
│   ├──  basic.ts                 # Basic encoding examples
│   └──  output/                  # Example output directory
│
├──  test/                        # Test suite
│   ├──  index.test.ts            # Unit tests (TODO)
│   └──  fixtures/                # Test fixtures (TODO)
│
└──  dist/                        # Build output (generated)
    └──  index.js                 # Compiled bundle

Key Changes from Original:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✓ Runtime: Node.js → Bun (native APIs)
✓ API Style: camelCase → snake_case (Rust compatibility)
✓ Text Encoding: TextEncoder (Bun native)
✓ File I/O: fs/promises → Bun.write/Bun.file
✓ Package Manager: npm → bun
✓ Build System: tsc → bun build
✓ Test Runner: node → bun test
✓ Zero dependencies maintained
```

## Module Overview

### Core Modules

**src/index.ts**

- Main QR code encoder
- Exports: `encode_qr()`, `Bitmap`, `utils`
- Optimized for Bun runtime
- Snake_case naming convention
- Zero external dependencies

**src/decode.ts** (Planned)

- QR code decoder/reader
- Image processing utilities
- Pattern detection algorithms

**src/dom.ts** (Planned)

- Browser canvas integration
- Camera access for QR scanning
- DOM manipulation helpers

### Performance Optimizations

1. **Bun Native APIs**
   - Direct use of Bun's TextEncoder/TextDecoder
   - Optimized file I/O with Bun.write/Bun.file
   - Fast TypeScript compilation

2. **Memory Efficiency**
   - Uint8Array for byte operations
   - Efficient bitmap representation
   - Minimal memory allocations

3. **Algorithm Optimizations**
   - Galois Field lookup tables
   - Reed-Solomon error correction
   - Optimized penalty calculations

## Usage

```bash
# Install dependencies
bun install

# Run examples
bun run examples/basic.ts

# Run tests
bun test

# Build for production
bun run build
```

## File Header Template

All source files use this template:

```typescript
// file: {file_path}
// description: {description}
// reference: {reference}
```
