#!/usr/bin/env node
/**
 * Post-prebuild: link HevSocks5Tunnel.xcframework into the Packet Tunnel target.
 * @bacons/apple-targets owns ios.xcodeProjectBeta2, so this runs after `expo prebuild`.
 *
 * NOTE: node-xcode writes unquoted array entries like `-lc++` / `$(inherited)`, which
 * CocoaPods/xcodeproj cannot parse. We always post-process the pbx text to quote them.
 */
const path = require('path');
const fs = require('fs');
const xcode = require('xcode');

const ROOT = path.join(__dirname, '..');
const TARGET_NAME = 'network-packet-tunnel';
const XCFRAMEWORK_RELATIVE = '../vendor/HevSocks5Tunnel.xcframework';

function main() {
  const xcframeworkAbs = path.join(ROOT, 'vendor/HevSocks5Tunnel.xcframework');
  if (!fs.existsSync(xcframeworkAbs)) {
    throw new Error(`Missing ${xcframeworkAbs}. See vendor/README.md`);
  }

  const projectPath = path.join(ROOT, 'ios/Lenswire.xcodeproj/project.pbxproj');
  if (!fs.existsSync(projectPath)) {
    console.warn('[link-hev-ios] ios project missing; skip (run expo prebuild first)');
    return;
  }

  const project = xcode.project(projectPath);
  project.parseSync();

  const nativeTargets = project.pbxNativeTargetSection();
  let tunnelTargetUuid = null;
  for (const [uuid, target] of Object.entries(nativeTargets)) {
    if (uuid.endsWith('_comment')) continue;
    if (typeof target !== 'object' || !target.name) continue;
    const name = String(target.name).replace(/"/g, '');
    if (name === TARGET_NAME || name === 'networkpackettunnel') {
      tunnelTargetUuid = uuid;
      break;
    }
  }
  if (!tunnelTargetUuid) {
    throw new Error(`[link-hev-ios] target "${TARGET_NAME}" not found`);
  }

  ensureFrameworkLink(project, tunnelTargetUuid);

  const configurations = project.pbxXCBuildConfigurationSection();
  for (const [uuid, conf] of Object.entries(configurations)) {
    if (uuid.endsWith('_comment')) continue;
    if (typeof conf !== 'object' || !conf.buildSettings) continue;
    const bundleId = conf.buildSettings.PRODUCT_BUNDLE_IDENTIFIER;
    if (!bundleId || !String(bundleId).includes('network-packet-tunnel')) continue;

    const settings = conf.buildSettings;
    // Store bare values — quoteBarePbxArrayEntries() fixes CocoaPods parsing after write.
    // Do NOT add both xcframework Headers slices to HEADER_SEARCH_PATHS — each has a
    // module.modulemap named HevSocks5Tunnel and clang reports "redefinition of module".
    // Headers live in HevSupport/ (local copy of hev-socks5-tunnel.h, no modulemap).
    settings.OTHER_LDFLAGS = uniqueFlags(settings.OTHER_LDFLAGS, [
      '$(inherited)',
      '-lresolv',
      '-lc++',
      '-lhev-socks5-tunnel',
    ]);
    settings.HEADER_SEARCH_PATHS = uniqueFlags(settings.HEADER_SEARCH_PATHS, [
      '$(inherited)',
      '$(SRCROOT)/../targets/network-packet-tunnel/HevSupport',
    ]);
    // SDK-specific library slices (device vs simulator stubs) — both listed;
    // the linker picks the archive matching the active architecture.
    settings.LIBRARY_SEARCH_PATHS = uniqueFlags(settings.LIBRARY_SEARCH_PATHS, [
      '$(inherited)',
      '$(SRCROOT)/../vendor/HevSocks5Tunnel.xcframework/ios-arm64',
      '$(SRCROOT)/../vendor/HevSocks5Tunnel.xcframework/ios-arm64_x86_64-simulator',
    ]);
    settings.SWIFT_OBJC_BRIDGING_HEADER =
      '"$(SRCROOT)/../targets/network-packet-tunnel/HevSupport/Bridging-Header.h"';
  }

  let written = project.writeSync();
  written = quoteBarePbxArrayEntries(written);
  // Ensure bridging header path stays quoted (node-xcode may strip quotes on scalars).
  written = written.replace(
    /SWIFT_OBJC_BRIDGING_HEADER = (?!")([^;]+);/g,
    'SWIFT_OBJC_BRIDGING_HEADER = "$1";',
  );
  // Drop any leftover vendor Headers paths that cause module redefinition.
  written = written.replace(
    /^\s*"\$\(SRCROOT\)\/\.\.\/vendor\/HevSocks5Tunnel\.xcframework\/[^"]+\/Headers",\n/gm,
    '',
  );
  fs.writeFileSync(projectPath, written);
  console.log('[link-hev-ios] linked HevSocks5Tunnel into network-packet-tunnel');
}

function fileEntryText(entry) {
  if (entry == null) return '';
  if (typeof entry === 'string') return entry;
  if (typeof entry === 'object') {
    if (entry.value) return String(entry.value);
    if (entry.comment) return String(entry.comment);
    try {
      return JSON.stringify(entry);
    } catch {
      return '';
    }
  }
  return String(entry);
}

function ensureFrameworkLink(project, tunnelTargetUuid) {
  const comment = 'HevSocks5Tunnel.xcframework';
  const fileRefs = project.pbxFileReferenceSection();
  const existingRef = Object.entries(fileRefs).find(
    ([key, ref]) =>
      !key.endsWith('_comment') &&
      typeof ref === 'object' &&
      ref.path &&
      String(ref.path).includes('HevSocks5Tunnel.xcframework'),
  );

  let refUuid;
  if (existingRef) {
    refUuid = existingRef[0];
  } else {
    refUuid = project.generateUuid();
    fileRefs[refUuid] = {
      isa: 'PBXFileReference',
      lastKnownFileType: 'wrapper.xcframework',
      name: comment,
      path: XCFRAMEWORK_RELATIVE,
      sourceTree: '"<group>"',
    };
    fileRefs[`${refUuid}_comment`] = comment;
  }

  const buildFiles = project.pbxBuildFileSection();
  let buildFileUuid = Object.entries(buildFiles).find(
    ([key, bf]) =>
      !key.endsWith('_comment') &&
      typeof bf === 'object' &&
      bf.fileRef &&
      String(bf.fileRef).replace(/"/g, '') === String(refUuid).replace(/"/g, ''),
  )?.[0];

  if (!buildFileUuid) {
    buildFileUuid = project.generateUuid();
    buildFiles[buildFileUuid] = {
      isa: 'PBXBuildFile',
      fileRef: refUuid,
      fileRef_comment: comment,
    };
    buildFiles[`${buildFileUuid}_comment`] = `${comment} in Frameworks`;
  }

  const target = project.pbxNativeTargetSection()[tunnelTargetUuid];
  const frameworksPhaseUuid = (target.buildPhases || [])
    .map((phase) => String(phase.value || phase).replace(/"/g, ''))
    .find((id) => {
      const phase = project.hash.project.objects.PBXFrameworksBuildPhase?.[id];
      return phase && phase.isa === 'PBXFrameworksBuildPhase';
    });

  if (frameworksPhaseUuid) {
    const phase = project.hash.project.objects.PBXFrameworksBuildPhase[frameworksPhaseUuid];
    phase.files = phase.files || [];
    const already = phase.files.some((f) => fileEntryText(f).includes(comment));
    if (!already) {
      phase.files.push(`${buildFileUuid} /* ${comment} in Frameworks */`);
    }
  }
}

function uniqueFlags(existing, extras) {
  const list = normalizeFlags(existing).map(stripQuotes);
  for (const flag of extras) {
    const bare = stripQuotes(flag);
    if (!list.includes(bare)) list.push(bare);
  }
  return list;
}

function normalizeFlags(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String);
  return [String(value)];
}

function stripQuotes(value) {
  const s = String(value).trim();
  if (s.startsWith('"') && s.endsWith('"')) return s.slice(1, -1);
  return s;
}

/**
 * CocoaPods/xcodeproj require quoted array entries for $(...), -lc++, paths, etc.
 * node-xcode often emits them bare, which breaks `pod install`.
 */
function quoteBarePbxArrayEntries(pbx) {
  return pbx
    .replace(/^(\s+)\$\(inherited\),/gm, '$1"$(inherited)",')
    .replace(/^(\s+)(-l[A-Za-z0-9_+\-]+),/gm, '$1"$2",')
    .replace(/^(\s+)(\$\(SRCROOT\)\/\.\.\/[^\s,]+),/gm, '$1"$2",');
}

main();
