/**
 * Project directory discovery — scans common locations for git repos.
 *
 * GET /api/pilot/projects — returns list of project directories
 */

import Router from '@koa/router'
import { readdir, stat, access } from 'fs/promises'
import { resolve, basename } from 'path'
import { homedir } from 'os'

export const projectRoutes = new Router()

interface ProjectInfo {
  name: string
  path: string
  hasGit: boolean
}

/** Directories to scan for projects (in order of priority). */
const SCAN_ROOTS = [
  resolve(homedir(), 'projects/own'),
  resolve(homedir(), 'projects'),
  resolve(homedir(), 'repos'),
  resolve(homedir(), 'src'),
  resolve(homedir(), 'work'),
  resolve(homedir(), 'dev'),
]

async function exists(p: string): Promise<boolean> {
  try { await access(p); return true } catch { return false }
}

async function scanForProjects(): Promise<ProjectInfo[]> {
  const projects: ProjectInfo[] = []
  const seen = new Set<string>()

  for (const root of SCAN_ROOTS) {
    if (!(await exists(root))) continue

    try {
      const entries = await readdir(root, { withFileTypes: true })
      for (const entry of entries) {
        if (!entry.isDirectory()) continue
        if (entry.name.startsWith('.')) continue

        const fullPath = resolve(root, entry.name)
        if (seen.has(fullPath)) continue
        seen.add(fullPath)

        const hasGit = await exists(resolve(fullPath, '.git'))
        projects.push({
          name: entry.name,
          path: fullPath,
          hasGit,
        })
      }
    } catch {
      // Permission denied or other error — skip
    }
  }

  // Also add ~/.pilot/pilot-agent itself
  const pilotAgent = resolve(homedir(), '.pilot/pilot-agent')
  if (await exists(pilotAgent) && !seen.has(pilotAgent)) {
    projects.push({
      name: 'pilot-agent',
      path: pilotAgent,
      hasGit: await exists(resolve(pilotAgent, '.git')),
    })
  }

  // Sort: git repos first, then alphabetical
  projects.sort((a, b) => {
    if (a.hasGit !== b.hasGit) return a.hasGit ? -1 : 1
    return a.name.localeCompare(b.name)
  })

  return projects
}

projectRoutes.get('/api/pilot/projects', async (ctx) => {
  const projects = await scanForProjects()
  ctx.body = { projects }
})
