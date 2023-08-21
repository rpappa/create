import { hello, add } from "../src/index.js";

describe("hello", () => {
    it("says hello", () => {
        expect(hello("World")).toBe("Hello World!");
    });
});

describe("add", () => {
    it("adds", () => {
        expect(add(1, 2)).toBe(3);
    });
});
