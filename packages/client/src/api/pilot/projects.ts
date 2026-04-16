import { request } from '@/api/client'

export interface ProjectInfo {
  name: string
  path: string
  hasGit: boolean
}

export async function fetchProjects(): Promise<{ projects: ProjectInfo[] }> {
  return request('/api/pilot/projects')
}
