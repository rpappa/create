/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
    preset: "ts-jest/presets/default-esm",
    testEnvironment: "node",
    moduleNameMapper: {
        "^(\\.\\.?\\/.+)\\.jsx?$": "$1",
    },
    collectCoverage: true,
};
