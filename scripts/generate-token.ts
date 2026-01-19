import { generateInitialToken } from "../src/core/auth";

console.log("🔑 Generating initial auth token for Wall-E...");
const token = await generateInitialToken();

if (token === "Token already exists") {
  console.log("ℹ️ A token already exists in the database. Use the existing one.");
} else {
  console.log("✅ Token generated successfully!");
  console.log("");
  console.log("--------------------------------------------------");
  console.log(`  ${token}  `);
  console.log("--------------------------------------------------");
  console.log("");
  console.log("👉 Copy this token and paste it into Wall-E settings.");
}
