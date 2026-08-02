#!/usr/bin/env node
/**
 * Google Play assets for Lenswire.
 * - docs/play-store/feature-graphic.png (1024×500)
 * - docs/play-store/icon-512.png
 * - docs/store-screenshots/android/framed-*.png (1080×1920)
 */
import { Buffer } from 'node:buffer';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const IOS_OUT = path.join(ROOT, 'docs/store-screenshots');
const ANDROID_OUT = path.join(ROOT, 'docs/store-screenshots/android');
const PLAY = path.join(ROOT, 'docs/play-store');

const FROM = '#0B3D91';
const TO = '#00B4D8';
const W = 1080;
const H = 1920;

async function framedFromStore(name) {
  await sharp(path.join(IOS_OUT, name))
    .resize(W, H, { fit: 'cover', position: 'top' })
    .png()
    .toFile(path.join(ANDROID_OUT, `framed-${name}`));
  console.log(`wrote android/framed-${name}`);
}

async function featureGraphic() {
  const FG_W = 1024;
  const FG_H = 500;

  // Icon as rounded squircle PNG with transparent corners (no square “ears”)
  const iconMask = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg width="320" height="320" xmlns="http://www.w3.org/2000/svg">
  <rect width="320" height="320" rx="72" ry="72" fill="#fff"/>
</svg>`);
  const icon = await sharp(path.join(ROOT, 'assets/images/icon.png'))
    .resize(320, 320, { fit: 'contain' })
    .composite([{ input: await sharp(iconMask).png().toBuffer(), blend: 'dest-in' }])
    .png()
    .toBuffer();

  const svg = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg width="${FG_W}" height="${FG_H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${FROM}"/>
      <stop offset="100%" stop-color="${TO}"/>
    </linearGradient>
  </defs>
  <rect width="${FG_W}" height="${FG_H}" fill="url(#g)"/>
  <text x="420" y="220" fill="#FFFFFF" font-family="Georgia, 'Times New Roman', Times, serif" font-size="84" font-weight="700" letter-spacing="-2">Lenswire</text>
  <text x="420" y="300" fill="#FFFFFF" font-family="Georgia, 'Times New Roman', Times, serif" font-size="32" opacity="0.92">Local HTTP(S) inspector.</text>
</svg>`);

  await sharp(svg)
    .composite([{ input: icon, left: 72, top: 90 }])
    .png()
    .toFile(path.join(PLAY, 'feature-graphic.png'));
  console.log('wrote play-store/feature-graphic.png');
}

async function storeIcon() {
  await sharp(path.join(ROOT, 'assets/images/icon.png'))
    .resize(512, 512)
    .png()
    .toFile(path.join(PLAY, 'icon-512.png'));
  console.log('wrote play-store/icon-512.png');
}

async function main() {
  await mkdir(ANDROID_OUT, { recursive: true });
  await mkdir(PLAY, { recursive: true });

  await featureGraphic();
  await storeIcon();

  for (const name of [
    '02-traffic.png',
    '03-domain.png',
    '04-request.png',
    '05-response.png',
    '06-overrides.png',
  ]) {
    await framedFromStore(name);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
