export default function BackgroundPattern() {
  return (
    <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
      <svg
        className="absolute bottom-0 right-0 w-[600px] h-[800px]"
        viewBox="0 0 600 800"
        fill="none"
        preserveAspectRatio="xMaxYMax meet"
      >
        {/* Couche extérieure - Bleu électrique #313ADF */}
        <path
          d="M600,800 L600,200
             C580,180 560,160 540,180
             C500,220 520,280 480,320
             C440,360 400,340 380,380
             C360,420 380,480 340,520
             C300,560 260,540 240,580
             C220,620 240,680 200,720
             C180,740 160,760 180,800
             L600,800 Z"
          fill="#313ADF"
        />
        {/* Couche intérieure - Bleu marine #040741 */}
        <path
          d="M600,800 L600,280
             C585,260 570,250 555,270
             C520,310 540,360 505,400
             C470,440 440,420 420,460
             C400,500 420,550 385,590
             C350,630 320,610 300,650
             C280,690 300,740 270,780
             C260,795 250,800 260,800
             L600,800 Z"
          fill="#040741"
        />
      </svg>
    </div>
  )
}
