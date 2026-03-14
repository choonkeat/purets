import { test, expect } from "@playwright/test";

test.describe("File Navigation", () => {
  test("page loads and shows file list with correct branding", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#file-list")).toBeVisible();
    const items = page.locator(".file-item");
    await expect(items.first()).toBeVisible();
    const count = await items.count();
    expect(count).toBeGreaterThan(0);

    // Sidebar header should say .pure.ts, not .data.ts
    await expect(page.locator("#sidebar h2")).toContainText(".pure.ts");
  });

  test("shows welcome message initially", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#welcome")).toBeVisible();
    await expect(page.locator("#welcome")).toContainText("Select a .pure.ts file");
  });

  test("clicking a file opens it in the editor", async ({ page }) => {
    await page.goto("/");
    await page.waitForFunction(() => typeof window.monaco !== "undefined", null, { timeout: 15000 });

    const fileItem = page.locator(".file-item", { hasText: "valid-basic.pure.ts" });
    await fileItem.click();

    await expect(page.locator("#welcome")).toBeHidden();
    await expect(page.locator("#editor-container")).toBeVisible();
    await expect(page.locator("#filename")).toContainText("valid-basic.pure.ts");

    const editorContent = await page.evaluate(() => window.editor?.getValue() || "");
    expect(editorContent).toContain("type");
    expect(editorContent).toContain("const");
  });

  test("clicking a different file switches content", async ({ page }) => {
    await page.goto("/");
    await page.waitForFunction(() => typeof window.monaco !== "undefined", null, { timeout: 15000 });

    await page.locator(".file-item", { hasText: "valid-basic.pure.ts" }).click();
    await page.waitForTimeout(500);
    const content1 = await page.evaluate(() => window.editor?.getValue() || "");

    await page.locator(".file-item", { hasText: "valid-unions.pure.ts" }).click();
    await page.waitForTimeout(500);
    const content2 = await page.evaluate(() => window.editor?.getValue() || "");

    expect(content1).not.toEqual(content2);
    await expect(page.locator("#filename")).toContainText("valid-unions.pure.ts");
    expect(content2).toContain("Role");
  });

  test("close button returns to welcome screen", async ({ page }) => {
    await page.goto("/");
    await page.waitForFunction(() => typeof window.monaco !== "undefined", null, { timeout: 15000 });

    await page.locator(".file-item", { hasText: "valid-basic.pure.ts" }).click();
    await expect(page.locator("#editor-container")).toBeVisible();

    await page.locator("#close-btn").click();

    await expect(page.locator("#welcome")).toBeVisible();
    await expect(page.locator("#editor-container")).toBeHidden();
    await expect(page.locator(".file-item.active")).toHaveCount(0);
  });
});

test.describe("Type Checking", () => {
  test("valid file shows no errors in status", async ({ page }) => {
    await page.goto("/");
    await page.waitForFunction(() => typeof window.monaco !== "undefined", null, { timeout: 15000 });

    await page.locator(".file-item", { hasText: "valid-basic.pure.ts" }).click();

    await page.waitForTimeout(2000);
    const status = page.locator("#status");
    await expect(status).toHaveClass(/ok/, { timeout: 10000 });
  });

  test("file with wrong type shows error markers", async ({ page }) => {
    await page.goto("/");
    await page.waitForFunction(() => typeof window.monaco !== "undefined", null, { timeout: 15000 });

    await page.locator(".file-item", { hasText: "invalid-wrong-type.pure.ts" }).click();

    await page.waitForTimeout(3000);
    const errorCount = await page.evaluate(() => {
      const model = window.editor?.getModel();
      if (!model) return 0;
      const markers = window.monaco.editor.getModelMarkers({ resource: model.uri });
      return markers.filter(m => m.severity === window.monaco.MarkerSeverity.Error).length;
    });
    expect(errorCount).toBeGreaterThan(0);
  });

  test("file with missing field shows errors", async ({ page }) => {
    await page.goto("/");
    await page.waitForFunction(() => typeof window.monaco !== "undefined", null, { timeout: 15000 });

    await page.locator(".file-item", { hasText: "invalid-missing-field.pure.ts" }).click();

    await page.waitForTimeout(3000);
    const errorCount = await page.evaluate(() => {
      const model = window.editor?.getModel();
      if (!model) return 0;
      const markers = window.monaco.editor.getModelMarkers({ resource: model.uri });
      return markers.filter(m => m.severity === window.monaco.MarkerSeverity.Error).length;
    });
    expect(errorCount).toBeGreaterThan(0);
  });

  test("error markers appear on lines with type errors", async ({ page }) => {
    await page.goto("/");
    await page.waitForFunction(() => typeof window.monaco !== "undefined", null, { timeout: 15000 });

    await page.locator(".file-item", { hasText: "invalid-wrong-type.pure.ts" }).click();

    await page.waitForTimeout(3000);
    const errorCount = await page.evaluate(() => {
      const model = window.editor?.getModel();
      if (!model) return 0;
      const markers = window.monaco.editor.getModelMarkers({ resource: model.uri });
      return markers.filter(m => m.severity === window.monaco.MarkerSeverity.Error).length;
    });
    expect(errorCount).toBeGreaterThan(0);
  });
});
