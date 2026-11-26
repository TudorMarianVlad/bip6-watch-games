// Tiny PNG reader (no dependencies), the partner of png.cjs.
// Handles 8-bit greyscale, RGB, palette, greyscale+alpha and RGBA images,
// including transparency chunks (tRNS). Returns { w, h, rgba: Uint8Array }.
const fs = require('fs')
const zlib = require('zlib')

function readPng(file) {
  const buf = fs.readFileSync(file)
  if (buf[0] === 0xff && buf[1] === 0xd8) throw new Error(file + ' is really a JPEG, not a PNG. Open it in Paint and use Save as > PNG.')
  if (buf.subarray(8, 12).toString('ascii') === 'WEBP') throw new Error(file + ' is really a WEBP, not a PNG. Open it in Paint and use Save as > PNG.')
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error(file + ' is not a PNG file')
  let pos = 8
  let w = 0, h = 0, depth = 0, type = 0, interlace = 0
  let palette = null
  let trns = null
  const idat = []
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos)
    const kind = buf.toString('ascii', pos + 4, pos + 8)
    const data = buf.subarray(pos + 8, pos + 8 + len)
    if (kind === 'IHDR') {
      w = data.readUInt32BE(0)
      h = data.readUInt32BE(4)
      depth = data[8]
      type = data[9]
      interlace = data[12]
    } else if (kind === 'PLTE') palette = data
    else if (kind === 'tRNS') trns = data
    else if (kind === 'IDAT') idat.push(data)
    else if (kind === 'IEND') break
    pos += 12 + len
  }
  if (depth !== 8) throw new Error(file + ': only 8-bit PNGs are supported (this one is ' + depth + '-bit). Re-export it as 8-bit RGBA.')
  if (interlace) throw new Error(file + ': interlaced PNGs are not supported. Re-export it without interlacing.')
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[type]
  if (!channels) throw new Error(file + ': unknown PNG colour type ' + type)
  const raw = zlib.inflateSync(Buffer.concat(idat))
  const stride = w * channels
  const px = Buffer.alloc(stride * h)
  // undo the per-row filters
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)]
    const src = y * (stride + 1) + 1
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? px[y * stride + x - channels] : 0
      const b = y > 0 ? px[(y - 1) * stride + x] : 0
      const c = x >= channels && y > 0 ? px[(y - 1) * stride + x - channels] : 0
      let v = raw[src + x]
      if (f === 1) v += a
      else if (f === 2) v += b
      else if (f === 3) v += (a + b) >> 1
      else if (f === 4) {
        const p = a + b - c
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c)
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c
      }
      px[y * stride + x] = v & 255
    }
  }
  // to RGBA
  const rgba = new Uint8Array(w * h * 4)
  for (let i = 0; i < w * h; i++) {
    const o = i * 4
    const s = i * channels
    if (type === 6) {
      rgba[o] = px[s]; rgba[o + 1] = px[s + 1]; rgba[o + 2] = px[s + 2]; rgba[o + 3] = px[s + 3]
    } else if (type === 2) {
      rgba[o] = px[s]; rgba[o + 1] = px[s + 1]; rgba[o + 2] = px[s + 2]
      rgba[o + 3] = trns && trns.length >= 6 && px[s] === trns[1] && px[s + 1] === trns[3] && px[s + 2] === trns[5] ? 0 : 255
    } else if (type === 3) {
      const k = px[s]
      rgba[o] = palette[k * 3]; rgba[o + 1] = palette[k * 3 + 1]; rgba[o + 2] = palette[k * 3 + 2]
      rgba[o + 3] = trns && k < trns.length ? trns[k] : 255
    } else if (type === 4) {
      rgba[o] = rgba[o + 1] = rgba[o + 2] = px[s]; rgba[o + 3] = px[s + 1]
    } else {
      rgba[o] = rgba[o + 1] = rgba[o + 2] = px[s]
      rgba[o + 3] = trns && trns.length >= 2 && px[s] === trns[1] ? 0 : 255
    }
  }
  return { w, h, rgba }
}

module.exports = { readPng }
