import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const publicDir = path.resolve(process.cwd(), 'public');

// Base SVG strings
const svgDark = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 70 70" width="512" height="512" fill="none">
  <!-- Blok Utama -->
  <rect x="10" y="28" width="32" height="32" rx="6" fill="#0F172A" />
  <!-- Pixel Ekstraksi Atas -->
  <rect x="28" y="10" width="14" height="14" rx="3" fill="#2563EB" />
  <!-- Pixel Ekstraksi Kanan -->
  <rect x="46" y="28" width="14" height="14" rx="3" fill="#2563EB" />
  <!-- Pixel Sudut Kanan Bawah -->
  <rect x="46" y="46" width="14" height="14" rx="3" fill="#0F172A" />
</svg>`;

const svgLight = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 70 70" width="512" height="512" fill="none">
  <!-- Blok Utama -->
  <rect x="10" y="28" width="32" height="32" rx="6" fill="#FFFFFF" />
  <!-- Pixel Ekstraksi Atas -->
  <rect x="28" y="10" width="14" height="14" rx="3" fill="#3B82F6" />
  <!-- Pixel Ekstraksi Kanan -->
  <rect x="46" y="28" width="14" height="14" rx="3" fill="#3B82F6" />
  <!-- Pixel Sudut Kanan Bawah -->
  <rect x="46" y="46" width="14" height="14" rx="3" fill="#FFFFFF" />
</svg>`;

// App icon with stylish dark onyx rounded container (perfect for WhatsApp profile / avatar)
const svgAppIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#18181B" />
      <stop offset="100%" stop-color="#09090B" />
    </linearGradient>
  </defs>
  <!-- Background Card -->
  <rect x="0" y="0" width="512" height="512" rx="112" fill="url(#bg)" />
  <rect x="2" y="2" width="508" height="508" rx="110" fill="none" stroke="#27272A" stroke-width="4" />
  
  <!-- Scaled Centered Pixel Logo -->
  <g transform="translate(96, 96) scale(4.57)">
    <rect x="10" y="28" width="32" height="32" rx="6" fill="#FFFFFF" />
    <rect x="28" y="10" width="14" height="14" rx="3" fill="#3B82F6" />
    <rect x="46" y="28" width="14" height="14" rx="3" fill="#3B82F6" />
    <rect x="46" y="46" width="14" height="14" rx="3" fill="#FFFFFF" />
  </g>
</svg>`;

/**
 * Packs multiple PNG buffers into standard multi-resolution ICO file
 */
function packIco(images: { width: number; height: number; buffer: Buffer }[]): Buffer {
  const count = images.length;
  const headerSize = 6;
  const dirEntrySize = 16;
  let offset = headerSize + count * dirEntrySize;

  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: 1 = ico
  header.writeUInt16LE(count, 4); // count

  const entries: Buffer[] = [];
  for (const img of images) {
    const entry = Buffer.alloc(dirEntrySize);
    entry.writeUInt8(img.width >= 256 ? 0 : img.width, 0);
    entry.writeUInt8(img.height >= 256 ? 0 : img.height, 1);
    entry.writeUInt8(0, 2); // color palette count
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // color planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(img.buffer.length, 8); // size of image data
    entry.writeUInt32LE(offset, 12); // offset of image data
    entries.push(entry);

    offset += img.buffer.length;
  }

  return Buffer.concat([header, ...entries, ...images.map((i) => i.buffer)]);
}

async function run() {
  console.log('Generating PNG and ICO brand assets...');

  // 1. Transparent 512x512 logo.png
  await sharp(Buffer.from(svgDark))
    .resize(512, 512)
    .png()
    .toFile(path.join(publicDir, 'logo.png'));

  // 2. Transparent 512x512 logo-white.png
  await sharp(Buffer.from(svgLight))
    .resize(512, 512)
    .png()
    .toFile(path.join(publicDir, 'logo-white.png'));

  // 3. Rounded App Icon 512x512 (ideal for avatars / social / logos)
  await sharp(Buffer.from(svgAppIcon))
    .resize(512, 512)
    .png()
    .toFile(path.join(publicDir, 'logo-app.png'));

  // 4. Apple Touch Icon 180x180
  await sharp(Buffer.from(svgAppIcon))
    .resize(180, 180)
    .png()
    .toFile(path.join(publicDir, 'apple-touch-icon.png'));

  // 5. Favicon PNGs
  const p16 = await sharp(Buffer.from(svgDark)).resize(16, 16).png().toBuffer();
  const p32 = await sharp(Buffer.from(svgDark)).resize(32, 32).png().toBuffer();
  const p48 = await sharp(Buffer.from(svgDark)).resize(48, 48).png().toBuffer();
  const p192 = await sharp(Buffer.from(svgDark)).resize(192, 192).png().toBuffer();
  const p512 = await sharp(Buffer.from(svgDark)).resize(512, 512).png().toBuffer();

  fs.writeFileSync(path.join(publicDir, 'favicon-16x16.png'), p16);
  fs.writeFileSync(path.join(publicDir, 'favicon-32x32.png'), p32);
  fs.writeFileSync(path.join(publicDir, 'favicon-192x192.png'), p192);
  fs.writeFileSync(path.join(publicDir, 'favicon-512x512.png'), p512);

  // 6. Generate real multi-resolution favicon.ico
  const icoBuffer = packIco([
    { width: 16, height: 16, buffer: p16 },
    { width: 32, height: 32, buffer: p32 },
    { width: 48, height: 48, buffer: p48 },
  ]);
  fs.writeFileSync(path.join(publicDir, 'favicon.ico'), icoBuffer);

  console.log('All image assets successfully created in /public directory!');
}

run().catch(console.error);
