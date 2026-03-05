const testPayload = {
    prompt: "summarize",
    pdfStoragePaths: [
        { name: "test.pdf", path: "test/test.pdf" } // This path assumes a dummy file, but we just want to see if it reaches the logger
    ]
};

fetch('http://localhost:3000/api/gemini', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(testPayload)
}).then(async res => {
    console.log("Status:", res.status);
    console.log("Body:", await res.text());
}).catch(err => console.error(err));
