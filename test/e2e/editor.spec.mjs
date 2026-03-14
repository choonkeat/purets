import { test, expect } from "@playwright/test";

test.describe("File Navigation", () => {
  test("page loads and shows file list", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#file-list")).toBeVisible();
    const items = page.locator(".file-item");
    await expect(items.first()).toBeVisible();
    const count = await items.count();
    expect(count).toBeGreaterThan(0);
  });

  test("shows welcome message initially", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#welcome")).toBeVisible();
    await expect(page.locator("#welcome")).toContainText("Select a .tjson file");
  });

  test("clicking a file opens it in the editor", async ({ page }) => {
    await page.goto("/");
    // Wait for Monaco to load
    await page.waitForFunction(() => typeof window.monaco !== "undefined", null, { timeout: 15000 });

    // Click a valid file
    const fileItem = page.locator(".file-item", { hasText: "valid-basic.tjson" });
    await fileItem.click();

    // Welcome should be hidden, editor visible
    await expect(page.locator("#welcome")).toBeHidden();
    await expect(page.locator("#editor-container")).toBeVisible();
    await expect(page.locator("#filename")).toContainText("valid-basic.tjson");

    // Editor should have content (check Monaco has text)
    const editorContent = await page.evaluate(() => {
      return window.editor?.getValue() || "";
    });
    expect(editorContent).toContain("type");
  });

  test("clicking a different file switches content", async ({ page }) => {
    await page.goto("/");
    await page.waitForFunction(() => typeof window.monaco !== "undefined", null, { timeout: 15000 });

    // Open first file
    await page.locator(".file-item", { hasText: "valid-basic.tjson" }).click();
    await page.waitForTimeout(500);
    const content1 = await page.evaluate(() => window.editor?.getValue() || "");

    // Open different file
    await page.locator(".file-item", { hasText: "valid-unions.tjson" }).click();
    await page.waitForTimeout(500);
    const content2 = await page.evaluate(() => window.editor?.getValue() || "");

    // Content should be different
    expect(content1).not.toEqual(content2);
    await expect(page.locator("#filename")).toContainText("valid-unions.tjson");

    // The unions file should have Role type
    expect(content2).toContain("Role");
  });

  test("close button returns to welcome screen", async ({ page }) => {
    await page.goto("/");
    await page.waitForFunction(() => typeof window.monaco !== "undefined", null, { timeout: 15000 });

    // Open a file
    await page.locator(".file-item", { hasText: "valid-basic.tjson" }).click();
    await expect(page.locator("#editor-container")).toBeVisible();

    // Click close
    await page.locator("#close-btn").click();

    // Should return to welcome
    await expect(page.locator("#welcome")).toBeVisible();
    await expect(page.locator("#editor-container")).toBeHidden();

    // No file should be selected in sidebar
    const activeItems = page.locator(".file-item.active");
    await expect(activeItems).toHaveCount(0);
  });
});

test.describe("Type Checking", () => {
  test("valid file shows no errors in status", async ({ page }) => {
    await page.goto("/");
    await page.waitForFunction(() => typeof window.monaco !== "undefined", null, { timeout: 15000 });

    await page.locator(".file-item", { hasText: "valid-basic.tjson" }).click();

    // Wait for TS diagnostics to settle
    await page.waitForTimeout(2000);

    const status = page.locator("#status");
    // Should eventually show ok (no errors)
    await expect(status).toHaveClass(/ok/, { timeout: 10000 });
  });

  test("file with wrong type shows error count", async ({ page }) => {
    await page.goto("/");
    await page.waitForFunction(() => typeof window.monaco !== "undefined", null, { timeout: 15000 });

    await page.locator(".file-item", { hasText: "invalid-wrong-type.tjson" }).click();

    // Wait for TS diagnostics + our status update (2s delay after open)
    const status = page.locator("#status");
    await expect(status).toHaveClass(/error/, { timeout: 15000 });
    const text = await status.textContent();
    expect(text).toMatch(/\d+ error/);
  });

  test("file with missing field shows errors", async ({ page }) => {
    await page.goto("/");
    await page.waitForFunction(() => typeof window.monaco !== "undefined", null, { timeout: 15000 });

    await page.locator(".file-item", { hasText: "invalid-missing-field.tjson" }).click();

    // Wait for TS diagnostics, then check markers directly
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

    await page.locator(".file-item", { hasText: "invalid-wrong-type.tjson" }).click();

    // Wait for markers to be set
    await page.waitForTimeout(3000);

    // Check that Monaco has error markers
    const errorCount = await page.evaluate(() => {
      const model = window.editor?.getModel();
      if (!model) return 0;
      const markers = window.monaco.editor.getModelMarkers({ resource: model.uri });
      return markers.filter(m => m.severity === window.monaco.MarkerSeverity.Error).length;
    });

    expect(errorCount).toBeGreaterThan(0);
  });
});
