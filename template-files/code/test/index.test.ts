import { describe, expect, test } from "vitest";
import { hello, add } from "../src/index.js";

describe("hello", () => {
    test("says hello", () => {
        expect(hello("World")).toBe("Hello World!");
    });
});

describe("add", () => {
    test("adds", () => {
        expect(add(1, 2)).toBe(3);
    });
});
