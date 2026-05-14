'use client'

import { Gem } from 'lucide-react'

interface TrendzLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl'
  showText?: boolean
}

const sizeConfig = {
  sm: { icon: 16, text: 'text-sm', gap: 'gap-1' },
  md: { icon: 20, text: 'text-base', gap: 'gap-1.5' },
  lg: { icon: 28, text: 'text-xl', gap: 'gap-2' },
  xl: { icon: 40, text: 'text-3xl', gap: 'gap-3' },
}

export function TrendzLogo({ size = 'md', showText = true }: TrendzLogoProps) {
  const config = sizeConfig[size]

  return (
    <div className={`flex items-center ${config.gap}`}>
      <div className="relative">
        <Gem
          size={config.icon}
          className="text-purple-600 dark:text-purple-400"
          strokeWidth={2.5}
        />
      </div>
      {showText && (
        <span className={`font-bold ${config.text} tracking-wider bg-gradient-to-r from-purple-600 to-rose-500 bg-clip-text text-transparent`}>
          TRENDZ
        </span>
      )}
    </div>
  )
}
