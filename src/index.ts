#!/usr/bin/env bun
export {};

const args = Bun.argv.slice(2);

if (args.includes("--help")) {
  console.log(`
Eve - AI Personal Agent Platform

Commands:
  (no args)          Launch TUI dashboard
  serve              Start HTTP server (default port: 3033)
  email:status       Check email configuration
  email:sync         Sync emails from Gmail
  jobs:list          List job opportunities

Options:
  --data-dir=PATH    Custom data directory (default: ~/.config/eve)
  --port=PORT        Server port (default: 3033)
  --help             Show this help

Environment Variables:
  EVE_DATA_DIR       Override default data directory
  PORT               Override default port
  `);
  process.exit(0);
}

if (args.length === 0) {
  if (process.stdout.isTTY) {
    await import("./ui/main");
  } else {
    console.log("Eve v0.3.0 - Personal AI Assistant");
    console.log("Usage: eve [command]");
    console.log("");
    console.log("Commands:");
    console.log("  (no args)      Launch TUI dashboard");
    console.log("  serve          Start HTTP API server");
    console.log("  email:status   Check email configuration");
    console.log("  email:sync     Sync emails from Gmail");
    console.log("  jobs:list      List job opportunities");
    console.log("  --help         Show all commands");
  }
} else if (args[0] === "serve") {
  const { startServer } = await import("./server");
  const portArg = args.find(a => a.startsWith("--port="));
  const port = portArg ? parseInt(portArg.split("=")[1], 10) : 3033;
  await startServer(port);
} else {
  await import("./cli/index");
}
