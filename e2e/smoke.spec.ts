import { expect, test } from '@playwright/test';
test('complete frontend Stage 0 journey', async ({ page }) => {
    await test.step('sign in and edit dietary preferences', async () => {
        await page.goto('/login');
        await page.getByRole('button', { name: 'Sign in' }).click();
        await expect(page.getByRole('heading', { name: /this week/i })).toBeVisible();
        await page.getByRole('link', { name: 'Settings' }).click();
        await page.getByLabel('Dietary patterns').fill('flexitarian, Mediterranean');
        await page.getByLabel('Preferences and constraints').fill('Fast weekday meals');
        await page.getByRole('button', { name: 'Save dietary profile' }).click();
        await expect(page.getByRole('status')).toContainText('Dietary preferences updated');
    });
    await test.step('create and edit an ingredient', async () => {
        await page.getByRole('link', { name: 'Ingredients' }).click();
        await page.getByRole('button', { name: 'Create ingredient' }).click();
        await page.getByLabel('Name').fill('Fresh Basil');
        await page.getByLabel('Default unit').fill('bunches');
        await page.getByRole('button', { name: 'Save ingredient' }).click();
        const ingredientCard = page.locator('section').filter({
            has: page.getByRole('heading', { name: 'Fresh Basil', exact: true }),
        });
        await expect(ingredientCard).toBeVisible();
        await ingredientCard.getByRole('button', { name: 'Edit' }).click();
        await ingredientCard.getByLabel('Notes').fill('Added and edited in Playwright');
        await ingredientCard.getByRole('button', { name: 'Save ingredient' }).click();
        await expect(page.getByRole('status')).toContainText('Ingredient updated');
    });
    await test.step('create a complete recipe', async () => {
        await page.getByRole('link', { name: 'Recipes' }).click();
        await page.getByRole('button', { name: 'Create recipe' }).click();
        await page.getByLabel('Name').fill('Basil Pasta Bowl');
        await page.getByLabel('Description').fill('A complete fresh basil pasta dinner.');
        await page.getByLabel('Cuisine').fill('Italian');
        await page.getByLabel('Step 1').fill('Cook and combine all ingredients.');
        await page.getByRole('button', { name: 'Save recipe' }).click();
        await expect(page.getByRole('heading', { name: 'Basil Pasta Bowl', exact: true })).toBeVisible();
    });
    await test.step('create a plan and add the recipe', async () => {
        await page.getByRole('link', { name: 'Meal plans' }).click();
        await page.getByRole('button', { name: 'Create plan' }).click();
        await page.getByLabel('Plan name').fill('E2E week');
        await page.getByRole('button', { name: 'Save plan' }).click();
        const planCard = page.locator('section').filter({
            has: page.getByRole('heading', { name: 'E2E week', exact: true }),
        }).first();
        await expect(planCard.getByLabel('E2E week weekly grid')).toBeVisible();
        await planCard.getByRole('button', { name: 'Add meal' }).click();
        await planCard.getByLabel('Recipe').selectOption({ label: 'Basil Pasta Bowl' });
        await planCard.getByRole('button', { name: 'Save meal' }).click();
        await expect(planCard.getByText('Basil Pasta Bowl')).toBeVisible();
    });
    await test.step('generate and modify the shopping list', async () => {
        await page.getByRole('link', { name: 'Shopping' }).click();
        await page.getByLabel('Source plan').selectOption({ label: 'E2E week' });
        await page.getByRole('button', { name: /generate list/i }).click();
        await page.getByLabel('Manual item').fill('Coffee');
        await page.getByRole('button', { name: 'Add manual item' }).click();
        await expect(page.getByText(/Coffee/)).toBeVisible();
    });
    await test.step('exercise invitation and reset flows', async () => {
        await page.getByRole('link', { name: 'Household' }).click();
        await page.getByLabel('Email').fill('e2e-invite@example.com');
        await page.getByRole('button', { name: 'Invite' }).click();
        await expect(page.getByText(/e2e-invite@example.com/)).toBeVisible();
        await page.getByRole('link', { name: 'Settings' }).click();
        page.once('dialog', (dialog) => dialog.accept());
        await page.getByRole('button', { name: 'Reset dummy data' }).click();
        await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible();
    });
});
async function signInAs(page: import('@playwright/test').Page, account: string) {
    await page.goto('/login');
    await page.getByLabel('Demo account').selectOption(account);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('heading', { name: /this week/i })).toBeVisible();
}
test('administrator cannot manage owners', async ({ page }) => {
    await signInAs(page, 'admin@mealplanner.dev');
    await page.getByRole('link', { name: 'Household' }).click();
    const ownerRow = page.getByText('Avery Stone · owner@mealplanner.dev').locator('..');
    await expect(ownerRow.getByRole('combobox')).toHaveCount(0);
    await expect(ownerRow.getByRole('button', { name: 'Remove' })).toHaveCount(0);
});
test('member sees shopping data without mutation controls', async ({ page }) => {
    await signInAs(page, 'member@mealplanner.dev');
    await page.getByRole('link', { name: 'Shopping' }).click();
    await expect(page.getByText('First week groceries')).toBeVisible();
    await expect(page.getByRole('button', { name: /generate|regenerate|save|remove|clear checked|add manual/i })).toHaveCount(0);
    await expect(page.getByRole('checkbox')).toHaveCount(0);
    await expect(page.getByLabel('Quantity')).toHaveCount(0);
    await expect(page.getByLabel('Unit')).toHaveCount(0);
});
