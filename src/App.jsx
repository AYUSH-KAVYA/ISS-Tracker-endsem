import { useEffect, useMemo, useState } from 'react'
import { MapContainer, Marker, Polyline, TileLayer, Tooltip } from 'react-leaflet'
import {
  ArcElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip as ChartTooltip,
} from 'chart.js'
import { Doughnut, Line } from 'react-chartjs-2'
import toast, { Toaster } from 'react-hot-toast'
import './App.css'

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  ChartTooltip,
  Legend,
  ArcElement,
)

const ISS_URL = '/api/iss-now'
const ASTRONAUTS_URL = '/api/astros'
const NEWS_URL = '/api/news'
const CHAT_URL = '/api/chat'
const NEWS_CACHE_TTL_MS = 15 * 60 * 1000
const ISS_POLL_MS = 15000
const NEWS_CATEGORIES = [
  { key: 'space', label: 'Space', query: 'space exploration OR NASA OR ISS' },
  { key: 'technology', label: 'Technology', query: 'technology OR AI OR software' },
]
const FETCH_MODE = { MANUAL: 'manual', POLL: 'poll' }

function toRadians(deg) {
  return deg * (Math.PI / 180)
}

function calculateSpeed(pos1, pos2, timeDiffSeconds) {
  if (!pos1 || !pos2 || timeDiffSeconds <= 0) return 0
  const earthRadiusKm = 6371
  const dLat = toRadians(pos2.lat - pos1.lat)
  const dLon = toRadians(pos2.lng - pos1.lng)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(pos1.lat)) *
      Math.cos(toRadians(pos2.lat)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  const distance = earthRadiusKm * c
  return (distance / timeDiffSeconds) * 3600
}

function formatDateTime(isoString) {
  return new Date(isoString).toLocaleString()
}

function readLocalStorage(key, fallback) {
  try {
    const item = localStorage.getItem(key)
    return item ? JSON.parse(item) : fallback
  } catch {
    return fallback
  }
}

function setLocalStorage(key, value) {
  localStorage.setItem(key, JSON.stringify(value))
}

function Spinner() {
  return <div className="spinner" aria-label="Loading" />
}

async function safeJson(response) {
  try {
    return await response.json()
  } catch {
    return null
  }
}

