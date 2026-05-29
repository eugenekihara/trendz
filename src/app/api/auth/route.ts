// This route has been replaced by /api/auth/login
// Keeping this file as a redirect for backward compatibility

import { NextResponse } from 'next/server'

export async function POST() {
  return NextResponse.json(
    { error: 'This endpoint has moved. Please use /api/auth/login.' },
    { status: 410 } // 410 Gone
  )
}
