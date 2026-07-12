import sharp from 'sharp';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

function createIco(pngData, sizes) {
  const count = sizes.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // ICO type
  header.writeUInt16LE(count, 4); // image count

  const dirEntrySize = 16;
  const dirOffset = 6;
  let dataOffset = dirOffset + count * dirEntrySize;
  const entries = [];
  const allData = [];

  for (const size of sizes) {
    const w = size === 256 ? 0 : size;
    const h = size === 256 ? 0 : size;
    const entry = Buffer.alloc(dirEntrySize);
    entry.writeUInt8(w, 0); // width
    entry.writeUInt8(h, 1); // height
    entry.writeUInt8(0, 2); // colors
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // planes
    entry.writeUInt16LE(32, 6); // bpp
    entry.writeUInt32LE(pngData.length, 8); // size
    entry.writeUInt32LE(dataOffset, 12); // offset
    dataOffset += pngData.length;
    entries.push(entry);
    allData.push(pngData);
  }

  return Buffer.concat([header, ...entries, ...allData]);
}

async function main() {
  const svgPath = join(root, 'public', 'logo.svg');
  const outDir = join(root, 'build');
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  const svg = readFileSync(svgPath, 'utf-8');

  // Generate 512x512 PNG icon
  await sharp(Buffer.from(svg))
    .resize(512, 512)
    .png()
    .toFile(join(outDir, 'icon.png'));
  console.log('Generated build/icon.png (512x512)');

  // Generate 256x256 PNG for ICO
  const png256 = await sharp(Buffer.from(svg))
    .resize(256, 256)
    .png()
    .toBuffer();

  // Create ICO with 256x256 PNG
  const ico = createIco(png256, [256]);
  writeFileSync(join(outDir, 'icon.ico'), ico);
  console.log('Generated build/icon.ico (256x256)');

  console.log('Done!');
}

main().catch(console.error);
