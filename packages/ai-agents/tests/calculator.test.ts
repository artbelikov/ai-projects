import { describe, it, expect } from "vitest";
import { evaluateExpression } from "../src/calculator.js";

describe("evaluateExpression", () => {
  it("respects operator precedence", () => {
    expect(evaluateExpression("1 + 2 * 3")).toBe(7);
    expect(evaluateExpression("(1 + 2) * 3")).toBe(9);
    expect(evaluateExpression("10 - 4 / 2")).toBe(8);
  });

  it("handles the advertised examples", () => {
    expect(evaluateExpression("15 * 85.50")).toBeCloseTo(1282.5);
    expect(evaluateExpression("sqrt(144) + 10")).toBe(22);
  });

  it("supports power, unary minus, and constants", () => {
    expect(evaluateExpression("2 ^ 3")).toBe(8);
    expect(evaluateExpression("-2 ^ 2")).toBe(-4);
    expect(evaluateExpression("pi")).toBeCloseTo(Math.PI);
    expect(evaluateExpression("e")).toBeCloseTo(Math.E);
    expect(evaluateExpression("-(3 + 1)")).toBe(-4);
  });

  it("supports functions", () => {
    expect(evaluateExpression("abs(-5)")).toBe(5);
    expect(evaluateExpression("min(3, 9)")).toBe(3);
    expect(evaluateExpression("max(3, 9)")).toBe(9);
    expect(evaluateExpression("round(2.6)")).toBe(3);
    expect(evaluateExpression("floor(2.9)")).toBe(2);
    expect(evaluateExpression("ceil(2.1)")).toBe(3);
    expect(evaluateExpression("log(100)")).toBe(2);
    expect(evaluateExpression("ln(e)")).toBeCloseTo(1);
    expect(evaluateExpression("exp(0)")).toBe(1);
    expect(evaluateExpression("sin(0)")).toBe(0);
    expect(evaluateExpression("cos(0)")).toBe(1);
    expect(evaluateExpression("tan(0)")).toBe(0);
  });

  it("rejects code-injection attempts", () => {
    expect(() => evaluateExpression("process.exit(1)")).toThrow();
    expect(() => evaluateExpression("constructor")).toThrow();
    expect(() => evaluateExpression("globalThis")).toThrow();
    expect(() => evaluateExpression("1); alert(1); (1")).toThrow();
    expect(() => evaluateExpression("require('fs')")).toThrow();
    expect(() => evaluateExpression("foo(1)")).toThrow();
  });

  it("rejects malformed input", () => {
    expect(() => evaluateExpression("")).toThrow();
    expect(() => evaluateExpression("   ")).toThrow();
    expect(() => evaluateExpression("1 +")).toThrow();
    expect(() => evaluateExpression("1 + 2)")).toThrow();
    expect(() => evaluateExpression("sqrt")).toThrow();
    expect(() => evaluateExpression("1 @ 2")).toThrow();
  });

  it("throws on division by zero", () => {
    expect(() => evaluateExpression("1 / 0")).toThrow(/division by zero/);
  });

  it("rejects over-long input and deep nesting", () => {
    expect(() => evaluateExpression("1".padEnd(201, "+1"))).toThrow(/too long/);
    const deep = "(".repeat(40) + "1" + ")".repeat(40);
    expect(() => evaluateExpression(deep)).toThrow(/nesting/);
  });
});
