async function dumpThread() {
    const threadId = "19bc1ff12e662e3d";
    const account = "imroybox@gmail.com";
    
    console.log(`📥 Fetching Thread ${threadId} from ${account}...`);
    const proc = Bun.spawn(["gog", "gmail", "thread", "get", threadId, "--account", account, "--json"], { stdout: "pipe", stderr: "inherit" });
    const text = await new Response(proc.stdout).text();
    
    let json;
    try {
        json = JSON.parse(text);
    } catch {
        console.error("Failed to parse JSON");
        return;
    }
    
    const messages = (json.thread && json.thread.messages) || json.messages || [];
    const msg = messages[0];
    
    if (!msg) {
        console.error("No messages found");
        return;
    }
    
    // Decode Body (Recursive)
    const decodePart = (part: any): string | null => {
        if (part.mimeType === 'text/html' && part.body && part.body.data) {
            return Buffer.from(part.body.data, 'base64url').toString('utf-8');
        }
        if (part.parts) {
            for (const sub of part.parts) {
                const found = decodePart(sub);
                if (found) return found;
            }
        }
        return null;
    };
    
    const body = decodePart(msg.payload);
    
    if (body) {
        await Bun.write("debug_email.html", body);
        console.log(`✅ Dumped HTML to debug_email.html (${body.length} bytes)`);
    } else {
        console.error("❌ Failed to decode body");
    }
}

dumpThread();