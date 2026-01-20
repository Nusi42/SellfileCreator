#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const LICENSE_SOURCES = {
  'Apache-2.0': 'node_modules/typescript/LICENSE.txt',
  MIT: 'node_modules/react/LICENSE',
  'BSD-2-Clause': 'node_modules/terser/LICENSE',
  ISC: 'node_modules/eslint-import-resolver-typescript/LICENSE'
};

const scriptPath = fileURLToPath(import.meta.url);
// Resolve repo root from scripts/tooling.
const repoRoot = path.resolve(path.join(path.dirname(scriptPath), '..', '..'));
const packageJsonPath = path.join(repoRoot, 'package.json');
if (!fs.existsSync(packageJsonPath)) {
  throw new Error('package.json not found. Run the script from the repository root.');
}

const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const dependencies = pkg.dependencies || {};
const dependencyNames = Object.keys(dependencies).sort();
if (dependencyNames.length === 0) {
  throw new Error('No runtime dependencies found in package.json.');
}

function resolvePackageJson(name) {
  const segments = ['node_modules', ...name.split('/')];
  return path.join(repoRoot, ...segments, 'package.json');
}

function readPackageMetadata(name) {
  const pkgPath = resolvePackageJson(name);
  const data = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const homepage = normalizeUrl(data.homepage || data.repository?.url || data.repository || '');
  const license = normalizeLicense(data.license, data.licenses);
  const version = data.version || 'UNKNOWN';
  return { name, version, license, homepage };
}

function normalizeLicense(licenseField, legacyLicenses) {
  if (typeof licenseField === 'string' && licenseField.trim().length > 0) {
    return licenseField.trim();
  }
  if (licenseField && typeof licenseField === 'object' && typeof licenseField.type === 'string') {
    return licenseField.type.trim();
  }
  if (Array.isArray(legacyLicenses) && legacyLicenses.length > 0) {
    return legacyLicenses.map((entry) => {
      if (typeof entry === 'string') {
        return entry.trim();
      }
      if (entry && typeof entry.type === 'string') {
        return entry.type.trim();
      }
      return 'UNKNOWN';
    }).join(', ');
  }
  return 'UNKNOWN';
}

function normalizeUrl(raw) {
  if (!raw || typeof raw !== 'string') {
    return '';
  }
  let url = raw.trim();
  if (url.startsWith('git+')) {
    url = url.slice(4);
  }
  if (url.startsWith('git://')) {
    url = 'https://' + url.slice(6);
  }
  const gitHubSshPrefix = 'git@github.com:';
  if (url.startsWith(gitHubSshPrefix)) {
    url = 'https://github.com/' + url.slice(gitHubSshPrefix.length);
  }
  if (url.endsWith('.git')) {
    url = url.slice(0, -4);
  }
  if (/^https?:\/\//i.test(url)) {
    return url;
  }
  if (/^github:/i.test(url)) {
    const repo = url.replace(/^github:/i, '');
    return repo ? `https://github.com/${repo}` : '';
  }
  if (/^[\w.-]+\/[\w.-]+$/.test(url)) {
    return `https://github.com/${url}`;
  }
  return url;
}

const entries = dependencyNames.map((name) => {
  try {
    return readPackageMetadata(name);
  } catch (error) {
    throw new Error(`Failed to read metadata for ${name}: ${error.message}`);
  }
});

function readLicenseText(key) {
  const source = LICENSE_SOURCES[key];
  if (!source) {
    throw new Error(`No license source configured for ${key}.`);
  }
  const resolved = path.join(repoRoot, source);
  if (!fs.existsSync(resolved)) {
    throw new Error(`License file not found for ${key} at ${resolved}.`);
  }
  return fs.readFileSync(resolved, 'utf8').trim();
}

const header = `# Third-Party Notices\n\nThis file enumerates the third-party packages that are bundled into Sellfile Creator distributions.\nIt is generated automatically by scripts/tooling/update-third-party-notices.mjs during release builds\nso every archive carries the up-to-date attribution data.`;

const tableLines = [
  '| Package | Version | License | Homepage |',
  '| --- | --- | --- | --- |',
  ...entries.map(({ name, version, license, homepage }) => `| ${name} | ${version} | ${license} | ${homepage} |`)
];

const sections = new Map();
const sectionOrder = [];
for (const entry of entries) {
  const tokens = entry.license.split(/\s+OR\s+|\s+AND\s+/i).map((token) => token.trim()).filter(Boolean);
  const pkgDir = path.join(repoRoot, 'node_modules', ...entry.name.split('/'));
  const pkgLicenseText = readPackageLicenseFile(pkgDir);
  const authorsContent = maybeReadAuthorsSupplement(pkgLicenseText, pkgDir);
  for (const token of tokens) {
    if (!LICENSE_SOURCES[token] && !pkgLicenseText) {
      throw new Error(`No license text available for "${entry.license}" (token: "${token}").`);
    }
    const text = normalizeLicenseText(pkgLicenseText ?? readLicenseText(token));
    const key = `${token}__${text}`;
    if (!sections.has(key)) {
      sections.set(key, { licenseId: token, text, packages: new Set(), supplements: [] });
      sectionOrder.push(key);
    }
    sections.get(key).packages.add(entry.name);
    if (authorsContent) {
      sections.get(key).supplements.push({ package: entry.name, label: 'AUTHORS', content: authorsContent });
    }
  }
}

const bodyLines = [header, '', ...tableLines, '', '## License Texts', ''];
for (const key of sectionOrder) {
  const section = sections.get(key);
  const packages = Array.from(section.packages).sort((a, b) => a.localeCompare(b));
  bodyLines.push(`### ${section.licenseId}`, '');
  if (packages.length > 0) {
    bodyLines.push(`Packages: ${packages.join(', ')}`, '');
  }
  bodyLines.push(section.text, '');
  if (section.supplements.length > 0) {
    bodyLines.push('#### Additional Notices', '');
    for (const supplement of section.supplements) {
      bodyLines.push(`##### ${supplement.label} (${supplement.package})`, '', supplement.content, '');
    }
  }
}

const output = bodyLines.join('\n').trimEnd() + '\n';
fs.writeFileSync(path.join(repoRoot, 'THIRD_PARTY_NOTICES.txt'), output, 'utf8');

function readPackageLicenseFile(pkgDir) {
  const candidates = [
    'LICENSE',
    'LICENSE.md',
    'LICENSE.txt',
    'license',
    'license.md',
    'license.txt',
    'LICENCE',
    'LICENCE.md',
    'LICENCE.txt',
  ];
  for (const name of candidates) {
    const candidate = path.join(pkgDir, name);
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return fs.readFileSync(candidate, 'utf8');
    }
  }
  return null;
}

function normalizeLicenseText(text) {
  if (!text) return '';
  return text.replace(/\r\n/g, '\n').trim();
}

function maybeReadAuthorsSupplement(licenseText, pkgDir) {
  if (!licenseText || !/\bAUTHORS\b/i.test(licenseText)) {
    return null;
  }
  const content = readAncillaryFile(pkgDir, ['AUTHORS', 'AUTHORS.txt', 'AUTHORS.md']);
  if (!content) {
    return null;
  }
  return content.replace(/\r\n/g, '\n').trim();
}

function readAncillaryFile(pkgDir, candidates) {
  for (const name of candidates) {
    const candidate = path.join(pkgDir, name);
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return fs.readFileSync(candidate, 'utf8');
    }
  }
  return null;
}
