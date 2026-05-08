const HF_URL = 'https://router.huggingface.co/v1/chat/completions'
const PREFERRED_MODELS = [
  'mistralai/Mistral-7B-Instruct-v0.2',
  'meta-llama/Llama-3.1-8B-Instruct',
]

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const token = process.env.VITE_AI_TOKEN
  if (!token) {
    return res.status(500).json({ error: 'Server missing VITE_AI_TOKEN' })
  }

  try {
    const prompt = req.body?.prompt
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'Invalid prompt' })
    }

    let lastError = null
    for (const model of PREFERRED_MODELS) {
      const response = await fetch(HF_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
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
      return res.status(200).json({
        answer: generatedText || 'I can only answer from dashboard data.',
        model,
      })
    }

    return res.status(502).json({ error: lastError || 'No supported model available' })
  } catch {
    return res.status(502).json({ error: 'Failed to fetch AI response' })
  }
}
