import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const chatModels = ['mistralai/Mistral-7B-Instruct-v0.2', 'meta-llama/Llama-3.1-8B-Instruct']

  return {
    plugins: [
      react(),
      {
        name: 'local-api-proxy',
        configureServer(server) {
          server.middlewares.use('/api/iss-now', async (_req, res) => {
            try {
              const response = await fetch('http://api.open-notify.org/iss-now.json')
              const data = await response.text()
              res.setHeader('Content-Type', 'application/json')
              res.end(data)
            } catch {
              res.statusCode = 502
              res.end(JSON.stringify({ error: 'Failed to fetch ISS data' }))
            }
          })

          server.middlewares.use('/api/astros', async (_req, res) => {
            try {
              const response = await fetch('http://api.open-notify.org/astros.json')
              const data = await response.text()
              res.setHeader('Content-Type', 'application/json')
              res.end(data)
            } catch {
              res.statusCode = 502
              res.end(JSON.stringify({ error: 'Failed to fetch astronaut data' }))
            }
          })

          server.middlewares.use('/api/news', async (req, res) => {
            try {
              const url = new URL(req.url || '', 'http://localhost')
              const upstream = new URL('https://newsapi.org/v2/everything')
              upstream.searchParams.set('q', url.searchParams.get('q') || 'technology')
              upstream.searchParams.set('pageSize', url.searchParams.get('pageSize') || '5')
              upstream.searchParams.set('language', url.searchParams.get('language') || 'en')
              upstream.searchParams.set('sortBy', url.searchParams.get('sortBy') || 'publishedAt')
              upstream.searchParams.set('apiKey', env.VITE_NEWS_API_KEY || '')

              const response = await fetch(upstream)
              const data = await response.text()
              res.statusCode = response.status
              res.setHeader('Content-Type', 'application/json')
              res.end(data)
            } catch {
              res.statusCode = 502
              res.end(JSON.stringify({ error: 'Failed to fetch news data' }))
            }
          })

          server.middlewares.use('/api/chat', async (req, res) => {
            try {
              if (req.method !== 'POST') {
                res.statusCode = 405
                res.end(JSON.stringify({ error: 'Method not allowed' }))
                return
              }

              let body = ''
              req.on('data', (chunk) => {
                body += chunk
              })
              req.on('end', async () => {
                const parsed = JSON.parse(body || '{}')
                const prompt = parsed.prompt
                let lastError = null

                for (const model of chatModels) {
                  const response = await fetch('https://router.huggingface.co/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                      Authorization: `Bearer ${env.VITE_AI_TOKEN || ''}`,
                      'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                      model,
                      messages: [{ role: 'user', content: prompt }],
                      max_tokens: 220,
                      temperature: 0.2,
                    }),
                  })

                  const data = await response.json()
                  if (!response.ok) {
                    lastError = data?.error?.message || data?.error || 'HF request failed'
                    continue
                  }

                  const generatedText = data?.choices?.[0]?.message?.content
                  res.setHeader('Content-Type', 'application/json')
                  res.end(
                    JSON.stringify({
                      answer: generatedText || 'I can only answer from dashboard data.',
                      model,
                    }),
                  )
                  return
                }

                res.statusCode = 502
                res.end(JSON.stringify({ error: lastError || 'No supported model available' }))
              })
            } catch {
              res.statusCode = 502
              res.end(JSON.stringify({ error: 'Failed to fetch AI response' }))
            }
          })
        },
      },
    ],
  }
})
