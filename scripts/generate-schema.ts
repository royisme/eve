#!/usr/bin/env bun
import { writeFileSync } from "fs";
import { join } from "path";
import { EveConfigSchema } from "../src/core/config-schema";

const schemaJson = JSON.stringify(EveConfigSchema, null, 2);
const outputPath = join(import.meta.dir, "../schema.json");

writeFileSync(outputPath, schemaJson, "utf-8");
console.log(`✅ Generated schema.json at ${outputPath}`);
