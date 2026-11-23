// Tiny PNG writer (RGBA, no dependencies) used by all the tools here; pngread.cjs reads.
const zlib = require('zlib')

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 255] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}

// rgba: Uint8Array of w*h*4. { small: true } picks the best PNG row filter for each
// row: same pixels, much smaller files for big images (used for the art/ sources)
function encodePng(w, h, rgba, opts = {}) {
  const stride = w * 4
  const raw = Buffer.alloc((stride + 1) * h)
  for (let y = 0; y < h; y++) {
    const row = rgba.subarray(y * stride, (y + 1) * stride)
    if (!opts.small) {
      raw[y * (stride + 1)] = 0
      Buffer.from(row.buffer, row.byteOffset, stride).copy(raw, y * (stride + 1) + 1)
      continue
    }
    const up = y ? rgba.subarray((y - 1) * stride, y * stride) : null
    let best = null
    let bestScore = Infinity
    for (let f = 0; f < 5; f++) {
      const out = Buffer.alloc(stride)
      let score = 0
      for (let x = 0; x < stride; x++) {
        const a = x >= 4 ? row[x - 4] : 0
        const b = up ? up[x] : 0
        const c = up && x >= 4 ? up[x - 4] : 0
        let p = 0
        if (f === 1) p = a
        else if (f === 2) p = b
        else if (f === 3) p = (a + b) >> 1
        else if (f === 4) {
          const q = a + b - c
          const pa = Math.abs(q - a), pb = Math.abs(q - b), pc = Math.abs(q - c)
          p = pa <= pb && pa <= pc ? a : pb <= pc ? b : c
        }
        const v = (row[x] - p) & 255
        out[x] = v
        score += v < 128 ? v : 256 - v
      }
      if (score < bestScore) {
        bestScore = score
        best = [f, out]
      }
    }
    raw[y * (stride + 1)] = best[0]
    best[1].copy(raw, y * (stride + 1) + 1)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

module.exports = { encodePng }
