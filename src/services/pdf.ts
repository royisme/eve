import { spawn } from "bun";

export class PDFService {
  /**
   * Extracts text from a PDF buffer using pdftotext CLI
   */
  async extractText(buffer: Buffer): Promise<string> {
    try {
      const proc = spawn(["pdftotext", "-", "-"], {
        stdin: buffer,
        stdout: "pipe",
        stderr: "pipe",
      });

      const stdout = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();

      if (stderr && stderr.trim().length > 0 && stdout.trim().length === 0) {
        throw new Error(`PDF extraction failed: ${stderr}`);
      }

      if (stdout.trim().length === 0) {
        console.warn("⚠️ Warning: Extracted text is empty. PDF might be scanned image.");
      }

      return stdout;
    } catch (error) {
      console.error("PDF Extraction Error:", error);
      throw new Error(`Failed to extract text from PDF: ${(error as Error).message}`);
    }
  }

  /**
   * Check if pdftotext is installed
   */
  async isInstalled(): Promise<boolean> {
    try {
      const proc = spawn(["pdftotext", "-v"], { stderr: "pipe" });
      const exitCode = await proc.exited;
      return exitCode === 0;
    } catch {
      return false;
    }
  }
}

export const pdfService = new PDFService();
