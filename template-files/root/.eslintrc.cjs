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
                "plugin:import/recommended",
                "plugin:import/typescript",
                "plugin:unicorn/recommended",
                "plugin:prettier/recommended",
            ],
            // This seems to cause issues with vscode auto-fixing in some cases
            reportUnusedDisableDirectives: false,
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
                "@typescript-eslint/consistent-type-definitions": ["error", "interface"],
                radix: "off",
                // Import rules
                // This is important when using npm workspaces
                "import/no-extraneous-dependencies": [
                    "error",
                    {
                        devDependencies: ["!./src/**/*"],
                        optionalDependencies: false,
                        peerDependencies: true,
                    },
                ],
                "import/order": [
                    "error",
                    {
                        alphabetize: {
                            order: "asc",
                            caseInsensitive: true,
                        },
                        "newlines-between": "always",
                        groups: ["builtin", "external", "internal", "parent", "sibling", "index", "type"],
                    },
                ],
                // Unicorn rules
                "unicorn/no-useless-undefined": ["error", { checkArguments: false }],
                "unicorn/numeric-separators-style": ["warn", { onlyIfContainsSeparator: true }],
                // Consider enabling the following rule for better code readability and maintainability.
                "unicorn/prevent-abbreviations": "off",
                "unicorn/filename-case": [
                    "error",
                    {
                        cases: {
                            camelCase: true,
                            pascalCase: true,
                        },
                    },
                ],
            },
            parserOptions: {
                project: "./tsconfig.eslint.json",
            },
            settings: {
                "import/resolver": {
                    typescript: {
                        alwaysTryTypes: true,
                    },
                    node: true,
                },
                // For monorepos:
                // "import/internal-regex": "^@scope/*",
            },
        },
    ],
    ignorePatterns: ["dist/", "node_modules/", "coverage/"],
};
