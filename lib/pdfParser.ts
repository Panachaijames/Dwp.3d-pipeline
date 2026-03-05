import * as pdfjsLib from 'pdfjs-dist';

// Configure the worker explicitly to load from unpkg according to the exact version.
// This is necessary for client-side PDF parsing in Next.js without complex webpack config.
if (typeof window !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
}

export async function parsePdfToText(base64DataUrl: string): Promise<string> {
    const base64Content = base64DataUrl.split(',')[1];
    if (!base64Content) {
        throw new Error('Invalid base64 data URL');
    }

    const binaryString = window.atob(base64Content);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }

    const loadingTask = pdfjsLib.getDocument({ data: bytes });
    const pdf = await loadingTask.promise;
    const numPages = pdf.numPages;
    let fullText = '';

    for (let i = 1; i <= numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items
            // @ts-ignore
            .map((item) => item.str)
            .join(' ');
        fullText += pageText + '\n';
    }

    return fullText.trim();
}
