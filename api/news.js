const NEWS_BASE_URL = 'https://newsapi.org/v2/everything'

export default async function handler(req, res) {
  const apiKey = process.env.VITE_NEWS_API_KEY
  if (!apiKey) {
    return res.status(500).json({ status: 'error', message: 'Server missing VITE_NEWS_API_KEY' })
  }

  try {
    const q = req.query.q || 'technology'
    const pageSize = req.query.pageSize || '5'
    const language = req.query.language || 'en'
    const sortBy = req.query.sortBy || 'publishedAt'

    const url = new URL(NEWS_BASE_URL)
    url.searchParams.set('q', q)
    url.searchParams.set('pageSize', String(pageSize))
    url.searchParams.set('language', String(language))
    url.searchParams.set('sortBy', String(sortBy))
    url.searchParams.set('apiKey', apiKey)

    const response = await fetch(url.toString())
    const data = await response.json()
    return res.status(response.status).json(data)
  } catch {
    return res.status(502).json({ status: 'error', message: 'Failed to fetch news data' })
  }
}
