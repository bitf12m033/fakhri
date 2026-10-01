import { expect, test } from '@playwright/test';
import { PRODUCTS } from '../support/env';

/** Discovery: nav, facets, sort, search, PDP and compare (REQ-01/02/04/05/07/08/09/10). */
test.describe('browsing the catalog', () => {
  test('category navigation, composable filters and a PDP with structured data', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('navigation', { name: 'Categories' }).getByRole('link', { name: 'Air Conditioners' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Air Conditioners' })).toBeVisible();
    await expect(page.getByTestId('result-count')).toHaveText('4 products');

    // Facets compose, and the URL carries the state (REQ-04).
    const filters = page.getByRole('complementary', { name: 'Filters' });
    await filters.getByRole('link', { name: /^Inverter/ }).click();
    await expect(page).toHaveURL(/attr=energy-type%3Ainverter/);
    await expect(page.getByTestId('result-count')).toHaveText('3 products');
    await filters.getByRole('link', { name: /^Haier/ }).click();
    await expect(page).toHaveURL(/brand=haier/);
    await expect(page.getByTestId('result-count')).toHaveText('1 product');

    // A numeric range filter works without JavaScript too: it is a plain GET form.
    await filters.getByRole('link', { name: 'Clear all' }).click();
    await page.getByRole('group', { name: 'Cooling capacity (BTU)' }).getByLabel('Minimum').fill('20000');
    await page.getByRole('group', { name: 'Cooling capacity (BTU)' }).getByRole('button', { name: 'Go' }).click();
    await expect(page.getByTestId('result-count')).toHaveText('1 product');
    await expect(page.getByTestId('product-card')).toContainText('Orient Ultron 2 Ton');

    // Sorting (REQ-07).
    await page.goto('/category/air-conditioners?sort=price_asc');
    await expect(page.getByTestId('product-card').first()).toContainText('Dawlance');
    await page.getByLabel('Sort by').selectOption('price_desc');
    await expect(page).toHaveURL(/sort=price_desc/);
    await expect(page.getByTestId('product-card').first()).toContainText('Orient Ultron');

    // PDP: specs from the attribute template, price, availability, JSON-LD (REQ-05/10).
    await page.getByRole('link', { name: 'Haier 1.5 Ton Inverter Split AC HSU-18HFPAA' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Haier 1.5 Ton Inverter Split AC HSU-18HFPAA');
    await expect(page.getByRole('row', { name: /Cooling capacity/ })).toContainText('18000 BTU');
    await expect(page.getByTestId('buy-box')).toContainText('Rs 1,89,999.00');
    await expect(page.getByTestId('buy-box')).toContainText('In stock');
    const jsonLd = await page.locator('script[type="application/ld+json"]').textContent();
    expect(JSON.parse(jsonLd ?? '[]').map((entry: { '@type': string }) => entry['@type'])).toEqual([
      'Product',
      'BreadcrumbList',
    ]);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/product\/haier-hsu-18hfpaa-inverter-ac$/);
  });

  test('search with suggestions, and a side-by-side comparison', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('combobox', { name: 'Search products' }).fill('inverter');
    await expect(page.getByRole('listbox', { name: 'Suggestions' })).toContainText('Gree 1 Ton Pular Inverter AC');
    await page.getByRole('combobox', { name: 'Search products' }).press('Enter');
    await expect(page).toHaveURL(/\/search\?q=inverter/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('inverter');
    const cards = page.getByTestId('product-card');
    await expect(cards.first()).toBeVisible();

    // Compare two products (REQ-08): only shared comparable specs are shown.
    await page.goto('/category/air-conditioners?sort=name_asc');
    await cards.filter({ hasText: 'Dawlance' }).getByLabel('Compare').check();
    await cards.filter({ hasText: 'Gree' }).getByLabel('Compare').check();
    await page.getByRole('link', { name: 'Compare now' }).click();
    const table = page.getByTestId('compare-table');
    await expect(table).toContainText('Dawlance 1.5 Ton Mega T');
    await expect(table).toContainText('Gree 1 Ton Pular');
    await expect(table.getByRole('row', { name: /Compressor/ })).toContainText('Fixed speed');
    await expect(table.getByRole('row', { name: /Compressor/ })).toContainText('Inverter');
    await page.getByRole('button', { name: 'Clear comparison' }).click();
    await expect(page).toHaveURL('/');
  });

  test('brand pages and content pages render from the API', async ({ page }) => {
    await page.goto('/brands');
    await page.getByRole('link', { name: /^Samsung/ }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Samsung' })).toBeVisible();
    await expect(page.getByTestId('product-card')).toContainText('Samsung Crystal UHD');
    await page.getByRole('link', { name: 'Samsung Crystal UHD 4K Smart TV' }).click();
    // Variants are chosen on the PDP (REQ-06).
    await page.getByTestId('buy-box').getByLabel('55 inch').check();
    await expect(page.getByTestId('buy-box')).toContainText('Rs 1,84,999.00');
    await expect(page).toHaveURL(new RegExp(`/product/${PRODUCTS.samsung}$`));

    await page.getByRole('link', { name: 'Returns & warranty' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Returns and warranty' })).toBeVisible();
  });
});
