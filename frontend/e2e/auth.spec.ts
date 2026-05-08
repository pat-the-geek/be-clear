import { test, expect } from '@playwright/test'

const ADMIN = { username: 'admin', password: 'admin' }

test.describe('Authentification', () => {
  test('login admin/admin réussi → redirige vers panel', async ({ page }) => {
    await page.goto('/login')
    await page.getByRole('textbox', { name: /identifiant/i }).fill(ADMIN.username)
    await page.getByLabel(/mot de passe/i).fill(ADMIN.password)
    await page.getByRole('button', { name: /connexion/i }).click()

    await expect(page).not.toHaveURL(/\/login/)
    await expect(page.getByRole('navigation')).toBeVisible()
  })

  test('mauvais mot de passe → message d\'erreur', async ({ page }) => {
    await page.goto('/login')
    await page.getByRole('textbox', { name: /identifiant/i }).fill('admin')
    await page.getByLabel(/mot de passe/i).fill('mauvais')
    await page.getByRole('button', { name: /connexion/i }).click()

    await expect(page.getByText(/identifiants invalides|incorrect|erreur/i)).toBeVisible()
  })

  test('page protégée sans token → redirige vers login', async ({ page }) => {
    await page.goto('/eng')
    await expect(page).toHaveURL(/\/login/)
  })
})
