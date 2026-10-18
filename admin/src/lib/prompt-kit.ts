export interface PromptKitInput {
  packName: string;
  style?: string;
  tile?: string;
  glyph?: string;
  accent?: string;
  apps: { pkg: string; subject: string }[];
}

export function buildPromptKit({ packName, style, tile, glyph, accent, apps }: PromptKitInput): string {
  const palette = [
    tile && `background ${tile}`,
    glyph && `main ${glyph}`,
    accent && `detail ${accent}`,
  ].filter(Boolean).join(", ");
  const head = style ? `Icon set, ${packName}, ${style} style.` : `Icon set, ${packName}.`;
  const preamble =
    `${head} One square 1024x1024 PNG per subject. Flat illustration, same light from top-left, same line weight` +
    `${palette ? `, palette: ${palette}.` : "."}` +
    " Subject centred inside the middle 66%, background fills edge to edge, no border, no rounded corners, no text, no watermark, no brand logos: draw the app's purpose, not its logo. Save each file under the given name.";
  return [preamble, "", ...apps.map((a) => `\`${a.pkg}.png\`: ${a.subject}`)].join("\n");
}
