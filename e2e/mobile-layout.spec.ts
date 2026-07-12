import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 375, height: 812 } });

test("スマホ幅でダッシュボードを開くとページ全体が横にはみ出さない", async ({ page }) => {
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "経理レビュー ダッシュボード" }).waitFor();

  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );

  expect(hasHorizontalOverflow).toBe(false);
});

test("スマホ幅で証憑一覧を開くと表の枠内だけ横スクロールできる", async ({ page }) => {
  await page.goto("/invoices", { waitUntil: "domcontentloaded" });
  const tableContainer = page.getByRole("table").locator("..");
  await tableContainer.waitFor();

  const scrollLeft = await tableContainer.evaluate((element) => {
    element.scrollLeft = 100;
    return element.scrollLeft;
  });

  expect(scrollLeft).toBeGreaterThan(0);
});

test("スマホ幅の証憑一覧ではページ全体が横にはみ出さない", async ({ page }) => {
  await page.goto("/invoices", { waitUntil: "domcontentloaded" });
  await page.getByRole("table").waitFor();

  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );

  expect(hasHorizontalOverflow).toBe(false);
});