function App() {
  const [theme, setTheme] = useState(() => readLocalStorage('theme', 'dark'))
  const [positions, setPositions] = useState([])
  const [speedHistory, setSpeedHistory] = useState([])
  const [locationName, setLocationName] = useState('Locating...')
  const [issLoading, setIssLoading] = useState(false)
  const [issError, setIssError] = useState('')
  const [astronauts, setAstronauts] = useState({ number: 0, people: [] })
  const [newsByCategory, setNewsByCategory] = useState({})
  const [newsLoading, setNewsLoading] = useState({})
  const [newsError, setNewsError] = useState({})
  const [searchTerm, setSearchTerm] = useState('')
  const [sortBy, setSortBy] = useState('date')
  const [activeCategory, setActiveCategory] = useState('all')
  const [chatOpen, setChatOpen] = useState(false)
  const [chatInput, setChatInput] = useState('')
  const [chatTyping, setChatTyping] = useState(false)
  const [chatMessages, setChatMessages] = useState(() =>
    readLocalStorage('chatMessages', [
      {
        role: 'assistant',
        content:
          'Hi! I can answer questions only about ISS tracking and the news shown in this dashboard.',
      },
    ]),
  )

  const currentPosition = positions[positions.length - 1]
  const currentSpeed = speedHistory[speedHistory.length - 1]?.speedKmh ?? 0

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    setLocalStorage('theme', theme)
  }, [theme])

  useEffect(() => {
    setLocalStorage('chatMessages', chatMessages.slice(-30))
  }, [chatMessages])

  const reverseGeocode = async (lat, lng) => {
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=jsonv2`
      const response = await fetch(url, {
        headers: { Accept: 'application/json' },
      })
      if (!response.ok) throw new Error('Reverse geocoding failed')
      const data = await response.json()
      const display =
        data.address?.city ||
        data.address?.town ||
        data.address?.state ||
        data.address?.country ||
        data.name ||
        data.display_name ||
        'Over ocean / remote region'
      setLocationName(display)
    } catch {
      setLocationName('Over ocean / remote region')
    }
  }

  const fetchIssPosition = async ({ mode = FETCH_MODE.POLL } = {}) => {
    setIssLoading(true)
    setIssError('')
    try {
      const response = await fetch(ISS_URL)
      if (!response.ok) throw new Error('Unable to fetch ISS location')
      const data = await response.json()
      const nextPosition = {
        lat: Number(data.iss_position.latitude),
        lng: Number(data.iss_position.longitude),
        timestamp: Number(data.timestamp) * 1000,
      }
      setPositions((prev) => {
        const next = [...prev, nextPosition]
        const bounded = next.slice(-15)
        if (next.length >= 2) {
          const prevPosition = next[next.length - 2]
          const speedKmh = calculateSpeed(
            prevPosition,
            nextPosition,
            (nextPosition.timestamp - prevPosition.timestamp) / 1000,
          )
          setSpeedHistory((prevSpeeds) =>
            [...prevSpeeds, { time: nextPosition.timestamp, speedKmh }].slice(-30),
          )
        }
        return bounded
      })
      if (mode === FETCH_MODE.MANUAL || speedHistory.length % 4 === 0) {
        reverseGeocode(nextPosition.lat, nextPosition.lng)
      }
    } catch (error) {
      setIssError(error.message || 'Failed to fetch ISS data')
      toast.error('ISS refresh failed')
    } finally {
      setIssLoading(false)
    }
  }

  const fetchAstronauts = async () => {
    try {
      const response = await fetch(ASTRONAUTS_URL)
      if (!response.ok) throw new Error('Unable to fetch astronauts')
      const data = await response.json()
      setAstronauts({ number: data.number ?? 0, people: data.people ?? [] })
    } catch {
      toast.error('Could not load people in space')
    }
  }

  const getNewsCacheKey = (categoryKey) => `news_cache_${categoryKey}`

  const fetchNews = async (category, forceRefresh = false) => {
    const categoryKey = category.key
    setNewsError((prev) => ({ ...prev, [categoryKey]: '' }))
    setNewsLoading((prev) => ({ ...prev, [categoryKey]: true }))

    try {
      const cached = readLocalStorage(getNewsCacheKey(categoryKey), null)
      const isFresh = cached && Date.now() - cached.savedAt < NEWS_CACHE_TTL_MS
      if (isFresh && !forceRefresh) {
        setNewsByCategory((prev) => ({ ...prev, [categoryKey]: cached.articles }))
        return
      }

      const url = new URL(NEWS_URL, window.location.origin)
      url.searchParams.set('q', category.query)
      url.searchParams.set('pageSize', '5')
      url.searchParams.set('language', 'en')
      url.searchParams.set('sortBy', 'publishedAt')

      const response = await fetch(url)
      const data = await safeJson(response)
      if (!response.ok || data.status === 'error') {
        throw new Error(data?.message || 'News API error')
      }

      const cleanArticles = (data.articles || []).slice(0, 5)
      setNewsByCategory((prev) => ({ ...prev, [categoryKey]: cleanArticles }))
      setLocalStorage(getNewsCacheKey(categoryKey), {
        savedAt: Date.now(),
        articles: cleanArticles,
      })
    } catch (error) {
      setNewsError((prev) => ({ ...prev, [categoryKey]: error.message || 'Failed to load news' }))
      toast.error(`News fetch failed for ${category.label}`)
    } finally {
      setNewsLoading((prev) => ({ ...prev, [categoryKey]: false }))
    }
  }

  useEffect(() => {
    fetchIssPosition()
    fetchAstronauts()
    NEWS_CATEGORIES.forEach((category) => {
      fetchNews(category)
    })

    const interval = setInterval(() => fetchIssPosition(), ISS_POLL_MS)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const allArticles = useMemo(
    () =>
      NEWS_CATEGORIES.flatMap((category) =>
        (newsByCategory[category.key] || []).map((article) => ({
          ...article,
          category: category.key,
          categoryLabel: category.label,
        })),
      ),
    [newsByCategory],
  )

  const filteredSortedArticles = useMemo(() => {
    let list = [...allArticles]
    if (activeCategory !== 'all') {
      list = list.filter((article) => article.category === activeCategory)
    }
    const q = searchTerm.toLowerCase().trim()
    if (q) {
      list = list.filter(
        (article) =>
          article.title?.toLowerCase().includes(q) ||
          article.description?.toLowerCase().includes(q) ||
          article.source?.name?.toLowerCase().includes(q),
      )
    }
    if (sortBy === 'date') {
      list.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))
    } else {
      list.sort((a, b) => (a.source?.name || '').localeCompare(b.source?.name || ''))
    }
    return list
  }, [allArticles, activeCategory, searchTerm, sortBy])

  const speedChartData = {
    labels: speedHistory.map((entry) => new Date(entry.time).toLocaleTimeString()),
    datasets: [
      {
        label: 'ISS Speed (km/h)',
        data: speedHistory.map((entry) => Number(entry.speedKmh.toFixed(2))),
        borderColor: '#4a90e2',
        backgroundColor: 'rgba(74, 144, 226, 0.2)',
        tension: 0.3,
      },
    ],
  }

  const distributionData = {
    labels: NEWS_CATEGORIES.map((category) => category.label),
    datasets: [
      {
        data: NEWS_CATEGORIES.map((category) => (newsByCategory[category.key] || []).length),
        backgroundColor: ['#7c3aed', '#0ea5e9'],
      },
    ],
  }

  const chatContext = useMemo(() => {
    const articleLines = allArticles
      .slice(0, 10)
      .map(
        (article, i) =>
          `${i + 1}. [${article.categoryLabel}] ${article.title} (${article.source?.name || 'Unknown source'})`,
      )
      .join('\n')
    return `
ISS Current:
- Latitude: ${currentPosition?.lat ?? 'N/A'}
- Longitude: ${currentPosition?.lng ?? 'N/A'}
- Speed km/h: ${currentSpeed.toFixed(2)}
- Location Name: ${locationName}
- Tracked positions: ${positions.length}

People in space:
- Total: ${astronauts.number}
- Names: ${astronauts.people.map((p) => p.name).join(', ') || 'N/A'}

News:
- Total articles loaded: ${allArticles.length}
${articleLines}
`.trim()
  }, [allArticles, astronauts, currentPosition, currentSpeed, locationName, positions.length])

  const sendChat = async () => {
    const input = chatInput.trim()
    if (!input) return

    const nextMessages = [...chatMessages, { role: 'user', content: input }].slice(-30)
    setChatMessages(nextMessages)
    setChatInput('')
    setChatTyping(true)

    const prompt = `
You are a dashboard assistant. Answer ONLY from the provided context.
If the answer is not in context, reply exactly: "I can only answer from dashboard data."
Do not use outside knowledge.

Context:
${chatContext}

Question: ${input}
Answer:
`.trim()

    try {
      const response = await fetch(CHAT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt,
          devBypass: import.meta.env.DEV ? '1' : undefined,
        }),
      })

      const data = await safeJson(response)
      if (!response.ok) {
        throw new Error(data?.error || 'Hugging Face request failed')
      }

      const modelText = data?.answer
      const answer = modelText?.trim() || 'I can only answer from dashboard data.'
      setChatMessages((prev) => [...prev, { role: 'assistant', content: answer }].slice(-30))
    } catch {
      setChatMessages((prev) =>
        [...prev, { role: 'assistant', content: 'I can only answer from dashboard data.' }].slice(
          -30,
        ),
      )
      toast.error('Chat service unavailable')
    } finally {
      setChatTyping(false)
    }
  }

  return (
    <div className="app-shell">
      <Toaster position="top-right" />
      <header className="topbar card">
        <h1>ISS + News Intelligence Dashboard</h1>
        <button
          type="button"
          className="btn"
          onClick={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
        >
          Toggle {theme === 'dark' ? 'Light' : 'Dark'} Mode
        </button>
      </header>

      <section className="card stats-grid">
        <div>
          <h3>Latitude</h3>
          <p>{currentPosition ? currentPosition.lat.toFixed(4) : '--'}</p>
        </div>
        <div>
          <h3>Longitude</h3>
          <p>{currentPosition ? currentPosition.lng.toFixed(4) : '--'}</p>
        </div>
        <div>
          <h3>Speed (km/h)</h3>
          <p>{currentSpeed.toFixed(2)}</p>
        </div>
        <div>
          <h3>Nearest Place</h3>
          <p>{locationName}</p>
        </div>
        <div>
          <h3>Positions Tracked</h3>
          <p>{positions.length}</p>
        </div>
        <div>
          <h3>People in Space</h3>
          <p>{astronauts.number}</p>
        </div>
      </section>

      <section className="grid-two">
        <article className="card">
          <div className="section-title-row">
            <h2>ISS Live Map</h2>
            <button
              type="button"
              className="btn"
              onClick={() => fetchIssPosition({ mode: FETCH_MODE.MANUAL })}
            >
              Refresh ISS
            </button>
          </div>
          {issLoading && <Spinner />}
          {issError && (
            <div className="error-box">
              <span>{issError}</span>
              <button
                type="button"
                className="btn"
                onClick={() => fetchIssPosition({ mode: FETCH_MODE.MANUAL })}
              >
                Retry
              </button>
            </div>
          )}
          <MapContainer center={[0, 0]} zoom={2} scrollWheelZoom className="map-wrap">
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {positions.length > 0 && (
              <>
                <Marker position={[currentPosition.lat, currentPosition.lng]}>
                  <Tooltip direction="top" offset={[0, -12]} opacity={1}>
                    ISS @ {currentPosition.lat.toFixed(2)}, {currentPosition.lng.toFixed(2)}
                  </Tooltip>
                </Marker>
                <Polyline positions={positions.map((p) => [p.lat, p.lng])} color="#f97316" />
              </>
            )}
          </MapContainer>
          <h3 className="subheading">Astronaut Names</h3>
          <ul className="chip-list">
            {astronauts.people.map((person) => (
              <li key={person.name}>{person.name}</li>
            ))}
          </ul>
        </article>

        <article className="card">
          <h2>ISS Speed Trend</h2>
          <div className="line-wrap">
            <Line data={speedChartData} options={{ responsive: true, maintainAspectRatio: false }} />
          </div>
        </article>
      </section>

      <section className="card">
        <div className="section-title-row">
          <h2>News Distribution</h2>
          <button type="button" className="btn" onClick={() => setActiveCategory('all')}>
            Reset Filter
          </button>
        </div>
        <div className="chart-wrap">
          <Doughnut
            data={distributionData}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              onClick: (_, elements) => {
                if (!elements.length) return
                const index = elements[0].index
                setActiveCategory(NEWS_CATEGORIES[index].key)
              },
            }}
          />
        </div>
      </section>

      <section className="card">
        <div className="section-title-row wrap">
          <h2>Latest News (10)</h2>
          <div className="controls">
            <input
              type="search"
              placeholder="Search news..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
              <option value="date">Sort by date</option>
              <option value="source">Sort by source</option>
            </select>
            {NEWS_CATEGORIES.map((category) => (
              <button
                key={category.key}
                type="button"
                className="btn"
                onClick={() => fetchNews(category, true)}
              >
                Refresh {category.label}
              </button>
            ))}
          </div>
        </div>
        {NEWS_CATEGORIES.some((category) => newsLoading[category.key]) && <Spinner />}
        {NEWS_CATEGORIES.map((category) =>
          newsError[category.key] ? (
            <div className="error-box" key={category.key}>
              <span>
                {category.label}: {newsError[category.key]}
              </span>
              <button type="button" className="btn" onClick={() => fetchNews(category, true)}>
                Retry
              </button>
            </div>
          ) : null,
        )}

        <div className="news-grid">
          {filteredSortedArticles.map((article, index) => (
            <article className="news-card" key={`${article.url}-${index}`}>
              <img
                src={article.urlToImage || 'https://placehold.co/600x400?text=No+Image'}
                alt={article.title}
              />
              <div className="news-card-body">
                <span className="tag">{article.categoryLabel}</span>
                <h3>{article.title}</h3>
                <p>{article.description || 'No description available.'}</p>
                <small>
                  {article.source?.name || 'Unknown source'} | {article.author || 'Unknown author'} |{' '}
                  {formatDateTime(article.publishedAt)}
                </small>
                <a className="btn link-btn" href={article.url} target="_blank" rel="noreferrer">
                  Read More
                </a>
              </div>
            </article>
          ))}
        </div>
      </section>

      <button type="button" className="chat-fab" onClick={() => setChatOpen((prev) => !prev)}>
        {chatOpen ? 'Close Chat' : 'Ask AI'}
      </button>

      {chatOpen && (
        <section className="chat-window card">
          <div className="section-title-row">
            <h3>Dashboard AI Assistant</h3>
            <button
              type="button"
              className="btn"
              onClick={() =>
                setChatMessages([
                  {
                    role: 'assistant',
                    content:
                      'Chat cleared. I can answer only from dashboard data (ISS + News).',
                  },
                ])
              }
            >
              Clear
            </button>
          </div>
          <div className="chat-messages">
            {chatMessages.map((msg, idx) => (
              <div key={`${msg.role}-${idx}`} className={`chat-bubble ${msg.role}`}>
                {msg.content}
              </div>
            ))}
            {chatTyping && <div className="chat-bubble assistant">Typing...</div>}
          </div>
          <div className="chat-input-row">
            <input
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Ask about ISS or news..."
            />
            <button type="button" className="btn" onClick={sendChat}>
              Send
            </button>
          </div>
        </section>
      )}
    </div>
  )
}

export default App
