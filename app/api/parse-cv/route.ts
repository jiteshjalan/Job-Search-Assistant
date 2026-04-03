import { NextRequest, NextResponse } from 'next/server';
import { createRequire } from 'module';

// createRequire loads the module through Node.js's native CJS loader,
// completely bypassing Turbopack/webpack. This is the only reliable way
// to use pdf-parse (a CJS library) in a Next.js App Router route.
const require = createRequire(import.meta.url);
type PdfParseResult = { text: string; numpages: number };
const pdfParse: (buf: Buffer) => Promise<PdfParseResult> = require('pdf-parse');

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }
    if (file.type !== 'application/pdf') {
      return NextResponse.json({ error: 'Only PDF files are supported' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const result = await pdfParse(buffer);

    if (!result.text?.trim()) {
      return NextResponse.json(
        { error: 'No text found in PDF — it may be a scanned image. Try pasting your CV as text instead.' },
        { status: 422 }
      );
    }

    return NextResponse.json({ text: result.text.trim() });
  } catch (err) {
    console.error('parse-cv error:', err);
    return NextResponse.json({ error: 'Failed to parse PDF' }, { status: 500 });
  }
}
