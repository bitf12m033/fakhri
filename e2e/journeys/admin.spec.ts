import { expect, test } from '@playwright/test';
import { ADMINS } from '../support/env';
import { adminSignIn, eventually } from '../support/flows';

/** The console's access boundaries and the publish-to-storefront path (REQ-29/33/10). */
test.describe('admin console', () => {
  test('an anonymous visitor is sent to sign in, and roles see only their sections', async ({ page }) => {
    await page.goto('/admin/orders');
    await expect(page).toHaveURL(/\/admin\/login\?next=%2Fadmin%2Forders/);

    await adminSignIn(page, ADMINS.catalog, '/admin');
    const nav = page.getByRole('navigation', { name: 'Admin' });
    await expect(nav.getByRole('link', { name: 'Products' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Orders' })).toHaveCount(0);
    await expect(nav.getByRole('link', { name: 'Admin users' })).toHaveCount(0);

    // Typing the URL does not get past the role either.
    await page.goto('/admin/orders');
    await expect(page.getByRole('alert').filter({ hasText: 'Your role cannot open this section' })).toBeVisible();

    await nav.getByRole('button', { name: 'Sign out' }).click();
    await page.waitForURL(/\/admin\/login/);
    await page.goto('/admin/products');
    await expect(page).toHaveURL(/\/admin\/login/);
  });

  test('an edit to a live page reaches the cached storefront page through revalidation', async ({ page, browser }) => {
    const slug = `e2e-notice-${Date.now()}`;
    await adminSignIn(page, ADMINS.marketing, '/admin/content');
    await page.goto('/admin/content/pages/new');
    await page.getByLabel('Title', { exact: true }).fill('Eid delivery schedule');
    await page.getByLabel('Slug').fill(slug);
    await page.getByLabel('Body').fill('Deliveries pause for two days over Eid.');
    await page.getByLabel(/Publish now/).check();
    await page.getByRole('button', { name: 'Create page' }).click();
    await page.waitForURL(/\/admin\/content\/pages\/[^/]+\?created=1/);

    // A shopper loads it once, which puts it in the storefront's cache.
    const shopper = await (await browser.newContext()).newPage();
    await shopper.goto(`/pages/${slug}`);
    await expect(shopper.getByText('Deliveries pause for two days')).toBeVisible();

    // The edit emits CONTENT_UPDATED; the outbox posts the signed tag to the storefront.
    await page.getByLabel('Body').fill('Deliveries pause for three days over Eid.');
    await page.getByRole('button', { name: 'Save page' }).click();
    await expect(page.getByRole('status').first()).toBeVisible();

    await eventually(shopper, `/pages/${slug}`, async () => {
      await expect(shopper.getByText('Deliveries pause for three days')).toBeVisible({ timeout: 1000 });
    });
  });
});
