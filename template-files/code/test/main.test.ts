import { describe, expect, test } from "vitest";

import { format } from "../src/index.js";

describe("format", () => {
    test("does formatting", () => {
        expect(format("World", 1, 2)).toBe("Hello World! 1 + 2 = 3");
    });
});
