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
    await expect(
      page.getByRole('heading', { name: 'Basil Pasta Bowl', exact: true }),
    ).toBeVisible();
  });
  await test.step('create a plan and add the recipe', async () => {
    await page.getByRole('link', { name: 'Meal plans' }).click();
    await page.getByRole('button', { name: 'Create plan' }).click();
    await page.getByLabel('Plan name').fill('E2E week');
    await page.getByRole('button', { name: 'Save plan' }).click();
    await page.getByRole('button', { name: /E2E week/ }).click();
    const planCard = page.getByTestId(/plan-/).filter({
      has: page.getByRole('heading', { name: 'E2E week', exact: true }),
    });
    await expect(planCard.getByLabel('E2E week weekly calendar')).toBeVisible();
    // Match the workspace-level action, not any of the seven date-specific actions.
    await planCard.getByRole('button', { name: 'Add meal', exact: true }).click();
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
  await test.step('accept invitation, sign out, and sign in as the new member', async () => {
    await page.getByRole('link', { name: 'Household' }).click();
    await page.getByLabel('Email').fill('e2e-invite@example.com');
    await page.getByRole('button', { name: 'Invite' }).click();
    const invitationRow = page.getByText(/e2e-invite@example.com/).locator('..');
    await invitationRow.getByRole('button', { name: 'Generate preview link' }).click();
    const acceptanceLink = invitationRow.getByRole('link', { name: 'Open acceptance preview' });
    await expect(acceptanceLink).toBeVisible();
    await acceptanceLink.click();
    await page.getByLabel('Display name').fill('E2E Invitee');
    await page.getByLabel('Create password').fill('invitee-password');
    await page.getByRole('button', { name: 'Accept invitation and sign in' }).click();
    await expect(page.getByRole('heading', { name: /this week/i })).toBeVisible();
    await page.getByRole('button', { name: 'Sign out' }).click();
    await page.getByLabel('Email').fill('e2e-invite@example.com');
    await page.getByLabel('Password').fill('invitee-password');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('heading', { name: /this week/i })).toBeVisible();
  });
});
async function signInAs(page: import('@playwright/test').Page, account: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(account);
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
  await page.getByRole('link', { name: 'Household' }).click();
  await expect(page.getByRole('heading', { name: 'Invitations' })).toHaveCount(0);
  await page.getByRole('link', { name: 'Shopping' }).click();
  await expect(page.getByText('First week groceries')).toBeVisible();
  await expect(
    page.getByRole('button', { name: /generate|regenerate|save|remove|clear checked|add manual/i }),
  ).toHaveCount(0);
  await expect(page.getByRole('checkbox')).toHaveCount(0);
  await expect(page.getByLabel('Quantity')).toHaveCount(0);
  await expect(page.getByLabel('Unit')).toHaveCount(0);
});

test('meal plan workspace supports deep links, day actions, meal changes, and responsive layouts', async ({
  page,
}) => {
  await signInAs(page, 'owner@mealplanner.dev');
  await page.goto('/plans?open=plan-current');
  const workspace = page.getByTestId('plan-plan-current');
  await expect(workspace.getByRole('heading', { name: 'First week of August' })).toBeVisible();
  await expect(page).toHaveURL(/open=plan-current/);

  const monday = workspace.getByRole('region', { name: /Monday/ });
  await monday.getByRole('button', { name: /Add meal on Monday/ }).click();
  await expect(workspace.getByLabel('Date')).toHaveValue('2026-08-03');
  await workspace.getByLabel('Recipe').selectOption('rec-tacos');
  await workspace.getByLabel('Notes').fill('Second Monday meal');
  await workspace.getByRole('button', { name: 'Save meal' }).click();
  await expect(monday.getByText('Chicken Black Bean Tacos')).toBeVisible();
  await expect(monday.getByText('Second Monday meal')).toBeVisible();

  await monday.getByRole('button', { name: 'Edit or move Chicken Black Bean Tacos' }).click();
  await workspace.getByLabel('Date').fill('2026-08-04');
  await workspace.getByRole('button', { name: 'Save meal' }).click();
  const tuesday = workspace.getByRole('region', { name: /Tuesday/ });
  await expect(tuesday.getByText('Chicken Black Bean Tacos')).toBeVisible();
  await tuesday.getByRole('button', { name: 'Remove Chicken Black Bean Tacos' }).click();
  await expect(tuesday.getByText('Chicken Black Bean Tacos')).toHaveCount(0);

  await page.goto('/plans?open=missing-plan');
  await expect(page.getByRole('status')).toContainText('could not be found');
  await expect(page.getByTestId('plan-plan-current')).toBeVisible();

  await page.setViewportSize({ width: 1440, height: 900 });
  const desktopDays = page
    .getByLabel('First week of August weekly calendar')
    .locator(':scope > section');
  await expect(desktopDays).toHaveCount(7);
  const firstBox = await desktopDays.nth(0).boundingBox();
  const lastBox = await desktopDays.nth(6).boundingBox();
  expect(firstBox?.y).toBe(lastBox?.y);

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileFirst = await desktopDays.nth(0).boundingBox();
  const mobileSecond = await desktopDays.nth(1).boundingBox();
  expect(mobileSecond!.y).toBeGreaterThan(mobileFirst!.y + mobileFirst!.height - 1);
});

test('meal plans are read-only for members', async ({ page }) => {
  await signInAs(page, 'member@mealplanner.dev');
  await page.goto('/plans?open=plan-current');
  await expect(page.getByTestId('plan-plan-current')).toBeVisible();
  await expect(
    page.getByRole('button', {
      name: /create plan|add meal|edit plan|archive plan|delete plan|edit or move|remove/i,
    }),
  ).toHaveCount(0);
});

test('logout clears protected data even after browser back', async ({ page }) => {
  await signInAs(page, 'owner@mealplanner.dev');
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goBack();
  await expect(page.getByText('Avery Stone · owner')).toHaveCount(0);
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: 'Session required' })).toBeVisible();
});

test('dummy-data reset clears protected data even after browser back', async ({ page }) => {
  await signInAs(page, 'owner@mealplanner.dev');
  await page.getByRole('link', { name: 'Settings' }).click();
  page.on('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Reset dummy data' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goBack();
  await expect(page.getByText('Avery Stone · owner')).toHaveCount(0);
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Session required' })).toBeVisible();
});
