// File-upload helpers for the creator workspace (extracted from use-vibe-workspace to keep the
// hook under the large-file ceiling).

export async function sha256Hex(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function extractedTextFor(file: File): Promise<string> {
  if (
    file.type.startsWith("text/") ||
    file.type === "application/json" ||
    file.name.toLowerCase().endsWith(".md") ||
    file.name.toLowerCase().endsWith(".csv")
  ) {
    return file.text();
  }
  return `Uploaded file ${file.name} (${file.type || "unknown type"}, ${file.size} bytes).`;
}
