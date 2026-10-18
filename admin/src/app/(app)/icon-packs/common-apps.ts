// verify every package id against the Play Store ?id= URL before locking (spec: ai-creation.md P6).
// `subject` is the app's purpose for prompts/kits, never its logo (trademark).
export interface CommonApp {
  pkg: string;
  label: string;
  subject: string;
  aliases: string[];
  tier: 1 | 2 | 3;
  region?: "mm";
}

const a = (tier: 1 | 2 | 3, label: string, pkg: string, subject: string, aliases: string[] = [], region?: "mm"): CommonApp => ({
  pkg, label, subject, aliases, tier, ...(region ? { region } : {}),
});

export const COMMON_APPS: CommonApp[] = [
  a(1, "Phone", "com.google.android.dialer", "a telephone handset", ["phone", "dialer"]),
  a(1, "Messages", "com.google.android.apps.messaging", "a speech bubble with lines of text", ["messages", "sms"]),
  a(1, "Camera", "com.android.camera", "a camera lens", ["camera", "com.android.camera2"]),
  a(1, "Photos", "com.google.android.apps.photos", "a pinwheel of overlapping petals", ["photos", "gallery"]),
  a(1, "Chrome", "com.android.chrome", "a web browser sphere", ["chrome"]),
  a(1, "Gmail", "com.google.android.gm", "an envelope", ["gmail", "mail"]),
  a(1, "Maps", "com.google.android.apps.maps", "a map pin", ["maps", "map"]),
  a(1, "YouTube", "com.google.android.youtube", "a play button on a video screen", ["youtube", "yt"]),
  a(1, "Play Store", "com.android.vending", "a shopping bag with a play triangle", ["playstore", "play"]),
  a(1, "Settings", "com.android.settings", "a gear", ["settings"]),
  a(1, "Clock", "com.google.android.deskclock", "an alarm clock face", ["clock", "alarm"]),
  a(1, "Calendar", "com.google.android.calendar", "a calendar page", ["calendar"]),
  a(1, "WhatsApp", "com.whatsapp", "a chat bubble with a phone handset", ["whatsapp", "wa"]),
  a(1, "Messenger", "com.facebook.orca", "a chat bubble with a lightning bolt", ["messenger"]),
  a(1, "Facebook", "com.facebook.katana", "a social feed", ["facebook", "fb"]),
  a(1, "Instagram", "com.instagram.android", "a camera outline with a dot", ["instagram", "ig", "insta"]),
  a(1, "TikTok", "com.zhiliaoapp.musically", "a musical note", ["tiktok"]),
  a(1, "Telegram", "org.telegram.messenger", "a paper plane", ["telegram"]),
  a(1, "Viber", "com.viber.voip", "a phone handset in a speech bubble", ["viber"]),
  a(1, "Spotify", "com.spotify.music", "sound waves", ["spotify"]),
  a(2, "Contacts", "com.google.android.contacts", "a person silhouette", ["contacts"]),
  a(2, "Calculator", "com.google.android.calculator", "plus and equals keys", ["calculator", "calc"]),
  a(2, "Files", "com.google.android.apps.nbu.files", "a folder", ["files"]),
  a(2, "Drive", "com.google.android.apps.docs", "a triangle of cloud storage", ["drive"]),
  a(2, "Keep", "com.google.android.keep", "a lightbulb note", ["keep"]),
  a(2, "Meet", "com.google.android.apps.tachyon", "a video camera", ["meet"]),
  a(2, "Translate", "com.google.android.apps.translate", "two speech characters", ["translate"]),
  a(2, "YouTube Music", "com.google.android.apps.youtube.music", "headphones with a play button", ["ytmusic", "youtubemusic"]),
  a(2, "Netflix", "com.netflix.mediaclient", "a streaming film ribbon", ["netflix"]),
  a(2, "X", "com.twitter.android", "a short post", ["x", "twitter"]),
  a(2, "Snapchat", "com.snapchat.android", "a friendly ghost", ["snapchat", "snap"]),
  a(2, "Discord", "com.discord", "a game controller face", ["discord"]),
  a(2, "Reddit", "com.reddit.frontpage", "an alien mascot", ["reddit"]),
  a(2, "LinkedIn", "com.linkedin.android", "a briefcase", ["linkedin"]),
  a(2, "Pinterest", "com.pinterest", "a push pin", ["pinterest"]),
  a(2, "Zoom", "us.zoom.videomeetings", "a video call camera", ["zoom"]),
  a(2, "Teams", "com.microsoft.teams", "two people at a table", ["teams"]),
  a(2, "Outlook", "com.microsoft.office.outlook", "an envelope with a calendar", ["outlook"]),
  a(2, "ChatGPT", "com.openai.chatgpt", "a knot of intertwined loops", ["chatgpt"]),
  a(2, "Gemini", "com.google.android.apps.bard", "a four-point sparkle", ["gemini"]),
  a(3, "KBZPay", "com.kbzbank.kpaycustomer", "a mobile wallet", ["kbzpay", "com.kbzbank.kbzpay"], "mm"),
  a(3, "Wave Money", "com.wavemoney.wavepay", "a wave over coins", ["wave", "wavemoney"], "mm"),
  a(3, "CB Pay", "com.cbbank.cbpay", "a bank card", ["cbpay"], "mm"),
  a(3, "MPT", "mm.com.mpt.mytel", "a mobile signal tower", ["mpt"], "mm"),
  a(3, "Grab", "com.grabtaxi.passenger", "a car on a road", ["grab"]),
  a(3, "Shopee", "com.shopee.mm", "a shopping bag", ["shopee"]),
  a(3, "Lazada", "com.lazada.android", "a shopping heart", ["lazada"]),
  a(3, "Viu", "com.vuclip.viu", "a streaming play button", ["viu"]),
  a(3, "Duolingo", "com.duolingo", "a cheerful owl", ["duolingo"]),
  a(3, "Firefox", "org.mozilla.firefox", "a fox curled around a globe", ["firefox"]),
  a(3, "Brave", "com.brave.browser", "a lion head shield", ["brave"]),
].sort((x, y) => x.tier - y.tier || Number(y.region === "mm") - Number(x.region === "mm"));

/** OEM variants: alias package -> canonical package. */
export const ALIAS_PACKAGES: Record<string, string> = {
  "com.samsung.android.dialer": "com.google.android.dialer",
  "com.sec.android.app.camera": "com.android.camera",
  "com.miui.gallery": "com.google.android.apps.photos",
};

export const PACKAGE_RE = /^[a-zA-Z][\w]*(\.[a-zA-Z][\w]*)+$/;
