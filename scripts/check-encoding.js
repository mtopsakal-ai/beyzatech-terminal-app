const fs = require("fs");
const path = require("path");
const { TextDecoder } = require("util");

const projectRoot = path.resolve(__dirname, "..");
const allowedExtensions = new Set([
  ".js", ".jsx", ".json", ".md", ".txt", ".html", ".css",
]);
const ignoredDirectories = new Set([
  ".git", ".expo", "node_modules", "android", "ios", "build", "dist",
]);
const mojibakePatterns = [
  /\u00c3/u,
  /\u00c4/u,
  /\u00c5/u,
  /\u00c2/u,
  /\u00f0\u0178/u,
  /\u011f\u0178/u,
  /\u00ef\u00b8/u,
  /\u00e2(?:\u20ac|\u201e|\u2122|\u0153|\u017e|\u2020|\u2021|\u2013|\u2014|\u2026)/u,
];

function collectFiles(directory, files = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;

    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      collectFiles(fullPath, files);
    } else if (allowedExtensions.has(path.extname(entry.name).toLowerCase())) {
      files.push(fullPath);
    }
  }
  return files;
}

const decoder = new TextDecoder("utf-8", { fatal: true });
const failures = [];

for (const filePath of collectFiles(projectRoot)) {
  const buffer = fs.readFileSync(filePath);
  const relativePath = path.relative(projectRoot, filePath);

  if (
    (buffer[0] === 0xff && buffer[1] === 0xfe) ||
    (buffer[0] === 0xfe && buffer[1] === 0xff)
  ) {
    failures.push(`${relativePath}: UTF-16 yerine UTF-8 kullanılmalı.`);
    continue;
  }

  try {
    const text = decoder.decode(buffer);
    if (text.includes("\uFFFD") || mojibakePatterns.some((pattern) => pattern.test(text))) {
      failures.push(`${relativePath}: bozuk Türkçe/emoji karakteri algılandı.`);
    }
  } catch {
    failures.push(`${relativePath}: geçerli UTF-8 değil.`);
  }
}

if (failures.length > 0) {
  console.error("\nUTF-8 denetimi başarısız:\n");
  failures.forEach((failure) => console.error(`- ${failure}`));
  console.error("\nDosyaları UTF-8 olarak kaydedip yeniden deneyin.\n");
  process.exit(1);
}

console.log("UTF-8 denetimi başarılı: Türkçe metinler ve emojiler sağlam.");
