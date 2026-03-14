import { test, expect } from '@playwright/test'

const uiBase = process.env.E2E_UI_URL ?? 'http://localhost:5173'
const govBase = process.env.E2E_GOV_URL ?? 'http://localhost:8001'

const publisherToken = process.env.E2E_PUBLISHER_TOKEN ?? 'local_admin_token'
const viewerToken = process.env.E2E_VIEWER_TOKEN ?? 'viewer_test_token'
const editorToken = process.env.E2E_EDITOR_TOKEN ?? 'editor_test_token'

const roles = [
  { name: 'viewer', token: viewerToken },
  { name: 'editor', token: editorToken },
  { name: 'publisher', token: publisherToken },
] as const

const navByRole = {
  viewer: {
    visible: ['Dashboard', 'Tickets', 'Taxonomy', 'Knowledge Base', 'Policy', 'Customers', 'Analytics'],
    hidden: ['Sandbox', 'System Admin'],
    blockedPaths: ['/sandbox', '/system'],
  },
  editor: {
    visible: ['Dashboard', 'Sandbox', 'Tickets', 'Taxonomy', 'Knowledge Base', 'Policy', 'Customers', 'Analytics'],
    hidden: ['System Admin'],
    blockedPaths: ['/system'],
  },
  publisher: {
    visible: ['Dashboard', 'Sandbox', 'Tickets', 'Taxonomy', 'Knowledge Base', 'Policy', 'Customers', 'Analytics', 'System Admin'],
    hidden: [],
    blockedPaths: [],
  },
} as const

test.beforeAll(async ({ request }) => {
  const headers = { 'X-Admin-Token': publisherToken }
  const users = [
    { api_token: viewerToken, role: 'viewer' },
    { api_token: editorToken, role: 'editor' },
  ]

  for (const user of users) {
    const res = await request.post(`${govBase}/admin/users`, {
      headers,
      data: user,
    })
    if (![200, 409].includes(res.status())) {
      throw new Error(`Failed to ensure ${user.role} user: ${res.status()}`)
    }
  }
})

async function login(page, token: string) {
  await page.goto(`${uiBase}/login`)
  await page.getByLabel('Admin Token').fill(token)
  await page.getByRole('button', { name: 'Sign In' }).click()
  await expect(page).toHaveURL(/\/dashboard/)
}

async function assertNavVisibility(page, visible: readonly string[], hidden: readonly string[]) {
  for (const label of visible) {
    await expect(page.getByRole('link', { name: label })).toBeVisible()
  }
  for (const label of hidden) {
    await expect(page.getByRole('link', { name: label })).toHaveCount(0)
  }
}

test.describe('Role-based access', () => {
  for (const role of roles) {
    test(`${role.name} navigation access`, async ({ page }) => {
      const errors: string[] = []
      page.on('pageerror', (err) => errors.push(err.message))

      await login(page, role.token)

      const expectations = navByRole[role.name]
      await assertNavVisibility(page, expectations.visible, expectations.hidden)

      for (const path of expectations.blockedPaths) {
        await page.goto(`${uiBase}${path}`)
        await expect(page).toHaveURL(/\/dashboard/)
      }

      expect(errors, 'No page errors should be thrown').toEqual([])
    })
  }
})
