import { initWasm, decompressToBuffer } from "https://cdn.jsdelivr.net/npm/lzma-wasm@1.0.7/dist/esm/index.js";

self.onmessage = async function (event) {
  const input = event.data;
  try {
    if (!input || !(input.buffer instanceof ArrayBuffer) || !Number.isSafeInteger(input.expectedSize)) {
      throw new Error("La petición del worker XZ no es válida.");
    }
    await initWasm();
    const compressed = new Uint8Array(input.buffer);
    const output = new Uint8Array(input.expectedSize);
    const written = decompressToBuffer(compressed, output);
    if (!Number.isInteger(written) || written !== input.expectedSize) {
      throw new Error("XZ produjo " + written + " bytes; el índice indica " + input.expectedSize + ".");
    }
    self.postMessage({ ok: true, buffer: output.buffer }, [output.buffer]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    self.postMessage({ ok: false, error: message });
  }
};
