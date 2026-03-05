import nextVitals from "eslint-config-next/core-web-vitals";

const eslintConfig = [
  ...nextVitals,
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "out/**",
      "build/**"
    ]
  },
  {
    settings: {
      react: {
        version: "19.2.3"
      }
    }
  }
];

export default eslintConfig;