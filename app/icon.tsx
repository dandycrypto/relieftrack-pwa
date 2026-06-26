import { ImageResponse } from 'next/og'

export const runtime = 'nodejs'

export async function generateImageMetadata() {
  return [
    {
      id: 'icon-192',
      url: '/icon',
      width: 192,
      height: 192,
    },
  ]
}

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 192,
          height: 192,
          background: 'linear-gradient(135deg, #10B981 0%, #047857 100%)',
          borderRadius: 40,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            width: 100,
            height: 120,
            background: 'white',
            borderRadius: 12,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
          }}
        >
          <div
            style={{
              width: 48,
              height: 60,
              background: '#059669',
              borderRadius: 6,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
            }}
          >
            <div style={{ width: 28, height: 4, background: 'white', borderRadius: 2 }} />
            <div style={{ width: 22, height: 4, background: 'white', borderRadius: 2 }} />
            <div style={{ width: 28, height: 4, background: 'white', borderRadius: 2 }} />
            <div style={{ width: 16, height: 4, background: '#86efac', borderRadius: 2 }} />
          </div>
        </div>
        <div
          style={{
            position: 'absolute',
            bottom: 28,
            right: 46,
            width: 24,
            height: 24,
            background: '#059669',
            borderRadius: 12,
            border: '3px solid white',
          }}
        />
      </div>
    ),
    { width: 192, height: 192 }
  )
}
