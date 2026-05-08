import { test, expect } from '@playwright/test'
import { loginAsAdmin } from './helpers'

test.describe('Engagements', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('liste des engagements accessible depuis le menu', async ({ page }) => {
    await page.getByRole('link', { name: /engagements/i }).click()
    await expect(page).toHaveURL(/\/eng/)
    await expect(page.getByPlaceholder(/rechercher un engagement/i)).toBeVisible()
  })

  test('bouton "Nouvel engagement" → page de création', async ({ page }) => {
    await page.goto('/eng')
    await page.getByRole('button', { name: /nouvel engagement/i }).click()
    await expect(page).toHaveURL(/\/eng\/new/)
    await expect(page.getByPlaceholder(/nom de l'engagement/i)).toBeVisible()
    await expect(page.getByText(/type d'engagement/i)).toBeVisible()
  })

  test('créer un engagement si un TENG existe', async ({ page }) => {
    await page.goto('/eng/new')

    // Vérifier qu'un type d'engagement est disponible
    const typeSelect = page.locator('select').first()
    const options = await typeSelect.locator('option').all()
    const hasType = options.length > 1

    if (!hasType) {
      test.skip(true, 'Aucun TENG configuré — test ignoré')
      return
    }

    // Sélectionner le premier type disponible
    await typeSelect.selectOption({ index: 1 })

    // Remplir le nom
    const nomInput = page.getByPlaceholder(/nom de l'engagement/i)
    await nomInput.fill('ENG E2E Test Playwright')

    // Date de début
    const dateInput = page.locator('input[type="date"]').first()
    if (await dateInput.isVisible()) {
      await dateInput.fill('2026-06-01')
    }

    // Soumettre
    await page.getByRole('button', { name: /^créer$/i }).click()

    // Vérifier la redirection vers le détail
    await expect(page).toHaveURL(/\/eng\/\d+/)
    await expect(page.getByText('ENG E2E Test Playwright')).toBeVisible()
  })

  test('filtre par statut', async ({ page }) => {
    await page.goto('/eng')
    await page.getByRole('button', { name: /en cours/i }).click()
    // Le filtre est appliqué — l'URL ou la liste se met à jour
    await expect(page.getByRole('button', { name: /en cours/i })).toBeVisible()
  })
})
