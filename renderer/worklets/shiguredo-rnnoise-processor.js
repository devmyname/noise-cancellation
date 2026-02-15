/**
 * Shiguredo RNNoise AudioWorklet Processor
 * 
 * Runs the @shiguredo/rnnoise-wasm v2025.1.5 WASM binary directly
 * inside an AudioWorklet.
 * 
 * Because 480 % 128 ≠ 0, naive input/output buffering can create periodic
 * zero-gaps and produce robotic artifacts.
 * 
 * Instead, it uses the proven shared ring-buffer technique from
 * @sapphi-red/web-noise-suppressor:
 *   - 1920 samples (4×480) shared ring buffer
 *   - Input writes and output reads happen in the same buffer with fixed latency
 *   - Processing is triggered 4 times over 15 blocks (perfect alignment)
 *   - ~13ms additional latency, zero artifacts
 */

class ShiguredoRNNoiseProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();

    this.ready = false;
    this.destroyed = false;

    // Constants
    this.BLOCK_SIZE = 128;
    this.FRAME_SIZE = 480;
    this.RING_SIZE = 1920;  // 4 × 480 — 4 frame'i tam kaplar

    // Shared ring buffer: input is written, processed in-place, then read as output
    this.ring = new Float32Array(this.RING_SIZE);
    this.writePos = 0;

    // Processing read position — start around the middle of the ring
    this.processReadPos = this.RING_SIZE - this.FRAME_SIZE * 2; // 960

    // Output delay offset
    // (floor(480/128)+1)*128 + 128 = 640 örnek ≈ 13.3ms
    this.OUTPUT_DELAY = (Math.floor(this.FRAME_SIZE / this.BLOCK_SIZE) + 1)
      * this.BLOCK_SIZE + this.BLOCK_SIZE; // 640

    // Port messages
    this.port.onmessage = (e) => {
      if (e.data === 'destroy') {
        this._destroy();
      }
    };

    // Create a synchronous instance from the WASM module
    try {
      const wasmModule = options.processorOptions.wasmModule;
      const wasmBinary = options.processorOptions.wasmBinary;
      if (!wasmModule && !wasmBinary) {
        console.error('[ShiguredoRNNoise] wasmModule or wasmBinary not provided');
        return;
      }
      this._initWasm(wasmModule, wasmBinary);
    } catch (err) {
      console.error('[ShiguredoRNNoise] Init error:', err);
    }
  }

  _initWasm(wasmModule, wasmBinary) {
    // If a precompiled module isn't provided, compile from the binary.
    const module = wasmModule || new WebAssembly.Module(wasmBinary);

    // WASM manages its own memory (exports.memory).
    // emscripten_resize_heap is wired after the instance is created.
    let wasmMemoryRef = null;

    const envFuncs = {
      __assert_fail: (condition, filename, line, func) => {
        console.error('[ShiguredoRNNoise] assert fail');
      },
      emscripten_resize_heap: (requestedSize) => {
        try {
          if (!wasmMemoryRef) return 0;
          const currentPages = wasmMemoryRef.buffer.byteLength / 65536;
          const neededPages = Math.ceil(requestedSize / 65536);
          const growBy = neededPages - currentPages;
          if (growBy > 0) {
            wasmMemoryRef.grow(growBy);
          }
          return 1;
        } catch (e) {
          return 0;
        }
      },
      fd_write: (fd, iov, iovcnt, pnum) => {
        // Stub: ignore WASM console output
        return 0;
      }
    };

    const imports = {
      env: envFuncs,
      wasi_snapshot_preview1: {
        fd_write: envFuncs.fd_write
      }
    };

    const instance = new WebAssembly.Instance(module, imports);
    this.exports = instance.exports;

    // Use WASM's own memory export
    this.wasmMemory = this.exports.memory;
    wasmMemoryRef = this.wasmMemory;

    // Initialize stack
    if (this.exports.emscripten_stack_init) {
      this.exports.emscripten_stack_init();
    }
    if (this.exports.__wasm_call_ctors) {
      this.exports.__wasm_call_ctors();
    }

    // Validate frame size
    const frameSize = this.exports.rnnoise_get_frame_size();
    if (frameSize !== this.FRAME_SIZE) {
      console.warn('[ShiguredoRNNoise] Unexpected frame size:', frameSize);
      this.FRAME_SIZE = frameSize;
      this.RING_SIZE = this.FRAME_SIZE * 4;
      this.ring = new Float32Array(this.RING_SIZE);
      this.processReadPos = this.RING_SIZE - this.FRAME_SIZE * 2;
      this.OUTPUT_DELAY = (Math.floor(this.FRAME_SIZE / this.BLOCK_SIZE) + 1)
        * this.BLOCK_SIZE + this.BLOCK_SIZE;
    }

    // Create DenoiseState
    this.state = this.exports.rnnoise_create(0); // 0 = default model
    if (!this.state) {
      console.error('[ShiguredoRNNoise] rnnoise_create failed');
      return;
    }

    // Allocate PCM buffers (float32 = 4 bytes per sample)
    this.pcmInputPtr = this.exports.malloc(this.FRAME_SIZE * 4);
    this.pcmOutputPtr = this.exports.malloc(this.FRAME_SIZE * 4);

    if (!this.pcmInputPtr || !this.pcmOutputPtr) {
      console.error('[ShiguredoRNNoise] malloc failed');
      return;
    }

    this.ready = true;
  }

  _destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.ready = false;

    if (this.exports && this.state) {
      try {
        this.exports.rnnoise_destroy(this.state);
        if (this.pcmInputPtr) this.exports.free(this.pcmInputPtr);
        if (this.pcmOutputPtr) this.exports.free(this.pcmOutputPtr);
      } catch (e) {}
    }
    this.state = 0;
    this.pcmInputPtr = 0;
    this.pcmOutputPtr = 0;
  }

  /**
   * Processes 480 samples in-place at the specified ring-buffer position.
   * Input:  ring[pos..pos+479] (float32 -1..1)
   * Output: written back to the same location
   */
  _processFrameInPlace(pos) {
    // WASM memory can change due to memory.grow; grab a fresh view each time
    const heap = new Float32Array(this.wasmMemory.buffer);
    const inOffset = this.pcmInputPtr / 4;
    const outOffset = this.pcmOutputPtr / 4;

    // Ring → WASM input (×32767 PCM scaling)
    for (let i = 0; i < this.FRAME_SIZE; i++) {
      heap[inOffset + i] = this.ring[pos + i] * 32767.0;
    }

    // Run RNNoise
    this.exports.rnnoise_process_frame(
      this.state,
      this.pcmOutputPtr,
      this.pcmInputPtr
    );

    // WASM output → Ring (÷32767 scaling, overwrite in-place)
    for (let i = 0; i < this.FRAME_SIZE; i++) {
      this.ring[pos + i] = heap[outOffset + i] / 32767.0;
    }
  }

  process(inputs, outputs) {
    if (this.destroyed) return false;

    const input = inputs[0]?.[0];
    const output = outputs[0]?.[0];
    if (!output) return true;

    // If not ready yet, pass audio through (bypass)
    if (!this.ready || !input) {
      if (input) output.set(input);
      else output.fill(0);
      return true;
    }

    // Step 1: Write the input block into the ring buffer
    this.ring.set(input, this.writePos);

    // Step 2: Advance write position
    this.writePos = (this.writePos + this.BLOCK_SIZE) % this.RING_SIZE;

    // Step 3: Check processing trigger points
    // Over 15 blocks (1920 samples), 4 frames are processed:
    //   writePos = 128, 512, 1024, 1536
    if (this.writePos === 128 || this.writePos === 512 ||
        this.writePos === 1024 || this.writePos === 1536) {
      this.processReadPos = (this.processReadPos + this.FRAME_SIZE) % this.RING_SIZE;
      this._processFrameInPlace(this.processReadPos);
    }

    // Step 4: Read output from the ring buffer with a fixed delay
    const readPos = (this.writePos + (this.RING_SIZE - this.OUTPUT_DELAY)) % this.RING_SIZE;
    output.set(this.ring.subarray(readPos, readPos + this.BLOCK_SIZE));

    return true;
  }
}

registerProcessor('shiguredo-rnnoise', ShiguredoRNNoiseProcessor);
