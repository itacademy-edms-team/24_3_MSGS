import js from "@eslint/js";
import globals from "globals";
import tsParser from "@typescript-eslint/parser";
import tseslint from "@typescript-eslint/eslint-plugin";
import reactPlugin from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import { fileURLToPath } from "node:url";
import path from "node:path";

const tsconfigRootDir = path.dirname(fileURLToPath(import.meta.url));

const speechApiGlobals = {
  SpeechRecognition: "readonly",
  SpeechRecognitionEvent: "readonly",
  SpeechRecognitionErrorEvent: "readonly",
  SpeechRecognitionResultList: "readonly",
  SpeechRecognitionResult: "readonly"
};

export default [
  js.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: {
          jsx: true
        },
        projectService: true,
        tsconfigRootDir
      },
      globals: {
        ...globals.browser,
        ...globals.es2021,
        ...speechApiGlobals,
        JSX: true
      }
    },
    plugins: {
      "@typescript-eslint": tseslint,
      react: reactPlugin,
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      ...reactPlugin.configs.recommended.rules,
      ...reactPlugin.configs["jsx-runtime"].rules,
      ...reactHooks.configs.recommended.rules,
      "react/no-unescaped-entities": "off",
      "react-refresh/only-export-components": [
        "warn",
        {
          allowConstantExport: true
        }
      ]
    },
    settings: {
      react: {
        version: "detect"
      }
    }
  },
  {
    files: ["**/*.d.ts"],
    rules: {
      "no-redeclare": "off",
      "@typescript-eslint/no-redeclare": "off",
      "no-var": "off"
    }
  }
];
