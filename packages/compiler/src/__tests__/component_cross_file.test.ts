
import { describe, it, expect } from "vitest";
import { compile } from "../index.js";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

describe("Cross-file Component Detection", () => {
  it("should recognize component fun from another file and use functional call", () => {
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
      
      expect(result.code).toContain("OtherComp({})");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("should recognize component fun from a star import and use functional call", () => {
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
      
      expect(result.code).toContain("OtherComp({})");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("should recognize component fun called via qualified name and use functional call", () => {
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
      
      expect(result.code).toContain("Other.OtherComp({})");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("should recognize member component fun from imported class and use functional call", () => {
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
      
      expect(result.code).toContain("v.SubComp({})");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("should use props-object calling convention for @jalvin/runtime functions that declare (props: {...}, children?)", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "jalvin-test-extpkg-"));

    // Simulate a node_modules/@jalvin/mypkg package with a props-object function
    const pkgRoot = path.join(tmpDir, "node_modules", "@jalvin", "mypkg");
    fs.mkdirSync(pkgRoot, { recursive: true });
    fs.writeFileSync(path.join(pkgRoot, "package.json"), JSON.stringify({
      name: "@jalvin/mypkg",
      types: "dist/index.d.ts",
    }));
    fs.mkdirSync(path.join(pkgRoot, "dist"), { recursive: true });
    fs.writeFileSync(path.join(pkgRoot, "dist", "index.d.ts"), `
export { MyHost } from "./myhost.js";
`);
    fs.writeFileSync(path.join(pkgRoot, "dist", "myhost.d.ts"), `
export declare class MyController {}
export declare function MyHost(props: {
    controller: MyController;
    startRoute: string;
}, children?: Array<any>): any;
`);

    try {
      const code = `
import @jalvin/mypkg.MyHost
import @jalvin/mypkg.MyController

component fun App(ctrl: MyController) {
    MyHost(controller = ctrl, startRoute = "home") { _ ->
        (<div/>)
    }
}
`;
      const result = compile(code, path.join(tmpDir, "App.jalvin"), { sourceRoot: tmpDir });
      // Should use props-object convention, not positional args
      expect(result.code).toContain("MyHost({ controller: ctrl, startRoute: \"home\" }");
      expect(result.code).not.toContain("MyHost(ctrl,");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("should emit parametrized trailing lambda as a function, not DOM children", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "jalvin-test-builderlambda-"));

    const pkgRoot = path.join(tmpDir, "node_modules", "@jalvin", "nav");
    fs.mkdirSync(pkgRoot, { recursive: true });
    fs.writeFileSync(path.join(pkgRoot, "package.json"), JSON.stringify({
      name: "@jalvin/nav",
      types: "dist/index.d.ts",
    }));
    fs.mkdirSync(path.join(pkgRoot, "dist"), { recursive: true });
    fs.writeFileSync(path.join(pkgRoot, "dist", "index.d.ts"), `
export declare class Builder {}
export declare function NavHost(props: {
    startRoute: string;
}, children?: Array<((builder: Builder) => void) | any>): any;
`);

    try {
      const code = `
import @jalvin/nav.NavHost
import @jalvin/nav.Builder

component fun App() {
    NavHost(startRoute = "home") { builder: Builder ->
        builder.add("home")
    }
}
`;
      const result = compile(code, path.join(tmpDir, "App.jalvin"), { sourceRoot: tmpDir });
      // Trailing lambda with a param should be emitted as (builder) => { ... }, not as flat DOM children
      expect(result.code).toContain("NavHost({ startRoute: \"home\" }, [(builder) =>");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
