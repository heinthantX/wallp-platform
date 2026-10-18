export function parseUserAgent(ua?: string | null): string {
  if (!ua) return "Unknown Device";

  let browser = "Web Browser";
  let os = "Unknown OS";

  // Browser detection
  if (/edg/i.test(ua)) {
    browser = "Edge";
  } else if (/chrome|crios/i.test(ua) && !/opr|opera/i.test(ua)) {
    browser = "Chrome";
  } else if (/firefox|fxios/i.test(ua)) {
    browser = "Firefox";
  } else if (/safari/i.test(ua) && !/chrome|crios/i.test(ua)) {
    browser = "Safari";
  } else if (/opr|opera/i.test(ua)) {
    browser = "Opera";
  }

  // OS detection
  if (/macintosh|mac os x/i.test(ua)) {
    os = "macOS";
  } else if (/windows/i.test(ua)) {
    os = "Windows";
  } else if (/iphone|ipad|ipod/i.test(ua)) {
    os = "iOS";
  } else if (/android/i.test(ua)) {
    os = "Android";
  } else if (/linux/i.test(ua)) {
    os = "Linux";
  }

  return `${browser} on ${os}`;
}
