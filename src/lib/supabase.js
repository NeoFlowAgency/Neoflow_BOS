import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://qucwuehtthlgtgkducod.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF1Y3d1ZWh0dGhsZ3Rna2R1Y29kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgwMzQ2NjAsImV4cCI6MjA4MzYxMDY2MH0.UNFMdMB1LIagrZDrvqdjQm2sZNtSzTk9566WlayaG7I'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
