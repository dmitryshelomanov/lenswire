#!/usr/bin/env node
/**
 * Bump marketing version + native build numbers in package.json / app.json.
 *
 * Usage:
 *   node scripts/bump-version.mjs [patch|minor|major]
 *   npm run version:bump
 *   npm run version:bump -- minor
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const LEVEL = (process.argv[2] ?? 'patch').toLowerCase();
if (!['patch', 'minor', 'major'].includes(LEVEL)) {
  console.error(`error: unknown bump level "${LEVEL}" (use patch|minor|major)`);
  process.exit(1);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function bumpSemver(version, level) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-.*)?$/.exec(version);
  if (!match) {
    throw new Error(`invalid semver: ${version}`);
  }
  let major = Number(match[1]);
  let minor = Number(match[2]);
  let patch = Number(match[3]);
  if (level === 'major') {
    major += 1;
    minor = 0;
    patch = 0;
  } else if (level === 'minor') {
    minor += 1;
    patch = 0;
  } else {
    patch += 1;
  }
  return `${major}.${minor}.${patch}`;
}

const packagePath = path.join(ROOT, 'package.json');
const lockPath = path.join(ROOT, 'package-lock.json');
const appPath = path.join(ROOT, 'app.json');

const pkg = readJson(packagePath);
const app = readJson(appPath);
const lock = fs.existsSync(lockPath) ? readJson(lockPath) : null;

const prevVersion = pkg.version;
const nextVersion = bumpSemver(prevVersion, LEVEL);

const prevVersionCode = Number(app.expo?.android?.versionCode ?? 0);
const nextVersionCode = prevVersionCode + 1;
const prevBuildNumber = Number.parseInt(String(app.expo?.ios?.buildNumber ?? '0'), 10);
const nextBuildNumber = String((Number.isFinite(prevBuildNumber) ? prevBuildNumber : 0) + 1);

pkg.version = nextVersion;
app.expo.version = nextVersion;
app.expo.android = { ...app.expo.android, versionCode: nextVersionCode };
app.expo.ios = { ...app.expo.ios, buildNumber: nextBuildNumber };

writeJson(packagePath, pkg);
writeJson(appPath, app);

if (lock) {
  lock.version = nextVersion;
  if (lock.packages?.['']) {
    lock.packages[''].version = nextVersion;
  }
  writeJson(lockPath, lock);
}

console.log(
  `bumped ${LEVEL}: ${prevVersion} → ${nextVersion} (android.versionCode ${nextVersionCode}, ios.buildNumber ${nextBuildNumber})`,
);
