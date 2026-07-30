#!/usr/bin/env node
/**
 * Marketing / store screenshots for Lenswire.
 * Colorful gradients per frame.
 * Output: docs/store-screenshots/*.png at 1290×2796
 * Also writes README docs/images/ and website/public/screenshots/*.jpg
 */
import { Buffer } from 'node:buffer';
import { copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'docs/store-screenshots/src');
const OUT = path.join(ROOT, 'docs/store-screenshots');
const README_IMAGES = path.join(ROOT, 'docs/images');
const WEB_SHOTS = path.join(ROOT, 'website/public/screenshots');

const W = 1290;
const H = 2796;
const BEZEL = '#0A0A0A';

const PAD_X = 96;
const CAPTION_TOP = 120;
const PHONE_TOP = 620;
const PHONE_SIDE = 110;
const BEZEL_W = 18;
const CORNER_OUTER = 88;
const CORNER_INNER = 72;

function escapeXml(s) {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function gradientSvg(from, to, angle = 160) {
  return Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%" gradientTransform="rotate(${angle} 0.5 0.5)">
      <stop offset="0%" stop-color="${from}"/>
      <stop offset="100%" stop-color="${to}"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#g)"/>
</svg>`);
}

function captionSvg(lines, { top = CAPTION_TOP, fontSize = 92, lineHeight = 108 } = {}) {
  const tspans = lines
    .map((line, i) => {
      const dy = i === 0 ? 0 : lineHeight;
      return `<tspan x="${PAD_X}" dy="${dy}">${escapeXml(line)}</tspan>`;
    })
    .join('');

  return Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <text
    y="${top}"
    fill="#FFFFFF"
    font-family="Georgia, 'Times New Roman', Times, serif"
    font-size="${fontSize}"
    font-weight="700"
    letter-spacing="-1.5"
  >${tspans}</text>
</svg>`);
}

function coverTitleSvg() {
  return Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <text
    x="${W / 2}"
    y="1680"
    text-anchor="middle"
    fill="#FFFFFF"
    font-family="Georgia, 'Times New Roman', Times, serif"
    font-size="110"
    font-weight="700"
    letter-spacing="-2"
  >Lenswire</text>
  <text
    x="${PAD_X}"
    y="1980"
    fill="#FFFFFF"
    font-family="Georgia, 'Times New Roman', Times, serif"
    font-size="84"
    font-weight="700"
    letter-spacing="-1.5"
  >
    <tspan x="${PAD_X}" dy="0">Local HTTP(S)</tspan>
    <tspan x="${PAD_X}" dy="100">inspector.</tspan>
  </text>
</svg>`);
}

async function gradientBg(from, to, angle) {
  return sharp(gradientSvg(from, to, angle)).png().toBuffer();
}

async function makePhoneScreen(screenshotPath) {
  const phoneW = W - PHONE_SIDE * 2;
  const phoneH = Math.round(phoneW * (19.5 / 9));
  const screenW = phoneW - BEZEL_W * 2;
  const screenH = phoneH - BEZEL_W * 2;

  const screenMask = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg width="${screenW}" height="${screenH}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${screenW}" height="${screenH}" rx="${CORNER_INNER}" ry="${CORNER_INNER}" fill="#fff"/>
</svg>`);

  const screen = await sharp(screenshotPath)
    .resize(screenW, screenH, { fit: 'cover', position: 'top' })
    .composite([{ input: screenMask, blend: 'dest-in' }])
    .png()
    .toBuffer();

  const frameSvg = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg width="${phoneW}" height="${phoneH}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${phoneW}" height="${phoneH}" rx="${CORNER_OUTER}" ry="${CORNER_OUTER}" fill="${BEZEL}"/>
