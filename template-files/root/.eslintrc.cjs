module.exports = {
    root: true,
    overrides: [
        {
            // Out of the box this just handles the eslint config
            files: ["*.cjs", "*.js"],
            extends: ["xo", "plugin:prettier/recommended"],
            rules: {
                "capitalized-comments": "off",
            },
        },
        {
            // This handles the typescript config
            files: ["*.ts", "*.tsx"],
            extends: [
                "plugin:@typescript-eslint/eslint-recommended",
                "xo",
                "xo-typescript",
                "plugin:prettier/recommended",
            ],
            rules: {
                "capitalized-comments": "off",
                "@typescript-eslint/naming-convention": [
                    "error",
                    {
                        selector: "variable",
                        modifiers: ["const"],
                        format: ["camelCase", "UPPER_CASE"],
                    },
                ],
                "@typescript-eslint/consistent-indexed-object-style": ["error", "index-signature"],
            },
            parserOptions: {
                project: "./tsconfig.eslint.json",
            },
        },
    ],
    ignorePatterns: ["dist/", "node_modules/", "coverage/"],
};
