// app/api/health/route.ts
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`
    return NextResponse.json({ db: 'ok' })
  } catch (e) {
    return NextResponse.json(
      { db: 'error', detail: String(e) },
      { status: 500 },
    )
  }
}
