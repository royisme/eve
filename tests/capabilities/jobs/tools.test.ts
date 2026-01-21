import { expect, test, describe, spyOn } from "bun:test";
import { jobsCapability } from "../../../src/capabilities/jobs";
import * as JobsService from "../../../src/capabilities/jobs/services/jobs-service";

describe("Jobs Capability Tools", () => {
  test("should have correct name and tools", () => {
    expect(jobsCapability.name).toBe("jobs");
    expect(jobsCapability.tools.length).toBeGreaterThan(0);
    const toolNames = jobsCapability.tools.map(t => t.name);
    expect(toolNames).toContain("jobs_search");
    expect(toolNames).toContain("jobs_list");
    expect(toolNames).toContain("jobs_enrich");
    expect(toolNames).toContain("jobs_analyze");
  });

  test("jobs_search tool should call searchJobs service", async () => {
    const searchTool = jobsCapability.tools.find(t => t.name === "jobs_search")!;
    const searchSpy = spyOn(JobsService, "searchJobs").mockImplementation(async () => []);
    
    await searchTool.execute("test-call-id", { query: "engineer" });
    
    expect(searchSpy).toHaveBeenCalledWith({
      query: "engineer",
      status: undefined,
      limit: undefined
    });
    
    searchSpy.mockRestore();
  });

  test("jobs_list tool should call searchJobs and getJobStats", async () => {
    const listTool = jobsCapability.tools.find(t => t.name === "jobs_list")!;
    const searchSpy = spyOn(JobsService, "searchJobs").mockImplementation(async () => []);
    const statsSpy = spyOn(JobsService, "getJobStats").mockImplementation(async () => ({
      total: 10, inbox: 5, enriched: 3, analyzed: 2, applied: 1
    }));
    
    await listTool.execute("test-call-id", { status: "inbox", limit: 5 });
    
    expect(searchSpy).toHaveBeenCalledWith({ status: "inbox", limit: 5 });
    expect(statsSpy).toHaveBeenCalled();
    
    searchSpy.mockRestore();
    statsSpy.mockRestore();
  });
});
