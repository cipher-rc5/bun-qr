// file: src/dom.ts
// description: Browser and DOM utilities for QR scanning
// reference: https://github.com/cipher-rc5/bun-qr

// Get element dimensions from computed style
export const get_size = (elm: HTMLElement): { width: number, height: number } => {
  const css = getComputedStyle(elm);
  const width = parseFloat(css.width);
  const height = parseFloat(css.height);
  if (!isFinite(width) || width <= 0) {
    throw new Error(
      `get_size: could not read element width (got "${css.width}"). Ensure the element is attached to the DOM and has a resolved layout.`
    );
  }
  if (!isFinite(height) || height <= 0) {
    throw new Error(
      `get_size: could not read element height (got "${css.height}"). Ensure the element is attached to the DOM and has a resolved layout.`
    );
  }
  return { width: Math.floor(width), height: Math.floor(height) };
};

// Canvas options for QR display
export type QRCanvasOpts = {
  result_block_size: number,
  overlay_main_color: string,
  overlay_finder_color: string,
  overlay_side_color: string,
  overlay_timeout: number,
  crop_to_square: boolean,
  text_decoder?: (bytes: Uint8Array) => string
};

// Canvas elements for QR operations
export type QRCanvasElements = { overlay?: HTMLCanvasElement, bitmap?: HTMLCanvasElement, result_qr?: HTMLCanvasElement };

// QR Canvas handler class
export class QRCanvas {
  constructor (_elements?: QRCanvasElements, _opts?: Partial<QRCanvasOpts>) {
    throw new Error('QRCanvas not yet implemented. Coming soon!');
  }
}

// Frame loop utility
export function frame_loop(cb: FrameRequestCallback): () => void {
  let handle: number | undefined = undefined;
  function loop(ts: number) {
    cb(ts);
    handle = requestAnimationFrame(loop);
  }
  handle = requestAnimationFrame(loop);
  return (): void => {
    if (handle === undefined) return;
    cancelAnimationFrame(handle);
    handle = undefined;
  };
}

// Convert SVG to PNG data URL
export function svg_to_png(svg_data: string, width: number, height: number): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!(Number.isSafeInteger(width) && Number.isSafeInteger(height) && width > 0 && height > 0 && width < 8192 && height < 8192)) {
      return reject(new Error('invalid width and height: ' + width + ' ' + height));
    }

    const dom_parser = new DOMParser();
    const doc = dom_parser.parseFromString(svg_data, 'image/svg+xml');
    const svg_element = doc.documentElement;

    svg_element.setAttribute('width', String(width));
    svg_element.setAttribute('height', String(height));

    const rect = doc.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('width', '100%');
    rect.setAttribute('height', '100%');
    rect.setAttribute('fill', 'white');
    svg_element.insertBefore(rect, svg_element.firstChild);

    const serializer = new XMLSerializer();
    const source = serializer.serializeToString(doc);
    const img = new Image();

    img.src = 'data:image/svg+xml,' + encodeURIComponent(source);
    img.onload = function() {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('was not able to create 2d context'));
      ctx.drawImage(img, 0, 0, width, height);
      const data_url = canvas.toDataURL('image/png');
      resolve(data_url);
    };
    img.onerror = reject;
  });
}

export default QRCanvas;
