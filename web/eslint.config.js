import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import eslintConfigPrettier from "eslint-config-prettier";

export default tseslint.config(
	js.configs.recommended,
	...tseslint.configs.recommended,
	reactHooks.configs.flat["recommended-latest"],
	eslintConfigPrettier,
	{
		ignores: ["dist/", "node_modules/", ".papi/", "scripts/"],
	},
);
