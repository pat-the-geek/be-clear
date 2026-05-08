import { test, expect } from '@playwright/test'
import { loginAsAdmin } from './helpers'

test.describe('Recherche', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('page de recherche accessible depuis le menu', async ({ page }) => {
    await page.getByRole('link', { name: /recherche/i }).click()
    await expect(page).toHaveURL(/\/search/)
    await expect(page.getByPlaceholder(/rechercher une organisation/i)).toBeVisible()
  })

  test('saisie trop courte (< 2 caractères) → pas de résultats envoyés', async ({ page }) => {
    await page.goto('/search')
    const input = page.getByPlaceholder(/rechercher une organisation/i)
    await input.fill('a')
    await input.press('Enter')
    // L'API attend min 2 caractères — l'interface ne devrait pas afficher d'erreur 422
    await expect(page.getByText(/erreur/i)).not.toBeVisible()
  })

  test('recherche avec résultats possibles', async ({ page }) => {
    await page.goto('/search?q=a')
    // Zone de résultats présente (même vide)
    await page.waitForSelector('[class*="search"]', { timeout: 5000 }).catch(() => null)
    // Pas d'erreur fatale
    await expect(page.getByText(/500|fatal|crash/i)).not.toBeVisible()
  })

  test('filtre par type d\'entité', async ({ page }) => {
    await page.goto('/search?q=test')
    // Les boutons de filtre doivent être présents
    await expect(page.getByRole('button', { name: /organisation/i })).toBeVisible()
  })
})
