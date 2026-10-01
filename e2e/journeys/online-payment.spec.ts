import { expect, test } from '@playwright/test';
import { uniquePhone } from '../support/api';
import { PRODUCTS } from '../support/env';
import { addToCart, refFrom } from '../support/flows';

/**
 * Online payment through the mock gateway (REQ-21): the order is placed, the
 * shopper is redirected to the provider, and the signed callback confirms it.
 */
test.describe('paying online', () => {
  test('a declined payment puts the order on hold and says so', async ({ page }) => {
    await addToCart(page, PRODUCTS.samsung, { option: '43 inch' });
    await page.goto('/checkout');
    await page.getByLabel('Mobile number').fill(uniquePhone());
    await page.getByLabel('Store pickup, Lahore (free)').check();
    await expect(page.getByTestId('delivery-fee')).toHaveText('Free');
    await expect(page.getByTestId('checkout-total')).toHaveText('Rs 1,24,999.00');
    await page.getByLabel('JazzCash').check();
    await page.getByRole('button', { name: 'Place order and pay' }).click();

    // The mock provider's page.
    await page.waitForURL(/\/checkout\/return\?/);
    await expect(page.getByRole('heading', { name: 'Pay Rs 1,24,999.00' })).toBeVisible();
    await page.getByRole('button', { name: 'Decline' }).click();

    await page.waitForURL(/\/orders\/FK-.*payment=failed/);
    const ref = refFrom(page.url());
    await expect(page.getByRole('alert').filter({ hasText: 'on hold' })).toBeVisible();
    await expect(page.getByTestId('order-ref')).toHaveText(`Order ${ref}`);
    await expect(page.locator('.pill').nth(1)).toHaveText('Payment failed');
    // A declined payment is final for that payment record (3.6): nothing offers to charge it again.
    await expect(page.getByRole('button', { name: 'Pay now' })).toHaveCount(0);
  });

  test('paying succeeds and the order moves to confirmed', async ({ page }) => {
    await addToCart(page, PRODUCTS.samsung, { option: '43 inch' });
    await page.goto('/checkout');
    await page.getByLabel('Mobile number').fill(uniquePhone());
    await page.getByLabel('Store pickup, Lahore (free)').check();
    await page.getByLabel('Easypaisa').check();
    await expect(page.getByTestId('checkout-total')).toHaveText('Rs 1,24,999.00');
    await page.getByRole('button', { name: 'Place order and pay' }).click();

    await page.waitForURL(/\/checkout\/return\?/);
    await page.getByRole('button', { name: 'Pay now' }).click();
    await page.waitForURL(/\/orders\/FK-.*payment=succeeded/);
    await expect(page.getByRole('status').filter({ hasText: 'Payment received' })).toBeVisible();
    await expect(page.locator('.pill').first()).toHaveText('Confirmed');
    await expect(page.locator('.pill').nth(1)).toHaveText('Paid');
  });
});
