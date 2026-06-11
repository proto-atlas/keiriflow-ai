import { expect, test } from "@playwright/test";

const routes = [
  { path: "/dashboard", heading: "経理レビュー ダッシュボード" },
  { path: "/invoices", heading: "証憑一覧" },
  { path: "/invoices/new", heading: "証憑を追加" },
  { path: "/invoices/export", heading: "CSV出力" },
  { path: "/invoices/doc-001", heading: "サンプル広告株式会社" },
];

test.describe("主要画面", () => {
  for (const route of routes) {
    test(`${route.path} がエラー画面にならない`, async ({ page }) => {
      const serverErrors: string[] = [];
      const pageErrors: string[] = [];
      const consoleErrors: string[] = [];

      page.on("response", (response) => {
        if (response.status() >= 500) {
          serverErrors.push(`${response.status()} ${response.url()}`);
        }
      });
      page.on("pageerror", (error) => pageErrors.push(error.message));
      page.on("console", (message) => {
        if (message.type() === "error") {
          consoleErrors.push(message.text());
        }
      });

      const response = await page.goto(route.path, { waitUntil: "domcontentloaded" });

      expect(response?.status(), route.path).toBe(200);
      await expect(page.getByRole("heading", { name: route.heading })).toBeVisible();
      await expect(page.getByText("Application error")).toHaveCount(0);
      await expect(page.getByText("Internal Server Error")).toHaveCount(0);
      expect(serverErrors).toEqual([]);
      expect(pageErrors).toEqual([]);
      expect(consoleErrors).toEqual([]);
    });
  }
});
