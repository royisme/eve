import { describe, expect, test } from "bun:test";
import { Dispatcher } from "../../src/core/dispatcher";

// Mock JobModule to verify routing
// In Bun we can spy/mock, but Dispatcher imports it directly. 
// For pure unit testing logic, we can just test the private `isJobRelated` method 
// or subclass Dispatcher to expose it, or check logs.
// A better way for unit test is to inspect the logic.

// Let's expose the logic for testing or check the side effect.
// Since Dispatcher is simple, let's trust the logic extraction.

describe("Dispatcher Routing Logic", () => {
    const dispatcher = new Dispatcher();
    // Access private method via casting or just rely on console logs/behavior?
    // Let's copy the logic or refactor dispatcher to be more testable?
    // Actually, Bun test runner can access private methods in JS sometimes, but TS blocks it.
    // Let's make it public for testing or test `dispatch` output.
    
    // Refactoring Dispatcher to accept handlers would be better DI.
    // But for now, let's test the keywords matching logic by copy-pasting the critical logic 
    // or assume we are testing the regexes.
    
    // Wait, let's just make the method public for now or cast to any.
    const isJobRelated = (dispatcher as any).isJobRelated.bind(dispatcher);

    test("should identify job emails", () => {
        expect(isJobRelated("Software Engineer Job", "hr@google.com", "")).toBe(true);
        expect(isJobRelated("Application received", "no-reply@greenhouse.io", "")).toBe(true);
        expect(isJobRelated("Interview Invitation", "recruiter@meta.com", "")).toBe(true);
        expect(isJobRelated("Your application status", "jobs@amazon.com", "")).toBe(true);
    });

    test("should identify platform emails", () => {
        expect(isJobRelated("New message", "jobalerts-noreply@linkedin.com", "")).toBe(true);
        expect(isJobRelated("Job alert", "alert@indeed.com", "")).toBe(true);
    });

    test("should ignore unrelated emails", () => {
        expect(isJobRelated("Invoice for AWS", "billing@aws.com", "")).toBe(false);
        expect(isJobRelated("Weekly Newsletter", "news@substack.com", "")).toBe(false);
        expect(isJobRelated("Your order has shipped", "amazon.ca", "")).toBe(false);
    });
});
