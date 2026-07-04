import { mkdir } from "node:fs/promises";
import sharp from "sharp";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
  <rect width="512" height="512" rx="96" fill="#C4693F"/>
  <text x="256" y="330" font-family="Georgia, serif" font-size="220"
        font-weight="bold" fill="#FFFFFF" text-anchor="middle">SG</text>
</svg>`;

await mkdir("public/icons", { recursive: true });
for (const size of [192, 512]) {
  await sharp(Buffer.from(svg))
    .resize(size, size)
    .png()
    .toFile(`public/icons/icon-${size}.png`);
}
console.log("icons written");
