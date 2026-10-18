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
