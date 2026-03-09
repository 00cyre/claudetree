import express from 'express'
import cors from 'cors'
import { createServer } from 'http'
import { WebSocketServer } from 'ws'
import { worktreeRouter } from './routes/worktrees.js'
import { gitRouter } from './routes/git.js'
import { setupTerminal } from './terminal.js'

const app = express()
const server = createServer(app)
const wss = new WebSocketServer({ server, path: '/terminal' })

app.use(cors())
app.use(express.json())

app.use('/api/worktrees', worktreeRouter)
app.use('/api/git', gitRouter)

app.get('/api/health', (_req, res) => res.json({ ok: true }))

setupTerminal(wss)

const PORT = process.env.PORT || 3001
server.listen(PORT, () => {
  console.log(`claudetree backend running on http://localhost:${PORT}`)
})
