import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

const ROOT = "Y:/(17) 2026 HYTEK PROJECTS";

interface ProfileUsage {
  profile: string;
  firstJobSeen: string;
  count: number;
}

async function* walkRfyFiles(dir: string): AsyncGenerator<string> {
  let entries;
  try {
    entries = await readdir(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    let s;
    try {
      s = await stat(fullPath);
    } catch {
      continue;
    }
    if (s.isDirectory()) {
      yield* walkRfyFiles(fullPath);
    } else if (entry.endsWith(".rfy")) {
      yield fullPath;
    }
  }
}

function parseProfile(filename: string): string | null {
  // Filenames like: HG260004_PK1-GF-NLBW-70.075.rfy → profile = "GF-NLBW-70.075"
  //                 HG260004_GF-RP-70.075.rfy → profile = "GF-RP-70.075"
  const m = filename.match(/_(?:PK\d+-)?(.+)\.rfy$/);
  return m ? m[1] : null;
}

async function main() {
  const usage = new Map<string, ProfileUsage>();
  let total = 0;

  for await (const path of walkRfyFiles(ROOT)) {
    total++;
    const basename = path.split(/[\\/]/).pop() ?? "";
    const profile = parseProfile(basename);
    if (!profile) continue;
    const job = path.match(/HG\d+/)?.[0] ?? "unknown";
    const existing = usage.get(profile);
    if (existing) {
      existing.count++;
    } else {
      usage.set(profile, { profile, firstJobSeen: job, count: 1 });
    }
  }

  const sorted = [...usage.values()].sort((a, b) => b.count - a.count);
  console.log(`# Production Panel Profiles\n`);
  console.log(`Scanned ${total} RFY files. Found ${sorted.length} unique profiles.\n`);
  console.log("| Profile | First job | Occurrences |");
  console.log("|---|---|---|");
  for (const u of sorted) {
    console.log(`| ${u.profile} | ${u.firstJobSeen} | ${u.count} |`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
