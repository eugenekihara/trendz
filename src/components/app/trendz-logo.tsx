'use client'

import Image from 'next/image'

interface TrendzLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl'
  showText?: boolean
}

const sizeConfig = {
  sm: { img: 24, text: 'text-sm', gap: 'gap-1' },
  md: { img: 32, text: 'text-base', gap: 'gap-1.5' },
  lg: { img: 40, text: 'text-xl', gap: 'gap-2' },
  xl: { img: 56, text: 'text-3xl', gap: 'gap-3' },
}

export function TrendzLogo({ size = 'md', showText = true }: TrendzLogoProps) {
  const config = sizeConfig[size]

  return (
    <div className={`flex items-center ${config.gap}`}>
      <Image
        src="/logo.png"
        alt="Trendz Logo"
        width={config.img}
        height={config.img}
        className="rounded-sm"
        priority
      />
      {showText && (
        <span className={`font-bold ${config.text} tracking-wider text-amber-800 dark:text-amber-400`}>
          TRENDZ
        </span>
      )}
    </div>
  )
}
