import { createZip } from '.';
import { writeFileSync } from 'fs';
import { execFileSync } from 'child_process';
import { webcrypto as crypto } from 'crypto';  // for older Node versions

const testStr = "The quick brown fox jumps over the lazy dog.\n";

function makeTestData() {
  const rawFiles = [];
  let i = 0;
  do {
    i++;
    const maxDataLength = [16, 1024, 65536][Math.floor(Math.random() * 3)];
    const dataLength = Math.floor(Math.random() * maxDataLength);
    let data;
    if (Math.random() < .5) {
      data = testStr.repeat(Math.ceil(dataLength / testStr.length)).slice(0, dataLength);
    } else {
      data = new Uint8Array(dataLength);
      crypto.getRandomValues(data as Uint8Array);
    }
    rawFiles.push({
      path: `f_${i}.${typeof data === 'string' ? 'txt' : 'dat'}`,  // .dat and not .bin, because Macs try to extract .bin files!
      data,
    });
  } while (Math.random() < 0.667);
  return rawFiles;
}

function makeTestZip(compress: boolean, makeReadFn: undefined | typeof byteByByteReadFn) {
  return createZip(makeTestData(), compress, makeReadFn);
}

function byteByByteReadFn(dataIn: Uint8Array) {
  const
    cs = new CompressionStream('gzip'),
    writer = cs.writable.getWriter(),
    reader = cs.readable.getReader();

  writer.write(dataIn);
  writer.close();

  let
    buffer: Uint8Array | undefined,
    bufferIndex: number;

  return async () => {
    if (buffer !== undefined && bufferIndex < buffer.byteLength) {
      return { value: buffer.subarray(bufferIndex, ++bufferIndex), done: false };
    }
    const { value, done } = await reader.read();
    if (done) {
      return { value, done };

    } else {
      buffer = value as Uint8Array;
      bufferIndex = 0;
      return { value: buffer.subarray(bufferIndex, ++bufferIndex), done: false };
    }
  }
}

function singleChunkReadFn(dataIn: Uint8Array) {
  const
    cs = new CompressionStream('gzip'),
    writer = cs.writable.getWriter(),
    reader = cs.readable.getReader();

  writer.write(dataIn);
  writer.close();

  let
    buffer = new Uint8Array(),
    returned = false;

  return async () => {
    if (returned) {
      return { value: undefined as any, done: true };
    }
    for (; ;) {
      const { value, done } = await reader.read();
      if (done) {
        returned = true;
        return { value: buffer, done: false };
      }
      const newBuffer = new Uint8Array(buffer.byteLength + value.byteLength);
      newBuffer.set(buffer);
      newBuffer.set(value, buffer.byteLength);
      buffer = newBuffer;
    }
  }
}

async function test() {
  for (const compress of [false, true]) {
    console.log('compress:', compress);
    for (const makeReadFn of [byteByByteReadFn, singleChunkReadFn, undefined]) {
      console.log('  read function:', makeReadFn?.name);
      for (let i = 0; i < 1000; i++) {
        const zip = await makeTestZip(compress, makeReadFn);
        const file = `testfiles/z_${i}.zip`;
        writeFileSync(file, zip);
        execFileSync('/usr/bin/unzip', ['-t', file]);  // throws error on non-zero exit
      }
    }
  }
}

test();
