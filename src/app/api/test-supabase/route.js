
import { NextResponse } from 'next/server'
import { supabase } from '../../../lib/supabase/client'

export async function GET() {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json(
      { message: 'Not found' },
      { status: 404 }
    )
  }

  try {
    const { error } = await supabase
      .from('academic_terms')
      .select('id')
      .limit(0)

    if (!error) {
      return NextResponse.json({
        connected: true,
        databaseReachable: true,
        tableReadAllowed: true,
        message: 'Supabase database connection verified.'
      })
    }

    // PostgreSQL responded, but blocked unauthorized access.
    if (error.code === '42501') {
      return NextResponse.json({
        connected: true,
        databaseReachable: true,
        tableReadAllowed: false,
        databaseRole: 'anon',
        message: 'Database connection verified. Table access is restricted until appropriate authentication and permissions are configured.'
      })
    }

    return NextResponse.json(
      {
        connected: false,
        message: error.message,
        code: error.code
      },
      { status: 500 }
    )

  } catch (error) {
    return NextResponse.json(
      {
        connected: false,
        message: error.message || 'Connection failed.'
      },
      { status: 500 }
    )
  }
}