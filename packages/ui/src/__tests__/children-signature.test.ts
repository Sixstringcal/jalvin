import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

/**
 * Tests to ensure all child-accepting UI components use consistent
 * second-argument children signature (not props-style).
 *
 * This prevents runtime mismatches like the 2.0.35 incident where
 * Scaffold/Card took children as second arg, but Column/Row read from props.
 */

describe("UI children signature consistency", () => {
  // Components that accept children
  const CHILD_COMPONENTS = [
    "Scaffold",
    "Card",
    "Column",
    "Row",
    "Box",
    "Button",
    "IconButton",
  ];

  // Text is intentionally different (uses props.children and props.text)
  const INTENTIONAL_EXCEPTIONS = ["Text"];

  it("all child-accepting components use second-argument style in TypeScript", () => {
    const srcDir = path.join(__dirname, "..");
    const tsxFiles = [
      path.join(srcDir, "surface.tsx"),
      path.join(srcDir, "layout.tsx"),
      path.join(srcDir, "button.tsx"),
    ];

    const content = tsxFiles
      .map((f) => fs.readFileSync(f, "utf-8"))
      .join("\n");

    for (const component of CHILD_COMPONENTS) {
      // Find the component function definition
      const componentRegex = new RegExp(
        `export function ${component}\\([\\s\\S]*?\\):\\s*React\\.ReactElement`,
        ""
      );
      const match = content.match(componentRegex);
      expect(match, `${component} function not found`).toBeTruthy();

      const functionSig = match![0];

      // Check: should have children as second parameter (after Props)
      // Pattern: }: PropType, children?: React.ReactNode
      // (handles multi-line with whitespace variations)
      const hasSecondArgChildren =
        /:\s*\w+Props\s*,\s*children\?/s.test(functionSig);
      expect(
        hasSecondArgChildren,
        `${component} should have children as second-argument, not in props`
      ).toBe(true);

      // Check: should NOT have children in props destructuring
      // Pattern: { ..., children... }
      const propsMatch = functionSig.match(/\{[\s\S]*?\}:\s*\w+Props/);
      if (propsMatch) {
        const propsBody = propsMatch[0];
        expect(
          !propsBody.includes("children"),
          `${component} props should NOT include children field`
        ).toBe(true);
      }
    }
  });

  it("interface props do not include children field", () => {
    const srcDir = path.join(__dirname, "..");
    const tsxFiles = [
      path.join(srcDir, "surface.tsx"),
      path.join(srcDir, "layout.tsx"),
      path.join(srcDir, "button.tsx"),
    ];

    const content = tsxFiles
      .map((f) => fs.readFileSync(f, "utf-8"))
      .join("\n");

    // Get interface definitions for components with children
    for (const component of CHILD_COMPONENTS) {
      // Look for interfaces like ScaffoldProps, CardProps, etc.
      const interfaceName = `${component}Props`;
      const interfacePattern = new RegExp(
        `export interface ${interfaceName}\\s*\\{[^}]*?\\}`,
        "s"
      );
      const match = content.match(interfacePattern);

      if (match) {
        const interfaceBody = match[0];

        // For non-exception components, children should NOT be in the interface
        if (!INTENTIONAL_EXCEPTIONS.includes(component)) {
          expect(
            !interfaceBody.includes("children"),
            `${interfaceName} should NOT include children field (children are second-argument)`
          ).toBe(true);
        }
      }
    }
  });

  it("component implementations spread children correctly as second arg", () => {
    const srcDir = path.join(__dirname, "..");
    const layoutContent = fs.readFileSync(
      path.join(srcDir, "layout.tsx"),
      "utf-8"
    );

    // Check that Column/Row/Box all use ...(children ?? []) pattern
    for (const component of ["Column", "Row", "Box"]) {
      // Should have pattern: ...(children ?? [])
      expect(
        layoutContent.includes(`...(children ?? [])`),
        `${component} should spread children with ...(children ?? []) pattern`
      ).toBe(true);
    }
  });

  it("compiled dist files maintain second-argument children signature", () => {
    const distDir = path.join(__dirname, "../../dist");

    // Check if dist exists (it will after build)
    if (!fs.existsSync(distDir)) {
      console.warn("dist/ not found; skipping compiled output check");
      return;
    }

    const jsFiles = [
      path.join(distDir, "surface.js"),
      path.join(distDir, "layout.js"),
      path.join(distDir, "button.js"),
    ].filter((f) => fs.existsSync(f));

    const content = jsFiles.map((f) => fs.readFileSync(f, "utf-8")).join("\n");

    // Check that second-argument children patterns exist in compiled code
    // Pattern: }, children) or }, children =
    expect(
      /},\s*children\s*[),=]/m.test(content),
      "Compiled code should have children as second parameter"
    ).toBe(true);
  });
});
