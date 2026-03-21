export default function BackgroundPattern() {
  return (
    <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
      {/* Subtle gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-white via-white to-[#313ADF]/5" />

      {/* Floating geometric shapes */}
      <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
        <defs>
          <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#313ADF" stopOpacity="0.03" />
            <stop offset="100%" stopColor="#040741" stopOpacity="0.06" />
          </linearGradient>
          <linearGradient id="grad2" x1="100%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#313ADF" stopOpacity="0.04" />
            <stop offset="100%" stopColor="#313ADF" stopOpacity="0.01" />
          </linearGradient>
        </defs>

        {/* Large soft circle top-right */}
        <circle cx="85%" cy="10%" r="300" fill="url(#grad1)" />

        {/* Medium circle bottom-left */}
        <circle cx="10%" cy="85%" r="200" fill="url(#grad2)" />

        {/* Subtle grid dots */}
        <pattern id="dots" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
          <circle cx="20" cy="20" r="1" fill="#313ADF" opacity="0.06" />
        </pattern>
        <rect width="100%" height="100%" fill="url(#dots)" />
      </svg>

      {/* Bottom-right decorative wave */}
      <svg
        className="absolute bottom-0 right-0 w-[500px] h-[400px] opacity-[0.08]"
        viewBox="0 0 500 400"
        fill="none"
        preserveAspectRatio="xMaxYMax meet"
      >
        <path
          d="M500,400 L500,100
             C480,80 450,100 420,130
             C380,170 360,150 330,190
             C300,230 280,210 250,250
             C220,290 200,270 170,310
             C150,340 140,360 160,400
             L500,400 Z"
          fill="#313ADF"
        />
        <path
          d="M500,400 L500,180
             C485,165 465,175 445,200
             C415,235 400,215 375,255
             C345,295 325,275 300,315
             C280,345 270,365 290,400
             L500,400 Z"
          fill="#040741"
        />
      </svg>
    </div>
  )
}
