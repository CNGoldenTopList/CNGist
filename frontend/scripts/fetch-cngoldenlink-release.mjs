import { mkdir, writeFile } from "node:fs/promises";

const releaseUrl = "https://api.github.com/repos/Diving-Fish/CNGoldenLink/releases/latest";

try {
  const response = await fetch(releaseUrl, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "CNGist-build",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    throw new Error(`GitHub returned HTTP ${response.status}`);
  }

  const release = await response.json();
  const version = typeof release?.tag_name === "string"
    ? release.tag_name.replace(/^v/, "")
    : "";
  if (release?.draft !== false || release?.prerelease !== false || !/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error("Latest release must be a published stable version (e.g. 0.2.2 or v0.2.2)");
  }
  const filename = `CNGoldenLink-${version}.zip`;
  if (!Array.isArray(release.assets) || !release.assets.some((asset) => asset?.name === filename)) {
    throw new Error(`Latest release is missing ${filename}`);
  }

  // 打进前端产物：运行时不去请求发布信息，国内访问也不依赖 GitHub。
  const output = new URL("../src/generated/cngoldenlink-release.json", import.meta.url);
  await mkdir(new URL(".", output), { recursive: true });
  await writeFile(output, JSON.stringify({
    version,
    downloadUrl: `https://aliyun-static.diving-fish.com/cngist/${filename}`,
  }, null, 2) + "\n");
  console.log(`CNGoldenLink: pinned ${version} for this build`);
} catch (error) {
  console.error("Unable to fetch CNGoldenLink release:", error);
  process.exitCode = 1;
}
