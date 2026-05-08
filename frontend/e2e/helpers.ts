import { Page } from '@playwright/test'

export async function loginAsAdmin(page: Page) {
  await page.goto('/login')
  await page.getByRole('textbox', { name: /identifiant/i }).fill('admin')
  await page.getByLabel(/mot de passe/i).fill('admin')
  await page.getByRole('button', { name: /connexion/i }).click()
  await page.waitForURL((url) => !url.pathname.includes('/login'))
}
