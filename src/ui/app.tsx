import React, { useState, useEffect } from "react";
import { render, Box, Text, useInput } from "@mariozechner/pi-tui"; // Use correct imports from pi-tui
import { Database } from "bun:sqlite";
import open from "open";

// Mock DB read since TUI runs in same process
const db = new Database("eva.db", { readonly: true });

function App() {
  const [jobs, setJobs] = useState<any[]>([]);
  const [selected, setSelected] = useState(0);

  useEffect(() => {
    const rows = db.query("SELECT * FROM jobs ORDER BY id DESC LIMIT 50").all();
    setJobs(rows as any[]);
  }, []);

  useInput((input: string, key: any) => {
    if (input === "q" || (key.ctrl && input === "c")) {
      process.exit(0);
    }
    if (key.upArrow) {
      setSelected((prev: number) => Math.max(0, prev - 1));
    }
    if (key.downArrow) {
      setSelected((prev: number) => Math.min(jobs.length - 1, prev + 1));
    }
    if (input === "o") {
      const job = jobs[selected];
      if (job && job.url) {
        open(job.url);
      }
    }
  });

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" title="Eva Job Hunter">
      <Box paddingBottom={1}>
        <Text bold>Found {jobs.length} Opportunities (o: Open | q: Quit)</Text>
      </Box>
      
      {jobs.map((job: any, i: number) => (
        <Box key={job.id} paddingLeft={1} borderStyle={i === selected ? "classic" : undefined} borderColor="green">
          <Text color={i === selected ? "green" : "white"}>
            {job.status === "New" ? "🆕" : "📋"} {job.role} @ {job.company}
          </Text>
          {i === selected && (
            <Box flexDirection="column" marginLeft={2}>
              <Text dimColor>From: {job.sender}</Text>
              <Text dimColor>Subject: {job.subject}</Text>
              <Text dimColor>Date: {job.receivedAt}</Text>
            </Box>
          )}
        </Box>
      ))}
    </Box>
  );
}

// Check if run directly
if (import.meta.main) {
  render(<App />);
}
