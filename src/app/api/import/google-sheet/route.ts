import { NextResponse } from "next/server";

// Runs on the Edge runtime so it works on Cloudflare Pages.
export const runtime = "edge";

/**
 * Accepts a normal Google Sheets share URL (from a sheet shared as
 * "Anyone with the link can view") and returns its contents as CSV.
 *
 * Fetching happens server-side rather than from the browser so this works
 * regardless of Google's CORS behavior for the export endpoint, and so it's
 * a natural place to add service-account auth later for private sheets.
 */
export async function POST(request: Request) {
  let url: string;
  try {
    const body = await request.json();
    url = body.url;
  } catch {
    return NextResponse.json({ error: "Missing request body." }, { status: 400 });
  }

  if (!url || typeof url !== "string") {
    return NextResponse.json({ error: "Please provide a Google Sheets URL." }, { status: 400 });
  }

  const idMatch = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (!idMatch) {
    return NextResponse.json(
      { error: "That doesn't look like a Google Sheets URL. Copy the link from the browser address bar or the Share dialog." },
      { status: 400 }
    );
  }
  const sheetId = idMatch[1];
  const gidMatch = url.match(/[#&?]gid=([0-9]+)/);
  const gid = gidMatch ? gidMatch[1] : "0";

  const exportUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;

  let res: Response;
  try {
    res = await fetch(exportUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
  } catch {
    return NextResponse.json({ error: "Could not reach Google Sheets. Check your connection and try again." }, { status: 502 });
  }

  if (!res.ok) {
    return NextResponse.json(
      { error: `Google Sheets returned an error (${res.status}). Make sure the sheet is shared as "Anyone with the link can view".` },
      { status: 400 }
    );
  }

  const text = await res.text();

  // A private/unshared sheet returns Google's HTML login page instead of CSV.
  if (text.trim().toLowerCase().startsWith("<!doctype html") || text.trim().startsWith("<html")) {
    return NextResponse.json(
      { error: 'This sheet isn\'t publicly viewable yet. In Google Sheets, use Share → "Anyone with the link" → Viewer, then try again.' },
      { status: 403 }
    );
  }

  return NextResponse.json({ csv: text, sheetId, gid });
}
