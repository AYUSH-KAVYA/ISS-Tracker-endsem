export default async function handler(_req, res) {
  try {
    const response = await fetch('http://api.open-notify.org/astros.json')
    const data = await response.json()
    return res.status(200).json(data)
  } catch {
    return res.status(502).json({ error: 'Failed to fetch astronaut data' })
  }
}
