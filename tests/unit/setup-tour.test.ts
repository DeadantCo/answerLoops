import { existsSync, readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const files = [
  "components/docs/screenshot.tsx",
  "components/docs/hotspots.tsx",
  "content/docs/integrations/discord.mdx",
  "content/docs/integrations/slack.mdx",
  "content/docs/product/chat-widget.mdx",
  "mdx-components.tsx",
];

describe("SetupTour issue #111 (docs setup tour)", () => {
  it("prerequisite files exist", () => {
    for (const f of files) console.log(`${existsSync(f) ? "EXISTS " : "MISSING"} ${f}`);
    expect(files.filter((f) => !existsSync(f))).toEqual([]);
  });
  it("<Steps used in mdx guides", () => {
    for (const f of files.filter((f) => f.endsWith(".mdx"))) {
      console.log(`${f}: <Steps count=${(readFileSync(f, "utf8").match(/<Steps/g) ?? []).length}`);
    }
  });
  it("SetupTour component exists in repo", () => {
    let out = "";
    try {
      out = execSync("grep -rln SetupTour . --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=.next --exclude=setup-tour.test.ts || true").toString();
    } catch {}
    console.log("SetupTour references:", JSON.stringify(out));
    expect(out.trim()).not.toBe("");
  });
});
