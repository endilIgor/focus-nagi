import { describe, expect, it } from "vitest";
import indexHtml from "../../index.html?raw";

// Routed screens, the shell/login and the components they render. Retired pages
// (Tasks/Projects/Goals/Notes) are not routed and may keep their legacy styles.
const activeSources = import.meta.glob<string>(
  [
    "./global.css",
    "../pages/{Today,Focus,Checklist,Journal,Analytics}Page.{tsx,module.css}",
    "../components/FocusDurationMenu.{tsx,module.css}",
    "../components/particles/*.{tsx,ts,module.css}",
    "../layout/AppShell.{tsx,module.css}",
    "../auth/LoginPage.{tsx,module.css}",
    "!**/*.test.*",
  ],
  { query: "?raw", import: "default", eager: true },
);

const LEGACY_FONTS = /Chakra Petch|Chakra\+Petch|JetBrains|Barlow/;

describe("v3 typography", () => {
  it("covers every routed v3 screen", () => {
    expect(Object.keys(activeSources)).toEqual(
      expect.arrayContaining([
        "./global.css",
        "../pages/TodayPage.module.css",
        "../pages/FocusPage.tsx",
        "../pages/ChecklistPage.module.css",
        "../pages/JournalPage.module.css",
        "../pages/AnalyticsPage.module.css",
        "../components/FocusDurationMenu.module.css",
      ]),
    );
  });

  it.each(Object.entries(activeSources))("%s uses only Geist / Geist Mono", (_path, source) => {
    expect(source).not.toMatch(LEGACY_FONTS);
  });

  it("no longer loads the legacy Chakra Petch / JetBrains Mono / Barlow faces", () => {
    expect(indexHtml).not.toMatch(LEGACY_FONTS);
    expect(indexHtml).toMatch(/family=Geist:/);
    expect(indexHtml).toMatch(/family=Geist\+Mono/);
  });
});
