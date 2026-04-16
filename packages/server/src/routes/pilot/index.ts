import Router from '@koa/router'
import { sessionRoutes } from './sessions'
import { profileRoutes } from './profiles'
import { configRoutes } from './config'
import { fsRoutes } from './filesystem'
import { logRoutes } from './logs'
import { pipelineRoutes } from './pipeline'
import { projectRoutes } from './projects'
import { weixinRoutes } from './weixin'
import { proxyRoutes, proxyMiddleware } from './proxy'
import { setupTerminalWebSocket } from './terminal'
import { setupPipelineWebSocket } from './pipeline-ws'

export const pilotRoutes = new Router()

pilotRoutes.use(sessionRoutes.routes())
pilotRoutes.use(profileRoutes.routes())
pilotRoutes.use(configRoutes.routes())
pilotRoutes.use(fsRoutes.routes())
pilotRoutes.use(logRoutes.routes())
pilotRoutes.use(pipelineRoutes.routes())
pilotRoutes.use(projectRoutes.routes())
pilotRoutes.use(weixinRoutes.routes())
pilotRoutes.use(proxyRoutes.routes())

export { setupTerminalWebSocket, setupPipelineWebSocket, proxyMiddleware }
