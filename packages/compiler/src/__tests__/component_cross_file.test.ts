
import { describe, it, expect } from "vitest";
import { compile } from "../index.js";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

describe("Cross-file Component Detection", () => {
  it("should recognize component fun from another file and use React.createElement", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "jalvin-test-"));
    const otherFile = path.join(tmpDir, "Other.jalvin");
    const otherCode = `
component fun OtherComp() {
    val x = remember { "Other" }
}
`;
    fs.writeFileSync(otherFile, otherCode);

    try {
      const code = `
import Other.OtherComp

component fun App(cond: Boolean) {
    if (cond) {
        OtherComp()
    }
}
`;
      // Use tmpDir as sourceRoot so compiler can find Other.jalvin
      const result = compile(code, path.join(tmpDir, "App.jalvin"), { sourceRoot: tmpDir });
      
      expect(result.code).toContain("React.createElement(OtherComp, {})");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("should recognize component fun from a star import and use React.createElement", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "jalvin-test-star-"));
    const otherFile = path.join(tmpDir, "Other.jalvin");
    const otherCode = `
component fun OtherComp() {
    val x = remember { "Other" }
}
`;
    fs.writeFileSync(otherFile, otherCode);

    try {
      const code = `
import Other.*

component fun App(cond: Boolean) {
    if (cond) {
        OtherComp()
    }
}
`;
      const result = compile(code, path.join(tmpDir, "App.jalvin"), { sourceRoot: tmpDir });
      
      expect(result.code).toContain("React.createElement(OtherComp, {})");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("should recognize component fun called via qualified name and use React.createElement", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "jalvin-test-qualified-"));
    const otherFile = path.join(tmpDir, "Other.jalvin");
    const otherCode = `
component fun OtherComp() { }
`;
    fs.writeFileSync(otherFile, otherCode);

    try {
      const code = `
import Other.OtherComp

component fun App() {
    Other.OtherComp()
}
`;
      const result = compile(code, path.join(tmpDir, "App.jalvin"), { sourceRoot: tmpDir });
      
      expect(result.code).toContain("React.createElement(Other.OtherComp, {})");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("should recognize member component fun from imported class and use React.createElement", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "jalvin-test-member-imported-"));
    const otherFile = path.join(tmpDir, "Views.jalvin");
    const otherCode = `
class MyView() {
    component fun SubComp() { }
}
`;
    fs.writeFileSync(otherFile, otherCode);

    try {
      const code = `
import Views.MyView

component fun App() {
    val v = MyView()
    v.SubComp()
}
`;
      const result = compile(code, path.join(tmpDir, "App.jalvin"), { sourceRoot: tmpDir });
      
      expect(result.code).toContain("React.createElement(v.SubComp, {})");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
