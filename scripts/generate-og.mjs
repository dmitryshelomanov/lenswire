#!/usr/bin/env node
/**
 * Open Graph / social preview card: website/public/og.png (1200×630)
 */
import { Buffer } from 'node:buffer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'website/public/og.png');

const FROM = '#0B3D91';
const TO = '#00B4D8';
const W = 1200;
const H = 630;
const ICON = 220;

const iconRaw = await sharp(path.join(ROOT, 'assets/images/icon.png'))
  .resize(ICON, ICON, { fit: 'contain' })
  .png()
  .toBuffer();

const roundedMask = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg width="${ICON}" height="${ICON}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${ICON}" height="${ICON}" rx="48" ry="48" fill="#fff"/>
</svg>`);

const icon = await sharp(iconRaw)
  .composite([{ input: roundedMask, blend: 'dest-in' }])
  .png()
  .toBuffer();

const svg = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${FROM}"/>
      <stop offset="100%" stop-color="${TO}"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#g)"/>
  <text x="600" y="390" text-anchor="middle" fill="#FFFFFF" font-family="Georgia, 'Times New Roman', Times, serif" font-size="72" font-weight="700" letter-spacing="-1.5">Lenswire</text>
  <text x="600" y="460" text-anchor="middle" fill="#FFFFFF" font-family="Helvetica, Arial, sans-serif" font-size="28" opacity="0.9">Local HTTP(S) inspector · iOS &amp; Android</text>
  <text x="600" y="510" text-anchor="middle" fill="#FFFFFF" font-family="Helvetica, Arial, sans-serif" font-size="22" opacity="0.72">Free and open source</text>
</svg>`);

await sharp(svg)
  .composite([{ input: icon, left: Math.round((W - ICON) / 2), top: 110 }])
  .png()
  .toFile(OUT);

const meta = await sharp(OUT).metadata();
console.log(`wrote website/public/og.png (${meta.width}×${meta.height})`);