</svg>`);

  const framed = await sharp(frameSvg)
    .composite([{ input: screen, left: BEZEL_W, top: BEZEL_W }])
    .png()
    .toBuffer();

  const visibleH = H - PHONE_TOP + 40;
  return sharp(framed)
    .extract({
      left: 0,
      top: 0,
      width: phoneW,
      height: Math.min(phoneH, visibleH),
    })
    .png()
    .toBuffer();
}

async function composeFeature({ outName, screenshot, captionLines, from, to, angle }) {
  const bg = await gradientBg(from, to, angle);
  const phone = await makePhoneScreen(path.join(SRC, screenshot));
  const caption = captionSvg(captionLines);
  const phoneMeta = await sharp(phone).metadata();
  const left = Math.round((W - phoneMeta.width) / 2);

  await sharp(bg)
    .composite([
      { input: caption, left: 0, top: 0 },
      { input: phone, left, top: PHONE_TOP },
    ])
    .png()
    .toFile(path.join(OUT, outName));

  console.log(`wrote ${outName}`);
}

async function composeCover() {
  const bg = await gradientBg('#0B3D91', '#00B4D8', 145);
  const iconSize = 420;
  const icon = await sharp(path.join(SRC, 'icon.png'))
    .resize(iconSize, iconSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  const iconMask = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg width="${iconSize}" height="${iconSize}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${iconSize}" height="${iconSize}" rx="94" ry="94" fill="#fff"/>
</svg>`);

  const maskedIcon = await sharp(icon)
    .composite([{ input: iconMask, blend: 'dest-in' }])
    .png()
    .toBuffer();

  const title = coverTitleSvg();
  const iconLeft = Math.round((W - iconSize) / 2);

  await sharp(bg)
    .composite([
      { input: maskedIcon, left: iconLeft, top: 520 },
      { input: title, left: 0, top: 0 },
    ])
    .png()
    .toFile(path.join(OUT, '01-cover.png'));

  console.log('wrote 01-cover.png');
}

async function writeWebAndReadme(features) {
  await mkdir(README_IMAGES, { recursive: true });
  await mkdir(WEB_SHOTS, { recursive: true });

  // README: first two feature frames (raw-ish phone crops from store frames are heavy;
  // also keep clean device shots from src for README table)
  await copyFile(path.join(SRC, 'main.png'), path.join(README_IMAGES, 'lenswire-screenshot-1.png'));
  await copyFile(path.join(SRC, 'host.png'), path.join(README_IMAGES, 'lenswire-screenshot-2.png'));

  const webMap = [
    { src: 'main.png', out: 'traffic.jpg' },
    { src: 'host.png', out: 'domain.jpg' },
    { src: 'request.png', out: 'request.jpg' },
    { src: 'response.png', out: 'response.jpg' },
    { src: 'settings.png', out: 'settings.jpg' },
  ];

  for (const { src, out } of webMap) {
    await sharp(path.join(SRC, src))
      .jpeg({ quality: 88, mozjpeg: true })
      .toFile(path.join(WEB_SHOTS, out));
    console.log(`wrote website/public/screenshots/${out}`);
  }

  // Framed colorful versions for website spotlight strip
  for (const f of features) {
    const framed = path.join(OUT, f.outName);
    const webName = f.outName.replace(/\.png$/, '-framed.jpg');
    await sharp(framed)
      .resize(720, null, { withoutEnlargement: true })
      .jpeg({ quality: 85, mozjpeg: true })
      .toFile(path.join(WEB_SHOTS, webName));
    console.log(`wrote website/public/screenshots/${webName}`);
  }
}

async function main() {
  await mkdir(OUT, { recursive: true });

  await composeCover();

  const features = [
    {
      outName: '02-traffic.png',
      screenshot: 'main.png',
      captionLines: ['Capture all', 'network traffic.'],
      from: '#0B3D91',
      to: '#48CAE4',
      angle: 155,
    },
    {
      outName: '03-domain.png',
      screenshot: 'host.png',
      captionLines: ['Filter by host,', 'method, status.'],
      from: '#0077B6',
      to: '#90E0EF',
      angle: 140,
    },
    {
      outName: '04-request.png',
      screenshot: 'request.png',
      captionLines: ['Inspect HTTP(S)', 'requests.'],
      from: '#023E8A',
      to: '#00B4D8',
      angle: 170,
    },
    {
      outName: '05-response.png',
      screenshot: 'response.png',
      captionLines: ['Beautiful body', 'preview.'],
      from: '#0096C7',
      to: '#CAF0F8',
      angle: 150,
    },
    {
      outName: '06-overrides.png',
      screenshot: 'settings.png',
      captionLines: ['Mock & rewrite', 'on device.'],
      from: '#03045E',
      to: '#0077B6',
      angle: 135,
    },
  ];

  for (const f of features) {
    await composeFeature(f);
  }

  await writeWebAndReadme(features);
  console.log('done');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
