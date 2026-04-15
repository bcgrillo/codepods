import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { ApiError, apiRequest } from '@/lib/api'
import './about-markdown.css'

type AboutResponse = {
  markdown: string
  version: string
}

function formatBuildVersion(value: string) {
  if (!value || value === 'dev') {
    return 'dev'
  }
  if (/^[0-9a-f]{7,40}$/i.test(value)) {
    return `#${value}`
  }
  return value
}

export function AboutPage() {
  const [data, setData] = useState<AboutResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const response = await apiRequest<AboutResponse>('/api/help/about')
        if (!active) {
          return
        }
        setData(response)
      } catch (err) {
        if (!active) {
          return
        }
        setError(err instanceof ApiError ? err.message : 'Failed to load about page.')
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    })()

    return () => {
      active = false
    }
  }, [])

  if (loading) {
    return <p className='text-sm text-muted-foreground'>Loading about...</p>
  }

  if (error) {
    return (
      <p className='rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive'>
        {error}
      </p>
    )
  }

  return (
    <section className='flex flex-1 flex-col gap-4 sm:gap-6'>
      <div className='flex items-baseline justify-between gap-2'>
        <h1 className='text-2xl font-bold tracking-tight'>About Codepods</h1>
        <span className='text-xs text-muted-foreground'>{formatBuildVersion(data?.version ?? 'dev')}</span>
      </div>

      <article className='about-markdown rounded-md border p-4'>
        <ReactMarkdown>{data?.markdown ?? ''}</ReactMarkdown>
      </article>
    </section>
  )
}
