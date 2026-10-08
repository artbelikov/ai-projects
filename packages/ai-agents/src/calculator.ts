type TokenType =
  | "number"
  | "identifier"
  | "operator"
  | "lparen"
  | "rparen"
  | "comma";

interface Token {
  type: TokenType;
  value: string;
}

const MAX_INPUT_LENGTH = 200;
const MAX_DEPTH = 32;

const CONSTANTS = new Map<string, number>([
  ["pi", Math.PI],
  ["e", Math.E],
]);

const FUNCTIONS = new Map<string, (...args: number[]) => number>([
  ["sqrt", (a = 0) => Math.sqrt(a)],
  ["abs", (a = 0) => Math.abs(a)],
  ["round", (a = 0) => Math.round(a)],
  ["floor", (a = 0) => Math.floor(a)],
  ["ceil", (a = 0) => Math.ceil(a)],
  ["sin", (a = 0) => Math.sin(a)],
  ["cos", (a = 0) => Math.cos(a)],
  ["tan", (a = 0) => Math.tan(a)],
  ["log", (a = 0) => Math.log10(a)],
  ["ln", (a = 0) => Math.log(a)],
  ["exp", (a = 0) => Math.exp(a)],
  ["min", (...args) => Math.min(...args)],
  ["max", (...args) => Math.max(...args)],
]);

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < input.length) {
    const char = input[i];
    if (char === undefined) break;

    if (/\s/.test(char)) {
      i++;
      continue;
    }

    if (/[0-9.]/.test(char)) {
      const match = input.slice(i).match(/^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/);
      if (!match) throw new Error(`Invalid expression: bad number at position ${i}`);
      tokens.push({ type: "number", value: match[0] });
      i += match[0].length;
      continue;
    }

    if (/[a-zA-Z_]/.test(char)) {
      const match = input.slice(i).match(/^[a-zA-Z_][a-zA-Z0-9_]*/);
      if (!match) throw new Error(`Invalid expression: bad identifier at position ${i}`);
      tokens.push({ type: "identifier", value: match[0] });
      i += match[0].length;
      continue;
    }

    if ("+-*/%^".includes(char)) {
      tokens.push({ type: "operator", value: char });
      i++;
      continue;
    }

    if (char === "(") {
      tokens.push({ type: "lparen", value: char });
      i++;
      continue;
    }

    if (char === ")") {
      tokens.push({ type: "rparen", value: char });
      i++;
      continue;
    }

    if (char === ",") {
      tokens.push({ type: "comma", value: char });
      i++;
      continue;
    }

    throw new Error(`Invalid expression: unexpected character "${char}"`);
  }

  return tokens;
}

class Parser {
  private pos = 0;
  private depth = 0;

  constructor(private tokens: Token[]) {}

  parse(): number {
    if (this.tokens.length === 0) throw new Error("Invalid expression: empty input");
    const value = this.parseExpression();
    if (this.pos < this.tokens.length) {
      const token = this.tokens[this.pos];
      throw new Error(`Invalid expression: unexpected token "${token?.value ?? ""}"`);
    }
    return value;
  }

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private next(): Token | undefined {
    return this.tokens[this.pos++];
  }

  private parseExpression(): number {
    let value = this.parseTerm();
    while (true) {
      const token = this.peek();
      if (token?.type !== "operator" || (token.value !== "+" && token.value !== "-")) break;
      this.next();
      const rhs = this.parseTerm();
      value = token.value === "+" ? value + rhs : value - rhs;
    }
    return value;
  }

  private parseTerm(): number {
    let value = this.parseUnary();
    while (true) {
      const token = this.peek();
      if (
        token?.type !== "operator" ||
        (token.value !== "*" && token.value !== "/" && token.value !== "%")
      ) {
        break;
      }
      this.next();
      const rhs = this.parseUnary();
      if ((token.value === "/" || token.value === "%") && rhs === 0) {
        throw new Error("Invalid expression: division by zero");
      }
      if (token.value === "*") value *= rhs;
      else if (token.value === "/") value /= rhs;
      else value %= rhs;
    }
    return value;
  }

  private parseUnary(): number {
    const token = this.peek();
    if (token?.type === "operator" && token.value === "-") {
      this.next();
      return -this.parseUnary();
    }
    if (token?.type === "operator" && token.value === "+") {
      this.next();
      return this.parseUnary();
    }
    return this.parsePower();
  }

  private parsePower(): number {
    const base = this.parsePrimary();
    const token = this.peek();
    if (token?.type === "operator" && token.value === "^") {
      this.next();
      const exponent = this.parseUnary();
      return base ** exponent;
    }
    return base;
  }

  private parsePrimary(): number {
    const token = this.next();
    if (!token) throw new Error("Invalid expression: unexpected end of input");

    if (token.type === "number") {
      const value = Number(token.value);
      if (!Number.isFinite(value)) throw new Error("Invalid expression: invalid number");
      return value;
    }

    if (token.type === "identifier") {
      const name = token.value.toLowerCase();
      const constant = CONSTANTS.get(name);
      const fn = FUNCTIONS.get(name);

      if (fn && this.peek()?.type === "lparen") {
        this.enter();
        this.next();
        const args = this.parseArguments();
        this.exit();
        if (!Number.isFinite(fn(...args))) {
          throw new Error(`Invalid expression: ${name} returned a non-finite value`);
        }
        return fn(...args);
      }

      if (constant !== undefined) return constant;
      if (fn) throw new Error(`Invalid expression: "${name}" requires parentheses`);
      throw new Error(`Invalid expression: unexpected token "${token.value}"`);
    }

    if (token.type === "lparen") {
      this.enter();
      const value = this.parseExpression();
      const closer = this.next();
      this.exit();
      if (closer?.type !== "rparen") {
        throw new Error("Invalid expression: missing closing parenthesis");
      }
      return value;
    }

    throw new Error(`Invalid expression: unexpected token "${token.value}"`);
  }

  private parseArguments(): number[] {
    const args: number[] = [];
    if (this.peek()?.type === "rparen") {
      this.next();
      return args;
    }
    args.push(this.parseExpression());
    while (this.peek()?.type === "comma") {
      this.next();
      args.push(this.parseExpression());
    }
    const closer = this.next();
    if (closer?.type !== "rparen") {
      throw new Error("Invalid expression: missing closing parenthesis");
    }
    return args;
  }

  private enter(): void {
    this.depth++;
    if (this.depth > MAX_DEPTH) {
      throw new Error("Invalid expression: nesting too deep");
    }
  }

  private exit(): void {
    this.depth--;
  }
}

export function evaluateExpression(input: string): number {
  if (typeof input !== "string") {
    throw new Error("Invalid expression: input must be a string");
  }
  const trimmed = input.trim();
  if (!trimmed) throw new Error("Invalid expression: empty input");
  if (trimmed.length > MAX_INPUT_LENGTH) {
    throw new Error("Invalid expression: input too long");
  }
  return new Parser(tokenize(trimmed)).parse();
}
