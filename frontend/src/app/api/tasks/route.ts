import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const formData = await req.formData()

  const file = formData.get('file') as File | null
  const domain = formData.get('domain') as string | null
  const language = formData.get('language') as string | null

  if (!file || !domain?.trim() || !language?.trim()) {
    return NextResponse.json(
      { error: 'file, domain, and language are all required' },
      { status: 400 },
    )
  }

  if (!file.name.endsWith('.zip')) {
    return NextResponse.json(
      { error: 'Only .zip files are accepted' },
      { status: 400 },
    )
  }

  // TODO: unpack zip, validate structure, prisma.task.create + inngest.send
  // The task title can be derived from the zip filename (strip .zip extension)
  const title = file.name.replace(/\.zip$/, '')

  return NextResponse.json(
    { id: 'stub-task-id', title, domain, language },
    { status: 201 },
  )
}

export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get('status')
  // TODO: prisma.task.findMany({ where: status ? { status } : undefined })
  return NextResponse.json([])
}
