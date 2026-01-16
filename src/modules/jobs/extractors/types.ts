export interface JobOpportunity {
    source: string;
    company: string;
    role: string;
    location?: string;
    salaryRange?: string;
    applyUrl?: string;
    rawEmailId?: string;
    originalBody?: string;
}

export interface EmailData {
    id?: string;
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
