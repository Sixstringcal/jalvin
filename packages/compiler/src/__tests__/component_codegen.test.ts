import { describe, it, expect } from "vitest";
import { lex } from "../lexer.js";
import { parse } from "../parser.js";
import { typeCheck } from "../typechecker.js";
import { generate } from "../codegen.js";
import { DiagnosticBag } from "../diagnostics.js";

function gen(source: string): string {
  const diag = new DiagnosticBag();
  const tokens = lex(source, "test.jalvin", diag);
  const ast = parse(tokens, "test.jalvin", diag, source);
  const checker = typeCheck(ast, diag);
  const result = generate(ast, {}, checker.operatorOverloadMap, checker.typeMap);
  return result.code;
}

describe("Component Codegen (Functional)", () => {
  it("emits direct functional calls for component calls", () => {
    const code = gen(`
      component fun Button(label: String) {
          return (<button>{label}</button>)
      }
      component fun App() {
          return Button(label = "Click Me")
      }
    `);

    expect(code).not.toContain('import React from "react";');
    expect(code).toContain('function Button({ label }: ButtonProps)');
    expect(code).toContain('return Button({ label: "Click Me" })');
  });

  it("handles trailing lambdas as children in functional calls", () => {
    const code = gen(`
      component fun Box(children: Any) {
          return (<div>{children}</div>)
      }
      component fun App() {
          return Box() {
              (<span />)
          }
      }
    `);

    expect(code).toContain('function Box({}, children?: any)');
    expect(code).toContain('return Box({}, [(jalvinCreateElement("span", {}, []))])');
  });

  it("handles components with no parameters", () => {
    const code = gen(`
      component fun Divider() { return (<hr />) }
      component fun App() { return Divider() }
    `);

    expect(code).toContain('function Divider()');
    expect(code).toContain('return Divider({})');
  });

  it("handles mixed named and positional arguments correctly", () => {
    const code = gen(`
      component fun Avatar(url: String, size: Int = 40) { return (<img src={url} />) }
      component fun App() {
          return Avatar("https://example.com/a.png", size = 80)
      }
    `);

    expect(code).toContain('return Avatar({ url: "https://example.com/a.png", size: 80 })');
  });

  it("uses direct calls for conditional component calls", () => {
    const code = gen(`
      import @jalvin/runtime.*
      component fun ChildA() { val x = remember { "A" } }
      component fun ChildB() { val x = remember { "B" } }
      component fun App(showA: Boolean) {
          if (showA) {
              ChildA()
          } else {
              ChildB()
          }
      }
    `);

    expect(code).toContain("return ChildA({})");
    expect(code).toContain("return ChildB({})");
  });

  it("uses functional calls inside loops", () => {
    const code = gen(`
      import @jalvin/ui.Column
      component fun Item(id: Int) { }
      component fun App(items: List<Int>) {
          Column {
              for (item in items) {
                  Item(id = item)
              }
          }
      }
    `);

    expect(code).toContain("Item({ id: item })");
  });

  it("emits valid class method syntax for components declared inside classes", () => {
    const code = gen(`
      import @jalvin/ui.Text
      class MyView() {
          component fun SubComp(label: String) {
              Text(text = label)
          }
      }
    `);

    expect(code).toContain("SubComp({ label }: { readonly label: any }) {");
    expect(code).toContain("return Text({ text: label })");
  });

  it("uses direct functional calls for member component calls", () => {
    const code = gen(`
      class MyView() {
          component fun SubComp() { }
      }
      component fun App() {
          val view = MyView()
          view.SubComp()
      }
    `);

    expect(code).toContain("return view.SubComp({})");
  });
});
