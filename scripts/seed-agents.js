#!/usr/bin/env node
/**
 * Seed default agents into the router DB.
 * Run from project root: node scripts/seed-agents.js
 */
const db = require("../src/db");

const AGENTS = [
  { name: "Diego", wa_number: "56996096419" },
  { name: "Rosario", wa_number: "56953494307" },
];

console.log("Seeding agents...");
for (const { name, wa_number } of AGENTS) {
  try {
    db.addAgent(name, wa_number);
    console.log(`  ✓ Added ${name} (${wa_number})`);
  } catch (e) {
    if (e.message && e.message.includes("UNIQUE constraint failed")) {
      console.log(`  — ${name} (${wa_number}) already exists`);
    } else {
      throw e;
    }
  }
}
console.log("Done.");
