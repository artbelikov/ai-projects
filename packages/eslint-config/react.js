import globals from "globals";
import base from "./base.js";

export default [
  ...base,
  {
    files: ["**/*.tsx", "**/*.jsx"],
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
  },
];
