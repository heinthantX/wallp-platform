import { expect, test } from "@playwright/test";
import { SETUP_TOKEN } from "./global-setup";

const EMAIL = "e2e@wallp.test";
const PASSWORD = "e2e-password-123";

test("setup, login, festival, generate theme, publish checks, logout", async ({ page }) => {
  // First-run setup
  await page.goto("/login/");
  await expect(page.getByText("Create the first admin")).toBeVisible();
  await page.getByLabel("Full Name").fill("E2E Admin");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Confirm Password").fill(PASSWORD);
  await page.getByLabel("Setup Token").fill(SETUP_TOKEN);
  await page.getByRole("button", { name: /create/i }).click();
  await expect(page).not.toHaveURL(/login/);

  // Log out and back in via the UI
  await page.evaluate(() => localStorage.clear());
  await page.context().clearCookies();
  await page.goto("/login/");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).not.toHaveURL(/login/);

  // Create a festival
  await page.goto("/festivals/edit/");
  await page.getByLabel("Festival Name").first().fill("E2E Festival");
  const saved = page.waitForResponse((r) => r.url().includes("/admin/v1/festivals") && r.request().method() === "POST");
  await page.getByRole("button", { name: "Save draft" }).click();
  const sr = await saved;
  expect(sr.ok(), await sr.text()).toBe(true);
  await page.waitForURL(/festivals\/edit\/?\?id=/);
  await page.goto("/festivals/");
  await expect(page.getByText("E2E Festival").first()).toBeVisible();

  // Generate themes
  await page.goto("/themes/generate/");
  await page.getByLabel("Festival", { exact: false }).first().click();
  await page.getByRole("option", { name: "E2E Festival" }).click();
  await page.getByRole("button", { name: /Generate Themes/ }).click();
  await expect(page.getByRole("button", { name: /Use this/ })).toHaveCount(6, { timeout: 60_000 });
  await page.getByRole("button", { name: /Use this/ }).first().click();
  await page.getByRole("button", { name: "Use this theme" }).click();
  await expect(page).toHaveURL(/\/themes\/edit\/?\?id=/);

  await expect(page.getByText(/not found|failed to load/i)).toHaveCount(0);

  // P2: pick related items by name, not by typing ids
  const packStatus = await page.evaluate(async () => {
    const tok = JSON.parse(localStorage.getItem("wallp_admin_auth")!).state.accessToken;
    const res = await fetch("http://127.0.0.1:18080/admin/v1/icon-packs", {
      method: "POST",
      headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
      body: JSON.stringify({ id: "e2e-pack", name: { en: "E2E Pack" }, style: {}, kind: "images", shape: "squircle", tile: "#1b1b2f", glyph: "#ffffff", ring: "#ffffff" }),
    });
    return res.status;
  });
  expect(packStatus).toBeLessThan(300);
  await page.reload();
  const pick = async (label: string | RegExp, option: RegExp) => {
    await page.getByRole("combobox", { name: label }).click();
    await page.getByRole("option", { name: option }).click();
  };
  await pick(/^Festival$/, /E2E Festival/);
  await pick(/Display \/ Clock Font/, /creepster/);
  await pick(/Bundled Icon Pack/, /E2E Pack/);
  await expect(page.getByRole("combobox", { name: /Bundled Icon Pack/ })).toContainText("E2E Pack");
  const themeSaved = page.waitForResponse((r) => r.url().includes("/admin/v1/themes/") && r.request().method() === "PATCH");
  await page.getByRole("button", { name: "Save draft" }).click();
  const tr = await themeSaved;
  expect(tr.ok(), await tr.text()).toBe(true);
  const { data: rawTheme } = await tr.json();
  const savedTheme = typeof rawTheme === "string" ? JSON.parse(rawTheme) : rawTheme;
  expect(savedTheme.iconPackId).toBe("e2e-pack");
  expect(savedTheme.fonts.display).toBe("creepster");
  expect(savedTheme.festivalId).toBeTruthy();

  // P4: quick theme wizard (upload -> palette -> icons/font -> draft theme)
  await page.goto("/themes/quick/");
  await pick(/^Festival$/, /E2E Festival/);
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAFklEQVR4nGP8z8Dwn4EIwESMolGFFFEIAD/yAhGRPa9CAAAAAElFTkSuQmCC",
    "base64"
  );
  await page.getByTestId("quick-image-input").setInputFiles({ name: "quick.png", mimeType: "image/png", buffer: png });
  await page.getByRole("button", { name: "Next" }).click();
  const cards = page.getByRole("button", { pressed: false });
  await expect(page.getByText(/^Pick a palette$/)).toBeVisible({ timeout: 60_000 });
  await cards.first().click();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Next" }).click();
  await pick(/Icon pack/, /E2E Pack/);
  await pick(/Clock font/, /creepster/);
  await page.getByRole("button", { name: "Next" }).click();
  const quickSaved = page.waitForResponse((r) => r.url().endsWith("/admin/v1/themes") && r.request().method() === "POST");
  await page.getByRole("button", { name: "Create draft theme" }).click();
  const qr = await quickSaved;
  expect(qr.ok(), await qr.text()).toBe(true);
  const quickBody = JSON.parse(qr.request().postData()!);
  const quick = quickBody.data ?? quickBody;
  expect(quick.wallpaperIds?.length).toBe(1);
  expect(quick.palette?.background).toBeTruthy();
  expect(quick.iconPackId).toBe("e2e-pack");
  await expect(page).toHaveURL(/\/themes\/edit\/?\?id=/);

  // Publish checks
  await page.goto("/publish/");
  await page.getByRole("button", { name: "Run checks" }).click();
  const results = page.getByRole("region", { name: "Check results" });
  // Either everything passes or the issue groups render; both are valid outcomes for a fresh catalog.
  await expect(results.getByText("All checks passed.").or(results.getByRole("heading", { name: /^(Errors?|Warnings?|Info|Notes?) \(\d+\)/i })).first()).toBeVisible();

  // Logout
  await page.getByRole("button", { name: /account|user|menu/i }).last().click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/login/);
});
