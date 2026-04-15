type SettingsPlaceholderPageProps = {
  title: string
  description: string
}

export function SettingsPlaceholderPage({ title, description }: SettingsPlaceholderPageProps) {
  return (
    <section className='space-y-2'>
      <h1 className='text-2xl font-bold tracking-tight'>{title}</h1>
      <p className='text-muted-foreground'>{description}</p>
    </section>
  )
}
