// file: examples/basic.ts
// description: Basic QR code generation examples

import encode_qr from '../src/index';

console.log('=== Basic QR Code Examples ===\n');

// 1. Simple text QR code
console.log('1. Simple Text QR Code:');
const text_qr = encode_qr('Hello, World!', 'ascii');
console.log(text_qr);

// 2. SVG format
console.log('\n2. Generating SVG QR code...');
const svg_qr = encode_qr('https://example.com', 'svg');
await Bun.write('examples/output/basic_qr.svg', svg_qr);
console.log('✓ Saved to: examples/output/basic_qr.svg');

// 3. Terminal format with colors
console.log('\n3. Terminal QR Code:');
const term_qr = encode_qr('Scan me!', 'term');
console.log(term_qr);

// 4. GIF format
console.log('\n4. Generating GIF QR code...');
const gif_qr = encode_qr('QR Code in GIF format', 'gif', { scale: 4 });
await Bun.write('examples/output/basic_qr.gif', gif_qr);
console.log('✓ Saved to: examples/output/basic_qr.gif');

// 5. Raw format (2D boolean array)
console.log('\n5. Raw Format (2D array):');
const raw_qr = encode_qr('Raw data', 'raw');
console.log(`Dimensions: ${raw_qr.length}x${raw_qr[0]?.length ?? 0}`);
console.log('First row:', raw_qr[0]?.slice(0, 10), '...');

// 6. Different error correction levels
console.log('\n6. Error Correction Levels:');
const ecc_low = encode_qr('Low ECC', 'svg', { ecc: 'low' });
const ecc_medium = encode_qr('Medium ECC', 'svg', { ecc: 'medium' });
const ecc_quartile = encode_qr('Quartile ECC', 'svg', { ecc: 'quartile' });
const ecc_high = encode_qr('High ECC', 'svg', { ecc: 'high' });
console.log('✓ Generated QR codes with all ECC levels');

// 7. Custom border and scale
console.log('\n7. Custom Options:');
const custom_qr = encode_qr('Custom styling', 'svg', { border: 4, scale: 8, ecc: 'medium' });
await Bun.write('examples/output/custom_style_qr.svg', custom_qr);
console.log('✓ Saved custom styled QR: examples/output/custom_style_qr.svg');

console.log('\n=== All basic examples completed! ===');
