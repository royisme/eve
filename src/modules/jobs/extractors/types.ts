export interface JobOpportunity {
    source: string;
    company: string;
    role: string;
    location?: string;
    salaryRange?: string;
    applyUrl?: string; // Direct link
    rawEmailId?: string; // Used to construct Gmail link
    originalBody?: string;
}

export interface EmailData {
    id?: string;
    threadId?: string; // Gmail thread id
    subject?: string;
    snippet?: string;
    from?: string;
    _account?: string;
    [key: string]: any;
}

export interface EmailExtractor {
    name: string;
    canHandle(sender: string, subject: string): boolean;
    extract(email: EmailData): Promise<JobOpportunity[]>;
}
